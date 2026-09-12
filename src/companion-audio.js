import { speechChunks, voiceLabel } from "../shared/speech.js";
// All speech surfaces in this document share one audible owner.
let activePlayer = null;
export class CompanionAudio {
  static isBusy() {
    return Boolean(activePlayer?.current);
  }
  constructor({
    fetcher = (...args) => fetch(...args),
    createAudio = () => new Audio(),
    createURL = (b) => URL.createObjectURL(b),
    revokeURL = (u) => URL.revokeObjectURL(u),
    onChange = () => {},
  } = {}) {
    Object.assign(this, { fetcher, createURL, revokeURL, onChange });
    this.audio = createAudio();
    this.audio.preload = "auto";
    this.audio.setAttribute?.("playsinline", "");
    this.queue = [];
    this.seen = new Set();
    this.epoch = 0;
    this.enabled = true;
    this.paused = false;
    this.current = null;
    this.profile = {};
    this.runId = null;
    this.state = { status: "idle", provider: null };
  }
  emit(extra) {
    this.state = { ...this.state, ...extra };
    this.onChange(this.state);
  }
  configure(runId, profile = {}) {
    const signature = (p) =>
      `${p.speechRate}:${p.speechVoice}:${p.speechStyle}`;
    if (
      this.runId !== null &&
      (this.runId !== runId || signature(this.profile) !== signature(profile))
    )
      this.stop();
    if (this.runId !== runId) this.seen.clear();
    this.runId = runId;
    this.profile = { ...profile };
    this.audio.volume = profile.volume ?? 0.8;
  }
  unlock() {
    if (this.current?.url && !this.paused) this.playCurrent();
    else this.pump();
  }
  enqueue(
    id,
    text,
    {
      replace = false,
      emotion,
      onStart,
      onEnd,
      onError,
      onCancel,
      onBlocked,
    } = {},
  ) {
    if (!this.enabled || !text || (!replace && this.seen.has(id))) return;
    const parts = speechChunks(text);
    if (!parts.length) return;
    if (replace) this.stop();
    this.seen.add(id);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value);
    const message = {
      id,
      started: false,
      finished: false,
      onStart,
      onEnd,
      onError,
      onCancel,
      onBlocked,
    };
    parts.forEach((part, index) =>
      this.queue.push({
        id: `${id}:${index}`,
        messageId: id,
        text: part,
        message,
        emotion,
        last: index === parts.length - 1,
      }),
    );
    this.pump();
    this.prefetch();
  }
  finish(message, kind, detail) {
    if (message.finished) return;
    message.finished = true;
    message[kind]?.(detail);
  }
  prepare(item) {
    if (item.ready) return item.ready;
    item.abort = new AbortController();
    // Resolve errors as values so speculative requests cannot reject unhandled.
    item.ready = (async () => {
      const response = await this.fetcher("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: this.runId,
          text: item.text,
          rate: this.profile.speechRate ?? 0.85,
          voice: this.profile.speechVoice ?? "default",
          emotion: item.emotion ?? this.profile.speechStyle ?? "neutral",
        }),
        signal: item.abort.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "语音暂不可用，请重试播放。");
      }
      if (!response.headers.get("content-type")?.startsWith("audio/"))
        throw new Error("没有收到可播放的音频，请重试。");
      const blob = await response.blob();
      if (!blob.size) throw new Error("语音内容为空，请重试。");
      return {
        blob,
        provider: response.headers.get("X-Voice-Provider") || "local",
        speaker: response.headers.get("X-Voice-Speaker") || "local",
        fallback: response.headers.get("X-Voice-Fallback") === "1",
        fallbackReason: response.headers.get("X-Voice-Fallback-Reason"),
      };
    })().catch((error) => ({ error }));
    return item.ready;
  }
  prefetch() {
    // At most one segment ahead, and only once current audio is ready.
    if (this.current?.url && !this.paused && this.enabled && this.queue[0])
      this.prepare(this.queue[0]);
  }
  async pump() {
    if (this.current || this.paused || !this.enabled || !this.queue.length)
      return;
    if (activePlayer && activePlayer !== this) activePlayer.stop();
    activePlayer = this;
    const item = this.queue.shift(),
      epoch = this.epoch;
    this.current = item;
    this.emit({
      status: "loading",
      messageId: item.messageId,
      text: item.text,
      error: null,
      notice: null,
      voiceName: null,
      provider: null,
    });
    const result = await this.prepare(item);
    if (epoch !== this.epoch) return;
    if (result.error) {
      this.fail(result.error);
      return;
    }
    Object.assign(item, result);
    item.url = this.createURL(item.blob);
    delete item.blob;
    item.ready = null;
    this.audio.src = item.url;
    this.emit({
      provider: item.provider,
      speaker: item.speaker,
      voiceName: voiceLabel(item.provider, item.speaker),
      fallback: item.fallback,
      notice: item.fallback
        ? item.fallbackReason === "not_configured"
          ? "百度音色尚未配置，本次使用本机声音。"
          : "百度音色暂不可用，本次使用本机声音。"
        : null,
    });
    this.audio.onended = () => {
      if (epoch !== this.epoch || this.current !== item) return;
      this.release(item);
      this.current = null;
      if (item.last) this.finish(item.message, "onEnd", this.state);
      if (!this.queue.length && activePlayer === this) activePlayer = null;
      this.emit({ status: "idle", messageId: null, text: "" });
      this.pump();
    };
    this.audio.onerror = () => {
      if (epoch === this.epoch) this.fail(new Error("音频未能播放，请重试。"));
    };
    this.prefetch();
    if (this.paused) this.emit({ status: "paused" });
    else await this.playCurrent();
  }
  async playCurrent() {
    const item = this.current,
      epoch = this.epoch;
    if (!item?.url || item.playingPromise) return;
    try {
      item.playingPromise = this.audio.play();
      await item.playingPromise;
      if (epoch !== this.epoch || this.paused) return;
      this.emit({ status: "playing", messageId: item.messageId, error: null });
      if (!item.message.started) {
        item.message.started = true;
        item.message.onStart?.(this.state);
      }
    } catch (error) {
      if (epoch !== this.epoch || this.paused) return;
      if (error.name === "NotAllowedError") {
        this.emit({
          status: "blocked",
          error: "点一下开启声音，小安会继续说。",
        });
        item.message.onBlocked?.(this.state);
      } else this.fail(error);
    } finally {
      item.playingPromise = null;
    }
  }
  fail(error) {
    const message = this.current?.message;
    if (message) this.finish(message, "onError", error);
    this.stop();
    this.emit({
      status: "error",
      error: error.message || "语音暂不可用，请重试。",
    });
  }
  setPaused(paused) {
    this.paused = paused;
    if (paused) {
      this.audio.pause();
      if (this.current) this.emit({ status: "paused" });
    } else if (this.current?.url) {
      this.playCurrent();
      this.prefetch();
    } else this.pump();
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
    else this.unlock();
  }
  release(item) {
    item?.abort?.abort();
    if (item?.url) {
      this.revokeURL(item.url);
      item.url = null;
    }
  }
  stop() {
    this.epoch++;
    const items = [this.current, ...this.queue].filter(Boolean);
    this.current = null;
    this.queue = [];
    this.audio.onended = null;
    this.audio.onerror = null;
    this.audio.pause();
    this.audio.removeAttribute?.("src");
    if (activePlayer === this) activePlayer = null;
    for (const item of items) {
      this.release(item);
      this.finish(item.message, "onCancel", { started: item.message.started });
    }
    this.emit({ status: "idle", messageId: null, text: "", error: null });
  }
  destroy() {
    this.stop();
  }
}
