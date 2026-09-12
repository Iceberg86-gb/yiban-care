import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CareError } from "./errors.js";
import {
  VOICE_OPTIONS,
  validVoice,
  validStyle,
  speechText,
} from "../shared/speech.js";
const run = promisify(execFile);
export async function localSpeech(text, rate = 0.85, voice = "Tingting") {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/say"))
    throw new CareError("本机语音不可用，请配置百度语音凭证。", 503);
  const dir = await mkdtemp(join(tmpdir(), "yiban-speech-"));
  try {
    const input = join(dir, "text.txt"),
      aiff = join(dir, "voice.aiff"),
      wav = join(dir, "voice.wav");
    await writeFile(input, text, { mode: 0o600 });
    await run(
      "/usr/bin/say",
      [
        "-v",
        voice,
        "-r",
        String(Math.round(190 * rate)),
        "-f",
        input,
        "-o",
        aiff,
      ],
      { timeout: 20000, maxBuffer: 32000 },
    );
    await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16", aiff, wav], {
      timeout: 10000,
      maxBuffer: 32000,
    });
    return { audio: await readFile(wav), type: "audio/wav", provider: "local" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export function createSpeechService({
  key = "",
  secret = "",
  voice = "Tingting",
  speaker = "4197",
  fetcher = fetch,
  synthesizeLocal = localSpeech,
  now = Date.now,
} = {}) {
  let token = null,
    expiresAt = 0,
    tokenRequest = null,
    cacheBytes = 0,
    verified = false,
    lastProvider = null,
    active = 0;
  const cache = new Map(),
    pending = new Map(),
    cooldowns = new Map(),
    jobs = [];
  const configured = Boolean(key && secret);
  const status = () => ({
    configured,
    available:
      configured ||
      (process.platform === "darwin" && existsSync("/usr/bin/say")),
    provider: lastProvider || (configured ? "baidu" : "local"),
    verified,
    localVoice: voice,
    defaultSpeaker: String(speaker),
    voices: VOICE_OPTIONS,
  });
  async function accessToken() {
    if (token && now() < expiresAt) return token;
    if (!tokenRequest)
      tokenRequest = (async () => {
        const response = await fetcher(
          "https://aip.baidubce.com/oauth/2.0/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: key,
              client_secret: secret,
            }),
            signal: AbortSignal.timeout(8000),
          },
        );
        const data = await response.json();
        if (!response.ok || !data.access_token)
          throw new Error("百度语音鉴权未成功");
        token = data.access_token;
        expiresAt =
          now() + Math.max(30, Number(data.expires_in || 3600) - 120) * 1000;
        return token;
      })().finally(() => {
        tokenRequest = null;
      });
    return tokenRequest;
  }
  async function baidu(text, rate, selected, emotion) {
    const body = new URLSearchParams({
      tex: text,
      tok: await accessToken(),
      cuid: "yiban-care-demo",
      ctp: "1",
      lan: "zh",
      spd: String(Math.max(0, Math.min(9, Math.round(5 + (rate - 1) * 10)))),
      pit: "5",
      vol: "5",
      per: selected,
      aue: "3",
    });
    // Emotion tags are supported only by these explicitly verified voices.
    if (["4197", "4195"].includes(selected))
      body.set("text_ctrl", JSON.stringify({ emo: emotion }));
    const response = await fetcher("https://tsn.baidu.com/text2audio", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(12000),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("audio/")
    ) {
      if (response.headers.get("content-type")?.includes("json")) {
        const error = await response.json().catch(() => ({}));
        if ([110, 111, 502].includes(error.err_no)) {
          token = null;
          expiresAt = 0;
        }
      }
      throw new Error("百度语音未返回可播放音频");
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error("语音内容为空");
    verified = true;
    return { audio, type: "audio/mpeg", provider: "baidu", speaker: selected };
  }
  function drain() {
    while (active < 2 && jobs.length) {
      const job = jobs.shift();
      active++;
      job
        .work()
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          drain();
        });
    }
  }
  function synthesize(raw, rawRate = 0.85, options = {}) {
    if (typeof raw !== "string" || !raw.trim() || raw.length > 300)
      throw new CareError("每段语音需要1–300个字符。");
    const text = speechText(raw),
      rate = Number(rawRate);
    if (!text) throw new CareError("请输入需要朗读的文字。");
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 1.5)
      throw new CareError("语速无效。");
    if (!options || typeof options !== "object" || Array.isArray(options))
      throw new CareError("语音选项无效。");
    const requested = options.voice ?? "default",
      emotion = options.emotion ?? "neutral";
    if (!validVoice(requested) || !validStyle(emotion))
      throw new CareError("请选择支持的音色与语气。");
    const selected = requested === "default" ? String(speaker) : requested;
    const useBaidu = configured && selected !== "local";
    const id = createHash("sha256")
      .update(`${useBaidu}:${rate}:${voice}:${selected}:${emotion}:${text}`)
      .digest("hex");
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    if (pending.has(id)) return pending.get(id);
    if (pending.size >= 16)
      throw new CareError("语音正在排队，请稍后重试。", 429);
    const promise = new Promise((resolve, reject) => {
      jobs.push({
        resolve,
        reject,
        work: async () => {
          let result,
            fallbackReason = null;
          if (useBaidu) {
            if ((cooldowns.get(selected) || 0) <= now()) {
              try {
                result = await baidu(text, rate, selected, emotion);
                cooldowns.delete(selected);
              } catch {
                // Avoid a fresh network timeout for every subsequent sentence.
                cooldowns.set(selected, now() + 20000);
              }
            }
            if (!result) fallbackReason = "provider_unavailable";
          } else if (requested !== "local" && requested !== "default")
            fallbackReason = "not_configured";
          if (!result)
            result = {
              ...(await synthesizeLocal(text, rate, voice)),
              speaker: "local",
            };
          if (fallbackReason)
            result = { ...result, fallback: true, fallbackReason };
          if (!result.audio?.length)
            throw new CareError("语音合成未产生音频。", 503);
          lastProvider = result.provider;
          // A temporary fallback must never pin a cloud voice to local audio in cache.
          if (!result.fallback && result.audio.length <= 16 * 1024 * 1024) {
            while (
              cacheBytes + result.audio.length > 16 * 1024 * 1024 &&
              cache.size
            ) {
              const oldest = cache.keys().next().value;
              cacheBytes -= cache.get(oldest).audio.length;
              cache.delete(oldest);
            }
            cache.set(id, result);
            cacheBytes += result.audio.length;
          }
          return result;
        },
      });
    }).finally(() => pending.delete(id));
    pending.set(id, promise);
    drain();
    return promise;
  }
  return { synthesize, status };
}
