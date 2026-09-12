import { useSpeechPlayer } from "./useSpeechPlayer.jsx";
import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Battery,
  Bell,
  BookOpen,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  Heart,
  House,
  Layers3,
  MapPin,
  Mic,
  Navigation,
  Phone,
  Play,
  Plus,
  Route,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Video,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import {
  Badge,
  Countdown,
  Logo,
  Modal,
  Portrait,
  STATUS,
  time,
} from "./components.jsx";
import {
  freshHome,
  homeReport,
  mapFacts,
  HOME_RULES,
  GUIDANCE,
  DEFAULT_ROUTE,
} from "../shared/home.js";
import { careDate, familyRisks } from "../shared/daily.js";
import "./home.css";
const hState = (state, now) => state.home || freshHome(now);
const fileData = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
const shortDate = (d) => d.slice(5).replace("-", "/");

export function CameraScene({ home, device, event, second = null }) {
  const down =
      second !== null ? second >= -3 : home.monitor.pose === "低位姿态",
    bend =
      second !== null
        ? second >= -8 && second < -3
        : home.monitor.pose === "弯腰拾物";
  const pose =
    second !== null
      ? down
        ? "低位姿态"
        : bend
          ? "弯腰拾物"
          : "站立"
      : home.monitor.pose;
  const cx = down ? 540 : 490,
    cy = down ? 340 : 210;
  return (
    <div className="camera-scene">
      <svg
        viewBox="0 0 960 510"
        role="img"
        aria-label="模拟照护画面，未连接真实摄像头"
      >
        <defs>
          <linearGradient id="room-wall" x2="0" y2="1">
            <stop stopColor="#63716d" />
            <stop offset="1" stopColor="#82908b" />
          </linearGradient>
          <pattern
            id="room-floor"
            width="120"
            height="65"
            patternUnits="userSpaceOnUse"
            patternTransform="skewX(-30)"
          >
            <path
              d="M120 0H0V65"
              fill="none"
              stroke="#a2a68f"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="960" height="510" fill="url(#room-wall)" />
        <path d="M0 325H960V510H0Z" fill="#b8b5a0" />
        <path d="M0 325H960V510H0Z" fill="url(#room-floor)" />
        <path d="M0 325H960" stroke="#4d5c57" strokeWidth="5" />
        <rect
          x="45"
          y="65"
          width="240"
          height="197"
          fill="#bbcdc4"
          stroke="#d3dcd2"
          strokeWidth="10"
        />
        <path d="M165 69V257M50 164H280" stroke="#d7dfd3" strokeWidth="7" />
        <path d="M48 261 211 510H541L283 260" fill="#edf0d0" opacity=".13" />
        <rect x="605" y="217" width="268" height="138" rx="24" fill="#4c6357" />
        <rect x="618" y="230" width="113" height="76" rx="12" fill="#68806f" />
        <rect x="742" y="230" width="115" height="76" rx="12" fill="#68806f" />
        <rect x="599" y="300" width="281" height="64" rx="16" fill="#4c6153" />
        <rect x="601" y="274" width="26" height="78" rx="9" fill="#435d4c" />
        <rect x="855" y="274" width="27" height="78" rx="9" fill="#435d4c" />
        <path d="M625 363v22m231-22v22" stroke="#354b3e" strokeWidth="9" />
        <ellipse
          cx="739"
          cy="403"
          rx="121"
          ry="39"
          fill="#807f69"
          opacity=".28"
        />
        <path d="M670 377h121l16 29H649Z" fill="#ddc39a" />
        <path d="M664 405v24m128-24v24" stroke="#887d5b" strokeWidth="7" />
        <rect x="735" y="363" width="19" height="13" rx="2" fill="#b89269" />
        <path d="M337 320v-180" stroke="#b8c0ac" strokeWidth="6" />
        <path d="M305 157h66l-12-42h-40Z" fill="#d9dcc0" />
        <ellipse cx="337" cy="322" rx="26" ry="7" fill="#8c9a85" />
        <g
          transform={`translate(${cx} ${cy}) rotate(${down ? -79 : bend ? 27 : 0})`}
        >
          <ellipse
            cx="1"
            cy="160"
            rx="49"
            ry="9"
            fill="#43554a"
            opacity=".25"
          />
          <circle cx="0" cy="0" r="23" fill="#dac1a0" />
          <path d="M-20-6q-4-29 22-23 26 4 20 24" fill="#dce0d2" />
          <path d="M-28 38q28-19 56 0l9 72h-74Z" fill="#cbba86" />
          <path
            d="M-22 109-12 156m34-47 11 44"
            stroke="#42584d"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M-32 42-51 98M29 42 51 93"
            stroke="#c7b386"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M-15 157h-15m44-3h14"
            stroke="#34483d"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </g>
        <rect
          x={down ? 380 : 421}
          y={down ? 286 : 170}
          width={down ? 230 : 144}
          height={down ? 122 : 220}
          rx="6"
          fill="none"
          stroke={event ? "#eed29b" : "#bddec4"}
          strokeWidth="2"
          strokeDasharray="9 3"
        />
        <g fill={event ? "#ecd19b" : "#d4e7d4"}>
          <rect
            x={down ? 380 : 421}
            y={down ? 259 : 143}
            width="164"
            height="26"
            rx="3"
          />
        </g>
        <text
          x={down ? 389 : 430}
          y={down ? 277 : 161}
          fill="#365342"
          fontSize="12"
        >
          老人 · {pose}（模拟）
        </text>
        <g opacity=".65" stroke="#f7f9ef" fill="none">
          <path
            d="M25 48V24H51M909 24h26v24M25 462v24h26M909 486h26v-24"
            strokeWidth="2"
          />
        </g>
      </svg>
      <div className="camera-overlay">
        <span>
          <i />
          {device?.online ? "模拟画面" : "模拟设备离线"}
        </span>
        <span>{device?.name || "客厅摄像头"}</span>
      </div>
      <div className="camera-footer">
        <span>
          <ShieldCheck size={13} />
          画面为情境重建 · 非真实视频流
        </span>
        <span>
          视觉
          {event?.simulatedConfidence
            ? ` ${event.simulatedConfidence.toFixed(2)}`
            : ""}{" "}
          · 模拟
        </span>
      </div>
      {!device?.online && (
        <div className="camera-offline">
          <Wifi size={30} />
          <strong>设备离线</strong>
          <p>保留最近状态，无法确认当前画面。</p>
        </div>
      )}
    </div>
  );
}
function ReplayDialog({ event, home, onClose }) {
  const [second, setSecond] = useState(-30);
  return (
    <Modal
      title="事前30秒情境回放"
      subtitle="预设情境重建，不是实际录像。拖动时间轴查看模拟姿态变化。"
      wide
      onClose={onClose}
    >
      <CameraScene
        home={home}
        device={
          home.devices.find((d) => d.id === event.cameraId) || home.devices[0]
        }
        event={event}
        second={second}
      />
      <div className="replay-controls">
        <span>
          {time(new Date(Date.parse(event.createdAt) + second * 1000))}
        </span>
        <label>
          <span className="sr-only">回放时间</span>
          <input
            type="range"
            min="-30"
            max="10"
            step="1"
            value={second}
            onChange={(e) => setSecond(Number(e.target.value))}
          />
        </label>
        <strong>
          {second > 0 ? "+" : ""}
          {second}s
        </strong>
      </div>
      <p className="fine-print">
        回放仅用于核对产品流程。没有接入小度摄像头或真实30秒缓存。
      </p>
    </Modal>
  );
}
function CommandDialog({ home, runId, kind, onClose, perform, busy }) {
  const preview = useSpeechPlayer(runId, home.careProfile);
  const [text, setText] = useState(
    kind === "informed"
      ? "周伯，有伴将按家人设置提供照护提醒，您可以随时告诉家人您的想法。"
      : "周伯，您现在需要帮助吗？",
  );
  const device =
    home.devices.find((d) => d.type === "screen") || home.devices[0];
  const recent = home.commands.at(-1);
  return (
    <Modal
      title={kind === "talk" ? "双向对讲演示" : "向终端发送语音提醒"}
      subtitle="终端连接和通话均为模拟；试听使用小安的统一声音。"
      onClose={onClose}
    >
      {kind !== "talk" && (
        <label className="home-field">
          播报文字
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={300}
          />
        </label>
      )}
      <div className="home-command-state">
        <Smartphone size={25} />
        <div>
          <strong>{device.name}</strong>
          <p>
            {device.online ? "模拟在线" : "模拟离线"} · 最近指令：
            {recent
              ? {
                  pending: "等待回执",
                  completed_simulated: "模拟完成",
                  failed: "失败",
                }[recent.status]
              : "暂无"}
          </p>
        </div>
      </div>
      {(preview.error || preview.notice) && (
        <p role="status" className="fine-print">
          {preview.error || preview.notice}
        </p>
      )}
      <div className="modal-actions">
        {kind !== "talk" && (
          <button
            className="button secondary"
            disabled={!text.trim()}
            onClick={() => {
              if (["loading", "playing"].includes(preview.status))
                preview.player.stop();
              else
                preview.player.enqueue("command-preview", text, {
                  replace: true,
                  emotion: "neutral",
                });
            }}
          >
            <Volume2 size={15} />
            {["loading", "playing"].includes(preview.status)
              ? "停止试听"
              : "本机试听"}
          </button>
        )}
        <button
          className="button primary"
          disabled={busy || !device.online}
          onClick={() =>
            perform(
              "/api/home/command",
              { kind, deviceId: device.id, text },
              "模拟指令已排队，等待回执。",
            )
          }
        >
          <Phone size={15} />
          {kind === "talk" ? "模拟接通对讲" : "模拟下发智能屏"}
        </button>
        {kind === "talk" && (
          <button
            className="button secondary"
            onClick={() =>
              perform(
                "/api/home/command",
                { kind: "hangup", deviceId: device.id },
                "模拟对讲已结束。",
              )
            }
          >
            结束
          </button>
        )}
      </div>
    </Modal>
  );
}
export function EmergencyDialog({ home, event, onClose, perform, busy }) {
  const card = home.emergency;
  return (
    <Modal
      title="急救信息，提前放在手边"
      subtitle="当前为演示；没有真实拨打120，也不代表机构已受理。"
      wide
      onClose={onClose}
    >
      <div className="emergency-card">
        <div>
          <Badge tone="red">
            {event?.emergencyActive ? "无人接手 · 需要决策" : "急救资料卡"}
          </Badge>
          <h2>周伯 · {card.age} 岁</h2>
          <p>{card.source}</p>
          <small>
            最后核对：
            {card.reviewedAt
              ? new Date(card.reviewedAt).toLocaleString("zh-CN")
              : "尚未核对"}
          </small>
        </div>
        <dl>
          <dt>诊断／档案</dt>
          <dd>{card.diagnoses.join("；")}</dd>
          <dt>过敏史</dt>
          <dd>{card.allergies.join("；")}</dd>
          <dt>在服药物</dt>
          <dd>
            {card.medications.length
              ? card.medications
                  .map((m) => `${m.name} ${m.dose || "剂量待核对"}`)
                  .join("；")
              : "尚无已核对用药清单"}
          </dd>
          <dt>最近位置</dt>
          <dd>
            {event?.place || "预设家庭空间"}
            <small>{event?.locationSource || "需现场核实"}</small>
          </dd>
        </dl>
      </div>
      <div className="emergency-actions">
        <button
          className="button primary"
          disabled={busy || !home.policy.emergencyCallEnabled}
          onClick={() =>
            perform(
              "/api/home/command",
              {
                kind: "emergency",
                deviceId: "phone",
                text: "演示120入口，不实际拨号",
              },
              "已记录模拟120操作，未拨打真实电话。",
            )
          }
        >
          <Phone size={16} />
          模拟呼叫120
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            perform(
              "/api/home/command",
              {
                kind: "carer_call",
                deviceId: "phone",
                text: home.members
                  .filter((m) => m.enabled && m.atHome)
                  .map((m) => m.name)
                  .join("、"),
              },
              "已记录模拟联系在宅护工。",
            )
          }
        >
          <Users size={16} />
          模拟联系在宅护工
        </button>
      </div>
      <p className="fine-print">
        {home.policy.emergencyCallEnabled
          ? "120演示入口已开启。"
          : "可在“我的 → 告警策略”开启120演示入口。"}
        真实电话、免打扰穿透和急救受理待接入。
      </p>
    </Modal>
  );
}

