import React, { useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";
import { Field, MButton } from "./MobileUI.jsx";
import { VOICE_OPTIONS, VOICE_STYLES } from "../shared/speech.js";
import { useSpeechPlayer } from "./useSpeechPlayer.jsx";
export function VoicePreferences({ runId, draft, set }) {
  const [service, setService] = useState(null),
    [error, setError] = useState("");
  const preview = useSpeechPlayer(runId, draft);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/speech/status", { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setService)
      .catch(() => {
        if (!abort.signal.aborted)
          setError("暂时无法检查声音服务，可以点击试听重试播放。");
      });
    return () => abort.abort();
  }, []);
  const speaking = ["loading", "playing", "paused"].includes(preview.status);
  const sample = `${draft.salutation || "周伯"}，我在这里陪您。今天想聊些什么？您慢慢说，我听着呢。`;
  return (
    <>
      <Field label="小安的声音">
        <select
          value={draft.speechVoice || "default"}
          onChange={(e) => set("speechVoice", e.target.value)}
        >
          {VOICE_OPTIONS.map((v) => (
            <option
              key={v.id}
              value={v.id}
              disabled={
                service &&
                !service.configured &&
                ["4197", "4195"].includes(v.id)
              }
            >
              {v.name} · {v.description}
            </option>
          ))}
        </select>
      </Field>
      <Field label="日常聊天语气">
        <select
          value={draft.speechStyle || "neutral"}
          onChange={(e) => set("speechStyle", e.target.value)}
        >
          {VOICE_STYLES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="m-footnote">
        轻快语气适用于度沁遥与度怀安。提醒和求助始终保持平和。
      </p>
      <section className="m-setting-preview m-voice-preview">
        <strong>听听小安怎么说</strong>
        <p>{sample}</p>
        <MButton
          type="button"
          secondary
          onClick={() => {
            if (speaking) preview.player.stop();
            else if (preview.status === "blocked") preview.player.unlock();
            else
              preview.player.enqueue("voice-preview", sample, {
                replace: true,
              });
          }}
        >
          {speaking ? <Square size={16} /> : <Volume2 size={18} />}
          {preview.status === "loading"
            ? "正在准备 · 点击取消"
            : speaking
              ? "停止试听"
              : preview.status === "blocked"
                ? "继续试听"
                : "试听这段问候"}
        </MButton>
        <div
          className="m-voice-preview-status"
          role="status"
          aria-live="polite"
        >
          {preview.error ||
            preview.notice ||
            (preview.voiceName
              ? `本次声音：${preview.voiceName}`
              : "试听使用当前音色、语速和音量；保存后应用到日常播报。")}
        </div>
      </section>
      {(error || (service && !service.configured)) && (
        <p className="m-note">
          {error ||
            "当前使用本机中文声音。配置百度语音服务后，即可试听两种大模型音色。"}
        </p>
      )}
    </>
  );
}
