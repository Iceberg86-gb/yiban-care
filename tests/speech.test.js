import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechService } from "../server/speech.js";
import { CompanionAudio } from "../src/companion-audio.js";
import { speechChunks, speechText } from "../shared/speech.js";
import { CareEngine } from "../server/engine.js";
const flush = () => new Promise((r) => setImmediate(r));
const wave = () =>
  new Response("wave", {
    headers: {
      "Content-Type": "audio/wav",
      "X-Voice-Provider": "local",
      "X-Voice-Speaker": "local",
    },
  });
const local = async () => ({
  audio: Buffer.from("wave"),
  type: "audio/wav",
  provider: "local",
});
const token = () =>
  new Response(JSON.stringify({ access_token: "test", expires_in: 3600 }));
function fixture(fetcher = async () => wave()) {
  const requests = [],
    released = [],
    playing = [];
  const audio = {
    play: async () => {
      playing.push(audio.src);
    },
    pause() {},
    setAttribute() {},
    removeAttribute() {},
  };
  let serial = 0;
  const player = new CompanionAudio({
    fetcher: (url, req) => {
      requests.push(req);
      return fetcher(url, req);
    },
    createAudio: () => audio,
    createURL: () => `blob:${serial++}`,
    revokeURL: (url) => released.push(url),
  });
  player.configure("run", {
    volume: 0,
    speechRate: 0.9,
    speechVoice: "4195",
    speechStyle: "happy",
  });
  return { player, audio, requests, released, playing };
}
test("第一句先说，下一段提前合成，整条消息只上报一次开始和完成", async () => {
  const f = fixture();
  let starts = 0,
    ends = 0;
  f.player.enqueue(
    "greeting",
    "周伯，我在。今天想聊些什么？您慢慢说，我听着呢。",
    {
      onStart: () => starts++,
      onEnd: () => ends++,
    },
  );
  await flush();
  assert.equal(f.playing.length, 1);
  assert.equal(f.requests.length, 2); // request 2 happened before ended
  assert.equal(JSON.parse(f.requests[0].body).text, "周伯，我在。");
  assert.equal(JSON.parse(f.requests[0].body).voice, "4195");
  assert.equal(JSON.parse(f.requests[0].body).emotion, "happy");
  assert.equal(f.audio.volume, 0);
  assert.equal(starts, 1);
  assert.equal(ends, 0);
  f.audio.onended();
  await flush();
  assert.equal(f.playing.length, 2);
  assert.equal(f.requests.length, 2);
  assert.equal(starts, 1);
  assert.equal(ends, 0);
  f.audio.onended();
  assert.equal(ends, 1);
  assert.equal(f.released.length, 2);
  f.player.destroy();
});
test("停止时中止预加载，迟到的第二段不会继续播放或记录完成", async () => {
  let resolveNext,
    calls = 0,
    cancelled = 0,
    completed = 0;
  const f = fixture(async () =>
    ++calls === 1
      ? wave()
      : new Promise((r) => {
          resolveNext = r;
        }),
  );
  f.player.enqueue("a", "第一句。第二句。", {
    onCancel: () => cancelled++,
    onEnd: () => completed++,
  });
  await flush();
  f.player.stop();
  assert.equal(f.requests[1].signal.aborted, true);
  resolveNext(wave());
  await flush();
  assert.equal(f.playing.length, 1);
  assert.equal(completed, 0);
  assert.equal(cancelled, 1);
  assert.equal(f.released.length, 1);
  f.player.destroy();
});
test("暂停后保留预加载音频，恢复时按顺序继续", async () => {
  const f = fixture();
  f.player.enqueue("a", "第一句。第二句。");
  await flush();
  f.player.setPaused(true);
  assert.equal(f.player.state.status, "paused");
  f.player.setPaused(false);
  await flush();
  f.audio.onended();
  await flush();
  assert.equal(f.requests.length, 2);
  assert.equal(f.player.state.text, "第二句。");
  f.player.destroy();
});
test("暂停打断尚未完成的play不会丢掉整段消息", async () => {
  const f = fixture();
  let rejectPlay;
  f.audio.play = () =>
    new Promise((_, reject) => {
      rejectPlay = reject;
    });
  f.player.enqueue("a", "第一句。第二句。");
  await flush();
  f.player.setPaused(true);
  rejectPlay(Object.assign(new Error("paused"), { name: "AbortError" }));
  await flush();
  assert.equal(f.player.state.status, "paused");
  assert.ok(f.player.current);
  assert.equal(f.player.queue.length, 1);
  f.player.destroy();
});
test("试听抢占旧播报，旧回调不会使新声音完成", async () => {
  const a = fixture(),
    b = fixture();
  let cancelled = 0;
  a.player.enqueue("a", "旧提醒。", { onCancel: () => cancelled++ });
  await flush();
  const late = a.audio.onended;
  b.player.enqueue("b", "新的试听。");
  await flush();
  late();
  assert.equal(cancelled, 1);
  assert.equal(a.player.current, null);
  assert.equal(b.player.state.status, "playing");
  a.player.destroy();
  b.player.destroy();
});
test("重新配置音色取消旧预加载，后续请求使用新偏好", async () => {
  const f = fixture();
  f.player.enqueue("a", "旧声音。还有一句。");
  await flush();
  f.player.configure("run", { speechVoice: "4197", speechStyle: "neutral" });
  assert.equal(f.player.current, null);
  assert.equal(f.requests[1].signal.aborted, true);
  f.player.enqueue("b", "新的声音。");
  await flush();
  assert.equal(JSON.parse(f.requests.at(-1).body).voice, "4197");
  f.player.destroy();
});
test("预加载失败直到该段需要播放时才上报失败，不能误报整条完成", async () => {
  let count = 0,
    errors = 0,
    ends = 0;
  const f = fixture(async () =>
    ++count === 1 ? wave() : new Response("{}", { status: 503 }),
  );
  f.player.enqueue("a", "第一句。第二句。", {
    onError: () => errors++,
    onEnd: () => ends++,
  });
  await flush();
  assert.equal(errors, 0);
  f.audio.onended();
  await flush();
  assert.equal(errors, 1);
  assert.equal(ends, 0);
  assert.equal(f.player.state.status, "error");
  f.player.destroy();
});
test("清理书面标记并保留药量、时间和内容顺序", () => {
  const text = "**周伯**，请核对08:30的记录。阿司匹林100mg，请按医嘱。";
  const parts = speechChunks(text);
  assert.equal(parts.join(""), speechText(text));
  assert.match(parts.join(""), /08:30/);
  assert.match(parts.join(""), /100mg/);
  const long = speechChunks("向前走，".repeat(100));
  assert.ok(long.every((p) => p.length <= 90));
  assert.equal(long.join(""), "向前走，".repeat(100));
});
test("百度请求按音色和语气区分缓存，并发鉴权只请求一次", async () => {
  const bodies = [];
  let auth = 0;
  const service = createSpeechService({
    key: "test",
    secret: "test",
    synthesizeLocal: local,
    fetcher: async (url, req) => {
      if (url.includes("oauth")) {
        auth++;
        await flush();
        return token();
      }
      bodies.push(req.body);
      return new Response("mp3", { headers: { "Content-Type": "audio/mpeg" } });
    },
  });
  await Promise.all([
    service.synthesize("你好", 0.9, { voice: "4197", emotion: "neutral" }),
    service.synthesize("你好", 0.9, { voice: "4195", emotion: "happy" }),
  ]);
  assert.equal(auth, 1);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].get("per"), "4197");
  assert.deepEqual(JSON.parse(bodies[1].get("text_ctrl")), { emo: "happy" });
  await service.synthesize("你好", 0.9, { voice: "4197", emotion: "neutral" });
  assert.equal(bodies.length, 2);
  await service.synthesize("你好", 0.9, { voice: "4197", emotion: "happy" });
  assert.equal(bodies.length, 3);
});
test("基础音色不发送不支持的情感标签，无效音色不会调用上游", async () => {
  let calls = 0;
  const service = createSpeechService({
    key: "x",
    secret: "x",
    speaker: "0",
    fetcher: async (url, req) => {
      calls++;
      if (url.includes("oauth")) return token();
      assert.equal(req.body.has("text_ctrl"), false);
      return wave();
    },
  });
  assert.throws(() => service.synthesize("你好", 1, { voice: "__proto__" }));
  assert.throws(() => service.synthesize("你好", 1, { emotion: "angry" }));
  assert.throws(() => service.synthesize("\u0001", 1));
  assert.equal(calls, 0);
  await service.synthesize("你好", 1);
});
test("百度故障短暂退避，不缓存回退结果，恢复后同一句可重新用百度声音", async () => {
  let time = 0,
    healthy = false,
    attempts = 0;
  const service = createSpeechService({
    key: "x",
    secret: "x",
    now: () => time,
    synthesizeLocal: local,
    fetcher: async (url) => {
      if (url.includes("oauth")) return token();
      attempts++;
      return healthy
        ? wave()
        : new Response("{}", {
            headers: { "Content-Type": "application/json" },
          });
    },
  });
  const first = await service.synthesize("你好");
  assert.equal(first.provider, "local");
  assert.equal(first.fallback, true);
  await service.synthesize("下一句");
  assert.equal(attempts, 1);
  time = 21000;
  healthy = true;
  const recovered = await service.synthesize("你好");
  assert.equal(recovered.provider, "baidu");
  assert.equal(attempts, 2);
});
test("本机选择绕过百度；无凭证的指定云音色会诚实返回降级原因", async () => {
  const service = createSpeechService({ synthesizeLocal: local });
  const selected = await service.synthesize("你好", 1, { voice: "4197" });
  assert.equal(selected.fallbackReason, "not_configured");
  const native = await service.synthesize("你好", 1, { voice: "local" });
  assert.equal(native.fallback, undefined);
  assert.equal(native.speaker, "local");
});
test("合成并发有上限，两段可同时准备且待处理请求不会无限堆积", async () => {
  const releases = [];
  let running = 0,
    max = 0;
  const service = createSpeechService({
    synthesizeLocal: () =>
      new Promise((resolve) => {
        running++;
        max = Math.max(max, running);
        releases.push(() => {
          running--;
          resolve(local());
        });
      }),
  });
  const tasks = Array.from({ length: 16 }, (_, i) =>
    service.synthesize(`第${i}句`),
  );
  assert.equal(running, 2);
  assert.throws(() => service.synthesize("超出队列"), /排队/);
  while (releases.length) {
    releases.shift()();
    await flush();
  }
  await Promise.all(tasks);
  assert.equal(max, 2);
});
test("保存音色偏好并拒绝未知音色，旧客户端保存其他设置时保留选声", () => {
  const e = new CareEngine();
  const save = (value) =>
    e.saveHome({
      runId: e.state.runId,
      version: e.state.home.configVersion,
      section: "careProfile",
      value,
    });
  const profile = {
    ...e.state.home.careProfile,
    speechVoice: "4195",
    speechStyle: "happy",
  };
  save(profile);
  assert.equal(e.state.home.careProfile.speechVoice, "4195");
  assert.throws(() => save({ ...profile, speechVoice: "not-a-voice" }));
  const { speechVoice, speechStyle, ...older } = profile;
  save(older);
  assert.equal(e.state.home.careProfile.speechVoice, "4195");
  assert.equal(e.state.home.careProfile.speechStyle, "happy");
});
test("默认fetch不绑定到播放器实例，兼容浏览器原生函数的调用约束", async (t) => {
  t.mock.method(globalThis, "fetch", function () {
    assert.ok(this === undefined || this === globalThis);
    return Promise.resolve(wave());
  });
  const f = fixture();
  const player = new CompanionAudio({
    createAudio: () => f.audio,
    createURL: () => "blob:test",
    revokeURL() {},
  });
  player.configure("run", {});
  player.enqueue("a", "您好。");
  await flush();
  assert.equal(player.state.status, "playing");
  player.destroy();
  f.player.destroy();
});