export function MonitorPage({
  state,
  now,
  config,
  busy,
  perform,
  onView,
  onEvent,
  children,
}) {
  const home = hState(state, now),
    [cameraId, setCameraId] = useState(home.monitor.cameraId),
    [dialog, setDialog] = useState(null),
    [taskId, setTaskId] = useState(null);
  const active = state.events.find((e) => e.id === state.activeId),
    device =
      home.devices.find((d) => d.id === cameraId) ||
      home.devices.find((d) => d.type === "camera");
  const risk = familyRisks(state),
    currentEvent = active?.status !== "closed" ? active : null,
    band = home.devices.find((d) => d.type === "band");
  const feed = [
    ...home.feed,
    ...state.events.flatMap((e) =>
      e.timeline.map((t) => ({
        ...t,
        id: t.id,
        title: t.title,
        detail: t.detail,
        level:
          t.kind === "alert"
            ? "danger"
            : t.kind === "evidence"
              ? "abnormal"
              : "normal",
        eventId: e.id,
      })),
    ),
  ]
    .filter((t) => careDate(Date.parse(t.at)) === careDate(now))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  const task =
      home.routineTasks.find((t) => t.id === taskId) ||
      home.routineTasks.at(-1),
    occ = task
      ? state.planner.occurrences.find((o) => o.id === task.occurrenceId)
      : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AGENT ON WATCH. FAMILY IN CONTROL.</p>
          <h1>有人值守，每一步由家人决定</h1>
          <p>周伯的居家照护 · 规则主动发现、触达与跟进 · 设备输入为模拟</p>
        </div>
        <button className="button primary" onClick={() => onView("plans")}>
          <Sparkles size={16} />
          安排照护提醒
        </button>
      </div>
      {currentEvent && (
        <div
          className={`monitor-alert ${currentEvent.emergencyActive ? "emergency" : ""}`}
        >
          <span>
            <Bell size={23} />
          </span>
          <div>
            <strong>
              {currentEvent.emergencyActive
                ? "尚无人接手，请决定急救联络"
                : `${currentEvent.title} · ${STATUS[currentEvent.status]}`}
            </strong>
            <p>{currentEvent.description}</p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              currentEvent.emergencyActive
                ? setDialog({ kind: "emergency" })
                : onEvent(currentEvent.id)
            }
          >
            {currentEvent.emergencyActive ? "急救信息与操作" : "立即跟进"}
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="monitor-top-grid">
        <section className="monitor-camera-panel">
          <div className="home-panel-header">
            <div>
              <h2>实时照护画面</h2>
              <Badge>模拟视频流</Badge>
            </div>
            <label>
              <span className="sr-only">选择摄像头</span>
              <select
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
              >
                {home.devices
                  .filter((d) => d.type === "camera")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.zone}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <CameraScene home={home} device={device} event={currentEvent} />
          <div className="camera-toolbar">
            <button onClick={() => setDialog({ kind: "talk" })}>
              <Mic size={16} />
              双向对讲
            </button>
            <button onClick={() => setDialog({ kind: "tts" })}>
              <Volume2 size={16} />
              语音提醒
            </button>
            <button onClick={() => onView("elder-preview")}>
              <Smartphone size={16} />
              查看老人端
            </button>
            <span>
              {home.privacy.nightEventOnly
                ? "夜间仅事件片段（策略）"
                : "连续画面策略（未接入）"}
            </span>
          </div>
        </section>
        <aside className="monitor-vitals">
          <div className="section-heading">
            <h2>生命体征与活动</h2>
            <Badge>模拟</Badge>
          </div>
          {[
            {
              label: "心率",
              value: home.vitals.heartRate,
              unit: "次/分",
              icon: Heart,
            },
            {
              label: "血氧",
              value: home.vitals.oxygen,
              unit: "%",
              icon: Activity,
            },
            {
              label: "今日步数",
              value: home.vitals.steps,
              unit: "步",
              icon: Route,
            },
          ].map((v) => (
            <div className="vital-row" key={v.label}>
              <span>
                <v.icon size={20} />
              </span>
              <div>
                <small>{v.label}</small>
                <strong>
                  {band?.online && band.worn && band.enabled ? v.value : "—"}
                  <em>{v.unit}</em>
                </strong>
              </div>
              <svg viewBox="0 0 100 34" aria-hidden="true">
                <path
                  d="M0 22 9 22 16 15 22 26 30 21 36 21 42 4 47 32 54 18 63 22 72 16 82 21 100 20"
                  fill="none"
                  stroke="#93a87d"
                  strokeWidth="1.6"
                />
              </svg>
            </div>
          ))}
          <div className="vitals-footer">
            <Battery size={14} />
            <span>
              手环 {band?.battery ?? "—"}% ·{" "}
              {band?.worn ? "模拟佩戴" : "模拟离腕"}
            </span>
          </div>
          <p className="fine-print">
            最近样本 {time(home.vitals.lastSync)}
            。当前没有真实手环接入，不能据此判断身体状态。
          </p>
        </aside>
      </div>
      <div className="home-section-title">
        <div>
          <h2>主动发现，按规则确认</h2>
          <p>切换一个情境，观察证据、联络和责任交接</p>
        </div>
        <button className="text-button" onClick={() => onView("my")}>
          调整个人规则 <Settings2 size={14} />
        </button>
      </div>
      <div className="behavior-scenarios">
        {Object.entries(HOME_RULES).map(([key, r]) => (
          <button
            key={key}
            disabled={busy || !home.rules[key].enabled}
            onClick={() =>
              perform(
                "/api/home/scenario",
                { scenario: key, cameraId },
                "模拟信号已进入照护流程。",
              )
            }
          >
            <Activity size={21} />
            <span>
              <strong>{r.label}</strong>
              <small>
                {home.rules[key].sensitivity === "high"
                  ? "高"
                  : home.rules[key].sensitivity === "medium"
                    ? "中"
                    : "低"}
                灵敏度 · 演示
              </small>
            </span>
            <Play size={12} />
          </button>
        ))}
      </div>
      <div className="monitor-mid-grid">
        <section className="panel care-actions">
          <div className="section-heading">
            <h2>定时照护动作</h2>
            <button className="text-button" onClick={() => onView("plans")}>
              全部计划 <ArrowRight size={14} />
            </button>
          </div>
          {state.planner.plans
            .filter((p) => p.status === "active")
            .slice(0, 3)
            .map((p) => (
              <div className="care-action-row" key={p.id}>
                <Clock3 size={17} />
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.recipient === "patient" ? "老人端" : "家属端"} · 下次{" "}
                    {p.nextAt ? time(p.nextAt) : "待确认"}
                  </small>
                </div>
                <Badge tone="green">服务端计时</Badge>
              </div>
            ))}
          {!state.planner.plans.some((p) => p.status === "active") && (
            <p className="section-description">
              还没有启用的照护计划。用一句话安排用药记录、饮水、活动或陪护提醒。
            </p>
          )}
          <div className="medication-demonstration">
            <div>
              <strong>用药动作链核实</strong>
              <Badge tone={task?.verified ? "green" : "amber"}>
                {task?.verified
                  ? "家属已核实"
                  : task?.candidate
                    ? "观察到动作 · 待核实"
                    : "未形成候选"}
              </Badge>
            </div>
            {home.routineTasks.length > 1 && (
              <label className="home-field">
                选择用药核实任务
                <select
                  value={task?.id || ""}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  {home.routineTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {
                        state.planner.occurrences.find(
                          (o) => o.id === t.occurrenceId,
                        )?.title
                      }{" "}
                      · {time(t.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              取药 → 送口 →
              饮水，仅作为动作证据。未确认时按配置重复提醒，再交给家属。
            </p>
            {task && (
              <small>
                提醒 {task.attempts}/{home.policy.routineAttempts} 次 ·{" "}
                {occ?.title}
              </small>
            )}
            <div className="home-button-row">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  perform(
                    "/api/home/medication-demo",
                    {},
                    "已开始一条模拟用药核实任务。",
                  )
                }
              >
                开始用药演示
              </button>
              <button
                className="button secondary"
                disabled={busy || !task}
                onClick={() =>
                  perform(
                    "/api/home/medication-evidence",
                    { occurrenceId: task.occurrenceId, action: "sequence" },
                    "动作链已作为候选保存。",
                  )
                }
              >
                模拟动作链
              </button>
              <button
                className="button primary"
                disabled={busy || !task?.candidate || task?.verified}
                onClick={() =>
                  perform(
                    "/api/home/medication-evidence",
                    { occurrenceId: task.occurrenceId, action: "confirm" },
                    "家属已核实并记录。",
                  )
                }
              >
                家属确认服用
              </button>
            </div>
            <small>再次模拟同一用药项的动作链，可演示重复服药核实提醒。</small>
          </div>
        </section>
        <section className="panel watch-status">
          <div className="section-heading">
            <h2>值守与联络状态</h2>
            <Badge tone="green">规则运行中</Badge>
          </div>
          <div className="watch-metrics">
            <div>
              <strong>
                {risk.filter((r) => r.priority === "urgent").length}
              </strong>
              <span>优先处理</span>
            </div>
            <div>
              <strong>
                {home.members.filter((m) => m.level === 1 && m.enabled).length}
              </strong>
              <span>一级联系人</span>
            </div>
            <div>
              <strong>
                {home.devices.filter((d) => d.online && d.enabled).length}/
                {home.devices.length}
              </strong>
              <span>模拟在线</span>
            </div>
          </div>
          <div className="watch-chain">
            <span>
              <b>{home.policy.confirmationSeconds}s</b>患者侧确认
            </span>
            <ArrowRight size={14} />
            <span>
              <b>+{home.policy.tierTwoSeconds}s</b>二级追加
            </span>
            <ArrowRight size={14} />
            <span>
              <b>+{home.policy.emergencySeconds}s</b>急救提示
            </span>
          </div>
          <p>
            一级成员全部立即联络，三级仅通报。后两段从首次升级联络起计时，当前全部为模拟通道。
          </p>
          <button
            className="button secondary full"
            onClick={() => setDialog({ kind: "emergency" })}
          >
            <FileText size={15} />
            查看急救信息卡
          </button>
          <button
            className="text-button"
            onClick={() =>
              perform(
                "/api/home/scenario",
                { scenario: "bend", cameraId },
                "已触发弯腰拾物纠错情境。",
              )
            }
          >
            演示弯腰误报与个体纠错 <ArrowRight size={14} />
          </button>
        </section>
      </div>
      {currentEvent && (
        <details className="monitor-event-detail" open>
          <summary>
            <span>
              <Bell size={16} />
              当前事件处置工作台
            </span>
            <Badge tone="amber">{STATUS[currentEvent.status]}</Badge>
          </summary>
          {children}
        </details>
      )}
      <section className="panel today-feed">
        <div className="section-heading">
          <h2>今日 AI 事件流</h2>
          <button className="text-button" onClick={() => onView("events")}>
            全部事件 <ArrowRight size={14} />
          </button>
        </div>
        {feed.length ? (
          feed.map((item) => (
            <div className={`feed-item ${item.level}`} key={item.id}>
              <span className="feed-dot" />
              <time>{time(item.at)}</time>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <Badge
                tone={
                  item.level === "danger"
                    ? "red"
                    : item.level === "abnormal"
                      ? "amber"
                      : "green"
                }
              >
                {item.level === "danger"
                  ? "危险"
                  : item.level === "abnormal"
                    ? "需关注"
                    : "记录"}
              </Badge>
              {item.eventId && (
                <button
                  className="text-button"
                  onClick={() =>
                    setDialog({
                      kind: "replay",
                      event: state.events.find((e) => e.id === item.eventId),
                    })
                  }
                >
                  回放
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="home-empty">
            <Sparkles size={29} />
            <p>
              当前没有新的照护事件。可启动上方情境，查看主动确认与联络记录。
            </p>
          </div>
        )}
      </section>
      {dialog?.kind === "replay" && dialog.event && (
        <ReplayDialog
          event={dialog.event}
          home={home}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "emergency" && (
        <EmergencyDialog
          home={home}
          event={currentEvent}
          busy={busy}
          perform={perform}
          onClose={() => setDialog(null)}
        />
      )}
      {["tts", "talk"].includes(dialog?.kind) && (
        <CommandDialog
          runId={state.runId}
          home={home}
          kind={dialog.kind}
          busy={busy}
          perform={perform}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

export function NeighborhoodMap({
  home,
  showNavigation = false,
  onAddPoint = null,
}) {
  const map = home.map,
    last = map.points.at(-1) || { x: 0, y: 0 };
  const pt = (p) => `${450 + p.x * 0.48},${340 - p.y * 0.48}`;
  return (
    <svg
      className="home-map-svg"
      viewBox="0 0 900 600"
      role="img"
      aria-label="虚构社区地图，路线与围栏均为演示"
      onClick={(e) => {
        if (!onAddPoint) return;
        const p = e.currentTarget.createSVGPoint();
        p.x = e.clientX;
        p.y = e.clientY;
        const c = p.matrixTransform(e.currentTarget.getScreenCTM().inverse());
        onAddPoint({
          x: Math.round((c.x - 450) / 0.48),
          y: Math.round((340 - c.y) / 0.48),
        });
      }}
    >
      <defs>
        <pattern
          id="city-blocks"
          width="150"
          height="120"
          patternUnits="userSpaceOnUse"
        >
          <rect
            x="15"
            y="15"
            width="119"
            height="90"
            rx="9"
            fill="#e4e9dd"
            stroke="#d5ddce"
          />
          <path d="M0 0h150M0 0v120" stroke="#fffef8" strokeWidth="20" />
        </pattern>
      </defs>
      <rect width="900" height="600" fill="#f0f2e8" />
      <rect width="900" height="600" fill="url(#city-blocks)" />
      <path
        d="M780-20q-90 170-45 300t-100 350"
        fill="none"
        stroke="#c9dfd7"
        strokeWidth="65"
      />
      <path d="M0 360H900M450 0V600" stroke="#fffdf5" strokeWidth="36" />
      <path d="M0 360H900M450 0V600" stroke="#dce2d4" strokeDasharray="7 8" />
      <g fill="#b4c5a4">
        <circle cx="105" cy="195" r="42" />
        <circle cx="160" cy="219" r="37" />
        <circle cx="109" cy="251" r="38" />
        <circle cx="606" cy="86" r="28" />
        <circle cx="571" cy="118" r="32" />
      </g>
      <text x="71" y="283" className="map-label">
        社区活动园
      </text>
      <text x="478" y="395" className="map-label">
        青禾路
      </text>
      <text x="480" y="308" className="map-label">
        家 · 虚构位置
      </text>
      <text x="685" y="67" className="map-label">
        东侧步道
      </text>
      <circle
        cx="450"
        cy="340"
        r={map.radius * 0.48}
        fill="#5a8652"
        fillOpacity=".05"
        stroke="#88a577"
        strokeWidth="2"
        strokeDasharray="7 7"
      />
      <polyline
        points={map.route.map(pt).join(" ")}
        fill="none"
        stroke="#a4b58d"
        strokeWidth="10"
        strokeOpacity=".3"
        strokeLinecap="round"
      />
      <polyline
        points={map.route.map(pt).join(" ")}
        fill="none"
        stroke="#749c64"
        strokeWidth="3"
        strokeDasharray="8 6"
      />
      {map.points.length > 1 && (
        <polyline
          points={map.points.map(pt).join(" ")}
          fill="none"
          stroke="#bd9259"
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
      {showNavigation && (
        <path
          d={`M450 340L450 ${340 - last.y * 0.48}L${450 + last.x * 0.48} ${340 - last.y * 0.48}`}
          stroke="#477867"
          strokeWidth="5"
          fill="none"
        />
      )}
      <circle
        cx="450"
        cy="340"
        r="14"
        fill="#527d48"
        stroke="white"
        strokeWidth="4"
      />
      <path d="m444 340 6-5 6 5v6h-12Z" fill="#f4faeb" />
      <circle
        cx={450 + last.x * 0.48}
        cy={340 - last.y * 0.48}
        r="27"
        fill="#c39a64"
        opacity=".16"
      />
      <circle
        cx={450 + last.x * 0.48}
        cy={340 - last.y * 0.48}
        r="12"
        fill="#b58a54"
        stroke="#fffdf4"
        strokeWidth="4"
      />
      <g fill="#8a9c78" fontSize="11">
        <text x="25" y="566">
          情境地图 · 非真实地理底图
        </text>
        <text x="705" y="566">
          虚构位置 · BD-09
        </text>
      </g>
    </svg>
  );
}
export function MapPage({ state, now, busy, perform, onView, onEvent }) {
  const home = hState(state, now),
    facts = mapFacts(home, now),
    [navigation, setNavigation] = useState(false),
    [editing, setEditing] = useState(false),
    [radius, setRadius] = useState(home.map.radius),
    [tolerance, setTolerance] = useState(home.map.tolerance),
    [route, setRoute] = useState(home.map.route),
    [command, setCommand] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FAMILIAR ROUTES. A LITTLE MORE REASSURANCE.</p>
          <h1>知道去向，也理解平时的路</h1>
          <p>手环位置、常用路线与出行记录 · 当前是独立的虚构轨迹演示</p>
        </div>
        <button className="button primary" onClick={() => setEditing(!editing)}>
          <Route size={16} />
          {editing ? "退出路线编辑" : "配置常用路线"}
        </button>
      </div>
      <div className="map-status-strip">
        <span>
          <MapPin size={16} />
          {home.map.worn ? "手环位置（模拟）" : "设备已离腕，不能代表老人位置"}
        </span>
        <Badge tone={facts.valid ? "green" : "amber"}>
          {facts.valid ? "样本在有效窗口内" : "最后已知位置／状态待核实"}
        </Badge>
        <span>精度 ±{facts.accuracy ?? "—"}m</span>
        <span>距家 {facts.distance ?? "—"}m</span>
        <span>
          <Battery size={14} />
          {home.map.battery}%
        </span>
      </div>
      <div className="map-page-grid">
        <section className="map-large-panel">
          <NeighborhoodMap
            home={
              editing
                ? { ...home, map: { ...home.map, route, radius, tolerance } }
                : home
            }
            showNavigation={navigation}
            onAddPoint={editing ? (p) => setRoute([...route, p]) : null}
          />
          <div className="map-legend">
            <span>
              <i className="usual" />
              预设散步路线
            </span>
            <span>
              <i className="actual" />
              本轮模拟轨迹
            </span>
            <span>
              <i className="fence" />
              活动围栏
            </span>
          </div>
          <div className="map-buttons">
            <button
              className="button secondary"
              onClick={() => setNavigation(!navigation)}
            >
              <Navigation size={15} />
              {navigation ? "关闭模拟导航" : "模拟导航接人"}
            </button>
            <button
              className="button secondary"
              onClick={() => setCommand(true)}
            >
              <Phone size={15} />
              语音呼叫老人
            </button>
            <span>
              点位采集：{facts.point ? time(facts.point.at) : "未知"} ·{" "}
              {facts.ageSeconds ?? "—"} 秒前
            </span>
          </div>
          {navigation && (
            <p className="map-navigation-note">
              模拟导航只展示示意路径，不是实际导航。该点来自{" "}
              {facts.point ? time(facts.point.at) : "未知时间"} 的手环记录。
            </p>
          )}
        </section>
        <aside className="map-side-panel">
          <section className="panel">
            <div className="section-heading">
              <h2>位置与路线核实</h2>
              <Badge>几何演示</Badge>
            </div>
            <div className="route-match">
              <strong>
                {facts.match ?? "—"}
                <small>%</small>
              </strong>
              <span>有效轨迹点落入路线容差带的比例</span>
            </div>
            <dl className="home-facts">
              <dt>围栏状态</dt>
              <dd>
                {facts.valid
                  ? facts.inside
                    ? "围栏内"
                    : "围栏外"
                  : "位置质量不足"}
              </dd>
              <dt>最大当前偏离</dt>
              <dd>{facts.deviation ?? "—"} 米</dd>
              <dt>路线容差</dt>
              <dd>{home.map.tolerance} 米</dd>
              <dt>活动半径</dt>
              <dd>{home.map.radius} 米</dd>
            </dl>
            <p className="fine-print">
              贴合度是几何计数，不是走失概率。越界形成候选，连续路线偏离先确认；夜间外出情境直接联络。
            </p>
            {home.map.geofenceEventId && (
              <button
                className="button primary full"
                onClick={() => onEvent(home.map.geofenceEventId)}
              >
                跟进位置事件 <ArrowRight size={14} />
              </button>
            )}
          </section>
          <section className="panel">
            <h2>播放一个出行情境</h2>
            <div className="map-scenario-buttons">
              {[
                ["normal", "沿常用路线散步"],
                ["deviation", "偏离路线与围栏"],
                ["night", "夜间外出 · 22:20情境"],
                ["stationary", "连续静止"],
                ["off_wrist", "模拟手环离腕"],
                ["disconnect", "模拟手环断连"],
                ["restore", "恢复模拟连接"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  disabled={busy}
                  onClick={() => perform("/api/home/map", { mode })}
                >
                  {label}
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
            <p className="fine-print">
              离腕／断连 {home.policy.disconnectSeconds}{" "}
              秒后告警。连续静止演示为10分钟，可在演示控制台推进时间。
            </p>
            <button className="text-button" onClick={() => onView("demo")}>
              打开演示时钟 <Clock3 size={13} />
            </button>
          </section>
        </aside>
      </div>
      {editing && (
        <section className="panel route-editor">
          <div>
            <h2>常用路线与围栏</h2>
            <p>
              点击地图添加路线点，或载入预设路线。配置保存后参与本地演示规则。
            </p>
          </div>
          <label>
            活动半径：{radius} 米
            <input
              type="range"
              min="100"
              max="1000"
              step="50"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </label>
          <label>
            路线容差：{tolerance} 米
            <input
              type="range"
              min="20"
              max="200"
              step="10"
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
            />
          </label>
          <div className="home-button-row">
            <button
              className="button secondary"
              onClick={() => setRoute(DEFAULT_ROUTE)}
            >
              预设路线
            </button>
            <button className="button secondary" onClick={() => setRoute([])}>
              重新描点
            </button>
            <button
              className="button primary"
              disabled={busy || route.length < 3}
              onClick={async () => {
                const r = await perform(
                  "/api/home/config",
                  {
                    version: home.configVersion,
                    section: "map",
                    value: { radius, tolerance, route },
                  },
                  "路线与围栏已更新。",
                );
                if (r) setEditing(false);
              }}
            >
              保存配置
            </button>
          </div>
        </section>
      )}
      <section className="panel map-track-history">
        <div className="section-heading">
          <h2>本轮轨迹回溯</h2>
          <Badge>{home.map.points.length} 个模拟点</Badge>
        </div>
        <div className="track-point-list">
          {home.map.points.map((p, i) => (
            <span key={`${p.at}-${i}`}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              {time(p.at)}
              <small>
                距家 {Math.round(Math.hypot(p.x, p.y))}m · 精度{p.accuracy}m
              </small>
            </span>
          ))}
        </div>
        <div className="trip-summary">
          <span>
            <b>{(home.map.trips || []).length}</b> 段演示出行
          </span>
          <span>
            最近时长 <b>{home.map.trips?.at(-1)?.durationSeconds ?? "—"} 秒</b>
          </span>
          <span>
            历史均值{" "}
            <b>
              {home.map.trips?.length > 1
                ? Math.round(
                    home.map.trips
                      .slice(0, -1)
                      .reduce((n, t) => n + t.durationSeconds, 0) /
                      (home.map.trips.length - 1),
                  )
                : "—"}{" "}
              秒
            </b>
          </span>
        </div>
        {(home.map.trips || [])
          .slice()
          .reverse()
          .slice(0, 6)
          .map((trip) => (
            <details className="trip-history-item" key={trip.id}>
              <summary>
                {time(trip.startAt)} — {time(trip.endAt)} · {trip.distance}米 ·{" "}
                {trip.stops.length}个停留候选 · 模拟轨迹
              </summary>
              <NeighborhoodMap
                home={{
                  ...home,
                  map: {
                    ...home.map,
                    points: trip.points,
                    route: trip.route,
                    radius: trip.radius,
                    tolerance: trip.tolerance,
                  },
                }}
              />
            </details>
          ))}
        <p className="fine-print">
          历史按演示轨迹点计算，时长是回放样本间隔，不等于真实外出时长。真实GPS、鹰眼上传与个体路线学习待联调。
        </p>
      </section>
      {command && (
        <CommandDialog
          runId={state.runId}
          home={home}
          kind="talk"
          onClose={() => setCommand(false)}
          perform={perform}
          busy={busy}
        />
      )}
    </>
  );
}

export function ReportsPage({
  state,
  now,
  config,
  busy,
  perform,
  request,
  notify,
  onView,
  onEvent,
  refreshConfig,
}) {
  const home = hState(state, now),
    [days, setDays] = useState(7),
    [tab, setTab] = useState("overview"),
    [upload, setUpload] = useState(false),
    [review, setReview] = useState(null),
    [interpreting, setInterpreting] = useState(false),
    [share, setShare] = useState(null),
    [pdfBusy, setPdfBusy] = useState(false);
  const r = useMemo(
      () => homeReport(state, now, days),
      [state, days, Math.floor(now / 60000)],
    ),
    interpretation = home.reportInterpretations
      .filter((x) => x.days === days && x.start === r.start)
      .at(-1);
  const focus = interpretation
      ? r.facts.filter((f) => interpretation.focusIds.includes(f.id))
      : r.facts.slice(0, 3),
    suggestions = interpretation
      ? r.suggestions.filter((s) => interpretation.suggestionIds.includes(s.id))
      : r.suggestions;
  const download = async () => {
    setPdfBusy(true);
    try {
      const response = await fetch(`/api/reports/visit.pdf?days=${days}`);
      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.error);
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `有伴-${days}天-演示就医包.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("PDF就医包已生成。");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setPdfBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVIDENCE FIRST. A CLEARER NEXT STEP.</p>
          <h1>把变化看清楚，把问题带给医生</h1>
          <p>个人基线、日常记录与已核对病历共同呈现，保留每条判断的来源。</p>
        </div>
        <button
          className="button primary"
          disabled={pdfBusy}
          onClick={download}
        >
          <ArrowDownToLine size={16} />
          {pdfBusy ? "正在生成PDF" : "导出就医包 PDF"}
        </button>
      </div>
      <div className="report-tabs">
        <div role="tablist" aria-label="报告内容">
          {[
            ["overview", "周期报告"],
            ["medical", "病历与医嘱"],
            ["package", "就医包与分享"],
          ].map(([v, t]) => (
            <button
              role="tab"
              key={v}
              aria-selected={tab === v}
              onClick={() => setTab(v)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="period-selector">
          {[7, 30].map((n) => (
            <button
              key={n}
              className={days === n ? "active" : ""}
              onClick={() => setDays(n)}
            >
              近{n}天
            </button>
          ))}
        </div>
      </div>
      {tab === "overview" && (
        <>
          <div className="report-schedule-note">
            <Clock3 size={15} />
            <span>
              默认
              {home.reportSchedule?.frequency === "monthly" ? "月报" : "周报"} ·
              下一次{" "}
              {home.reportSchedule?.nextAt
                ? new Date(home.reportSchedule.nextAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })
                : "待初始化"}
              （北京时间）
            </span>
            <small>新异常会自动保存临时报告快照</small>
          </div>
          <div className="report-overview-grid">
            <section className="care-index">
              <p>
                照护闭环指数 <Badge>执行记录</Badge>
              </p>
              <strong>
                {r.score.value ?? "—"}
                <span>{r.score.value === null ? "样本不足" : "/100"}</span>
              </strong>
              <small>
                {r.score.delta === null
                  ? "上期缺少可比事项"
                  : `较上期 ${r.score.delta > 0 ? "+" : ""}${r.score.delta} 分`}
              </small>
              <p>
                {r.score.done}/{r.score.total}{" "}
                项已处理或确认。不是病情、健康或认知评分。
              </p>
            </section>
            <section className="panel report-period-summary">
              <div className="section-heading">
                <h2>本期概述</h2>
                <Badge>模拟监测样本</Badge>
              </div>
              <h3>
                {r.facts.length
                  ? `${r.facts.length} 类变化值得进一步核对`
                  : "暂无满足演示阈值的异常"}
              </h3>
              <p>
                监测样本覆盖 {r.current.length}/{days} 天，日常记录覆盖{" "}
                {r.daily.recordedDays}/{days}{" "}
                天。个人基线采用前一等长周期，当前统计规则仅用于演示。
              </p>
              <div>
                <span>
                  <b>{r.events.length}</b> 照护事件
                </span>
                <span>
                  <b>{r.corrections.length}</b> 家属纠错
                </span>
                <span>
                  <b>{r.medicalRecords.length}</b> 已核对资料
                </span>
              </div>
            </section>
          </div>
          <div className="report-metric-grid">
            {r.metrics.map((m) => (
              <section className="report-metric" key={m.id}>
                <div>
                  <span>{m.name}</span>
                  {m.anomaly && <Badge tone="amber">重点关注</Badge>}
                </div>
                <strong>
                  {m.value ?? "—"}
                  <small>{m.unit}</small>
                </strong>
                <p>
                  较上期{" "}
                  {m.delta === null
                    ? "暂无对比"
                    : `${m.delta > 0 ? "+" : ""}${m.delta} ${m.deltaUnit || m.unit}`}
                </p>
                <small>
                  本期 n={m.currentN} · 基线 n={m.baselineN} ·{" "}
                  {m.id === "systolic" ? "模拟家庭测量" : "模拟手环样本"}
                </small>
              </section>
            ))}
          </div>
          <section className="panel baseline-alerts">
            <div className="section-heading">
              <h2>重点关注：与个人基线比较</h2>
              <Badge>非人群标准</Badge>
            </div>
            {r.metrics
              .filter((m) => m.anomaly)
              .map((m) => (
                <div className="baseline-row" key={m.id}>
                  <Activity size={20} />
                  <div>
                    <strong>{m.name}连续3个样本超出个人演示阈值</strong>
                    <p>
                      历史均值 {m.baselineMean?.toFixed(1)}，标准差{" "}
                      {m.baselineSD?.toFixed(1)}，阈值 {m.threshold?.toFixed(1)}{" "}
                      {m.unit}，基线 n={m.baselineN}。
                    </p>
                    <small>
                      可能相关的记录因素：佩戴状态、作息和环境改变、身体不适。尚未确认原因。
                    </small>
                  </div>
                  <a
                    href="https://www.nhs.uk/conditions/dementia/living-with-dementia/behaviour/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    资料来源 <ArrowUpRight size={13} />
                  </a>
                </div>
              ))}
            {!r.metrics.some((m) => m.anomaly) && (
              <p className="section-description">
                目前没有满足“连续3天±2σ”演示规则的项目，缺少基线时不作异常判定。
              </p>
            )}
          </section>
          <section className="report-ai panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CONNECTED OBSERVATIONS</p>
                <h2>Agent 照护解读</h2>
              </div>
              <button
                className="button secondary"
                disabled={interpreting}
                onClick={async () => {
                  setInterpreting(true);
                  try {
                    await request("/api/agent/report", { days });
                    await refreshConfig();
                  } catch (e) {
                    notify(e.message, "error");
                  } finally {
                    setInterpreting(false);
                  }
                }}
              >
                <Sparkles size={15} />
                {interpreting ? "正在核对来源" : "更新AI解读"}
              </button>
            </div>
            <Badge
              tone={interpretation?.mode === "qianfan" ? "green" : "neutral"}
            >
              {interpretation?.mode === "qianfan"
                ? "千帆来源约束解读"
                : "本地来源约束汇总"}
            </Badge>
            <p className="ai-observation">
              {focus.length
                ? focus.map((f) => f.text).join(" ")
                : "目前缺少可以组合判断的异常记录。先完善日常观察与设备覆盖。"}
            </p>
            <p>
              这些信号可以组合成需要核实的照护问题，不能据此确认病情进展或具体病因。
            </p>
            <div className="report-advice-grid">
              {suggestions.map((s, i) => (
                <article key={s.id}>
                  <span>0{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <div>
                    {s.sourceIds.map((id) => {
                      const source = GUIDANCE.find((s) => s.id === id);
                      return source ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          key={id}
                        >
                          {source.source} <ArrowUpRight size={11} />
                        </a>
                      ) : (
                        <Badge key={id}>
                          {id === "personal"
                            ? "个人特征资料"
                            : "已核对病历／日记"}
                        </Badge>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
            <div className="knowledge-layer-strip">
              <span>个人特征 {r.knowledge.personal}</span>
              <ArrowRight size={13} />
              <span>病情资料 {r.knowledge.medical}</span>
              <ArrowRight size={13} />
              <span>照护知识 {r.knowledge.guidelines}</span>
              <small>结构化与关键词检索 · 向量RAG待接入</small>
            </div>
            <details className="retrieval-details">
              <summary>查看本次分层检索依据 · {r.retrieval.length} 条</summary>
              {r.retrieval.map((d) => (
                <div key={d.id}>
                  <Badge>
                    {d.layer === "personal"
                      ? "个人特征"
                      : d.layer === "medical"
                        ? "病情资料"
                        : "照护知识"}
                  </Badge>
                  <strong>{d.title}</strong>
                  <p>{d.excerpt}</p>
                  <small>
                    {d.source} · {d.match}
                  </small>
                </div>
              ))}
            </details>
          </section>
          <div className="home-button-row report-links">
            <button
              className="button secondary"
              onClick={() => onView("daily")}
            >
              <Heart size={15} />
              查看日常记录与细分趋势
            </button>
            <button
              className="button secondary"
              onClick={() => onView("events")}
            >
              <Bell size={15} />
              危险行为与误报记录
            </button>
          </div>
          {(home.reportHistory || []).length > 0 && (
            <section className="panel report-snapshot-history">
              <h2>自动生成的报告快照</h2>
              {home.reportHistory
                .slice()
                .reverse()
                .slice(0, 8)
                .map((s) => (
                  <details key={s.id}>
                    <summary>
                      {s.kind === "event"
                        ? "异常临时报告"
                        : s.kind === "monthly"
                          ? "月报"
                          : "周报"}{" "}
                      · {time(s.createdAt)} · {s.start} 至 {s.end}
                    </summary>
                    {s.facts.map((f) => (
                      <p key={f.id}>{f.text}</p>
                    ))}
                    <small>
                      生成时的结构化快照 · 监测样本为模拟 · 不构成诊断
                    </small>
                  </details>
                ))}
            </section>
          )}
        </>
      )}
      {tab === "medical" && (
        <>
          <div className="medical-intro">
            <div>
              <h2>原文保留，先核对，再写入计划</h2>
              <p>
                上传病历、检验单或用药清单，提取候选信息。明确核对后再写入急救卡与提醒草稿。
              </p>
            </div>
            <button className="button primary" onClick={() => setUpload(true)}>
              <Plus size={16} />
              上传／粘贴资料
            </button>
          </div>
          <div className="medical-record-list">
            {home.medicalRecords.map((m) => (
              <article className="panel medical-record-card" key={m.id}>
                <div>
                  <FileText size={28} />
                  <h3>{m.name}</h3>
                  <Badge tone={m.status === "confirmed" ? "green" : "amber"}>
                    {m.status === "confirmed"
                      ? "家属已核对"
                      : m.status === "needs_transcription"
                        ? "扫描件待转录"
                        : "候选待核对"}
                  </Badge>
                </div>
                <p>{m.parser}</p>
                <small>
                  导入 {new Date(m.createdAt).toLocaleString("zh-CN")} ·
                  资料内容来自上传，不能自动视为诊断结论
                </small>
                <div className="home-button-row">
                  <button
                    className="button secondary"
                    onClick={() => setReview(m)}
                  >
                    核对结构化信息
                  </button>
                  {m.fileId && (
                    <a
                      className="button secondary"
                      href={`/api/medical/${m.id}/original`}
                      download
                    >
                      下载原始资料
                    </a>
                  )}
                  <button
                    className="button primary"
                    disabled={busy || m.status !== "confirmed"}
                    onClick={() =>
                      perform(
                        "/api/medical/reminders",
                        { recordId: m.id },
                        "已生成明确时点的提醒草稿，请在计划助手启用。",
                      )
                    }
                  >
                    生成医嘱提醒草稿
                  </button>
                </div>
                {m.status === "confirmed" && (
                  <div className="confirmed-medications">
                    {m.confirmed.medications.map((med) => (
                      <p key={med.id}>
                        <strong>{med.name}</strong>
                        <span>
                          {med.dose || "剂量未填写"} ·{" "}
                          {med.times.length
                            ? med.times.join(" / ")
                            : "未明确时间，不自动生成提醒点"}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {!home.medicalRecords.length && (
              <section className="panel home-empty">
                <FileText size={35} />
                <h2>还没有病历资料</h2>
                <p>
                  支持PDF、TXT、MD与图片。图片和无文字扫描PDF需要转录，当前未接入OCR。
                </p>
                <button
                  className="button primary"
                  onClick={() => setUpload(true)}
                >
                  添加第一份资料
                </button>
              </section>
            )}
          </div>
          <button className="text-button" onClick={() => onView("plans")}>
            去计划助手核对提醒草稿 <ArrowRight size={14} />
          </button>
        </>
      )}
      {tab === "package" && (
        <section className="panel visit-package">
          <div className="package-art">
            <FileText size={58} strokeWidth={1.2} />
            <span>YOUBAN CARE REPORT</span>
          </div>
          <div>
            <p className="eyebrow">READY FOR A 3-MINUTE CONVERSATION</p>
            <h2>给医生一份可快速阅读的就医包</h2>
            <p>
              包含已核对的基本信息、用药原文、近期异常、行为变化、照护进展和资料来源。未确认信息保留为未知。
            </p>
            <div className="home-button-row">
              <button
                className="button primary"
                disabled={pdfBusy}
                onClick={download}
              >
                <ArrowDownToLine size={16} />
                {pdfBusy ? "生成中…" : `导出近${days}天 PDF`}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  const result = await perform("/api/reports/share", { days });
                  if (result) setShare(result);
                }}
              >
                生成只读分享链接
              </button>
            </div>
            {share && (
              <div className="package-share">
                <strong>只读就医包链接 · 24小时有效</strong>
                <a href={share.url} target="_blank" rel="noreferrer">
                  打开医生阅读页 <ArrowUpRight size={14} />
                </a>
                <small>
                  {location.origin}
                  {share.url}
                </small>
              </div>
            )}
            <p className="fine-print">
              {config?.security?.accessCodeEnabled
                ? "家庭后台已启用访问口令；医生链接只返回这份快照PDF。"
                : "当前家庭后台是本地演示访问。启用APP_ACCESS_CODE后，家庭API才会强制登录；默认模式不构成真实成员隔离。"}
            </p>
            {home.shares.some((s) => s.active) && (
              <details>
                <summary>管理已生成链接</summary>
                {home.shares
                  .filter((s) => s.active)
                  .map((s) => (
                    <div className="share-management" key={s.id}>
                      <span>
                        创建于 {time(s.createdAt)} · 到期{" "}
                        {new Date(s.expiresAt).toLocaleString("zh-CN")}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          perform(
                            "/api/reports/revoke",
                            { shareId: s.id },
                            "链接已撤销。",
                          )
                        }
                      >
                        撤销
                      </button>
                    </div>
                  ))}
              </details>
            )}
          </div>
        </section>
      )}
      {upload && (
        <MedicalImport
          busy={busy}
          perform={perform}
          onClose={() => setUpload(false)}
        />
      )}
      {review && (
        <MedicalReview
          key={review.id}
          record={review}
          busy={busy}
          perform={perform}
          onClose={() => setReview(null)}
        />
      )}
    </>
  );
}
function MedicalImport({ busy, perform, onClose }) {
  const [text, setText] = useState(""),
    [file, setFile] = useState(null),
    [working, setWorking] = useState(false);
  const sample =
    "演示病历（虚构资料）\n诊断：阿尔茨海默病，中期（示例）\n过敏史：尚待家属核实\n药品：示例药物A；剂量：按原医嘱；频率：每日；时间：08:00,20:00\n复诊：2026-10-10 09:00\n血压：132/78 mmHg（模拟家庭记录）";
  return (
    <Modal
      title="把资料整理到一起"
      subtitle="文字规则提取需要家属核对；扫描图片目前不会自动OCR。最多5MB、20页PDF。"
      wide
      onClose={onClose}
    >
      <form
        className="medical-import-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setWorking(true);
          try {
            let base64 = null,
              mime = "text/plain";
            if (file) {
              base64 = await fileData(file);
              mime =
                file.type ||
                (/\.md$/i.test(file.name) ? "text/markdown" : "text/plain");
            }
            const r = await perform(
              "/api/medical/import",
              { text, name: file?.name || "手动病历记录", mime, base64 },
              "资料已导入，请核对提取结果。",
            );
            if (r) onClose();
          } finally {
            setWorking(false);
          }
        }}
      >
        <label className="file-upload-zone">
          <FileText size={29} />
          <strong>{file ? file.name : "选择病历、检验单或用药清单"}</strong>
          <span>PDF / TXT / MD / PNG / JPG / WebP</span>
          <input
            type="file"
            accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
        </label>
        <label className="home-field">
          或者粘贴文字／扫描件转录
          <textarea
            rows={9}
            value={text}
            maxLength={50000}
            onChange={(e) => setText(e.target.value)}
            placeholder="诊断：…\n过敏史：…\n药品：…；剂量：…；时间：08:00,20:00"
          />
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setText(sample)}
          >
            填入虚构示例
          </button>
          <button
            className="button primary"
            disabled={busy || working || (!file && !text.trim())}
          >
            {working ? "正在处理" : "提取结构化候选"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function MedicalReview({ record, busy, perform, onClose }) {
  const initial = record.confirmed || record.parsed;
  const [diagnoses, setDiagnoses] = useState(initial.diagnoses.join("\n")),
    [allergies, setAllergies] = useState(initial.allergies.join("\n")),
    [medications, setMedications] = useState(
      initial.medications.map((m) => ({ ...m, timesText: m.times.join(",") })),
    ),
    [reviewed, setReviewed] = useState(false),
    [followDate, setFollowDate] = useState(initial.followUpDate || ""),
    [followTime, setFollowTime] = useState(initial.followUpTime || ""),
    [measurements, setMeasurements] = useState(
      (initial.measurements || []).map((m) => m.text).join("\n"),
    );
  return (
    <Modal
      title="对照原文核实"
      subtitle="仅保存明确的信息；没有具体时间的用药不自动猜测提醒点。"
      wide
      onClose={onClose}
    >
      <div className="medical-review-grid">
        <section>
          <h3>原始文字</h3>
          <pre>
            {record.text || "扫描件未提取到文字，请参照原文件手动填写。"}
          </pre>
          <p className="fine-print">提取来源：{record.parser}</p>
        </section>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const value = {
              diagnoses: diagnoses
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              allergies: allergies
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              medications: medications.map((m) => ({
                id: m.id,
                name: m.name,
                dose: m.dose,
                times: m.timesText.split(/[,，\s]+/).filter(Boolean),
                frequency: m.frequency || "unspecified",
              })),
              followUpDate: followDate,
              followUpTime: followTime,
              measurements: measurements
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((text) => ({ text })),
            };
            const r = await perform(
              "/api/medical/confirm",
              { recordId: record.id, version: record.version, reviewed, value },
              "结构化资料已由家属核对并写入急救卡。",
            );
            if (r) onClose();
          }}
        >
          <label className="home-field">
            诊断／档案原文
            <textarea
              rows={2}
              value={diagnoses}
              onChange={(e) => setDiagnoses(e.target.value)}
            />
          </label>
          <label className="home-field">
            过敏史（未知可留空）
            <textarea
              rows={2}
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
            />
          </label>
          <h3>用药清单</h3>
          {medications.map((m, i) => (
            <div className="medical-med-row" key={m.id || i}>
              <label>
                药名
                <input
                  required
                  value={m.name}
                  onChange={(e) =>
                    setMedications(
                      medications.map((x, j) =>
                        i === j ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                剂量原文
                <input
                  value={m.dose}
                  onChange={(e) =>
                    setMedications(
                      medications.map((x, j) =>
                        i === j ? { ...x, dose: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                明确时间，逗号分隔
                <input
                  value={m.timesText}
                  placeholder="没有具体时间就留空"
                  onChange={(e) =>
                    setMedications(
                      medications.map((x, j) =>
                        i === j ? { ...x, timesText: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                用药频率
                <select
                  value={m.frequency || "unspecified"}
                  onChange={(e) =>
                    setMedications(
                      medications.map((x, j) =>
                        i === j ? { ...x, frequency: e.target.value } : x,
                      ),
                    )
                  }
                >
                  <option value="unspecified">未明确，不自动生成计划</option>
                  <option value="daily">每日（已核对医嘱）</option>
                </select>
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setMedications(medications.filter((_, j) => i !== j))
                }
              >
                移除这一项
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setMedications([
                ...medications,
                {
                  id: crypto.randomUUID?.() || String(Date.now()),
                  name: "",
                  dose: "",
                  timesText: "",
                },
              ])
            }
          >
            <Plus size={14} />
            补充药物
          </button>
          <label className="home-field">
            检验与测量指标原文
            <textarea
              rows={3}
              value={measurements}
              onChange={(e) => setMeasurements(e.target.value)}
              placeholder="只填写文书中明确的指标与单位"
            />
          </label>
          <div className="home-form-pair">
            <label className="home-field">
              复诊日期
              <input
                type="date"
                value={followDate}
                onChange={(e) => setFollowDate(e.target.value)}
              />
            </label>
            <label className="home-field">
              复诊时间（未明确可留空）
              <input
                type="time"
                value={followTime}
                onChange={(e) => setFollowTime(e.target.value)}
              />
            </label>
          </div>
          <label className="home-checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            我已对照原文核实以上信息，时间和剂量未被自动补全。
          </label>
          <button className="button primary full" disabled={busy || !reviewed}>
            确认并写入照护档案
          </button>
        </form>
      </div>
    </Modal>
  );
}

export function MyPage({ state, now, config, busy, perform, onView }) {
  const home = hState(state, now),
    [section, setSection] = useState("devices"),
    [editing, setEditing] = useState(null);
  const sections = [
    ["devices", "设备管理", Camera],
    ["members", "紧急联系链", Users],
    ["preferences", "个性化规则", Settings2],
    ["privacy", "隐私与授权", ShieldCheck],
    ["knowledge", "分层知识库", BookOpen],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT PERSONAL. MAKE IT TRACEABLE.</p>
          <h1>越了解周伯，照护才越有分寸</h1>
          <p>设备在场、联系人明确、个人习惯可核实，是主动照护的前提。</p>
        </div>
        <button
          className="button secondary"
          onClick={() => onView("architecture")}
        >
          <Layers3 size={16} />
          百度全栈接入状态
        </button>
      </div>
      <section className="my-profile">
        <Portrait size={70} />
        <div>
          <h2>
            周伯 <Badge>虚构演示档案</Badge>
          </h2>
          <p>76岁 · 居家照护 · 原型示例：阿尔茨海默中期</p>
          <small>
            付费与使用主体：子女／主陪护人；协同成员：护工、家属、社区医生。
          </small>
        </div>
        <div className="my-quick-links">
          <button onClick={() => onView("elder-preview")}>
            <Smartphone size={16} />
            老人端
          </button>
          <button onClick={() => onView("daily")}>
            <Heart size={16} />
            日常记录
          </button>
          <button onClick={() => onView("plans")}>
            <Sparkles size={16} />
            计划助手
          </button>
          <button
            className="family-preview-link"
            onClick={() => onView("family-phone")}
          >
            <Smartphone size={16} />
            手机预览
          </button>
        </div>
      </section>
      <div className="my-section-tabs" role="tablist" aria-label="照护配置">
        {sections.map(([id, text, Icon]) => (
          <button
            role="tab"
            aria-selected={section === id}
            key={id}
            onClick={() => setSection(id)}
          >
            <Icon size={16} />
            {text}
          </button>
        ))}
      </div>
      {section === "devices" && (
        <>
          <div className="home-section-title">
            <div>
              <h2>多端设备</h2>
              <p>绑定与在线状态分别记录，当前为模拟设备。</p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                setEditing({
                  type: "device",
                  value: {
                    name: "",
                    type: "camera",
                    zone: "客厅",
                    online: false,
                    enabled: true,
                  },
                })
              }
            >
              <Plus size={15} />
              添加设备
            </button>
          </div>
          <div className="device-management-grid">
            {home.devices.map((d) => (
              <article className="panel device-management-card" key={d.id}>
                <div>
                  <span>
                    {d.type === "camera" ? (
                      <Camera size={26} />
                    ) : d.type === "band" ? (
                      <Activity size={26} />
                    ) : (
                      <Smartphone size={26} />
                    )}
                  </span>
                  <Badge tone={d.online && d.enabled ? "green" : "amber"}>
                    {!d.enabled ? "已停用" : d.online ? "模拟在线" : "模拟离线"}
                  </Badge>
                </div>
                <h3>{d.name}</h3>
                <p>
                  {d.zone} ·{" "}
                  {d.battery !== null ? `电量${d.battery}%` : "外接电源"}
                </p>
                <small>最近同步 {time(d.lastSync)} · 硬件真实接入待验证</small>
                <button
                  className="button secondary full"
                  onClick={() => setEditing({ type: "device", value: d })}
                >
                  管理设备
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {section === "members" && (
        <>
          <div className="home-section-title">
            <div>
              <h2>按责任等级触达</h2>
              <p>
                一级全部立即，二级{home.policy.tierTwoSeconds}
                秒追加，三级仅通报；送达不等于接手。
              </p>
            </div>
            <button
              className="button primary"
              onClick={() =>
                setEditing({
                  type: "member",
                  value: {
                    name: "",
                    role: "其他家属",
                    level: 2,
                    phone: "",
                    enabled: true,
                    atHome: false,
                    photo: null,
                  },
                })
              }
            >
              <Plus size={15} />
              添加成员
            </button>
          </div>
          <div className="member-list">
            {home.members.map((m) => (
              <article className="panel member-card" key={m.id}>
                {m.photo ? (
                  <img src={m.photo} alt={`${m.name}的头像`} />
                ) : (
                  <Portrait
                    size={51}
                    variant={m.level === 1 ? "family" : "backup"}
                  />
                )}
                <div>
                  <h3>
                    {m.name} <Badge>{m.role}</Badge>
                  </h3>
                  <p>
                    {m.phone || "联系电话待填写"} ·{" "}
                    {m.atHome ? "在宅协助" : "非在宅成员"}
                  </p>
                </div>
                <Badge tone={m.level === 1 ? "amber" : "neutral"}>
                  {m.level === 1
                    ? "一级 · 立即"
                    : m.level === 2
                      ? "二级 · 追加"
                      : "三级 · 通报"}
                </Badge>
                <button
                  className="button secondary"
                  onClick={() => setEditing({ type: "member", value: m })}
                >
                  编辑
                </button>
              </article>
            ))}
          </div>
          <section className="panel alarm-policy">
            <div>
              <h2>告警策略与120入口</h2>
              <p>当前为演示配置，Push、电话、免打扰穿透和120均未真实接入。</p>
            </div>
            <div className="policy-chips">
              <span>确认 {home.policy.confirmationSeconds}s</span>
              <span>二级 +{home.policy.tierTwoSeconds}s</span>
              <span>急救 +{home.policy.emergencySeconds}s</span>
              <Badge>
                {home.policy.emergencyCallEnabled
                  ? "120演示入口已开"
                  : "120演示入口关闭"}
              </Badge>
            </div>
            <button
              className="button primary"
              onClick={() => setEditing({ type: "policy", value: home.policy })}
            >
              配置策略
            </button>
          </section>
        </>
      )}
      {section === "preferences" && (
        <>
          <section className="panel">
            <div className="section-heading">
              <h2>危险行为识别</h2>
              <button
                className="button secondary"
                onClick={() => setEditing({ type: "rules", value: home.rules })}
              >
                编辑规则
              </button>
            </div>
            <div className="behavior-rule-list">
              {Object.entries(home.rules).map(([key, r]) => (
                <div key={key}>
                  <Activity size={18} />
                  <strong>{r.label}</strong>
                  <span>{r.enabled ? "已开启" : "已关闭"}</span>
                  <Badge>
                    {r.sensitivity === "high"
                      ? "高"
                      : r.sensitivity === "medium"
                        ? "中"
                        : "低"}
                    灵敏度
                  </Badge>
                  {r.minutes > 0 && <small>{r.minutes} 分钟阈值</small>}
                </div>
              ))}
            </div>
            <p className="fine-print">
              这些设置作用于演示规则。真实识别阈值需要设备与模型实测，明火／厨房异常识别保留为后续接入项。
            </p>
          </section>
          <div className="my-preference-grid">
            <section className="panel">
              <Route size={27} />
              <h3>常用散步路线</h3>
              <p>
                围栏{home.map.radius}米，路线容差{home.map.tolerance}
                米。偏离后的确认流程可在地图页演示。
              </p>
              <button
                className="button secondary"
                onClick={() => onView("map")}
              >
                配置与演示路线
              </button>
            </section>
            <section className="panel">
              <Volume2 size={27} />
              <h3>沟通与方言偏好</h3>
              <p>
                {home.preferences.dialect} ·
                方言识别属于待接入能力，设置偏好不代表模型已支持。
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  setEditing({ type: "preferences", value: home.preferences })
                }
              >
                设置偏好
              </button>
            </section>
            <section className="panel">
              <Clock3 size={27} />
              <h3>用药时间与照护安排</h3>
              <p>按已核对医嘱建立提醒时点；已观察动作与家属确认分别记录。</p>
              <button
                className="button secondary"
                onClick={() => onView("daily")}
              >
                日常用药配置
              </button>
              <button className="text-button" onClick={() => onView("plans")}>
                自然语言安排 <ArrowRight size={13} />
              </button>
            </section>
          </div>
        </>
      )}
      {section === "privacy" && (
        <>
          <div className="privacy-grid">
            <section className="panel">
              <ShieldCheck size={29} />
              <h2>本地数据保护</h2>
              <dl className="home-facts">
                <dt>当前运行文件</dt>
                <dd>
                  {config?.security?.encryptedAtRest
                    ? "AES-256-GCM 已加密"
                    : "尚未启用加密"}
                </dd>
                <dt>密钥保管</dt>
                <dd>同机权限文件，非端到端加密</dd>
                <dt>家庭访问</dt>
                <dd>
                  {config?.security?.accessCodeEnabled
                    ? "访问口令已启用"
                    : "演示访问 · 无身份鉴权"}
                </dd>
                <dt>医生入口</dt>
                <dd>只读就医包快照，24小时链接</dd>
              </dl>
              <p className="fine-print">
                历史备份不自动宣称已加密。默认本地演示不构成成员隔离；设置APP_ACCESS_CODE后家庭API才强制登录。真实家庭/机构权限仍需生产化。
              </p>
            </section>
            <section className="panel">
              <Camera size={29} />
              <h2>监控范围与知情告知</h2>
              <dl className="home-facts">
                <dt>布点范围</dt>
                <dd>
                  {home.privacy.placementConfirmed
                    ? "家属已确认（演示）"
                    : "尚待家属确认"}
                </dd>
                <dt>敏感空间</dt>
                <dd>卫生间／浴室默认禁止</dd>
                <dt>夜间策略</dt>
                <dd>
                  {home.privacy.nightEventOnly
                    ? "仅事件片段，不回传连续画面"
                    : "连续画面策略待接入"}
                </dd>
                <dt>知情告知</dt>
                <dd>
                  {home.privacy.informedAt
                    ? `已登记 ${time(home.privacy.informedAt)}`
                    : "尚未登记"}
                </dd>
              </dl>
              <button
                className="button primary"
                onClick={() =>
                  setEditing({ type: "privacy", value: home.privacy })
                }
              >
                确认范围与告知
              </button>
              <p className="fine-print">
                当前无真实摄像头采集。此处记录的是家属操作与模拟策略，真实硬件播放和被照护人理解仍待验证。
              </p>
            </section>
          </div>
        </>
      )}
      {section === "knowledge" && (
        <>
          <div className="knowledge-counts">
            {[
              [
                "个人特征资料",
                home.personalNotes.length + home.corrections.length,
                "作息、沟通、环境与纠错",
              ],
              [
                "病情发展资料",
                home.medicalRecords.filter((r) => r.status === "confirmed")
                  .length,
                "家属核对的病历与用药",
              ],
              ["照护知识", GUIDANCE.length, "有来源的照护指南"],
            ].map(([t, n, d]) => (
              <section className="panel" key={t}>
                <BookOpen size={24} />
                <strong>{n}</strong>
                <h3>{t}</h3>
                <p>{d}</p>
              </section>
            ))}
          </div>
          <p className="knowledge-disclosure">
            当前采用结构化与关键词检索，不是向量RAG，也不声称完成模型持续训练。
          </p>
          <section className="panel correction-library">
            <div className="section-heading">
              <h2>家属纠错，让演示规则更贴近这个人</h2>
              <Badge>{home.corrections.length} 次</Badge>
            </div>
            {home.corrections.length ? (
              home.corrections.map((c) => (
                <article key={c.id}>
                  <div>
                    <strong>{c.reason}</strong>
                    <p>{c.validation}</p>
                  </div>
                  <Badge tone={c.applied ? "green" : "amber"}>
                    {c.applied ? "演示校正已应用" : "待验证"}
                  </Badge>
                  <button
                    className="button secondary"
                    disabled={
                      busy || c.applied || c.pattern !== "bend_normal_imu"
                    }
                    onClick={() =>
                      perform(
                        "/api/home/correction",
                        { correctionId: c.id },
                        "只对演示规则应用了校正，真实模型仍待验证。",
                      )
                    }
                  >
                    应用演示校正
                  </button>
                </article>
              ))
            ) : (
              <p className="section-description">
                在跌倒事件中标记“误报＋弯腰拾物原因”后，会在这里出现待验证的个人纠错记录。
              </p>
            )}
          </section>
          <section className="panel knowledge-sources">
            <h2>资料来源</h2>
            {GUIDANCE.map((s) => (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                <span>
                  <strong>{s.title}</strong>
                  <small>
                    {s.source} · {s.text}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </section>
        </>
      )}
      {editing && (
        <HomeConfigDialog
          key={`${editing.type}-${editing.value.id || ""}`}
          data={editing}
          home={home}
          busy={busy}
          perform={perform}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function HomeConfigDialog({ data, home, busy, perform, onClose }) {
  const [v, setV] = useState(structuredClone(data.value)),
    [photoError, setPhotoError] = useState("");
  const set = (key, value) => setV({ ...v, [key]: value });
  const kind = data.type;
  const titles = {
    device: "设备管理",
    member: "联络成员",
    policy: "告警策略",
    rules: "个性化识别规则",
    preferences: "沟通偏好",
    privacy: "范围与知情告知",
  };
  return (
    <Modal
      title={titles[kind]}
      subtitle="修改会用于本地演示，真实设备与服务的接入状态单独记录。"
      wide={kind === "rules"}
      onClose={onClose}
    >
      <form
        className="home-config-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await perform(
            "/api/home/config",
            { section: kind, version: home.configVersion, value: v },
            "照护配置已保存。",
          );
          if (r) onClose();
        }}
      >
        {kind === "device" && (
          <>
            <label>
              设备名称
              <input
                required
                value={v.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <div className="home-form-pair">
              <label>
                设备类型
                <select
                  value={v.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  {[
                    ["camera", "摄像头"],
                    ["band", "手环"],
                    ["screen", "智能屏"],
                    ["phone", "手机"],
                  ].map(([a, b]) => (
                    <option key={a} value={a}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                安装区域／归属
                <input
                  value={v.zone}
                  onChange={(e) => set("zone", e.target.value)}
                />
              </label>
            </div>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              启用这台设备
            </label>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.online}
                onChange={(e) => set("online", e.target.checked)}
              />
              模拟在线（不代表真实连接）
            </label>
          </>
        )}
        {kind === "member" && (
          <>
            <label>
              姓名
              <input
                value={v.name}
                required
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <div className="home-form-pair">
              <label>
                角色
                <select
                  value={v.role}
                  onChange={(e) => set("role", e.target.value)}
                >
                  {["子女", "其他家属", "在宅护工", "社区照护", "医生"].map(
                    (r) => (
                      <option key={r}>{r}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                触达等级
                <select
                  value={v.level}
                  onChange={(e) => set("level", Number(e.target.value))}
                >
                  <option value="1">一级 · 立即触达</option>
                  <option value="2">二级 · 追加联络</option>
                  <option value="3">三级 · 仅通报</option>
                </select>
              </label>
            </div>
            <label>
              联系电话
              <input
                value={v.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </label>
            <label>
              头像（可选，120KB以内）
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const f = e.target.files[0];
                  if (!f) return;
                  if (f.size > 120000) {
                    setPhotoError("请选择120KB以内的头像。");
                    return;
                  }
                  set("photo", `data:${f.type};base64,${await fileData(f)}`);
                  setPhotoError("");
                }}
              />
            </label>
            {photoError && <p>{photoError}</p>}
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.atHome}
                onChange={(e) => set("atHome", e.target.checked)}
              />
              当前可提供在宅协助
            </label>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              启用联络
            </label>
          </>
        )}
        {kind === "policy" && (
          <>
            <div className="home-form-pair">
              {[
                ["confirmationSeconds", "患者确认窗口（秒）", 3, 120],
                ["tierTwoSeconds", "二级追加（首次联络后秒）", 5, 300],
                ["emergencySeconds", "急救提示（首次联络后秒）", 10, 600],
                ["routineRetrySeconds", "照护重复提醒间隔（秒）", 5, 300],
                ["routineAttempts", "最多照护提醒次数", 1, 5],
                ["disconnectSeconds", "离腕／断连窗口（秒）", 30, 600],
              ].map(([k, l, min, max]) => (
                <label key={k}>
                  {l}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    required
                    value={v[k]}
                    onChange={(e) => set(k, Number(e.target.value))}
                  />
                </label>
              ))}
            </div>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.emergencyCallEnabled}
                onChange={(e) => set("emergencyCallEnabled", e.target.checked)}
              />
              开启120模拟呼叫入口
            </label>
            <p className="fine-print">
              只影响之后新建事件的计时，已有事件截止时间保留。
            </p>
          </>
        )}
        {kind === "rules" &&
          Object.entries(v).map(([key, r]) => (
            <div className="rule-edit-row" key={key}>
              <label className="home-checkbox">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) =>
                    set(key, { ...r, enabled: e.target.checked })
                  }
                />
                {r.label}
              </label>
              <label>
                灵敏度
                <select
                  value={r.sensitivity}
                  onChange={(e) =>
                    set(key, { ...r, sensitivity: e.target.value })
                  }
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </label>
              <label>
                时长阈值（分钟）
                <input
                  type="number"
                  min="0"
                  max="480"
                  value={r.minutes}
                  onChange={(e) =>
                    set(key, { ...r, minutes: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          ))}
        {kind === "preferences" && (
          <>
            <label>
              周期报告
              <select
                value={v.reportFrequency || "weekly"}
                onChange={(e) => set("reportFrequency", e.target.value)}
              >
                <option value="weekly">每周一09:00生成周报</option>
                <option value="monthly">每月1日09:00生成月报</option>
              </select>
            </label>
            <label>
              方言偏好
              <select
                value={v.dialect}
                onChange={(e) => set("dialect", e.target.value)}
              >
                {["普通话", "四川话", "粤语", "上海话"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <p className="fine-print">
              当前仅保存偏好，真实方言识别待模型与语音链路验证。
            </p>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.nightEventOnly}
                onChange={(e) => set("nightEventOnly", e.target.checked)}
              />
              夜间仅事件片段策略
            </label>
          </>
        )}
        {kind === "privacy" && (
          <>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.placementConfirmed}
                onChange={(e) => set("placementConfirmed", e.target.checked)}
              />
              家属已确认摄像头布点范围（演示）
            </label>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.nightEventOnly}
                onChange={(e) => set("nightEventOnly", e.target.checked)}
              />
              夜间仅事件片段，不回传连续画面
            </label>
            <label className="home-checkbox">
              <input
                type="checkbox"
                checked={v.informed || false}
                onChange={(e) => set("informed", e.target.checked)}
              />
              我已向被照护人说明监测安排，并记录本次告知
            </label>
            <p className="fine-print">
              该操作记录家属报告，不自动证明老人理解或实际硬件已播报。卫生间、浴室等敏感区域仍禁止布点。
            </p>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            保存配置
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function DoctorPage() {
  const token = location.pathname.split("/").at(-1),
    [info, setInfo] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/shared/${token}/info`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setInfo(data);
      })
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <main className="doctor-page">
      <Logo />
      <section>
        <FileText size={48} />
        <h1>就医包 · 只读分享</h1>
        {info ? (
          <>
            <h2>
              {info.person.name} · {info.person.age}岁
            </h2>
            <p>
              {info.start} 至 {info.end}
            </p>
            <a
              className="button primary"
              href={`/api/shared/${token}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              打开PDF就医包 <ArrowUpRight size={15} />
            </a>
            <p className="fine-print">
              演示资料，分享页只展示当前PDF快照，不提供家庭实时监控、原始文书或成员管理。链接到期：
              {new Date(info.expiresAt).toLocaleString("zh-CN")}
            </p>
          </>
        ) : (
          <p>{error || "正在读取分享信息…"}</p>
        )}
      </section>
    </main>
  );
}
export function FamilyPhonePreview() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE SAME CARE, ON YOUR PHONE.</p>
          <h1>手机里，也有完整的照护现场</h1>
          <p>下面是真实运行的家属页面，四个主Tab与桌面端共享同一事件状态。</p>
        </div>
      </div>
      <div
        className="device-preview-stage"
        style={{ maxWidth: 470, margin: "0 auto 28px" }}
      >
        <div className="phone-frame">
          <iframe src="?view=dashboard" title="家属手机四Tab预览" />
        </div>
        <span className="device-preview-caption">
          390 px · 监控 / 地图 / 报告 / 我的
        </span>
      </div>
    </>
  );
}
