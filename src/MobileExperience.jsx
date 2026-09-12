import React, { useState, useEffect, useRef } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BatteryFull,
  Bell,
  Bot,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Heart,
  Home,
  MapPin,
  Navigation,
  Maximize2,
  MessageCircle,
  Mic,
  Pause,
  Phone,
  Pill,
  Play,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Sun,
  Users,
  UserRound,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import { NeighborhoodMap } from "./HomeScreens.jsx";
import MobileSettings from "./MobileSettings.jsx";
import WayfindingCard from "./WayfindingCard.jsx";
import { ROUTE_DESTINATIONS } from "../shared/wayfinding.js";
import { useCompanionVoice } from "./useCompanionVoice.jsx";
import { Tag, MButton, Row, Sheet, Field } from "./MobileUI.jsx";
import {
  CARE_PROFILE,
  medicationOverview,
  demoElapsed,
  careBrief,
} from "../shared/mobile.js";
import { dailySummary, careDate, CATEGORIES } from "../shared/daily.js";
import { mapFacts, homeReport } from "../shared/home.js";
import "./mobile.css";
import { TOUR_DURATION } from "../shared/mobile-tour.js";
const tabs = [
  ["guard", "守护", Home],
  ["map", "地图", MapPin],
  ["board", "看板", BarChart3],
  ["mine", "我的", UserRound],
];
const scenes = [
  ["chat", "日常陪伴", MessageCircle],
  ["wayfinding", "找路演示", Navigation],
  ["medication", "用药提醒", Pill],
  ["fall", "跌倒守护", ShieldCheck],
  ["location", "路线偏离", MapPin],
];
const statusText = {
  confirming: "正在向本人确认",
  review_required: "等待家人核实",
  escalated: "已联络家人",
  handling: "家人正在处理",
  closed: "处理已记录",
};
const clockText = (now) =>
  new Date(now).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export default function MobileExperience({
  state,
  connected,
  busy,
  perform,
  notify,
  initialRole = "family",
}) {
  const [role, setRole] = useState(initialRole),
    [tab, setTab] = useState("guard"),
    [detail, setDetail] = useState(null),
    [days, setDays] = useState(7),
    [dual, setDual] = useState(false),
    [info, setInfo] = useState(false),
    [wall, setWall] = useState(Date.now()),
    [selectedEventId, setSelectedEventId] = useState(null),
    [selectedRiskId, setSelectedRiskId] = useState(null);
  const now = state.pausedAt ?? wall + (state.serverDelta || 0),
    demo = state.mobile?.demo,
    elapsed = demoElapsed(demo, now),
    p = { ...CARE_PROFILE, ...state.home.careProfile };
  const active =
    state.events.find((e) => e.id === demo?.eventId) ||
    state.events.find((e) => e.id === state.activeId && e.status !== "closed");
  const selectedEvent =
    state.events.find((e) => e.id === selectedEventId) || active;
  const stats = medicationOverview(state, now, days);
  const companion = useCompanionVoice({
    state,
    profile: p,
    patientVisible: role === "patient" || dual,
  });
  useEffect(() => {
    const t = setInterval(() => setWall(Date.now()), 80);
    return () => clearInterval(t);
  }, []);
  const scene = async (kind) => {
    companion.arm();
    if (["chat", "medication", "wayfinding"].includes(kind)) setRole("patient");
    const r = await perform("/api/mobile/action", { action: "start", kind });
    if (r) {
      setDetail(null);
      setTab(kind === "location" ? "map" : "guard");
      setRole(
        ["chat", "medication", "wayfinding"].includes(kind)
          ? "patient"
          : "family",
      );
    }
  };
  const mAction = (action, data = {}) =>
    perform("/api/mobile/action", { action, demoId: demo?.id, ...data });
  const eventAction = (event, action, payload = {}) =>
    perform("/api/events/action", {
      eventId: event.id,
      version: event.version,
      action,
      payload,
    });
  const openDetail = (value, eventId = null, riskId = null) => {
    setSelectedRiskId(riskId);
    setSelectedEventId(eventId);
    setDetail(value);
  };
  const tour = state.mobile?.tour;
  const tourSeconds = tour
    ? Math.min(
        TOUR_DURATION,
        Math.floor((now - Date.parse(tour.startedAt)) / 1000),
      )
    : 0;
  useEffect(() => {
    if (!tour) return;
    setRole(tour.role);
    setTab(tour.tab);
    setDetail(tour.detail || null);
  }, [tour?.id, tour?.step]);
  const currentTask = stats.tasks.find((t) =>
    state.planner.occurrences.some(
      (o) =>
        o.id === t.occurrenceId &&
        state.planner.plans.some(
          (p) => p.id === o.planId && p.mobileDemoId === demo?.id,
        ),
    ),
  );
  const stageIndex =
    demo?.kind === "wayfinding"
      ? state.mobile.navigation?.status === "arrived"
        ? 3
        : state.mobile.navigation?.status === "guiding"
          ? 2
          : 0
      : demo?.kind === "medication"
        ? currentTask?.verified
          ? 3
          : currentTask?.candidate
            ? 2
            : state.mobile?.reminderSeen
              ? 1
              : 0
        : active?.status === "closed"
          ? 4
          : active?.status === "handling"
            ? 3
            : active
              ? 2
              : elapsed >= 4000 && demo?.kind === "fall"
                ? 1
                : 0;
  const stage = active
    ? statusText[active.status]
    : demo?.kind === "fall"
      ? elapsed < 4000
        ? "日常活动"
        : elapsed < 6500
          ? "失衡与倒地"
          : "异常确认"
      : demo?.kind === "location"
        ? "沿日常路线行走"
        : demo?.kind === "medication"
          ? "提醒与用药核实"
          : demo?.kind === "wayfinding"
            ? "确认目的地，全程语音陪同"
            : "日常陪伴";
  const phone = (patient) => (
    <div
      className={`m-device ${patient ? "is-patient" : ""}`}
      key={patient ? "patient" : "family"}
    >
      <div className="m-statusbar">
        <strong>{clockText(now)}</strong>
        <span className="m-island" />
        <span>
          <Signal size={15} />
          <Wifi size={16} />
          <BatteryFull size={21} />
        </span>
      </div>
      <div
        className="m-screen"
        key={patient ? "patient" : tab}
        data-testid={patient ? "patient-screen" : "family-screen"}
      >
        {patient ? (
          <Patient
            state={state}
            now={now}
            active={active}
            busy={busy}
            perform={perform}
            notify={notify}
            eventAction={eventAction}
            profile={p}
            voice={companion}
            onDetail={(...args) => {
              setRole(patient ? "patient" : "family");
              openDetail(...args);
            }}
          />
        ) : (
          <>
            {active &&
              active.status !== "closed" &&
              tab !== "guard" &&
              tab !== "map" && (
                <button
                  className="m-alert-banner"
                  onClick={() =>
                    setTab(active.type === "location" ? "map" : "guard")
                  }
                >
                  <Bell size={16} />
                  {active.title} · {statusText[active.status]}
                  <ChevronRight size={16} />
                </button>
              )}
            {tab === "guard" && (
              <Guard
                state={state}
                now={now}
                demo={demo}
                elapsed={elapsed}
                active={active}
                busy={busy}
                onDetail={(...args) => {
                  setRole(patient ? "patient" : "family");
                  openDetail(...args);
                }}
                eventAction={eventAction}
                perform={perform}
              />
            )}
            {tab === "map" && (
              <MapScreen
                state={state}
                now={now}
                active={active?.type === "location" ? active : null}
                busy={busy}
                onDetail={(...args) => {
                  setRole(patient ? "patient" : "family");
                  openDetail(...args);
                }}
                eventAction={eventAction}
                perform={perform}
              />
            )}
            {tab === "board" && (
              <Board
                state={state}
                now={now}
                days={days}
                setDays={setDays}
                stats={stats}
                onDetail={(...args) => {
                  setRole(patient ? "patient" : "family");
                  openDetail(...args);
                }}
              />
            )}
            {tab === "mine" && (
              <MobileSettings
                state={state}
                perform={perform}
                busy={busy}
                onMedical={() => setDetail("medical")}
                onMedication={() => setDetail("medication")}
                onMap={() => setTab("map")}
                onPatient={() => {
                  setRole("patient");
                  setDetail(null);
                }}
              />
            )}
          </>
        )}
      </div>
      {!patient && (
        <nav className="m-tabbar" aria-label="看护端导航">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setRole("family");
                setDetail(null);
              }}
            >
              <Icon size={23} />
              <span>{label}</span>
              {id === "guard" && active?.status !== "closed" && active && <i />}
            </button>
          ))}
        </nav>
      )}
      <div className="m-home-indicator" />
      {detail && (!dual || patient === (role === "patient")) && (
        <Sheet
          title={
            {
              medication: "用药记录与依据",
              report: "完整照护报告",
              medical: "健康档案",
              camera: "客厅实时守护",
              replay: "事件片段回放",
              events: "今日照护记录",
              close: "记录处理结果",
              help: "联系家人",
              contact: "联系爸爸",
              observation: "照护变化与进展",
            }[detail] || "照护详情"
          }
          onClose={() => setDetail(null)}
        >
          {detail === "observation" && (
            <>
              {selectedEventId && selectedEvent ? (
                <>
                  <EventCard
                    event={selectedEvent}
                    now={now}
                    busy={busy}
                    eventAction={eventAction}
                    onDetail={(...args) => {
                      setRole(patient ? "patient" : "family");
                      openDetail(...args);
                    }}
                  />
                  <Timeline event={selectedEvent} />
                </>
              ) : (
                <ObservationDetails
                  state={state}
                  risk={state.daily.alerts.find((r) => r.id === selectedRiskId)}
                  perform={perform}
                  busy={busy}
                  onDone={() => setDetail(null)}
                />
              )}
            </>
          )}
          {detail === "medication" && (
            <MedicationDetails
              state={state}
              stats={stats}
              busy={busy}
              perform={perform}
            />
          )}
          {detail === "report" && (
            <Report state={state} now={now} days={days} stats={stats} />
          )}
          {detail === "medical" && <Medical state={state} />}
          {(detail === "camera" || detail === "replay") && (
            <>
              {detail === "replay" && selectedEvent?.type === "location" ? (
                <div className="m-map-container">
                  <NeighborhoodMap home={state.home} />
                </div>
              ) : (
                <SceneVisual
                  demo={demo}
                  elapsed={elapsed}
                  now={now}
                  active={selectedEvent}
                  replay={detail === "replay"}
                />
              )}
              <p className="m-note">
                {detail === "replay"
                  ? "事件情境重建，可重新播放动作过程。"
                  : "客厅守护场景模拟。"}
                画面与人物由 AI 生成，预设动画触发演示事件。
              </p>
              {selectedEvent && <Timeline event={selectedEvent} />}
            </>
          )}
          {detail === "events" && (
            <Feed
              state={state}
              onDetail={(...args) => {
                setRole(patient ? "patient" : "family");
                openDetail(...args);
              }}
              all
            />
          )}
          {detail === "close" && selectedEvent && (
            <CloseEvent
              event={selectedEvent}
              busy={busy}
              eventAction={eventAction}
              onDone={() => setDetail(null)}
            />
          )}
          {detail === "contact" && (
            <>
              <div className="m-call-art">
                <Phone size={40} />
              </div>
              <h2 className="center">联系爸爸</h2>
              <p className="m-note">
                通过客厅终端发起双向对讲，和爸爸确认近况。
              </p>
              <MButton
                disabled={busy}
                onClick={async () => {
                  const r = await perform(
                    "/api/home/command",
                    {
                      kind: "talk",
                      deviceId: "screen",
                      text: "家人正在联系您。",
                    },
                    "模拟对讲已发起",
                  );
                  if (r) setDetail(null);
                }}
              >
                <Phone size={18} />
                发起模拟对讲
              </MButton>
              <p className="m-footnote center">
                当前为应用内模拟，不拨打真实电话。
              </p>
            </>
          )}
          {detail === "help" && (
            <>
              <div className="m-call-art">
                <Phone size={40} />
              </div>
              <h2 className="center">联系周宁</h2>
              <p className="m-note">在当前应用内通知家人，等待家人回应。</p>
              <MButton
                disabled={busy}
                onClick={async () => {
                  const r = await perform(
                    "/api/help",
                    {},
                    "已在应用内通知家人",
                  );
                  if (r) setDetail(null);
                }}
              >
                <Phone size={18} />
                通知家人
              </MButton>
              <p className="m-footnote center">演示不会拨打真实电话</p>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
  return (
    <div
      className={`mobile-demo ${dual ? "dual" : ""} ${tour ? "with-tour" : ""}`}
    >
      <header className="m-demo-header">
        <a className="m-brand" href="/">
          <span>
            <Heart size={22} />
          </span>
          <b>有伴</b>
          <small>让陪伴，一直在。</small>
        </a>
        <div>
          <span className={`m-connection ${connected ? "online" : ""}`}>
            <i />
            {connected ? "双端已连接" : "正在重连"}
          </span>
          <button
            className="m-demo-icon"
            aria-label="演示说明"
            onClick={() => setInfo(!info)}
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      {tour && (
        <section className="m-tour-strip" aria-live="polite">
          <div>
            <strong>
              {tour.status === "completed"
                ? "完整演示已完成"
                : tour.status === "paused"
                  ? "演示已暂停"
                  : "完整演示 · 自动切换双端"}
            </strong>
            <span>
              {Math.floor(tourSeconds / 60)}:
              {String(tourSeconds % 60).padStart(2, "0")} /{" "}
              {Math.floor(TOUR_DURATION / 60)}:
              {String(TOUR_DURATION % 60).padStart(2, "0")}
            </span>
          </div>
          <p>{tour.caption}</p>
          <progress value={tourSeconds} max={TOUR_DURATION} />
        </section>
      )}
      <main className="m-stage">
        <aside className="m-stage-copy">
          <p className="m-kicker">有伴 · 家庭照护</p>
          <h1>
            每一份牵挂，
            <br />
            都有回应。
          </h1>
          <p>
            陪在身边的日常，
            <br />
            连在一起的守护。
          </p>
          <div className="m-role-description">
            <span>{role === "patient" ? "01" : "02"}</span>
            <div>
              <strong>
                {role === "patient" ? "患者端 · 小安陪伴" : "看护端 · 家人守护"}
              </strong>
              <p>
                {role === "patient"
                  ? "说说话，找找东西，安心过好每一天。"
                  : "看见日常变化，也及时接住每一次求助。"}
              </p>
            </div>
          </div>
          <button className="m-dual-button" onClick={() => setDual(!dual)}>
            <Smartphone size={17} />
            {dual ? "收起双端对照" : "打开双端对照"}
            <ArrowUpRight size={16} />
          </button>
        </aside>
        <div className="m-phone-column">
          <div className="m-role-tabs" aria-label="演示角色">
            <button
              aria-pressed={role === "patient"}
              className={role === "patient" ? "active" : ""}
              onClick={() => {
                setRole("patient");
                setDetail(null);
              }}
            >
              患者端
            </button>
            <button
              aria-pressed={role === "family"}
              className={role === "family" ? "active" : ""}
              onClick={() => {
                setRole("family");
                setDetail(null);
              }}
            >
              看护端
            </button>
            {dual && (
              <button onClick={() => setDual(false)} aria-label="收起双端对照">
                <X size={14} />
                收起对照
              </button>
            )}
          </div>
          <div className="m-phones">
            {dual ? (
              <>
                {phone(true)}
                {phone(false)}
              </>
            ) : (
              phone(role === "patient")
            )}
          </div>
          <p className="m-device-caption">
            <ShieldCheck size={13} />
            同一个家庭，两端实时同步
          </p>
        </div>
        <aside className="m-story">
          <div className="m-story-heading">
            <span className="m-live-dot" />
            正在体验
          </div>
          <h2>{scenes.find((s) => s[0] === demo?.kind)?.[1] || "日常守护"}</h2>
          <p>
            {demo?.kind === "wayfinding"
              ? "先确认目的地，再一步一步陪您走到熟悉的地方。"
              : demo?.kind === "fall"
                ? "从发现异常，到家人接手。每一步，都有回应。"
                : demo?.kind === "location"
                  ? "沿着熟悉的路散步，偏离时多一份关心。"
                  : demo?.kind === "medication"
                    ? "提醒、回应、核实，把每一次用药记清楚。"
                    : "小安陪老人过好今天，家人随时了解近况。"}
          </p>
          <ol>
            {(demo?.kind === "wayfinding"
              ? ["确认目的地", "查看路线", "语音陪同", "确认到达"]
              : demo?.kind === "medication"
                ? ["收到用药提醒", "本人回应", "家属核实", "同步照护看板"]
                : demo?.kind === "location"
                  ? ["日常路线", "偏离提醒", "联络家人", "接手寻找", "记录结果"]
                  : ["日常活动", "发现异常", "本人确认", "家人接手", "记录结果"]
            ).map((x, i) => (
              <li key={x} className={i === stageIndex ? "active" : ""}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {x}
              </li>
            ))}
          </ol>
          {demo && (
            <div className="m-stage-status">
              <Clock3 size={15} />
              {state.pausedAt != null ? "演示已暂停" : stage}
            </div>
          )}
        </aside>
      </main>
      <footer className="m-demo-controls">
        <button
          className="m-tour-start"
          disabled={busy}
          onClick={() => {
            companion.arm();
            perform("/api/mobile/action", { action: "tour_start" });
          }}
        >
          <Play size={16} />
          <span>
            {tour?.status === "running" || tour?.status === "paused"
              ? "重新演示"
              : "完整演示"}
            <small>{TOUR_DURATION} 秒自动播放</small>
          </span>
        </button>
        <span className="m-demo-label">场景演示</span>
        <div className="m-scene-buttons">
          {scenes.map(([id, label, Icon]) => (
            <button
              key={id}
              disabled={busy}
              className={demo?.kind === id ? "active" : ""}
              onClick={() => scene(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>
        <div className="m-playback-controls">
          <button
            disabled={!demo || busy}
            aria-label={state.pausedAt != null ? "继续演示" : "暂停演示"}
            onClick={() => mAction(state.pausedAt != null ? "resume" : "pause")}
          >
            {state.pausedAt != null ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button
            disabled={!demo || busy}
            aria-label="重置本轮演示"
            onClick={() => mAction("reset")}
          >
            <RotateCcw size={18} />
          </button>
        </div>
        <span className="m-simulation-label">虚构人物 · 场景模拟</span>
      </footer>
      {info && (
        <div className="m-demo-info">
          <button aria-label="关闭演示说明" onClick={() => setInfo(false)}>
            <X size={17} />
          </button>
          <h3>演示说明</h3>
          <p>
            画面、轨迹与联络均为模拟。事件处理、设置保存和双端状态同步由本地服务执行。小安聊天采用本地情境回复，语音播放使用统一合成服务。
          </p>
          <p>暂停会冻结本轮服务端演示时钟；重置保留家庭设置与已确认记录。</p>
          <button
            className="m-text-link"
            disabled={busy}
            onClick={() => perform("/api/daily/seed", {}, "已载入虚构照护记录")}
          >
            载入日常样例
          </button>
          <a href="?view=dashboard" className="m-text-link">
            打开完整工作台与计划助手 <ArrowUpRight size={13} />
          </a>
        </div>
      )}
    </div>
  );
}

function SceneVisual({
  demo,
  elapsed,
  now,
  active,
  replay = false,
  offline = false,
}) {
  const [replayStart, setReplayStart] = useState(Date.now()),
    [frame, setFrame] = useState(Date.now());
  useEffect(() => {
    if (!replay) return;
    const t = setInterval(() => setFrame(Date.now()), 50);
    return () => clearInterval(t);
  }, [replay]);
  if (offline && !replay)
    return (
      <div className="m-camera m-camera-offline">
        <Camera size={32} />
        <h3>画面状态待更新</h3>
        <p>请检查设备连接，再查看最新情况。</p>
        <Tag tone="amber">设备未连接或数据过旧</Tag>
      </div>
    );
  const t = replay
    ? Math.min(8000, frame - replayStart)
    : demo?.kind === "fall"
      ? elapsed
      : 0;
  const walk = Math.min(1, t / 3800),
    stumble = Math.max(0, Math.min(1, (t - 3800) / 500)),
    fall = Math.max(0, Math.min(1, (t - 5200) / 550));
  const danger = (demo?.kind === "fall" || replay) && t >= 5700;
  const phase =
    t < 3800
      ? "正常行走"
      : t < 5000
        ? "失去平衡"
        : t < 5700
          ? "倒地动作"
          : t < 6500
            ? "低位持续"
            : "发起确认";
  return (
    <div className={`m-camera ${danger ? "alert" : ""}`}>
      <img
        className="m-room"
        src="/assets/care-room.png"
        alt="模拟客厅，沙发与窗户之间留有活动空间"
      />
      <img
        className="m-elder-sprite standing"
        aria-hidden={stumble >= 1}
        src="/assets/elder-standing.png"
        alt="老人行走动作模拟"
        style={{
          left: `${27 + walk * 9}%`,
          bottom: "14%",
          width: "22%",
          height: "auto",
          opacity: 1 - stumble,
          transform: `translateY(${Math.sin(t / 190) * Math.min(walk, 1) * 1.4}px)`,
        }}
      />
      <img
        className="m-elder-sprite stumble"
        aria-hidden={stumble === 0 || fall === 1}
        src="/assets/elder-stumble.png"
        alt="老人踉跄并伸手尝试扶稳"
        style={{
          left: `${36 + fall * 3}%`,
          bottom: "14%",
          width: "22%",
          height: "auto",
          opacity: stumble * (1 - fall),
          transform: `translateY(${fall * 14}px) rotate(${fall * 16}deg)`,
        }}
      />
      <img
        className="m-elder-sprite lying"
        aria-hidden={fall === 0}
        src="/assets/elder-on-floor.png"
        alt="老人侧卧在地面的动作模拟"
        style={{
          left: "36%",
          bottom: "calc(14% - 18px)",
          width: "37%",
          height: "auto",
          opacity: fall,
        }}
      />
      <div className="m-camera-top">
        <span>
          <i />
          REC <b>客厅摄像头 01</b>
        </span>
        <Tag tone={danger ? "rose" : ""}>
          {demo?.kind === "fall" || replay ? phase : "日常活动"}
        </Tag>
      </div>
      <time>
        {new Date(now).toLocaleDateString("zh-CN")} {clockText(now)}
      </time>
      <div className="m-camera-bottom">
        <span>场景模拟 · 仅照护成员可查看</span>
        <Camera size={16} />
      </div>
      {danger && (
        <div className="m-detection-label">
          <Activity size={13} />
          {t < 6500 ? "低位持续 · 观察中" : "疑似跌倒 · 等待回应"}
        </div>
      )}
      {replay && (
        <button
          className="m-replay-control"
          onClick={() => setReplayStart(Date.now())}
        >
          <RotateCcw size={16} />
          重播片段
        </button>
      )}
    </div>
  );
}
function Guard({
  state,
  now,
  demo,
  elapsed,
  active,
  busy,
  onDetail,
  eventAction,
  perform,
}) {
  const guardContent = useRef(null);
  const camera = state.home.devices.find(
    (d) => d.id === state.home.monitor.cameraId,
  );
  const available = Boolean(camera?.online && camera?.enabled),
    fresh = available && now - Date.parse(camera.lastSync) < 120000;
  const pending = medicationOverview(state, now, 7).pending;

  useEffect(() => {
    if (!active || active.status === "closed") return;
    const card = guardContent.current?.querySelector(".m-event-card");
    const screen = card?.closest(".m-screen");
    if (card && screen) {
      const over =
        card.getBoundingClientRect().bottom -
        screen.getBoundingClientRect().bottom;
      if (over > 0)
        screen.scrollTo({
          top: screen.scrollTop + over + 12,
          behavior: "smooth",
        });
    }
  }, [active?.id, active?.status]);
  return (
    <>
      <header
        className={`m-page-header ${active && active.status !== "closed" ? "has-event" : ""}`}
      >
        <div>
          <p className="m-kicker">牵挂的人，就在这里</p>
          <h1>爸爸的守护首页</h1>
          <p>
            <span className="m-green-dot" />
            {active && active.status !== "closed"
              ? "有一件事情需要您关注"
              : !available
                ? "客厅设备离线"
                : !fresh
                  ? "画面状态待更新"
                  : "当前未发现新异常"}{" "}
            ·{" "}
            {camera?.lastSync
              ? `${clockText(Date.parse(camera.lastSync))} 更新`
              : "等待设备数据"}
          </p>
        </div>
        <button
          className="m-soft-icon"
          aria-label="查看健康档案"
          onClick={() => onDetail("medical")}
        >
          <Heart size={22} />
        </button>
      </header>
      <button
        className={`m-today-task ${pending ? "attention" : ""}`}
        onClick={() => onDetail("medication")}
      >
        <Pill size={18} />
        <span>
          <strong>
            {pending
              ? `今日待办 · ${pending} 条用药待核实`
              : "今日用药与照护记录"}
          </strong>
          <small>
            {pending ? "查看依据，和家人一起确认" : "查看记录来源和计划安排"}
          </small>
        </span>
        <ChevronRight size={17} />
      </button>
      <div
        className={`m-camera-wrap ${active && active.status !== "closed" ? "is-alert" : ""}`}
      >
        <SceneVisual
          demo={demo}
          elapsed={elapsed}
          now={now}
          active={active}
          offline={!fresh}
        />
        <button
          className="m-expand"
          aria-label="放大守护画面"
          onClick={() => onDetail("camera")}
        >
          <Maximize2 size={17} />
        </button>
      </div>
      <div className="m-quick-actions">
        <button onClick={() => onDetail("contact")}>
          <Phone size={18} />
          联系爸爸
        </button>
        <button
          onClick={() =>
            perform(
              "/api/home/command",
              {
                kind: "tts",
                deviceId: "screen",
                text: "爸爸，慢慢来，小安陪着您。",
              },
              "已发送模拟语音关怀",
            )
          }
          disabled={busy}
        >
          <Volume2 size={18} />
          语音关怀
        </button>
        <button onClick={() => onDetail("events")}>
          <Clock3 size={18} />
          今日记录
        </button>
      </div>
      <div className="m-pad" ref={guardContent}>
        {active && (
          <EventCard
            event={active}
            now={now}
            busy={busy}
            eventAction={eventAction}
            onDetail={onDetail}
          />
        )}
        <div className="m-vitals">
          <div>
            <Heart size={17} />
            <strong>
              {state.home.vitals.heartRate}
              <small>次/分</small>
            </strong>
            <span>心率</span>
          </div>
          <div>
            <Activity size={17} />
            <strong>
              {state.home.vitals.steps}
              <small>步</small>
            </strong>
            <span>今日活动</span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <strong>
              {state.home.devices.filter((d) => d.online && d.enabled).length}
              <small>台</small>
            </strong>
            <span>在线设备</span>
          </div>
        </div>
        <div className="m-section-heading">
          <h2>今日提醒</h2>
          <span className="m-muted">按时间倒序</span>
        </div>
        <Feed state={state} onDetail={onDetail} />
        <section className="m-gentle-note">
          <Sun size={21} />
          <div>
            <strong>平常的一天，也值得被关心</strong>
            <p>小安陪伴爸爸，照护记录同步给您。</p>
          </div>
        </section>
      </div>
    </>
  );
}
function EventCard({ event, now, busy, eventAction, onDetail }) {
  const closed = event.status === "closed",
    handling = event.status === "handling",
    countdown = Math.max(
      0,
      Math.ceil((Date.parse(event.confirmDeadline) - now) / 1000),
    );
  return (
    <section className={`m-event-card ${closed ? "resolved" : ""}`}>
      <div className="m-section-heading">
        <h2>
          <Bell size={19} />
          {event.title}
        </h2>
        <Tag tone={closed ? "" : "rose"}>
          {closed
            ? event.closeReason === "demo_reset"
              ? "演示已重置"
              : event.closeReason === "demo_completed"
                ? "演示已完成"
                : "已处理"
            : statusText[event.status]}
        </Tag>
      </div>
      <p>
        {closed
          ? event.closeNote
          : handling
            ? `${event.assignee}已接手 · ${event.progress.at(-1)?.text || "正在核实情况"}`
            : event.confirmation.responseText ||
              "尚未收到本人回应，正在等待确认。"}
      </p>
      {!closed && event.status === "confirming" && (
        <div className="m-countdown">
          <span>本人确认窗口</span>
          <strong>
            {countdown}
            <small> 秒</small>
          </strong>
        </div>
      )}
      <div className="m-event-buttons">
        {!closed && (
          <MButton
            disabled={busy}
            onClick={() =>
              handling
                ? onDetail("close", event.id)
                : eventAction(event, "review_claim")
            }
          >
            {handling ? "记录处理结果" : "我来接手"}
          </MButton>
        )}
        <MButton secondary onClick={() => onDetail("replay", event.id)}>
          <Play size={15} />
          查看片段
        </MButton>
      </div>
      {handling && (
        <div className="m-progress-actions">
          {[
            "已取得联系",
            event.type === "location" ? "已找到老人" : "已到达现场",
          ].map((text) => (
            <button
              key={text}
              disabled={busy || event.progress.some((p) => p.text === text)}
              onClick={() => eventAction(event, "progress", { text })}
            >
              {event.progress.some((p) => p.text === text) && (
                <Check size={13} />
              )}{" "}
              {text}
            </button>
          ))}
        </div>
      )}
      {event.contacts.length > 0 && !closed && (
        <p className="m-footnote">
          已联络：
          {[
            ...new Set(
              event.contacts
                .filter((c) => c.role !== "medical")
                .map((c) => c.name),
            ),
          ].join("、") || "正在安排"}{" "}
          · 应用内模拟
        </p>
      )}
    </section>
  );
}
function Feed({ state, onDetail, all = false }) {
  const [filter, setFilter] = useState("all");
  const feed = [...state.home.feed]
    .reverse()
    .filter(
      (f) =>
        filter === "all" ||
        (filter === "danger" && f.level === "danger") ||
        (filter === "medication" && /药/.test(f.title)),
    );
  return (
    <>
      <div className="m-filters">
        {[
          ["all", "全部"],
          ["danger", "危险"],
          ["medication", "用药"],
        ].map(([id, t]) => (
          <button
            key={id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {t}
          </button>
        ))}
      </div>
      {feed.slice(0, all ? 30 : 4).map((f) => (
        <button
          className={`m-feed-item ${f.level === "danger" ? "danger" : ""}`}
          key={f.id}
          onClick={() =>
            onDetail(
              /药/.test(f.title)
                ? "medication"
                : f.eventId
                  ? "replay"
                  : "events",
              f.eventId,
            )
          }
        >
          <span className="m-feed-icon">
            {/药/.test(f.title) ? (
              <Pill size={21} />
            ) : f.level === "danger" ? (
              <Bell size={21} />
            ) : (
              <CheckCheck size={21} />
            )}
          </span>
          <span>
            <strong>{f.title}</strong>
            <small>
              {clockText(Date.parse(f.at))} · {f.detail}
            </small>
          </span>
          <ChevronRight size={15} />
        </button>
      ))}
      {!feed.length && (
        <div className="m-empty">
          <CheckCheck size={26} />
          <strong>
            {filter === "all" ? "今天的守护已开启" : "暂无此类提醒"}
          </strong>
          <p>新的照护记录会显示在这里。</p>
        </div>
      )}
    </>
  );
}
function Patient({
  state,
  now,
  active,
  busy,
  perform,
  notify,
  eventAction,
  profile,
  voice,
  onDetail,
}) {
  const [text, setText] = useState(""),
    [typing, setTyping] = useState(false),
    [recording, setRecording] = useState(false),
    [speechText, setSpeechText] = useState("");
  const bottom = useRef(null),
    recognition = useRef(null);
  const demo = state.mobile?.demo;
  const chat = (state.mobile?.chat || []).filter(
    (m) =>
      demo?.kind !== "wayfinding" ||
      m.navigationId === state.mobile.navigation?.id,
  );
  const medicationVisible =
    demo?.kind === "medication" &&
    !(Date.parse(state.mobile?.reminderSnoozeUntil) > now);
  const task = [...state.home.routineTasks]
    .reverse()
    .find((t) =>
      state.planner.occurrences.some(
        (o) =>
          o.id === t.occurrenceId &&
          o.status !== "withdrawn" &&
          state.planner.plans.some(
            (p) => p.id === o.planId && p.mobileDemoId === demo?.id,
          ),
      ),
    );
  const urgent = active && active.status !== "closed";
  const navigation = state.mobile.navigation;
  const navigating =
    demo?.kind === "wayfinding" ||
    (navigation &&
      ["confirming", "choosing", "guiding"].includes(navigation.status));
  const navigate = (op, extra = {}) => {
    if (!navigation) return;
    voice.stop();
    return perform("/api/mobile/action", {
      action: "wayfinding",
      op,
      navigationId: navigation.id,
      version: navigation.version,
      ...extra,
    });
  };
  const salutation = profile.salutation || "周伯";
  const routine = [...state.planner.occurrences]
    .reverse()
    .find(
      (o) =>
        o.recipient === "patient" &&
        o.category === "custom" &&
        o.status === "pending" &&
        Date.parse(o.availableAt) <= now,
    );
  const holdMode = profile.voiceInputMode === "hold";

  useEffect(() => {
    if (!chat.length) return;
    const scroller = bottom.current?.parentElement;
    if (scroller) {
      const latest = chat.at(-1);
      const bubble =
        latest?.kind === "directions"
          ? scroller.querySelector(`[data-message-id="${latest.id}"]`)
          : null;
      const top = bubble
        ? scroller.scrollTop +
          bubble.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          10
        : scroller.scrollHeight;
      scroller.scrollTo({ top, behavior: "smooth" });
    }
  }, [chat.length]);
  useEffect(() => {
    const scroller = bottom.current?.parentElement;
    scroller?.scrollTo({
      top: demo?.kind === "wayfinding" ? scroller.scrollHeight : 0,
      behavior: "auto",
    });
  }, [demo?.id, routine?.id, urgent ? active?.id : null]);
  useEffect(() => () => recognition.current?.abort(), []);
  const send = async (value) => {
    if (!value.trim() || busy) return;
    voice.stop();
    const r = await perform("/api/mobile/action", {
      action: "chat",
      text: value,
    });
    if (r) {
      setText("");
      setSpeechText("");
    }
  };
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setTyping(true);
      notify("此浏览器暂不支持语音输入，您可以打字或选择一句话。");
      return;
    }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = !holdMode;
    let captured = "",
      failed = false;
    recognition.current = rec;
    rec.onresult = (e) => {
      const value = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      captured = value;
      setSpeechText(value);
    };
    rec.onerror = (event) => {
      failed = true;
      if (event.error === "aborted") {
        setRecording(false);
        return;
      }
      setRecording(false);
      setTyping(true);
      notify("未能获取语音，请检查权限或使用打字。");
    };
    rec.onend = () => {
      setRecording(false);
      if (captured.trim() && !failed) send(captured);
    };
    try {
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };
  return (
    <div className="m-patient">
      <header className="m-patient-header">
        <span className="m-bot-avatar">
          <Bot size={30} />
        </span>
        <div>
          <h1>小安陪着您</h1>
          <p>
            <span className="m-green-dot" />
            正在陪伴
          </p>
        </div>
        <button
          className={`m-voice-toggle ${voice.enabled ? "on" : ""}`}
          aria-label={voice.enabled ? "关闭语音陪伴" : "开启语音陪伴"}
          aria-pressed={voice.enabled}
          onClick={voice.toggle}
        >
          <Volume2 size={23} />
          <small>语音{voice.enabled ? "开" : "关"}</small>
        </button>
      </header>
      {voice.enabled && ["blocked", "error"].includes(voice.status) && (
        <button className="m-voice-recover" onClick={voice.resume}>
          <Volume2 size={17} />
          {voice.error || "点一下开启声音"}
        </button>
      )}
      {voice.enabled &&
        ["loading", "playing", "paused"].includes(voice.status) && (
          <div className="m-voice-playing" role="status">
            <Volume2 size={14} />
            {voice.status === "loading"
              ? "正在准备语音"
              : voice.status === "paused"
                ? "语音已暂停"
                : "小安正在说"}
            <span>{voice.voiceName || "准备中"}</span>
          </div>
        )}
      {voice.enabled && voice.notice && (
        <p className="m-voice-notice" role="status">
          {voice.notice}
        </p>
      )}
      <div className="m-patient-scroll">
        {urgent ? (
          <section className="m-patient-emergency" role="alert">
            <Tag tone="rose">安全守护</Tag>
            <h2>
              {active.type === "location"
                ? "您现在想去哪里？"
                : `${salutation}，您需要帮助吗？`}
            </h2>
            <p>
              {active.status === "handling"
                ? `${active.assignee}已接手，正在联系您。`
                : "小安在这里，家人也会一起帮您。"}
            </p>
            <MButton
              danger
              disabled={busy}
              onClick={() =>
                eventAction(active, "respond", { response: "help_requested" })
              }
            >
              需要帮助，请联系家人
            </MButton>
            <MButton
              secondary
              disabled={busy}
              onClick={() =>
                eventAction(active, "respond", { response: "no_help_claimed" })
              }
            >
              暂不需要帮助
            </MButton>
            {active.confirmation.responseText && (
              <small>{active.confirmation.responseText}</small>
            )}
          </section>
        ) : (!routine || medicationVisible) && !navigating ? (
          <section
            className={`m-reminder ${medicationVisible ? "medication" : "routine"}`}
          >
            <div className="m-reminder-icon">
              <Bell size={24} />
            </div>
            <div>
              <strong>
                {medicationVisible ? "家人用药提醒" : "小安的陪伴"}
              </strong>
              <h2>
                {medicationVisible
                  ? `${salutation}，到了计划用药时间`
                  : `${salutation}，今天也慢慢来`}
              </h2>
              <p>
                {medicationVisible
                  ? "请按家人核对的方案服用。"
                  : "有事就叫小安，家人一直在。"}
              </p>
              {medicationVisible && (
                <>
                  <div className="m-inline-buttons">
                    <button
                      disabled={busy || state.mobile.reminderSeen}
                      onClick={() =>
                        perform("/api/mobile/action", { action: "seen" })
                      }
                    >
                      <Check size={17} />
                      {state.mobile.reminderSeen ? "已收到提醒" : "我知道了"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        perform(
                          "/api/mobile/action",
                          { action: "snooze" },
                          "30 秒后再次提醒（演示）",
                        )
                      }
                    >
                      稍后提醒
                    </button>
                  </div>
                  {task && state.mobile.reminderSeen && (
                    <MButton
                      secondary
                      disabled={busy || task.candidate}
                      onClick={() =>
                        perform(
                          "/api/home/medication-evidence",
                          {
                            action: "sequence",
                            occurrenceId: task.occurrenceId,
                          },
                          "已记录模拟服药动作，等待家属核实",
                        )
                      }
                    >
                      {task.verified
                        ? "家人已确认"
                        : task.candidate
                          ? "已记录，等家人核实"
                          : "我已服用，请家人核实"}
                    </MButton>
                  )}
                </>
              )}
            </div>
          </section>
        ) : null}
        {!urgent && routine && (
          <section className="m-routine-reminder">
            <div className="m-section-heading">
              <h2>{routine.title}</h2>
              <Tag tone="amber">提醒</Tag>
            </div>
            <p>{routine.message}</p>
            <div className="m-event-buttons">
              <MButton
                disabled={busy}
                onClick={() =>
                  perform(
                    "/api/reminders/action",
                    {
                      action: "acknowledge",
                      occurrenceId: routine.id,
                      version: routine.version,
                    },
                    "已收到，提醒已记录",
                  )
                }
              >
                我知道了
              </MButton>
              <MButton
                secondary
                disabled={busy}
                onClick={() =>
                  perform(
                    "/api/reminders/action",
                    {
                      action: "snooze",
                      occurrenceId: routine.id,
                      version: routine.version,
                      minutes: 5,
                    },
                    "5 分钟后再提醒",
                  )
                }
              >
                稍后提醒
              </MButton>
            </div>
          </section>
        )}
        <div className="m-conversation-label">
          今天的对话 <span />
        </div>
        {!chat.length && (
          <>
            <div className="m-message assistant">
              <span className="m-bot-small">
                <Bot size={23} />
              </span>
              <div>
                <small>小安</small>
                <p>
                  {salutation}，我在这里陪您。
                  <br />
                  今天想聊些什么？
                </p>
                <button
                  onClick={() =>
                    voice.replay(
                      `${salutation}，我在这里陪您。今天想聊些什么？`,
                      "greeting",
                    )
                  }
                >
                  <Volume2 size={16} />
                  播放这段话
                </button>
              </div>
            </div>
            <div className="m-chat-suggestions">
              {["小安，我的眼镜放哪里了？", "今天天气不错，陪我聊聊"].map(
                (x) => (
                  <button key={x} disabled={busy} onClick={() => send(x)}>
                    {x}
                  </button>
                ),
              )}
            </div>
          </>
        )}
        {chat.map((m) => (
          <div
            key={m.id}
            data-message-id={m.id}
            className={`m-message ${m.role === "user" ? "user" : "assistant"}`}
          >
            {m.role === "assistant" && (
              <span className="m-bot-small">
                <Bot size={23} />
              </span>
            )}
            <div>
              {m.role === "assistant" && <small>小安</small>}
              {(m.role === "assistant" && m.kind?.startsWith("destination")) ||
              m.kind === "directions" ? (
                <WayfindingCard
                  message={m}
                  navigation={navigation}
                  busy={busy}
                  onAction={navigate}
                  voice={voice}
                />
              ) : (
                <p>{m.text}</p>
              )}
              {m.role === "assistant" && (
                <div className="m-message-actions">
                  <button onClick={() => voice.replay(m.text, m.id)}>
                    <Volume2 size={16} />
                    播放这段话
                  </button>
                  {m.text.includes("眼镜在") && !m.navigationId && (
                    <button disabled={busy} onClick={() => send("我找到了")}>
                      我找到了
                    </button>
                  )}
                </div>
              )}
              {m.kind === "route-step" &&
                navigation?.id === m.navigationId &&
                navigation.status === "guiding" &&
                navigation.step === m.step && (
                  <MButton
                    className="m-route-next"
                    disabled={busy}
                    onClick={() =>
                      navigate(navigation.step === 2 ? "arrived" : "next")
                    }
                  >
                    {navigation.step === 2 ? "我找到了" : "我已完成这一步"}
                  </MButton>
                )}
              <time>{clockText(Date.parse(m.at))}</time>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <footer className="m-composer">
        {navigating && navigation?.status === "guiding" ? (
          <div className="m-route-composer-row">
            <span>当前第 {navigation.step + 1} 步</span>
            <button
              disabled={busy}
              onClick={() =>
                navigate(navigation.step === 2 ? "arrived" : "next")
              }
            >
              {ROUTE_DESTINATIONS[navigation.destination]?.nextLabels[
                navigation.step
              ] || "继续"}
            </button>
          </div>
        ) : (
          <div>
            <strong>您可以说话，也可以打字</strong>
          </div>
        )}
        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              autoFocus
              aria-label="和小安说句话"
              placeholder="和小安说句话…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              aria-label="发送消息"
              disabled={busy || !text.trim()}
            >
              <Send size={21} />
            </button>
            <button
              type="button"
              aria-label="切回语音"
              onClick={() => setTyping(false)}
            >
              <Mic size={21} />
            </button>
          </form>
        ) : (
          <div className="m-composer-buttons">
            <button
              className={`m-hold-to-talk ${recording ? "recording" : ""}`}
              disabled={busy}
              onClick={
                holdMode
                  ? undefined
                  : () =>
                      recording ? recognition.current?.stop() : startVoice()
              }
              onPointerDown={holdMode ? startVoice : undefined}
              onPointerUp={
                holdMode ? () => recognition.current?.stop() : undefined
              }
              onPointerCancel={() => recognition.current?.stop()}
              onKeyDown={(e) => {
                if (holdMode && e.code === "Space" && !e.repeat) {
                  e.preventDefault();
                  startVoice();
                }
              }}
              onKeyUp={(e) => {
                if (holdMode && e.code === "Space") recognition.current?.stop();
              }}
            >
              <Mic size={31} />
              <span>
                <strong>
                  {recording
                    ? holdMode
                      ? "我在听…"
                      : "说好了，点这里"
                    : holdMode
                      ? "按住说话"
                      : "点一下，说句话"}
                </strong>
                <small>
                  {holdMode
                    ? "松开后，小安会回应您"
                    : "点一下开始，再点一下结束"}
                </small>
              </span>
            </button>
            <button className="m-type-button" onClick={() => setTyping(true)}>
              <MessageCircle size={23} />
              打字
            </button>
          </div>
        )}
        <button
          className="m-family-call"
          disabled={busy}
          onClick={() =>
            urgent
              ? eventAction(active, "respond", { response: "help_requested" })
              : perform("/api/help", {}, "已经通知家人，小安陪您一起等回应")
          }
        >
          <Phone size={20} />
          <strong>联系家人</strong>
          <span>一键通知</span>
        </button>
        {speechText && <p className="m-transcript">{speechText}</p>}
        <p className="m-patient-safety">
          <span>小安陪您，慢慢说</span>
          <span>
            <ShieldCheck size={13} />
            安全守护中
          </span>
        </p>
      </footer>
    </div>
  );
}

function Board({ state, now, days, setDays, stats, onDetail }) {
  const summary = dailySummary(state, now, days),
    report = homeReport(state, now, days);
  return (
    <>
      <header className="m-page-header board">
        <div>
          <p className="m-kicker">把每一天的照护，连在一起</p>
          <h1>照护看板</h1>
        </div>
        <button className="m-health-link" onClick={() => onDetail("medical")}>
          <Plus size={25} />
          <span>健康档案</span>
        </button>
        <div className="m-board-person">
          <strong>爸爸</strong>
          <span>· 阿尔茨海默病照护</span>
          <Tag>虚构案例</Tag>
        </div>
      </header>
      <div className="m-pad">
        <div className="m-period">
          {[7, 30].map((d) => (
            <button
              key={d}
              className={days === d ? "active" : ""}
              onClick={() => setDays(d)}
            >
              近 {d} 天
            </button>
          ))}
        </div>
        <p className="m-period-caption">
          {stats.start.slice(5).replace("-", "月")}日 —{" "}
          {stats.end.slice(5).replace("-", "月")}日 · 本期记录
        </p>
        <div className="m-section-heading">
          <h2>用药记录 {stats.demoCount > 0 && <Tag>含本轮演示</Tag>}</h2>
          <Pill size={19} />
        </div>
        <section className="m-card m-med-summary">
          <div className="m-med-counts">
            <div>
              <strong>{stats.planned}</strong>
              <span>{stats.hasPlan ? "计划次数" : "已记及待核实"}</span>
            </div>
            <div>
              <strong>{stats.confirmed}</strong>
              <span>已记录服用</span>
            </div>
            <div>
              <strong>{stats.pending}</strong>
              <span>待核实</span>
            </div>
          </div>
          <p className="m-note">
            {stats.pending
              ? `${stats.pending} 条尚待确认 · 请家人核实`
              : stats.rows.some((r) => r.value === "missed")
                ? `有 ${stats.rows.filter((r) => r.value === "missed").length} 次已确认未服用，可查看记录`
                : "本期用药记录已整理，可查看来源与时间"}
          </p>
          <button
            className="m-text-link"
            onClick={() => onDetail("medication")}
          >
            查看用药记录与依据 <ArrowRight size={17} />
          </button>
        </section>
        <section className="m-ai-summary">
          <div className="m-section-heading">
            <h2>
              <Sun size={22} />
              小安的照护小结
            </h2>
            <Tag>日常记录</Tag>
          </div>
          <p>{careBrief(summary, stats)}</p>

          <footer>
            <span>
              本期 {summary.stats?.recordedDays ?? summary.recordedDays ?? 0} /{" "}
              {days} 天有记录
            </span>
            <button onClick={() => onDetail("report")}>
              完整报告 <ChevronRight size={16} />
            </button>
          </footer>
        </section>
        <div className="m-section-heading">
          <h2>
            需要关注{" "}
            <Tag tone="amber">
              {summary.risks.filter((r) => r.kind !== "medication").length +
                (stats.pending ? 1 : 0)}
            </Tag>
          </h2>
          <span className="m-muted">一起跟进，不遗漏</span>
        </div>
        {summary.risks
          .filter((r) => r.kind !== "medication")
          .map((r) => (
            <section className="m-concern" key={r.id}>
              <div className="m-section-heading">
                <h2>{r.title}</h2>
                <Tag tone="amber">待跟进</Tag>
              </div>
              <p>{r.reason}</p>
              <MButton
                secondary
                onClick={() => onDetail("observation", r.eventId, r.id)}
              >
                查看变化依据与进展
              </MButton>
            </section>
          ))}
        {stats.pending ? (
          <section className="m-concern">
            <div className="m-section-heading">
              <h2>有用药记录待核实</h2>
              <Tag tone="amber">待确认</Tag>
            </div>
            <p>尚无明确的服药确认记录，或已有模拟动作线索，等家人一起核对。</p>
            <div className="m-note amber">
              收到提醒、观察到动作，均不等同于确认服用。
            </div>
            <MButton secondary onClick={() => onDetail("medication")}>
              查看依据并核实
            </MButton>
          </section>
        ) : (
          <div className="m-calm-row">
            <CheckCheck size={22} />
            <div>
              <strong>已记录用药暂无待核实项</strong>
              <p>新的提醒会及时同步到这里。</p>
            </div>
          </div>
        )}
        <div className="m-section-heading">
          <h2>日常变化</h2>
          <span className="m-muted">模拟设备样本</span>
        </div>
        <section className="m-card">
          <div className="m-trend-header">
            <div>
              <span>每日活动步数</span>
              <h2>
                {state.home.sensorHistory.slice(-days).length}{" "}
                <small>天有样本</small>
              </h2>
            </div>
            <Tag>近 {days} 天</Tag>
          </div>
          <div className="m-bars">
            {state.home.sensorHistory.slice(-Math.min(days, 14)).map((r, i) => (
              <div key={r.date}>
                <span style={{ height: `${Math.max(12, r.steps / 60)}px` }} />
                <small>
                  {i === 0 || i === Math.min(days, 14) - 1
                    ? r.date.slice(8)
                    : ""}
                </small>
              </div>
            ))}
          </div>
          <button className="m-text-link" onClick={() => onDetail("report")}>
            查看活动与睡眠变化 <ChevronRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
function MapScreen({
  state,
  now,
  active,
  busy,
  onDetail,
  eventAction,
  perform,
}) {
  const facts = mapFacts(state.home, now),
    point = state.home.map.points.at(-1);
  return (
    <>
      <header className="m-page-header">
        <div>
          <p className="m-kicker">熟悉的路，安心地走</p>
          <h1>爸爸的位置</h1>
          <p>
            <span className="m-green-dot" />
            {facts.valid ? "定位已更新" : "位置待更新"} · 手环定位
          </p>
        </div>
        <button
          className="m-soft-icon"
          aria-label="查看地图说明"
          onClick={() => onDetail("events")}
        >
          <RouteIcon />
        </button>
      </header>
      <div className="m-map-container">
        <NeighborhoodMap home={state.home} />
        <div className="m-map-status">
          <Tag tone={active && active.status !== "closed" ? "amber" : ""}>
            {active && active.status !== "closed"
              ? "偏离日常路线 · 待确认"
              : "日常散步路线"}
          </Tag>
          <span>青禾社区 · 虚构地图</span>
        </div>
        <div className="m-map-legend">
          <span>
            <i />
            日常路线
          </span>
          <span>
            <i />
            本次轨迹
          </span>
          <span>虚线：安全区域</span>
        </div>
      </div>
      <div className="m-pad">
        {state.mobile.navigation?.status === "guiding" && (
          <section className="m-card">
            <h2>
              <Navigation size={18} />
              小安正在语音陪同找路
            </h2>
            <p>当前第 {state.mobile.navigation.step + 1} 步 · 路线情境演示</p>
            <small>进度来自老人按钮确认，不代表真实定位。</small>
          </section>
        )}
        <section className="m-location-card">
          <div className="m-section-heading">
            <h2>
              <MapPin size={19} />
              青禾社区 · 花园附近
            </h2>
            <Tag>{facts.valid ? "位置有效" : "待更新"}</Tag>
          </div>
          <p>
            {facts.valid
              ? `距家 ${facts.distance} 米 · 偏离路线 ${facts.deviation} 米`
              : "当前定位较旧或质量不足，等待新位置。"}
          </p>
          <small>
            {point
              ? `${clockText(Date.parse(point.at))} 更新 · 精度约 ${point.accuracy} 米`
              : "正在等待定位"}
          </small>
          <div className="m-event-buttons">
            <MButton onClick={() => onDetail("contact")}>
              <Phone size={16} />
              联系爸爸
            </MButton>
            <MButton
              secondary
              disabled={busy}
              onClick={() =>
                perform(
                  "/api/home/command",
                  {
                    kind: "tts",
                    deviceId: "screen",
                    text: "周伯，您现在想去哪里？家人正在联系您。",
                  },
                  "已发送模拟关怀提醒",
                )
              }
            >
              语音提醒
            </MButton>
          </div>
        </section>
        {active && (
          <EventCard
            event={active}
            now={now}
            busy={busy}
            onDetail={onDetail}
            eventAction={eventAction}
          />
        )}
        <section className="m-card">
          <h2>常用路线</h2>
          <div className="m-route-steps">
            <span>
              <Home size={17} />家
            </span>
            <span />
            <span>社区花园</span>
            <span />
            <span>
              <Home size={17} />家
            </span>
          </div>
          <p className="m-footnote">
            安全区域 {state.home.map.radius} 米 · 路线容差{" "}
            {state.home.map.tolerance} 米
          </p>
        </section>
        <section className="m-card">
          <h2>本次轨迹</h2>
          {[...state.home.map.points]
            .reverse()
            .slice(0, 5)
            .map((pt, i) => (
              <div className="m-track-row" key={`${pt.at}-${i}`}>
                <span className="m-green-dot" />
                <strong>{clockText(Date.parse(pt.at))}</strong>
                <span>距家约 {Math.round(Math.hypot(pt.x, pt.y))} 米</span>
                <small>精度 {pt.accuracy} 米</small>
              </div>
            ))}
        </section>
      </div>
    </>
  );
}
function RouteIcon() {
  return <MapPin size={21} />;
}
function MedicationDetails({ state, stats, busy, perform }) {
  return (
    <>
      <p className="m-note">
        本期 {stats.start} — {stats.end}
        。记录保留本人报告、动作线索与家属确认来源。
      </p>
      {stats.tasks.map((t) => (
        <section className="m-card" key={t.id}>
          <div className="m-section-heading">
            <h3>本次用药提醒</h3>
            <Tag tone={t.verified ? "" : "amber"}>
              {t.verified
                ? "家属已确认"
                : t.candidate
                  ? "待家属核实"
                  : "等待本人回应"}
            </Tag>
          </div>
          <p>
            {t.candidate
              ? "已记录：取药 → 送口 → 饮水（模拟线索）"
              : "尚未获得模拟服药动作线索"}
          </p>
          {t.verified ? (
            <p className="m-footnote">
              {t.verifiedBy} · {clockText(Date.parse(t.verifiedAt))}
            </p>
          ) : (
            <MButton
              disabled={busy || !t.candidate}
              onClick={() =>
                perform(
                  "/api/home/medication-evidence",
                  { action: "confirm", occurrenceId: t.occurrenceId },
                  "已确认服用，照护看板已同步",
                )
              }
            >
              我已核实，确认服用
            </MButton>
          )}
        </section>
      ))}
      {stats.missing.map((r) => (
        <section className="m-card" key={`${r.date}:${r.slot}`}>
          <h3>
            {r.date} · {r.time}
          </h3>
          <p>尚无服药确认记录 · 待家属核实</p>
          <MButton
            secondary
            disabled={busy}
            onClick={() =>
              perform(
                "/api/daily/record",
                {
                  requestId: crypto.randomUUID(),
                  kind: "medication",
                  value: "taken",
                  reporter: "family",
                  date: r.date,
                  slot: r.slot,
                  note: "家属核实后补记服用。",
                },
                "已补充服药记录",
              )
            }
          >
            家属核实后确认
          </MButton>
        </section>
      ))}
      {[...stats.rows].reverse().map((r) => (
        <article className="m-card" key={r.id}>
          <div className="m-section-heading">
            <h3>
              {r.date} · {r.slot === "evening" ? "晚间用药" : "早间用药"}
            </h3>
            <Tag tone={r.value === "taken" ? "" : "amber"}>
              {r.value === "taken"
                ? "已记录服用"
                : r.value === "missed"
                  ? "已确认未服用"
                  : "待核实"}
            </Tag>
          </div>
          <p>{r.note || "日常用药记录"}</p>
          <small>
            来源：{r.reporter === "family" ? "家属记录" : "本人报告"} ·{" "}
            {r.sourceMode === "simulated" ? "模拟样本" : "手动记录"}
          </small>
          {["unsure", "not_taken"].includes(r.value) && (
            <MButton
              secondary
              disabled={busy}
              onClick={() =>
                perform(
                  "/api/daily/record",
                  {
                    requestId: crypto.randomUUID(),
                    kind: "medication",
                    value: "taken",
                    reporter: "family",
                    date: r.date,
                    slot: r.slot,
                    note: "家属核对后补充确认。",
                  },
                  "已更新用药记录",
                )
              }
            >
              家属核实后确认
            </MButton>
          )}
        </article>
      ))}
      {!stats.rows.length && !stats.tasks.length && (
        <div className="m-empty">
          <Pill size={30} />
          <h3>还没有用药记录</h3>
          <p>从页面下方启动“用药提醒”，体验双端核实。</p>
        </div>
      )}
    </>
  );
}
function Report({ state, now, days, stats }) {
  const history = state.home.sensorHistory.slice(-days),
    mean = (key) =>
      history.length
        ? Math.round(history.reduce((s, r) => s + r[key], 0) / history.length)
        : 0;
  return (
    <>
      <section className="m-ai-summary">
        <h2>爸爸的 {days} 天照护报告</h2>
        <p>
          {stats.start} — {stats.end}
        </p>
        <Tag>虚构案例 · 模拟样本</Tag>
      </section>
      <section className="m-card">
        <h2>日常活动与睡眠</h2>
        <Row
          icon={Activity}
          title="平均每日步数"
          tail={`${mean("steps")} 步`}
        />
        <Row icon={Sun} title="平均户外活动" tail={`${mean("outdoor")} 分钟`} />
        <Row
          icon={Clock3}
          title="平均夜间醒来"
          tail={`${mean("nightWaking")} 次`}
        />
        <p className="m-footnote">
          基于 {history.length} 天预设设备样本，供演示回顾。
        </p>
      </section>
      <section className="m-card">
        <h2>用药与照护记录</h2>
        <p>
          记录服用 {stats.confirmed} 次，{stats.pending} 次需要核实。
        </p>
        <p>如发现持续变化，可携带记录与医生沟通。</p>
        <a
          className="m-button secondary"
          href={`/api/daily/summary?days=${days}&format=md`}
          download
        >
          导出照护摘要
        </a>
      </section>
      {state.events
        .filter((e) => e.status === "closed")
        .slice(-3)
        .map((e) => (
          <section className="m-card" key={e.id}>
            <h3>{e.title}</h3>
            <p>{e.closeNote}</p>
            <small>
              {e.closeReason === "demo_reset" ? "场景重置" : "家人手动记录"}
            </small>
          </section>
        ))}
    </>
  );
}
function Medical({ state }) {
  const e = state.home.emergency;
  return (
    <>
      <section className="m-profile">
        <div className="m-avatar">
          <UserRound size={30} />
        </div>
        <div>
          <h2>周伯 · {e.age} 岁</h2>
          <p>爸爸 · 居家照护</p>
          <Tag>虚构演示档案</Tag>
        </div>
      </section>
      <section className="m-card">
        <h2>健康信息</h2>
        <Field label="病历信息">
          <p>{e.diagnoses.join("；")}</p>
        </Field>
        <Field label="过敏信息">
          <p>{e.allergies.join("；")}</p>
        </Field>
        <Field label="用药信息">
          <p>
            {e.medications.length
              ? e.medications.join("；")
              : "待家属核对原医嘱"}
          </p>
        </Field>
      </section>
      <section className="m-card">
        <h2>病历与医嘱</h2>
        {state.home.medicalRecords.length ? (
          state.home.medicalRecords.map((r) => (
            <div className="m-note" key={r.id}>
              {r.filename || r.title || "病历记录"} ·{" "}
              {r.status === "confirmed" ? "已核对" : "待核对"}
            </div>
          ))
        ) : (
          <p>暂无上传病历。可通过完整工作台导入并核对。</p>
        )}
        <p className="m-footnote">已保存的病历与确认信息在双端共用同一档案。</p>
      </section>
    </>
  );
}
function Timeline({ event }) {
  return (
    <div className="m-timeline">
      {event.timeline.map((t, i) => (
        <div key={t.id || i}>
          <span />
          <div>
            <strong>{t.title}</strong>
            <small>
              {clockText(Date.parse(t.at))} · {t.detail}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
function CloseEvent({ event, busy, eventAction, onDone }) {
  const [reason, setReason] = useState("confirmed_safe"),
    [note, setNote] = useState(""),
    [medical, setMedical] = useState(false);
  const needsMedical = event.contacts.some(
    (c) => c.role === "medical" && c.handlingStatus !== "completed",
  );
  return (
    <form
      className="m-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await eventAction(event, "close", {
          reason,
          note,
          ...(medical ? { medicalResolution: "cancelled_after_review" } : {}),
        });
        if (r) onDone();
      }}
    >
      <p className="m-note">由接手人记录现场核实结果，保留在本次事件中。</p>
      <Field label="处理结果">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="confirmed_safe">人工核实，确认安全</option>
          <option value="false_alarm">经核实为误报</option>
        </select>
      </Field>
      <Field label="核实说明">
        <textarea
          required
          placeholder="请记录您确认的情况和处理过程"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {needsMedical && (
        <label className="m-check">
          <span>经核实，结束本次模拟医疗协助任务</span>
          <input
            type="checkbox"
            required
            checked={medical}
            onChange={(e) => setMedical(e.target.checked)}
          />
        </label>
      )}
      <MButton type="submit" disabled={busy || !note.trim()}>
        保存处理结果
      </MButton>
      <Timeline event={event} />
    </form>
  );
}

function ObservationDetails({ state, risk, perform, busy, onDone }) {
  const [note, setNote] = useState("");
  if (!risk) return <p className="m-note">请在完整照护报告中查看日常变化。</p>;
  const records = state.daily.records.filter((r) =>
    risk.recordIds.includes(r.id),
  );
  return (
    <>
      <h2>{risk.title}</h2>
      <p className="m-note">{risk.reason}</p>
      {records.map((r) => (
        <section className="m-card" key={r.id}>
          <h3>
            {r.date} · {CATEGORIES[r.kind]?.label}
          </h3>
          <p>{CATEGORIES[r.kind]?.values[r.value] || r.value}</p>
          {r.note && <p>{r.note}</p>}
          {r.additions?.map((a) => (
            <p key={a.id}>{a.note}</p>
          ))}
          <small>
            来源：{r.reporter === "family" ? "家属记录" : "本人报告"} ·{" "}
            {r.sourceMode === "simulated" ? "模拟样本" : "手动记录"}
          </small>
        </section>
      ))}
      <form
        className="m-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await perform(
            "/api/daily/review",
            { alertId: risk.id, note },
            "已保存家属跟进记录",
          );
          if (r) onDone();
        }}
      >
        <Field label="家属跟进记录">
          <textarea
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="记录已核实的情况与下一步安排"
          />
        </Field>
        <MButton type="submit" disabled={busy || !note.trim()}>
          保存跟进记录
        </MButton>
      </form>
    </>
  );
}
