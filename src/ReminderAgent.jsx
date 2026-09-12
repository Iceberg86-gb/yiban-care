import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Badge, Modal } from "./components.jsx";
import { careDate } from "../shared/daily.js";
import {
  dueReminders,
  freshPlanner,
  PLAN_CATEGORIES,
  RECIPIENTS,
  scheduleLabel,
  wallTime,
  wallInstant,
  WEEKDAYS,
  reminderMessage,
} from "../shared/plans.js";
import "./reminders.css";
import { useSpeechPlayer } from "./useSpeechPlayer.jsx";
import { CompanionAudio } from "./companion-audio.js";

const id = () =>
  window.crypto?.randomUUID?.() ||
  `reminder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmt = (value, tz = "Asia/Shanghai") =>
  value
    ? `${careDate(Date.parse(value), tz)} ${wallTime(Date.parse(value), tz)}`
    : "—";
export function useReminderVoice({
  state,
  recipient,
  now,
  request,
  suspended = false,
}) {
  const storageKey = `yiban-reminder-voice:${recipient}`;
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "on";
    } catch {
      return false;
    }
  });
  const [voiceError, setVoiceError] = useState("");
  const owned = useRef(null),
    claimed = useRef(new Set());
  const voice = useSpeechPlayer(state?.runId, state?.home?.careProfile);
  const { player } = voice;
  const available =
    typeof window !== "undefined" && typeof Audio !== "undefined";
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(storageKey) === "on");
    } catch {
      setEnabled(false);
    }
    player.stop();
    owned.current = null;
    claimed.current.clear();
  }, [recipient, state?.runId]);
  const speak = (o, manual = false) => {
    if (!available || !state || (suspended && !manual)) return false;
    if (!manual && CompanionAudio.isBusy()) return false;
    const audioKey = `yiban-spoken:${state.runId}:${o.id}:${o.attempt}`;
    if (!manual) {
      try {
        if (localStorage.getItem(audioKey)) return false;
      } catch {}
      if (claimed.current.has(audioKey)) return false;
      claimed.current.add(audioKey);
    }
    const session = id(),
      runId = state.runId;
    let provider = null,
      started = false;
    const receipt = (status) =>
      request("/api/reminders/voice", {
        runId,
        occurrenceId: o.id,
        status,
        source: "server_tts",
        provider,
        receiptId: `${session}:${status}`,
      }).catch(() => {});
    const text =
      now - Date.parse(o.scheduledAt) > 60000
        ? reminderMessage(o, true)
        : o.message;
    const failed = () => {
      owned.current = null;
      setVoiceError("本次播报未完成，可点“读给我听”重试。");
      receipt("failed");
    };
    player.enqueue(o.id + ":" + session, text, {
      replace: manual,
      emotion: "neutral",
      onStart: (detail) => {
        started = true;
        provider = detail.provider;
        setVoiceError("");
        try {
          localStorage.setItem(audioKey, "playing");
        } catch {}
        receipt("playing");
      },
      onEnd: () => {
        owned.current = null;
        receipt("completed");
      },
      onError: failed,
      onBlocked: () => setVoiceError("声音尚未开启，请点“读给我听”继续。"),
      onCancel: () => {
        owned.current = null;
        if (started) receipt("failed");
        else claimed.current.delete(audioKey);
      },
    });
    owned.current = o.id;
    if (manual) player.unlock();
    return true;
  };
  useEffect(() => {
    if (!state || !enabled || !available) return;
    const pending = dueReminders(state, recipient);
    if (
      owned.current &&
      (suspended || !pending.some((o) => o.id === owned.current))
    ) {
      player.stop();
      owned.current = null;
    }
    if (suspended || CompanionAudio.isBusy()) return;
    for (const o of pending) {
      if (speak(o)) break;
    }
  }, [
    state?.planner?.occurrences,
    state?.runId,
    enabled,
    suspended,
    Math.floor(now / 1000),
  ]);
  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setVoiceError("");
    try {
      localStorage.setItem(storageKey, next ? "on" : "off");
    } catch {}
    if (!next) {
      player.stop();
      owned.current = null;
    } else if (available)
      player.enqueue("enabled:" + id(), "好的。到提醒时间，我会叫您。", {
        replace: true,
        emotion: "neutral",
      });
  };
  return {
    enabled,
    available,
    voiceError: voiceError || voice.notice || "",
    toggle,
    speak: (o) => speak(o, true),
  };
}

export function VoiceReminderToggle({ voice, small = false }) {
  return (
    <button
      className={`voice-reminder-toggle ${voice.enabled ? "enabled" : ""} ${small ? "small" : ""}`}
      disabled={!voice.available}
      aria-pressed={voice.enabled}
      onClick={voice.toggle}
      title="只在本设备页面打开时播报；使用小安的统一声音"
    >
      <Volume2 size={small ? 15 : 17} />
      {voice.enabled ? "语音提醒已开" : "开启语音提醒"}
    </button>
  );
}
export function ReminderInbox({
  state,
  recipient,
  now,
  busy,
  perform,
  voice,
  suspended = false,
  onPlans,
  onRecord,
  compact = false,
}) {
  const pending = dueReminders(state, recipient);
  if (!pending.length) return null;
  if (suspended)
    return (
      <div className="reminder-held">
        <Bell size={16} />
        <span>
          有 {pending.length} 条计划提醒。当前照护事件优先，自动播报暂缓。
        </span>
        {onPlans && <button onClick={onPlans}>查看计划</button>}
      </div>
    );
  return (
    <section
      className={`reminder-inbox ${compact ? "patient-reminders" : ""}`}
      aria-label="到期计划提醒"
      aria-live="polite"
    >
      <div className="reminder-inbox-heading">
        <span>
          <Bell size={17} />
          按约定，提醒您一下
        </span>
        {onPlans && (
          <button className="text-button" onClick={onPlans}>
            全部计划 <ArrowRight size={13} />
          </button>
        )}
      </div>
      {pending.slice(0, 3).map((o) => (
        <article key={o.id}>
          <div>
            <strong>{o.title}</strong>
            <small>
              原定 {fmt(o.scheduledAt, o.timeZone)} · 北京时间
              {now - Date.parse(o.scheduledAt) > 60000 ? " · 已过原定时间" : ""}
            </small>
            <p>
              {now - Date.parse(o.scheduledAt) > 60000
                ? reminderMessage(o, true)
                : o.message}
            </p>
          </div>
          <div className="reminder-actions">
            <button
              disabled={busy}
              className="button primary"
              onClick={() =>
                perform("/api/reminders/action", {
                  occurrenceId: o.id,
                  version: o.version,
                  action: "acknowledge",
                })
              }
            >
              <CheckCheck size={14} />
              知道了
            </button>
            <button
              disabled={busy}
              className="button secondary"
              onClick={() =>
                perform("/api/reminders/action", {
                  occurrenceId: o.id,
                  version: o.version,
                  action: "snooze",
                  minutes: 5,
                })
              }
            >
              <Clock3 size={14} />5 分钟后
            </button>
            <button
              disabled={!voice.available}
              className="text-button"
              onClick={() => voice.speak(o)}
            >
              <Volume2 size={14} />
              读给我听
            </button>
            {onRecord &&
              ["medication", "sleep", "mood"].includes(o.category) && (
                <button
                  className="text-button"
                  onClick={() => onRecord(o.category)}
                >
                  去记录 <ArrowRight size={13} />
                </button>
              )}
          </div>
        </article>
      ))}
      {pending.length > 3 && (
        <p className="fine-print">
          另有 {pending.length - 3} 条提醒，可在计划助手中查看。
        </p>
      )}
      {voice.voiceError && (
        <p className="voice-error" role="status">
          {voice.voiceError}
        </p>
      )}
    </section>
  );
}
export function ReminderAgentPage({
  state,
  config,
  now,
  busy,
  perform,
  request,
  refreshConfig,
  notify,
  voice,
}) {
  const planner = state.planner || freshPlanner(),
    tz = state.daily.timeZone;
  const [input, setInput] = useState(""),
    [asking, setAsking] = useState(false),
    [editing, setEditing] = useState(null),
    [showAll, setShowAll] = useState(false),
    [listening, setListening] = useState(false),
    [speechError, setSpeechError] = useState("");
  const list = useRef(),
    recognition = useRef();
  const supportsRecognition = Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition,
  );
  const draft = planner.drafts.filter((d) => d.status === "proposed").at(-1);
  const plans = planner.plans
    .filter((p) => showAll || ["active", "paused"].includes(p.status))
    .sort(
      (a, b) =>
        (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
        (a.nextAt || "z").localeCompare(b.nextAt || "z"),
    );
  const configured = config?.qianfan?.configured;
  const examples = [
    "每天晚上八点提醒周伯记录用药",
    "明天上午九点提醒我整理就诊摘要",
    "每周三下午三点半提醒我查看照护记录",
    "一分钟后提醒我记录心情",
  ];
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [planner.messages.length, asking]);
  useEffect(() => () => recognition.current?.abort(), []);
  const submit = async (event) => {
    event?.preventDefault();
    if (!input.trim() || asking) return;
    const text = input.trim();
    setAsking(true);
    setInput("");
    recognition.current?.stop();
    try {
      await request("/api/agent/plan", { text, requestId: id() });
      await refreshConfig();
    } catch (e) {
      notify(e.message, "error");
      setInput(text);
    } finally {
      setAsking(false);
    }
  };
  const dictate = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const r = new Recognition();
    r.lang = "zh-CN";
    r.continuous = false;
    r.interimResults = true;
    recognition.current = r;
    setSpeechError("");
    const prefix = input;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = (event) => {
      setListening(false);
      setSpeechError(
        event.error === "not-allowed"
          ? "尚未获得麦克风权限，可以直接打字。"
          : "语音识别暂不可用，可以直接打字。",
      );
    };
    r.onresult = (event) => {
      let result = "";
      for (let i = 0; i < event.results.length; i++)
        result += event.results[i][0].transcript;
      setInput((prefix ? prefix + " " : "") + result);
    };
    try {
      r.start();
    } catch {
      setListening(false);
      setSpeechError("语音输入未启动，请使用文字输入。");
    }
  };
  const activate = async (plan) => {
    const result = await perform(
      "/api/reminders/activate",
      { draftId: draft.id, version: draft.version, plan },
      "提醒已启用，服务端会按计划触发。",
    );
    if (result) setEditing(null);
  };
  const change = (p, action) =>
    perform("/api/reminders/change", {
      planId: p.id,
      version: p.version,
      action,
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A SMALL PLAN. A GENTLE REMINDER.</p>
          <h1>说一句，把接下来的事安排好</h1>
          <p>告诉有伴提醒什么、什么时候、提醒谁。计划会先整理给你看。</p>
        </div>
        <VoiceReminderToggle voice={voice} />
      </div>
      <div className="planner-layout">
        <section className="planner-conversation">
          <header>
            <span className="planner-avatar">
              <Sparkles size={22} />
            </span>
            <div>
              <h2>有伴 · 计划助手</h2>
              <p>
                {configured
                  ? "千帆理解意图，服务端执行提醒"
                  : "本地简易解析可用 · 千帆等待配置"}
              </p>
            </div>
            <Badge
              tone={config?.qianfan?.planner?.verified ? "green" : "neutral"}
            >
              {config?.qianfan?.planner?.verified
                ? "千帆已验证"
                : configured
                  ? "待调用验证"
                  : "本地解析"}
            </Badge>
          </header>
          <div
            className="planner-messages"
            ref={list}
            role="log"
            aria-label="计划助手对话"
          >
            {!planner.messages.length && (
              <div className="planner-welcome">
                <span>
                  <CalendarClock size={34} strokeWidth={1.4} />
                </span>
                <h3>把记住时间的事，交给有伴。</h3>
                <p>
                  比如“每天晚上八点提醒周伯记录用药”。
                  <br />
                  你也可以继续说“改成晚上九点”，调整草稿。
                </p>
                <div className="planner-examples">
                  {examples.map((t) => (
                    <button key={t} onClick={() => setInput(t)}>
                      {t}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {planner.messages.map((m) => (
              <div className={`planner-message ${m.role}`} key={m.id}>
                {m.role === "assistant" && (
                  <span className="message-spark">
                    <Sparkles size={15} />
                  </span>
                )}
                <div>
                  <p>{m.text}</p>
                  {m.role === "assistant" && (
                    <small>
                      {m.source || "计划助手"}
                      {m.question ? " · 等待补充" : ""}
                    </small>
                  )}
                </div>
              </div>
            ))}
            {asking && (
              <div className="planner-working">
                <LoaderCircle size={15} className="spin" />
                正在整理时间和安排…
              </div>
            )}
          </div>
          <form className="planner-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="reminder-prompt">
              告诉有伴你的提醒计划
            </label>
            <textarea
              id="reminder-prompt"
              value={input}
              maxLength={1200}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="例如：明天上午九点提醒我整理就诊摘要"
              rows={2}
            />
            <div>
              <button
                type="button"
                className={`dictation-button ${listening ? "active" : ""}`}
                disabled={!supportsRecognition || asking}
                onClick={dictate}
                title={
                  supportsRecognition
                    ? "浏览器语音识别可能联网，点击后由浏览器请求麦克风授权"
                    : "当前浏览器不支持语音识别，可直接打字"
                }
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}{" "}
                {listening ? "停止听写" : "语音输入"}
              </button>
              <small>北京时间 · Enter 发送</small>
              <button
                className="button primary"
                disabled={asking || !input.trim()}
              >
                <Send size={15} />
                {asking ? "正在理解" : "发送计划"}
              </button>
            </div>
            {speechError && (
              <p className="voice-error" role="status">
                {speechError}
              </p>
            )}
            <p className="planner-input-note">
              语音输入使用浏览器能力；播报使用小安的统一声音
              RTC；听写后可修改再发送。
            </p>
          </form>
        </section>
        <aside className="planner-side">
          {draft && (
            <section className="planner-draft">
              <div className="section-heading">
                <h2>待启用的提醒</h2>
                <Badge tone="amber">草稿</Badge>
              </div>
              <p className="draft-intro">
                时间与接收人已整理好，核对后即可启用。
              </p>
              <PlanForm
                key={draft.id}
                plan={draft}
                now={now}
                timeZone={tz}
                disabled={busy || asking}
                onSave={activate}
                buttonText="启用这个提醒"
                notify={notify}
              />
            </section>
          )}
          <section className="planner-plan-list">
            <div className="section-heading">
              <h2>
                我的提醒计划{" "}
                <span>
                  {planner.plans.filter((p) => p.status === "active").length}
                </span>
              </h2>
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "仅看进行中" : "查看全部"}
              </button>
            </div>
            {!plans.length ? (
              <div className="no-reminder-plans">
                <Bell size={26} />
                <p>还没有{showAll ? "" : "进行中的"}提醒计划</p>
                <small>
                  从左侧说一句话开始。
                  <br />
                  草稿启用后，才会开始计时。
                </small>
              </div>
            ) : (
              plans.map((p) => (
                <article className="reminder-plan-card" key={p.id}>
                  <div>
                    <h3>{p.title}</h3>
                    <Badge tone={p.status === "active" ? "green" : "neutral"}>
                      {
                        {
                          active: "已启用",
                          paused: "已暂停",
                          completed: "已触发",
                          cancelled: "已取消",
                        }[p.status]
                      }
                    </Badge>
                  </div>
                  <p>
                    <CalendarClock size={14} />
                    {scheduleLabel(p.schedule, p.timeZone)}
                  </p>
                  <small>{RECIPIENTS[p.recipient]} · 北京时间</small>
                  {p.nextAt && p.status === "active" && (
                    <div className="plan-next">
                      下一次 <strong>{fmt(p.nextAt, p.timeZone)}</strong>
                    </div>
                  )}
                  <div className="plan-card-actions">
                    {p.status !== "cancelled" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setEditing(p)}
                      >
                        <Settings2 size={13} />
                        修改
                      </button>
                    )}
                    {p.status === "active" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => change(p, "pause")}
                      >
                        <Pause size={13} />
                        暂停
                      </button>
                    )}
                    {p.status === "paused" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => change(p, "resume")}
                      >
                        <Play size={13} />
                        恢复
                      </button>
                    )}
                    {p.status !== "cancelled" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => change(p, "cancel")}
                      >
                        <X size={13} />
                        取消
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>
          <div className="planner-operating-note">
            <Clock3 size={20} />
            <div>
              <strong>理解可以慢一点，计时不会停。</strong>
              <p>
                已启用计划由本地服务保存并执行，模型暂时不可用也能提醒。页面需保持打开，才能即时显示或播报。
              </p>
            </div>
          </div>
        </aside>
      </div>
      <div className="planner-bottom-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>提醒记录</h2>
            <Badge>确认提醒 ≠ 完成事项</Badge>
          </div>
          {!planner.occurrences.length ? (
            <p className="section-description">
              到点后，这里记录触发时间、确认与延后状态。不会自动勾选已经服药。
            </p>
          ) : (
            <div className="reminder-history">
              {[...planner.occurrences]
                .reverse()
                .slice(0, 12)
                .map((o) => (
                  <div key={o.id}>
                    <Bell size={15} />
                    <span>
                      <strong>{o.title}</strong>
                      <small>
                        {fmt(o.scheduledAt, o.timeZone)} ·{" "}
                        {RECIPIENTS[o.recipient]}
                      </small>
                    </span>
                    <Badge tone={o.status === "pending" ? "amber" : "neutral"}>
                      {
                        {
                          pending: "等待确认",
                          acknowledged: "已确认提醒",
                          snoozed: "稍后提醒",
                          withdrawn: "已停止",
                        }[o.status]
                      }
                    </Badge>
                    {o.status === "snoozed" && (
                      <small>延后至 {fmt(o.snoozeUntil, o.timeZone)}</small>
                    )}
                  </div>
                ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Agent 与调度记录</h2>
            <Sparkles size={17} />
          </div>
          <details className="planner-logs">
            <summary>查看实际调用与执行结果 · {planner.logs.length} 条</summary>
            {[...planner.logs]
              .reverse()
              .slice(0, 20)
              .map((l) => (
                <div key={l.id}>
                  <code>{l.tool}</code>
                  <Badge>
                    {l.origin === "qianfan"
                      ? "千帆"
                      : l.origin === "local"
                        ? "本地解析"
                        : l.origin === "scheduler"
                          ? "服务端调度"
                          : l.origin === "user"
                            ? "用户操作"
                            : "故障注入"}
                  </Badge>
                  <p>{l.result}</p>
                </div>
              ))}
          </details>
          <p className="fine-print">
            记录来自真实的请求、校验与执行，不生成“思考过程”。这类计划不会修改紧急照护截止时间。
          </p>
        </section>
      </div>
      {editing && (
        <Modal
          title="修改提醒计划"
          subtitle="保存后按新的时间继续提醒，已经触发的旧提醒会保留处理记录。"
          onClose={() => setEditing(null)}
        >
          <PlanForm
            key={editing.id}
            plan={editing}
            now={now}
            timeZone={tz}
            disabled={busy}
            buttonText="保存并启用"
            notify={notify}
            onSave={async (plan) => {
              const result = await perform(
                "/api/reminders/change",
                {
                  planId: editing.id,
                  version: editing.version,
                  action: "edit",
                  plan,
                },
                "计划已更新。",
              );
              if (result) setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
function PlanForm({
  plan,
  now,
  timeZone,
  disabled,
  onSave,
  buttonText,
  notify,
}) {
  const [title, setTitle] = useState(plan.title),
    [category, setCategory] = useState(plan.category),
    [recipient, setRecipient] = useState(plan.recipient),
    [type, setType] = useState(plan.schedule.type),
    [date, setDate] = useState(
      plan.schedule.type === "once"
        ? careDate(Date.parse(plan.schedule.at), timeZone)
        : careDate(now, timeZone),
    ),
    [time, setTime] = useState(
      plan.schedule.type === "once"
        ? wallTime(Date.parse(plan.schedule.at), timeZone)
        : plan.schedule.time,
    ),
    [days, setDays] = useState(plan.schedule.weekdays || [1]);
  const save = (e) => {
    e.preventDefault();
    try {
      const schedule =
        type === "once"
          ? {
              type,
              at: new Date(wallInstant(date, time, timeZone)).toISOString(),
            }
          : {
              type,
              time: time.slice(0, 5),
              ...(type === "weekly" ? { weekdays: days } : {}),
            };
      onSave({ title, category, recipient, message: plan.message, schedule });
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <form className="plan-form" onSubmit={save}>
      <label>
        提醒什么
        <input
          value={title}
          maxLength={80}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="plan-form-pair">
        <label>
          提醒谁
          <select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          >
            {Object.entries(RECIPIENTS).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          重复方式
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="once">只提醒一次</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </label>
      </div>
      <div className="plan-form-pair">
        {type === "once" && (
          <label>
            日期
            <input
              type="date"
              min={careDate(now, timeZone)}
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
        <label>
          北京时间
          <input
            type="time"
            step={type === "once" ? 1 : 60}
            value={time}
            required
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
      {type === "weekly" && (
        <fieldset className="plan-weekdays">
          <legend>每周哪几天</legend>
          {WEEKDAYS.map((n, i) => (
            <label key={n} className={days.includes(i + 1) ? "checked" : ""}>
              <input
                type="checkbox"
                checked={days.includes(i + 1)}
                onChange={(e) =>
                  setDays(
                    e.target.checked
                      ? [...days, i + 1]
                      : days.filter((d) => d !== i + 1),
                  )
                }
              />
              {n}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        事项类型
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(PLAN_CATEGORIES).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {category === "medication" && (
        <p className="plan-medication-note">
          仅提醒核对既定医嘱和用药记录，不代表已经服药，也不会设置剂量。
        </p>
      )}
      <button
        className="button primary full"
        disabled={
          disabled || !title.trim() || (type === "weekly" && !days.length)
        }
      >
        <CheckCheck size={16} />
        {buttonText}
      </button>
    </form>
  );
}
