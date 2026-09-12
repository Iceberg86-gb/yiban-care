import { useSpeechPlayer } from "./useSpeechPlayer.jsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import MobileExperience from "./MobileExperience.jsx";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Clock3,
  Cloud,
  Code2,
  Cpu,
  FileText,
  Heart,
  House,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  MapPin,
  Menu,
  MessageCircle,
  Mic,
  Monitor,
  MoreHorizontal,
  Phone,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  Badge,
  CAPTURE,
  CLOSE,
  Countdown,
  DELIVERY,
  EventTimeline,
  Evidence,
  FlowSteps,
  Logo,
  MapView,
  Modal,
  Neighborhood,
  Portrait,
  PROMPT,
  RESPONSE,
  STATUS,
  Waveform,
  date,
  time,
} from "./components.jsx";
import { DailyFamilyPage, DailyPatient, DailyOverview } from "./DailyCare.jsx";
import { familyRisks, PRIORITIES, eventUnknowns } from "../shared/daily.js";
import {
  ReminderAgentPage,
  ReminderInbox,
  VoiceReminderToggle,
  useReminderVoice,
} from "./ReminderAgent.jsx";
import {
  MonitorPage,
  MapPage,
  ReportsPage,
  MyPage,
  EmergencyDialog,
  FamilyPhonePreview,
} from "./HomeScreens.jsx";

const NAV = [
  { id: "dashboard", text: "监控", icon: Monitor },
  { id: "map", text: "地图", icon: MapPin },
  { id: "reports", text: "报告", icon: FileText },
  { id: "my", text: "我的", icon: Users },
];
const PAGE_NAMES = {
  dashboard: "监控",
  map: "地图",
  reports: "报告",
  my: "我的",
  daily: "日常与趋势",
  plans: "计划助手",
  events: "事件与跟进",
  "elder-preview": "老人端体验",
  elder: "老人端",
  architecture: "百度 AI 全栈",
  settings: "档案与连接",
  demo: "演示控制台",
  "legacy-dashboard": "原工作台",
  "family-phone": "手机四Tab预览",
};
const primaryView = (view) =>
  ["reports", "daily"].includes(view)
    ? "reports"
    : ["my", "settings", "architecture", "family-phone"].includes(view)
      ? "my"
      : view === "map"
        ? "map"
        : "dashboard";
const clientId = () =>
  window.crypto?.randomUUID?.() ||
  `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const SCENES = [
  {
    id: "fall",
    number: "01",
    name: "疑似跌倒",
    desc: "多源感知 · 确认与分级联络",
    icon: Activity,
    color: "ochre",
  },
  {
    id: "speech",
    number: "02",
    name: "慢慢说，我在听",
    desc: "保留表达 · 等待停顿后的续句",
    icon: Mic,
    color: "sage",
  },
  {
    id: "location",
    number: "03",
    name: "位置异常",
    desc: "可信位置 · 协同寻找与核实",
    icon: MapPin,
    color: "blue",
  },
];

function useCare() {
  const [state, setState] = useState(null),
    ref = useRef(null);
  const [config, setConfig] = useState(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const apply = useCallback((next) => {
    if (!next?.runId) return;
    const prev = ref.current;
    if (prev && prev.runId === next.runId && prev.revision > next.revision)
      return;
    if (prev && (prev.generation || 0) > (next.generation || 0)) return;
    if (
      prev &&
      prev.runId !== next.runId &&
      Date.parse(prev.createdAt) > Date.parse(next.createdAt)
    )
      return;
    const observed = {
      ...next,
      serverDelta: Date.parse(next.now) - Date.now(),
    };
    ref.current = observed;
    setState(observed);
  }, []);
  const refreshConfig = useCallback(async () => {
    try {
      const r = await fetch("/api/config");
      if (r.ok) setConfig(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    let disposed = false;
    fetch("/api/state")
      .then((r) => {
        if (r.status === 401) setLoginRequired(true);
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((s) => {
        if (!disposed) apply(s);
      })
      .catch(() => {
        if (!disposed) setError("连接暂不可用，请确认本地服务正在运行。");
      });
    refreshConfig();
    const source = new EventSource("/api/stream");
    source.addEventListener("state", (e) => {
      apply(JSON.parse(e.data));
      setConnected(true);
      setError("");
    });
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => {
      disposed = true;
      source.close();
    };
  }, [apply, refreshConfig]);
  const request = async (path, data = {}) => {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: ref.current.runId, ...data }),
    });
    const result = await r.json();
    if (!r.ok) {
      const fresh = await fetch("/api/state");
      if (fresh.ok) apply(await fresh.json());
      throw new Error(result.error || "操作未完成，请重试。");
    }
    apply(result.state || result);
    return result;
  };
  return {
    state,
    config,
    connected,
    error,
    request,
    refreshConfig,
    loginRequired,
  };
}

export default function App() {
  const {
    state,
    config,
    connected,
    error,
    request,
    refreshConfig,
    loginRequired,
  } = useCare();
  const [dailySection, setDailySection] = useState("records");
  const notificationSeen = useRef({ runId: null, ids: [] });
  const [view, setViewState] = useState(
    () => new URLSearchParams(location.search).get("view") || "mobile",
  );
  const [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [busy, setBusy] = useState(false),
    [summaryBusy, setSummaryBusy] = useState(false),
    [mapStatus, setMapStatus] = useState("unverified");
  const [selectedId, setSelectedId] = useState(null),
    [wallNow, setWallNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setWallNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const pop = () =>
      setViewState(
        new URLSearchParams(location.search).get("view") || "mobile",
      );
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    document.title = `有伴 · ${PAGE_NAMES[view] || "照护空间"}`;
  }, [view]);
  const setView = (id) => {
    setViewState(id);
    setDrawer(false);
    const url = new URL(location.href);
    url.searchParams.set("view", id);
    history.pushState({}, "", url);
    window.scrollTo(0, 0);
  };
  const notify = (message, tone = "success") => setToast({ message, tone });
  useEffect(() => {
    if (!state?.daily) return;
    const notifications = state.daily.notifications;
    if (notificationSeen.current.runId === state.runId && view !== "elder") {
      const fresh = notifications.filter(
        (n) => !notificationSeen.current.ids.includes(n.id),
      );
      if (fresh.length) {
        const n = fresh.at(-1);
        setToast({
          message: `${PRIORITIES[n.priority].label}：${n.title}。已加入家属提醒队列。`,
          tone: "attention",
        });
      }
    }
    notificationSeen.current = {
      runId: state.runId,
      ids: notifications.map((n) => n.id),
    };
  }, [state?.daily?.notifications, state?.runId, view]);
  const perform = async (path, data, message) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await request(path, data);
      if (message) notify(message);
      return result;
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const event =
    state?.events.find((e) => e.id === (selectedId || state.activeId)) ||
    state?.events[0] ||
    null;
  const active = state?.events.find((e) => e.id === state.activeId) || null;
  const now = state?.pausedAt ?? Date.now() + (state?.serverDelta || 0);
  const priorityCount = state
    ? familyRisks(state).filter((r) => r.priority !== "observe").length
    : 0;
  const routineSuspended = Boolean(
    state && familyRisks(state).some((r) => r.priority === "urgent"),
  );
  const reminderVoice = useReminderVoice({
    state,
    recipient: view === "elder" ? "patient" : "family",
    now,
    request,
    suspended:
      routineSuspended || ["mobile", "elder", "family-phone"].includes(view),
  });
  const action = (type, payload = {}, target = event) =>
    target &&
    perform("/api/events/action", {
      eventId: target.id,
      version: target.version,
      action: type,
      payload,
    });
  const start = async (scenario) => {
    const result = await perform("/api/demo/start", {
      scenario,
      sourceEventId: clientId(),
    });
    if (result) {
      setSelectedId(null);
      setModal(null);
      if (scenario === "speech")
        setView(view === "elder" ? "elder" : "elder-preview");
      else {
        setView("dashboard");
        setTimeout(
          () =>
            document
              .getElementById("care-workspace")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          150,
        );
      }
    }
  };
  const summarize = async () => {
    if (!event || summaryBusy) return;
    setSummaryBusy(true);
    try {
      await request("/api/agent/summary", { eventId: event.id });
      await refreshConfig();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setSummaryBusy(false);
    }
  };
  const reset = async () => {
    const result = await perform("/api/demo/reset", {}, "已创建新的演示场次。");
    if (result) {
      setSelectedId(null);
      setModal(null);
    }
  };
  const help = () => perform("/api/help", {}, "已收到求助，正在联络家人。");
  const toastElement = toast && (
    <div className={`toast ${toast.tone}`} role="status">
      {toast.tone === "error" ? (
        <CircleHelp size={18} />
      ) : toast.tone === "attention" ? (
        <Bell size={18} />
      ) : (
        <CheckCheck size={18} />
      )}
      <span>{toast.message}</span>
      <button onClick={() => setToast(null)} aria-label="关闭提示">
        <X size={16} />
      </button>
    </div>
  );
  if (loginRequired && !state) return <FamilyLogin />;
  if (!state)
    return (
      <div className="loading-page">
        <Logo />
        <LoaderCircle className="spin" size={28} />
        <p>{error || "正在连接照护工作台…"}</p>
        {error && (
          <button className="button primary" onClick={() => location.reload()}>
            重新连接
          </button>
        )}
      </div>
    );
  if (["mobile", "elder", "family-phone"].includes(view))
    return (
      <>
        <MobileExperience
          key={state.runId}
          state={state}
          connected={connected}
          busy={busy}
          perform={perform}
          notify={notify}
          initialRole={view === "elder" ? "patient" : "family"}
        />
        {toastElement}
      </>
    );
  if (view === "elder")
    return (
      <>
        <Elder
          state={state}
          event={active}
          now={now}
          busy={busy}
          connected={connected}
          action={action}
          help={help}
          goBack={() => setView("dashboard")}
          start={start}
          notify={notify}
          saveDaily={(data) => perform("/api/daily/record", data)}
          reminderVoice={reminderVoice}
          reminderPerform={perform}
          routineSuspended={routineSuspended}
          reportPlayback={(data) =>
            request("/api/events/playback", data).catch(() => {})
          }
        />
        {toastElement}
      </>
    );
  return (
    <div className="app-shell">
      {drawer && (
        <div className="sidebar-scrim" onClick={() => setDrawer(false)} />
      )}
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <a
          href="?view=dashboard"
          className="brand-link"
          onClick={(e) => {
            e.preventDefault();
            setView("dashboard");
          }}
        >
          <Logo />
        </a>
        <div className="workspace-label">
          家庭照护空间 <Badge>演示</Badge>
        </div>
        <div className="sidebar-profile">
          <Portrait size={42} />
          <div>
            <strong>周伯的照护空间</strong>
            <small>家人、社区，一起照护</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-caption">日常照护</p>
        <nav aria-label="主导航">
          {NAV.map(({ id, text, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`nav-item ${primaryView(view) === id ? "active" : ""}`}
              aria-current={primaryView(view) === id ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{text}</span>
              {id === "dashboard" &&
                state.events.some((e) => e.status !== "closed") && (
                  <span className="nav-count">
                    {state.events.filter((e) => e.status !== "closed").length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-secondary-link"
            onClick={() => setView("plans")}
          >
            <Sparkles size={14} />
            计划 Agent
          </button>
          <button
            className="sidebar-secondary-link"
            onClick={() => setView("architecture")}
          >
            <Layers3 size={14} />
            技术与接入状态
          </button>
          <div className="care-note">
            <span className="tiny-flower">✳</span>
            <p>
              多一份理解，
              <br />
              少一份牵挂。
            </p>
            <small>从听见需要，到持续跟进。</small>
          </div>
          <button
            onClick={() => setView("demo")}
            className={`nav-item ${view === "demo" ? "active" : ""}`}
          >
            <SlidersHorizontal size={18} />
            <span>演示控制台</span>
            <ChevronRight size={14} />
          </button>
          <div className="sidebar-user">
            <Portrait size={34} variant="family" />
            <div>
              <strong>周宁</strong>
              <small>家人 · 模拟身份</small>
            </div>
            <span className="user-online" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <span>我的照护空间</span>
            <ChevronRight size={13} />
            <strong>{PAGE_NAMES[view] || "照护空间"}</strong>
          </div>
          <div className="topbar-right">
            <VoiceReminderToggle voice={reminderVoice} small />
            <span className={`connection ${connected ? "" : "offline"}`}>
              <i />
              {connected ? "多端已同步" : "正在重新连接"}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="查看演示指南"
              onClick={() => setModal("guide")}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button notification-icon"
              aria-label="查看事件通知"
              onClick={() => {
                setDailySection("risks");
                setView("daily");
              }}
            >
              <Bell size={19} />
              {priorityCount > 0 && <i />}
            </button>
            <Portrait size={32} variant="family" />
          </div>
        </header>
        {!connected && (
          <div className="connection-banner">
            <WifiOff size={15} />
            连接已中断，当前显示最后收到的状态；连接恢复后自动同步。
          </div>
        )}
        <main className="main-content">
          <ReminderInbox
            state={state}
            recipient="family"
            now={now}
            busy={busy}
            perform={perform}
            voice={reminderVoice}
            suspended={routineSuspended}
            onPlans={() => setView("plans")}
            onRecord={() => {
              setDailySection("records");
              setView("daily");
            }}
          />
          {view === "plans" && (
            <ReminderAgentPage
              state={state}
              config={config}
              now={now}
              busy={busy}
              perform={perform}
              request={request}
              refreshConfig={refreshConfig}
              notify={notify}
              voice={reminderVoice}
            />
          )}
          {view === "dashboard" && (
            <MonitorPage
              state={state}
              now={now}
              config={config}
              busy={busy}
              perform={perform}
              onView={setView}
              onEvent={(id) => {
                setSelectedId(id);
                setView("events");
              }}
            >
              <Workspace
                event={active}
                state={state}
                config={config}
                now={now}
                busy={busy}
                action={action}
                onMapStatus={setMapStatus}
                onSummary={() => {
                  setSelectedId(active?.id);
                  setModal("summary");
                }}
                onClose={() => {
                  setSelectedId(active?.id);
                  setModal("close");
                }}
                onTimeline={() => {
                  setSelectedId(active?.id);
                  setView("events");
                }}
                onStart={() => setModal("scenarios")}
                openElder={() =>
                  window.open(
                    `${location.origin}/?view=elder`,
                    "_blank",
                    "noopener",
                  )
                }
              />
            </MonitorPage>
          )}
          {view === "map" && (
            <MapPage
              state={state}
              now={now}
              busy={busy}
              perform={perform}
              onView={setView}
              onEvent={(id) => {
                setSelectedId(id);
                setView("events");
              }}
            />
          )}
          {view === "reports" && (
            <ReportsPage
              state={state}
              now={now}
              config={config}
              busy={busy}
              perform={perform}
              request={request}
              notify={notify}
              onView={setView}
              onEvent={(id) => {
                setSelectedId(id);
                setView("events");
              }}
              refreshConfig={refreshConfig}
            />
          )}
          {view === "my" && (
            <MyPage
              state={state}
              now={now}
              config={config}
              busy={busy}
              perform={perform}
              onView={setView}
            />
          )}
          {view === "family-phone" && <FamilyPhonePreview />}
          {view === "legacy-dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">CARE, WITH UNDERSTANDING</p>
                  <h1>
                    每一份需要，都有人回应
                    <span className="heading-dot">。</span>
                  </h1>
                  <p>把周伯的日常放在心上，把需要关注的事落到行动。</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("scenarios")}
                >
                  <Play size={15} fill="currentColor" /> 开始情境演示
                </button>
              </div>
              <div className="overview-grid">
                <section className="person-card">
                  <div className="person-main">
                    <Portrait size={76} />
                    <div>
                      <div className="person-name">
                        <h2>周伯</h2>
                        <Badge>虚构档案</Badge>
                      </div>
                      <p>
                        76 岁 <span>·</span> 青禾社区 <span>·</span> 居家照护
                      </p>
                      <div className="profile-note">
                        <MessageCircle size={13} /> 请说慢一些，给我一点时间。
                      </div>
                    </div>
                  </div>
                  <div className="person-card-bottom">
                    <span>
                      <House size={14} /> 常用区域：家与社区
                    </span>
                    <button onClick={() => setView("settings")}>
                      查看档案 <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <div className="person-decoration" aria-hidden="true">
                    <Heart />
                    <Heart />
                  </div>
                </section>
                <section
                  className={`overview-status ${active && active.status !== "closed" ? "attention" : ""}`}
                >
                  <div className="status-top">
                    <span className="status-icon">
                      {active && active.status !== "closed" ? (
                        <Activity size={19} />
                      ) : (
                        <ShieldCheck size={21} />
                      )}
                    </span>
                    <span>当前照护状态</span>
                    <Badge
                      tone={
                        active && active.status !== "closed" ? "amber" : "green"
                      }
                      dot
                    >
                      {active && active.status !== "closed"
                        ? STATUS[active.status]
                        : "暂无待办"}
                    </Badge>
                  </div>
                  <h3>
                    {active && active.status !== "closed"
                      ? active.assignee
                        ? `${active.assignee}正在跟进`
                        : "有一件事，需要关注"
                      : "当前没有待处理事件"}
                  </h3>
                  <p>
                    {active && active.status !== "closed"
                      ? `${active.title} · ${active.place}`
                      : "持续关注设备与事件状态，照护始终有人协同。"}
                  </p>
                  <div className="status-bottom">
                    <span>
                      <Users size={14} /> 2 位预设联系人
                    </span>
                    <small>演示环境</small>
                  </div>
                </section>
                <section className="devices-card">
                  <div className="section-heading">
                    <h3>感知设备</h3>
                    <Badge>模拟</Badge>
                  </div>
                  {[
                    {
                      icon: Monitor,
                      title: "客厅感知终端",
                      sub: "姿态 · 音频",
                      ok: !state.faults.microphone,
                    },
                    {
                      icon: Activity,
                      title: "随身照护设备",
                      sub: "IMU · 位置",
                      ok: true,
                    },
                  ].map(({ icon: Icon, title, sub, ok }) => (
                    <div className="device-row" key={title}>
                      <span className="device-icon">
                        <Icon size={20} />
                      </span>
                      <div>
                        <strong>{title}</strong>
                        <small>{sub}</small>
                      </div>
                      <span className={`device-status ${ok ? "" : "warning"}`}>
                        <i />
                        {ok ? "模拟在线" : "模拟故障"}
                      </span>
                    </div>
                  ))}
                  <button
                    className="subtle-link"
                    onClick={() => setView("settings")}
                  >
                    查看接入状态 <ArrowRight size={13} />
                  </button>
                </section>
              </div>
              <DailyOverview
                state={state}
                now={now}
                onOpen={() => {
                  setDailySection("records");
                  setView("daily");
                }}
              />
              <section className="scenario-section">
                <div className="section-heading">
                  <div className="inline-heading">
                    <h2>三个场景，一条照护闭环</h2>
                    <span>选择一个情境，亲手走过每一步</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("demo")}
                  >
                    演示控制台 <ArrowUpRight size={14} />
                  </button>
                </div>
                <SceneCards onStart={start} busy={busy} />
              </section>
              <Workspace
                event={active}
                state={state}
                config={config}
                now={now}
                busy={busy}
                action={action}
                onMapStatus={setMapStatus}
                onSummary={() => {
                  setSelectedId(active?.id);
                  setModal("summary");
                }}
                onClose={() => {
                  setSelectedId(active?.id);
                  setModal("close");
                }}
                onTimeline={() => {
                  setSelectedId(active?.id);
                  setView("events");
                }}
                onStart={() => setModal("scenarios")}
                openElder={() =>
                  window.open(
                    `${location.origin}/?view=elder`,
                    "_blank",
                    "noopener",
                  )
                }
              />
              <div className="bottom-strip">
                <div>
                  <Layers3 size={19} />
                  <p>
                    <strong>百度 AI 全栈，让技术落到每一次照护</strong>
                    <span>
                      芯片与算力 → 框架与算法 → 模型与编排 → 应用与服务
                    </span>
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setView("architecture")}
                >
                  查看技术链路 <ArrowUpRight size={15} />
                </button>
              </div>
            </>
          )}
          {view === "daily" && (
            <DailyFamilyPage
              state={state}
              now={now}
              busy={busy}
              perform={perform}
              section={dailySection}
              setSection={setDailySection}
              onEvent={(id) => {
                setSelectedId(id);
                setView("events");
              }}
            />
          )}
          {view === "events" && (
            <EventsPage
              state={state}
              event={event}
              setSelectedId={setSelectedId}
              config={config}
              now={now}
              busy={busy}
              action={action}
              setModal={setModal}
              onMapStatus={setMapStatus}
            />
          )}
          {view === "elder-preview" && (
            <DevicePreview event={active} onBack={() => setView("dashboard")} />
          )}
          {view === "architecture" && (
            <Architecture
              config={config}
              mapStatus={mapStatus}
              setModal={setModal}
            />
          )}
          {view === "settings" && (
            <Settings
              state={state}
              config={config}
              refreshConfig={refreshConfig}
              notify={notify}
            />
          )}
          {view === "demo" && (
            <Demo
              state={state}
              event={active}
              config={config}
              busy={busy}
              start={start}
              perform={perform}
              action={action}
              setModal={setModal}
              now={now}
            />
          )}
          <footer className="app-footer">
            <span>
              <Heart size={12} /> 有伴 · 从理解开始，让照护持续
            </span>
            <span>
              比赛演示 · 虚构人物与情境 <i /> RUN {state.runId.slice(0, 8)}
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-primary-tabs" aria-label="四个主页面">
        {NAV.map(({ id, text, icon: Icon }) => (
          <button
            key={id}
            className={primaryView(view) === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            <Icon size={20} />
            {text}
          </button>
        ))}
      </nav>
      {modal === "scenarios" && (
        <Modal
          title="从一个照护情境开始"
          subtitle="输入来自模拟情境，后续状态由你的操作与事件规则共同推进。"
          wide
          onClose={() => setModal(null)}
        >
          <SceneCards onStart={start} busy={busy} />
          <div className="info-note">
            <CircleHelp size={16} />{" "}
            如果已有待处理事件，请先结案，或前往演示控制台复位。
          </div>
        </Modal>
      )}
      {modal === "summary" && event && (
        <Summary
          event={event}
          config={config}
          busy={summaryBusy}
          onGenerate={summarize}
          onClose={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal === "close" && event && (
        <CloseDialog
          event={event}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const result = await action("close", payload);
            if (result) {
              setModal(null);
              notify("处理结果已记录，事件已结案。");
            }
          }}
        />
      )}
      {modal === "reset" && (
        <Modal
          title="开始一轮新的演示"
          subtitle="当前场次的事件、日常记录、提醒计划、聊天、计时与模拟回执会清空。旧场次消息会被忽略。"
          onClose={() => setModal(null)}
        >
          <div className="info-note">
            需要保留本轮记录时，请先导出。新的场次将从正常状态开始。
          </div>
          <div className="modal-actions">
            <a className="button secondary" href="/api/export" download>
              <ArrowDownToLine size={15} />
              导出本轮记录
            </a>
            <button className="button primary" disabled={busy} onClick={reset}>
              <RotateCcw size={15} />
              复位演示
            </button>
          </div>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal
          title="用三分钟，讲清一次照护"
          subtitle="建议先演示疑似跌倒，再展示慢表达与位置异常。"
          onClose={() => setModal(null)}
        >
          <ol className="guide-list">
            <li>
              <strong>发现与确认</strong>
              <p>启动疑似跌倒，查看模拟证据；打开老人端，体验单问题确认。</p>
            </li>
            <li>
              <strong>升级与接手</strong>
              <p>选择需要帮助，或在控制台推进演示时钟；家人点击“我来接手”。</p>
            </li>
            <li>
              <strong>跟进与结果</strong>
              <p>更新处理进展，查看交接卡，记录核实结果后结案。</p>
            </li>
            <li>
              <strong>展示技术依据</strong>
              <p>
                打开百度 AI
                全栈页，说明每层任务和实际接入状态。导出记录可查看规则与真实调用日志。
              </p>
            </li>
          </ol>
          <div className="info-note">
            当前为比赛演示，通知与机构接单均为模拟。确认 45 秒、接手 30 秒、进展
            60 秒仅为演示参数。
          </div>
        </Modal>
      )}
      {modal === "reference-stack" && (
        <Modal title="百度 AI 全栈方案原图" wide onClose={() => setModal(null)}>
          <img
            className="reference-image"
            src="/references/baidu-ai-stack.png"
            alt="用户提供的有伴百度AI全栈规划架构图"
          />
        </Modal>
      )}
      {modal === "reference-flow" && (
        <Modal title="异常事件照护流程原图" wide onClose={() => setModal(null)}>
          <img
            className="reference-image"
            src="/references/care-workflow.png"
            alt="用户提供的异常事件进入照护流程规划图"
          />
        </Modal>
      )}
      {toastElement}
    </div>
  );
}

function SceneCards({ onStart, busy }) {
  return (
    <div className="scene-cards">
      {SCENES.map(({ id, number, name, desc, icon: Icon, color }) => (
        <button
          className={`scene-card ${color}`}
          disabled={busy}
          onClick={() => onStart(id)}
          key={id}
        >
          <span className="scene-icon">
            <Icon size={23} strokeWidth={1.5} />
          </span>
          <div>
            <span className="scene-kicker">SCENARIO {number}</span>
            <h3>{name}</h3>
            <p>{desc}</p>
          </div>
          <span className="scene-arrow">
            <ArrowUpRight size={17} />
          </span>
        </button>
      ))}
    </div>
  );
}

function Workspace({
  event,
  state,
  config,
  now,
  busy,
  action,
  onMapStatus,
  onSummary,
  onClose,
  onTimeline,
  onStart,
  openElder,
}) {
  return (
    <section className="care-workspace" id="care-workspace">
      <div className="section-heading workspace-heading">
        <div className="inline-heading">
          <span className="live-square" />
          <h2>照护协同</h2>
          <span>
            {event
              ? `${event.number} · ${date(event.createdAt)} ${time(event.createdAt)}`
              : "让每一步处理都有迹可循"}
          </span>
        </div>
        {event ? (
          <Badge tone={event.status === "closed" ? "green" : "amber"} dot>
            {STATUS[event.status]}
          </Badge>
        ) : (
          <Badge>等待情境</Badge>
        )}
      </div>
      <FlowSteps event={event} />
      <div className="workspace-columns">
        <section className="workspace-column location-column">
          <div className="column-title">
            <MapPin size={16} />
            <h3>位置与感知</h3>
            <Badge>模拟</Badge>
          </div>
          <MapView config={config} event={event} onMapStatus={onMapStatus} />
          <div className="location-info">
            <strong>
              <MapPin size={14} />
              {event ? event.place : "家中 · 客厅"}
            </strong>
            <p>{event ? event.locationSource : "预设设备安装区域"}</p>
            <small>
              {event
                ? `${event.location.known === false ? "报告于" : "采集于"} ${time(event.location.capturedAt)} · ${Math.max(0, Math.floor((now - Date.parse(event.location.capturedAt)) / 60000)) >= 2 ? "最后已知位置" : "模拟采集时间"}`
                : "具体房间来自配置，非地图定位结果"}
            </small>
          </div>
          {event && <Evidence event={event} />}
        </section>
        <section className="workspace-column confirmation-column">
          <div className="column-title">
            <MessageCircle size={16} />
            <h3>当前事件与确认</h3>
          </div>
          {event ? (
            <>
              <div
                className={`event-title-block ${event.status === "closed" ? "resolved" : ""}`}
              >
                <span className="event-symbol">
                  {event.status === "closed" ? (
                    <ShieldCheck size={23} />
                  ) : event.type === "location" ? (
                    <MapPin size={23} />
                  ) : (
                    <Activity size={23} />
                  )}
                </span>
                <div>
                  <h3>
                    {event.status === "closed"
                      ? CLOSE[event.closeReason]
                      : event.type === "help"
                        ? "周伯希望联系家人"
                        : `周伯出现${event.title}`}
                  </h3>
                  <p>
                    {event.status === "closed"
                      ? event.closeNote
                      : event.description}
                  </p>
                </div>
              </div>
              {event.status !== "closed" && (
                <div className="confirmation-box">
                  <div className="confirm-question">
                    <Volume2 size={15} />
                    <span>{event.confirmation.prompt}</span>
                  </div>
                  <Waveform
                    active={["confirming", "review_required"].includes(
                      event.status,
                    )}
                  />
                  <strong className="response-label">
                    {RESPONSE[event.confirmation.responseStatus]}
                  </strong>
                  <div className="channel-states">
                    <span>{PROMPT[event.confirmation.promptStatus]}</span>
                    <span
                      className={
                        event.confirmation.captureStatus === "failed"
                          ? "text-amber"
                          : ""
                      }
                    >
                      {CAPTURE[event.confirmation.captureStatus]}
                    </span>
                  </div>
                  <small>
                    播放与收音回执：
                    {["browser_tts", "server_tts"].includes(
                      event.confirmation.promptSource,
                    )
                      ? "浏览器播放／模拟收音"
                      : "模拟终端"}
                  </small>
                  {["confirming", "review_required"].includes(event.status) && (
                    <Countdown deadline={event.confirmDeadline} now={now} />
                  )}
                </div>
              )}
              <div className="event-context">
                <ShieldCheck size={14} />
                <p>
                  {event.status === "closed"
                    ? event.closeReason === "care_transferred"
                      ? `责任已移交给${event.transferReceiver}，不等同于确认安全。`
                      : "结案依据来自家人手动核实记录。"
                    : event.assignee
                      ? "已接手后持续检查进展，接手不会自动结案。"
                      : event.confirmation.responseStatus === "no_help_claimed"
                        ? "已记录“暂不需要帮助”，仍需人工核实；原截止时间不变。"
                        : "规则引擎持续跟进，Agent 不可用时联络仍会继续。"}
                </p>
              </div>
              <button
                className="button secondary full"
                onClick={event.status === "closed" ? onSummary : openElder}
              >
                {event.status === "closed" ? (
                  <FileText size={15} />
                ) : (
                  <Smartphone size={15} />
                )}
                {event.status === "closed"
                  ? "查看完整交接卡"
                  : "打开老人端进行确认"}
                <ArrowUpRight size={14} />
              </button>
            </>
          ) : (
            <div className="workspace-empty">
              <span className="empty-orbit">
                <Heart size={29} strokeWidth={1.4} />
              </span>
              <h3>每一次需要，都值得被听见</h3>
              <p>
                选择一个演示情境，
                <br />
                看看有伴如何把异常信号变成照护行动。
              </p>
              <button className="button secondary" onClick={onStart}>
                <Play size={13} />
                选择演示情境
              </button>
            </div>
          )}
        </section>
        <section className="workspace-column contacts-column">
          <div className="column-title">
            <Users size={16} />
            <h3>联络与接手</h3>
          </div>
          {event ? (
            <ContactPanel
              event={event}
              now={now}
              busy={busy}
              action={action}
              onClose={onClose}
              onSummary={onSummary}
            />
          ) : (
            <>
              <div className="preset-contact">
                <Portrait size={39} variant="family" />
                <div>
                  <strong>
                    周宁 <span>女儿</span>
                  </strong>
                  <small>第一联系人</small>
                </div>
                <Badge>待联络</Badge>
              </div>
              <div className="preset-contact">
                <Portrait size={39} variant="backup" />
                <div>
                  <strong>社区照护员</strong>
                  <small>备用联系人</small>
                </div>
                <Badge>待联络</Badge>
              </div>
              <div className="waiting-contact">
                <Radio size={20} />
                <p>
                  有需要时，按规则联络。
                  <br />
                  每次送达、接手和进展分别记录。
                </p>
              </div>
              <div className="contact-footnote">
                <ShieldCheck size={13} />
                联络与医疗协助使用模拟通道
              </div>
            </>
          )}
        </section>
      </div>
      <div className="workspace-footer">
        <span>
          <Clock3 size={14} />
          {event
            ? `已记录 ${event.timeline.length} 条事件动态`
            : "等待第一条照护记录"}
        </span>
        <button className="text-button" disabled={!event} onClick={onTimeline}>
          完整时间轴 <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}

function ContactPanel({ event, now, busy, action, onClose, onSummary }) {
  return (
    <>
      {event.contacts.length === 0 ? (
        <>
          <div className="preset-contact">
            <Portrait size={40} variant="family" />
            <div>
              <strong>
                周宁 <span>女儿</span>
              </strong>
              <small>第一联系人 · 等待确认结果</small>
            </div>
          </div>
          <p className="contact-description">
            需要帮助或确认超时后，系统将创建联络任务。也可以主动接手核实。
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => action("review_claim", {}, event)}
          >
            <UserRound size={15} />
            我来核实
          </button>
        </>
      ) : (
        <div className="contact-list">
          {event.contacts.map((c) => (
            <div
              className={`contact-item ${c.handlingStatus === "accepted" ? "accepted" : ""}`}
              key={c.id}
            >
              <div className="contact-person">
                <Portrait size={37} variant={c.role} />
                <div>
                  <strong>
                    {c.name}
                    {c.role === "family" && <span>女儿</span>}
                  </strong>
                  <small>
                    {c.role === "medical"
                      ? "模拟医疗协助"
                      : c.role === "backup"
                        ? "备用联系人"
                        : "第一联系人"}
                  </small>
                </div>
                {c.handlingStatus === "accepted" ? (
                  <Badge tone="green">已接手</Badge>
                ) : c.handlingStatus === "completed" ? (
                  <Badge>已记录结果</Badge>
                ) : null}
              </div>
              <div className="delivery-line">
                <span
                  className={c.deliveryStatus === "unknown" ? "text-amber" : ""}
                >
                  {c.deliveryStatus === "delivered" ? (
                    <CheckCheck size={13} />
                  ) : (
                    <Clock3 size={12} />
                  )}
                  {DELIVERY[c.deliveryStatus]}
                  <small>模拟</small>
                </span>
                {c.handlingStatus === "unclaimed" &&
                  event.status !== "closed" &&
                  !c.informOnly &&
                  (c.role === "medical" || !event.assignee) && (
                    <button
                      disabled={busy}
                      className="claim-link"
                      onClick={() => action("claim", { taskId: c.id }, event)}
                    >
                      {c.informOnly
                        ? "三级成员 · 仅通报"
                        : c.role === "medical"
                          ? "模拟接单"
                          : c.role === "family"
                            ? "我来接手"
                            : "模拟接手"}
                      <ArrowRight size={12} />
                    </button>
                  )}
              </div>
              {c.deliveryStatus === "unknown" && event.status !== "closed" && (
                <button
                  className="text-button small"
                  disabled={busy}
                  onClick={() =>
                    action("resolve_receipt", { taskId: c.id }, event)
                  }
                >
                  核查模拟回执
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {event.status === "escalated" &&
        !event.contacts.some((c) => c.role === "backup") && (
          <Countdown
            deadline={event.claimDeadline}
            now={now}
            label="备用联络"
          />
        )}
      {event.status === "handling" && (
        <div className="progress-panel">
          <div>
            <strong>继续跟进</strong>
            <span>
              {event.progress.length
                ? event.progress.at(-1).text
                : "等待首次进展"}
            </span>
          </div>
          {event.reminderCount > 0 && (
            <p className="progress-reminder">
              进展检查已提醒 {event.reminderCount} 次，请更新实际进展。
            </p>
          )}
          <label className="sr-only" htmlFor={`progress-${event.id}`}>
            选择处理进展
          </label>
          <select
            id={`progress-${event.id}`}
            value=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value)
                action("progress", { text: e.target.value }, event);
            }}
          >
            <option value="" disabled>
              更新处理进展…
            </option>
            {[
              "正在联系老人",
              "已取得联系",
              "已到达现场",
              "已找到老人",
              "已联系医疗协助",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <button
            className="button primary full"
            disabled={busy}
            onClick={onClose}
          >
            <CheckCheck size={15} />
            记录处理结果
          </button>
        </div>
      )}
      <button className="summary-link" onClick={onSummary}>
        <FileText size={15} />
        查看照护交接卡
        <ChevronRight size={15} />
      </button>
      <div className="contact-footnote">
        通知与机构接单均为模拟；接手不等于结案。
      </div>
    </>
  );
}

function EventsPage({
  state,
  event,
  setSelectedId,
  config,
  now,
  busy,
  action,
  setModal,
  onMapStatus,
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERY STEP, ACCOUNTED FOR</p>
          <h1>事件与跟进</h1>
          <p>从第一条信号，到最后一次回应。</p>
        </div>
        <a href="/api/export" className="button secondary" download>
          <ArrowDownToLine size={16} />
          导出本轮记录
        </a>
      </div>
      {!state.events.length ? (
        <section className="panel large-empty">
          <ListChecks size={40} strokeWidth={1.2} />
          <h2>还没有照护事件</h2>
          <p>开始情境演示后，事件的确认、联络与处理过程会保存在这里。</p>
          <button
            className="button primary"
            onClick={() => setModal("scenarios")}
          >
            开始情境演示 <ArrowRight size={15} />
          </button>
        </section>
      ) : (
        <>
          <div className="event-tabs" role="tablist" aria-label="本轮事件">
            {state.events.map((e) => (
              <button
                role="tab"
                aria-selected={event?.id === e.id}
                className={event?.id === e.id ? "active" : ""}
                key={e.id}
                onClick={() => setSelectedId(e.id)}
              >
                <span>{e.number}</span>
                <strong>{e.title}</strong>
                <Badge tone={e.status === "closed" ? "green" : "amber"}>
                  {STATUS[e.status]}
                </Badge>
              </button>
            ))}
          </div>
          <Workspace
            event={event}
            state={state}
            config={config}
            now={now}
            busy={busy}
            action={action}
            onMapStatus={onMapStatus}
            onSummary={() => setModal("summary")}
            onClose={() => setModal("close")}
            onTimeline={() =>
              document
                .getElementById("full-timeline")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            openElder={() =>
              window.open(
                `${location.origin}/?view=elder`,
                "_blank",
                "noopener",
              )
            }
          />
          <div className="records-grid">
            <section className="panel" id="full-timeline">
              <div className="section-heading">
                <h2>完整事件时间轴</h2>
                <Badge>{event.timeline.length} 条记录</Badge>
              </div>
              <EventTimeline event={event} />
            </section>
            <section className="panel agent-records">
              <div className="section-heading">
                <h2>Agent 与工具记录</h2>
                <Sparkles size={17} />
              </div>
              <p className="section-description">
                记录实际调用与结果。规则任务、模板生成、千帆调用分别标注。
              </p>
              {event.agentLogs.map((log) => (
                <div className="agent-log" key={log.id}>
                  <div>
                    <code>{log.tool}</code>
                    <Badge
                      tone={
                        log.status === "failed" || log.status === "rejected"
                          ? "amber"
                          : "neutral"
                      }
                    >
                      {log.status === "completed"
                        ? "已完成"
                        : log.status === "running"
                          ? "已发起"
                          : log.status === "rejected"
                            ? "已拒绝"
                            : "未成功"}
                    </Badge>
                  </div>
                  <p>{log.result}</p>
                  <small>
                    {time(log.at)} ·{" "}
                    {log.origin === "rule"
                      ? "规则引擎"
                      : log.origin === "template"
                        ? "本地模板"
                        : log.origin === "fault_injection"
                          ? "故障注入"
                          : "百度千帆"}
                  </small>
                </div>
              ))}
              <div className="rule-record">
                <p className="eyebrow">RULE ENGINE</p>
                <strong>
                  {event.rule} <Badge>{event.ruleVersion}</Badge>
                </strong>
                <p>
                  确认截止：{time(event.confirmDeadline)}
                  <br />
                  输入采集：{time(event.capturedAt)}
                  <br />
                  服务接收：{time(event.receivedAt)}
                </p>
                <small>UTC 存储 · 当前界面以浏览器当地时间展示</small>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Summary({ event, config, busy, onGenerate, onClose, notify }) {
  const summary = event.summary;
  const download = () => {
    const content = `# 有伴照护交接卡\n\n场次：${event.runId}\n事件：${event.number} ${event.title}\n对象：周伯（虚构档案）\n状态：${STATUS[event.status]}\n位置：${event.place}\n位置来源：${event.locationSource}\n采集时间：${event.location.capturedAt}\n确认：${RESPONSE[event.confirmation.responseStatus]}\n责任人：${event.assignee || "尚未接手"}\n\n## 已知证据\n${event.evidence.map((e) => `- ${e.title}：${e.value}（${e.sourceMode === "simulated" ? "模拟" : "手动记录／规则"}）`).join("\n")}\n\n## 联络与接手\n${event.contacts.map((c) => `- ${c.name}：${DELIVERY[c.deliveryStatus]}；${c.handlingStatus}；回执：${c.receipt || "暂无"}（模拟）`).join("\n")}\n\n## 进展\n${event.progress.map((p) => `- ${p.at} ${p.text}（${p.source}）`).join("\n")}\n\n## 处理结果\n${event.closeReason ? CLOSE[event.closeReason] + "：" + event.closeNote : `尚未结案；${eventUnknowns(event).join("；")}`}\n\n## 辅助摘要\n${summary ? `[${summary.provider}${summary.stale ? "；事件更新后未重新生成" : ""}]\n${summary.text}` : "尚未生成"}\n\n本记录为比赛情境演示。通知与机构接单为模拟。`;
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `有伴-${event.number}-交接卡.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("交接卡已导出。");
  };
  return (
    <Modal
      title="把已知的事，清楚交接"
      subtitle={`${event.number} · ${event.title} · 周伯（虚构档案）`}
      wide
      onClose={onClose}
    >
      <div className="handoff-layout">
        <div className="handoff-facts">
          <div className="handoff-status">
            <Badge tone={event.status === "closed" ? "green" : "amber"}>
              {STATUS[event.status]}
            </Badge>
            <span>{event.assignee || "尚无责任人接手"}</span>
          </div>
          <dl>
            <dt>最后记录位置</dt>
            <dd>
              {event.place}
              <small>
                {event.locationSource} · {time(event.location.capturedAt)}
              </small>
            </dd>
            <dt>老人回应</dt>
            <dd>{RESPONSE[event.confirmation.responseStatus]}</dd>
            <dt>已知事实</dt>
            <dd>
              <ul>
                {event.evidence.map((e) => (
                  <li key={e.title}>
                    {e.title}：{e.value}
                    <small>
                      {e.sourceMode === "simulated"
                        ? "模拟证据"
                        : "手动记录／照护规则"}
                    </small>
                  </li>
                ))}
              </ul>
            </dd>
            <dt>联络与接手</dt>
            <dd>
              {event.contacts.length
                ? event.contacts.map((c) => (
                    <p key={c.id}>
                      {c.name} ·{" "}
                      {c.handlingStatus === "accepted"
                        ? "已接手"
                        : c.handlingStatus === "completed"
                          ? "已记录结果"
                          : DELIVERY[c.deliveryStatus]}
                      <small>
                        模拟{c.receipt ? ` · 回执 ${c.receipt}` : ""}
                      </small>
                    </p>
                  ))
                : "尚未创建联络任务"}
            </dd>
            <dt>最近进展</dt>
            <dd>
              {event.progress.length ? event.progress.at(-1).text : "尚未报告"}
              <small>来源：家人手动报告</small>
            </dd>
          </dl>
          <div className="unknown-box">
            <CircleHelp size={17} />
            <div>
              <strong>
                {event.status === "closed" ? "结果与依据" : "当前仍然未知"}
              </strong>
              <p>
                {event.status === "closed"
                  ? `${CLOSE[event.closeReason]}：${event.closeNote}${event.transferReceiver ? `；接收方：${event.transferReceiver}` : ""}`
                  : eventUnknowns(event).join("；")}
              </p>
            </div>
          </div>
        </div>
        <div className="handoff-ai">
          <div className="section-heading">
            <h3>
              <Sparkles size={17} />
              辅助摘要
            </h3>
            <Badge tone={summary?.mode === "live" ? "green" : "neutral"}>
              {!summary
                ? "待生成"
                : summary.mode === "live"
                  ? "真实调用"
                  : "本地模板"}
            </Badge>
          </div>
          {summary ? (
            <>
              <p className="summary-text">{summary.text}</p>
              <p className="fine-print">
                {summary.provider} · {time(summary.generatedAt)}
                {summary.mode === "live"
                  ? " · 模型文本请与左侧事实核对"
                  : ` · ${summary.fallbackReason || "未调用大模型"}`}
              </p>
              {summary.stale && (
                <div className="info-note amber">
                  事件已有更新，请重新生成摘要。
                </div>
              )}
            </>
          ) : (
            <div className="summary-placeholder">
              <FileText size={33} strokeWidth={1.2} />
              <p>
                根据当前事件记录，
                <br />
                生成便于交接的简短摘要。
              </p>
              <small>
                {config?.qianfan.configured
                  ? "将请求百度千帆，实际调用结果会被记录。"
                  : "当前未配置千帆，使用本地结构化模板。"}
              </small>
            </div>
          )}
          <button
            className="button primary full"
            disabled={busy}
            onClick={onGenerate}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {busy
              ? "正在整理事件记录…"
              : summary
                ? "根据最新记录重新生成"
                : "生成交接摘要"}
          </button>
          <p className="fine-print">摘要生成不会改变事件状态或升级截止时间。</p>
        </div>
      </div>
      <div className="modal-actions">
        <span className="fine-print">
          结构化事实始终保留，未知信息不自动补全。
        </span>
        <button className="button secondary" onClick={download}>
          <ArrowDownToLine size={15} />
          导出交接卡
        </button>
      </div>
    </Modal>
  );
}

function CloseDialog({ event, onClose, onSubmit, busy }) {
  const [reason, setReason] = useState("confirmed_safe"),
    [note, setNote] = useState(""),
    [resolveMedical, setResolveMedical] = useState(false);
  const medical = event.contacts.filter(
    (c) => c.role === "medical" && c.handlingStatus !== "completed",
  );
  const transferable = medical.some(
    (c) => c.handlingStatus === "accepted" && c.receipt,
  );
  return (
    <Modal
      title="记录这一次照护的结果"
      subtitle="由责任人核实后填写，记录来源为家人手动报告。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            reason,
            note,
            medicalResolution: resolveMedical
              ? "cancelled_after_review"
              : undefined,
          });
        }}
      >
        <fieldset className="reason-options">
          <legend>结案原因</legend>
          {Object.entries(CLOSE).map(([key, text]) => (
            <label key={key} className={reason === key ? "selected" : ""}>
              <input
                type="radio"
                name="reason"
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
              />
              <span>
                <strong>{text}</strong>
                <small>
                  {key === "confirmed_safe"
                    ? "责任人已经联系或到场核实"
                    : key === "false_alarm"
                      ? "核实后确认原信号为误报"
                      : "移交给已提供接单回执的模拟服务台"}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        {reason === "care_transferred" && !transferable && (
          <div className="info-note amber">
            请先在联络卡中完成“模拟接单”，取得回执后再记录移交。
          </div>
        )}
        <label className="field-label" htmlFor="close-note">
          核实结果／移交说明
        </label>
        <textarea
          id="close-note"
          value={note}
          maxLength={1000}
          required
          onChange={(e) => setNote(e.target.value)}
          placeholder="请填写实际核实过程，例如：已到达现场，经核实……"
          rows={3}
        />
        {medical.length > 0 && reason !== "care_transferred" && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={resolveMedical}
              onChange={(e) => setResolveMedical(e.target.checked)}
              required
            />
            <span>
              我已核实，确认结束当前模拟医疗协助任务，并记录这一处理结果。
            </span>
          </label>
        )}
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            继续跟进
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              !note.trim() ||
              (reason === "care_transferred" && !transferable)
            }
          >
            <CheckCheck size={16} />
            确认记录并结案
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Elder({
  state,
  event,
  now,
  busy,
  connected,
  action,
  help,
  goBack,
  start,
  notify,
  reportPlayback,
  saveDaily,
  reminderVoice,
  reminderPerform,
  routineSuspended,
}) {
  const spoken = useSpeechPlayer(state.runId, state.home.careProfile);
  const speaking = ["loading", "playing"].includes(spoken.status);
  const [dailyQuestion, setDailyQuestion] = useState("这一次的药，吃过了吗？");
  const speech = state.expression;
  const pending = event && event.status !== "closed";
  const helpRequested =
    pending && event.confirmation.responseStatus === "help_requested";
  const text = pending
    ? event.assignee
      ? `${event.assignee}已经接手，正在跟进。`
      : helpRequested
        ? "已收到您的求助，正在尝试联系家人。"
        : event.confirmation.prompt
    : speech?.status === "awaiting_confirmation"
      ? "要帮您联系周宁吗？"
      : "今天怎么样？点一下就好。";
  const speak = () => {
    const playbackId = clientId();
    let provider = null;
    const receipt = (status) => {
      if (pending)
        reportPlayback({
          runId: event.runId,
          eventId: event.id,
          status,
          source: "server_tts",
          provider,
          sourceEventId: `${playbackId}:${status}`,
        });
    };
    spoken.player.enqueue(
      playbackId,
      !pending && (!speech || speech.status === "confirmed")
        ? dailyQuestion
        : text,
      {
        replace: true,
        emotion: "neutral",
        onStart: (detail) => {
          provider = detail.provider;
          receipt("playing");
        },
        onEnd: () => receipt("completed"),
        onCancel: ({ started }) => {
          if (started) receipt("failed");
        },
        onBlocked: () => notify("点一下“读给我听”，开启声音。", "error"),
        onError: () => {
          receipt("failed");
          notify("语音播放未完成，请使用屏幕文字与按钮。", "error");
        },
      },
    );
  };
  const showExpression = speech && speech.status !== "confirmed" && !pending;
  return (
    <div
      className={`elder-page ${!pending && !showExpression ? "with-daily" : ""}`}
    >
      <header className="elder-top">
        <button className="brand-link" onClick={goBack}>
          <Logo small />
        </button>
        <Badge dot tone={connected ? "green" : "amber"}>
          {connected ? "已连接照护空间" : "正在重连"}
        </Badge>
      </header>
      <main className="elder-main">
        <div className="elder-reminder-voice">
          <VoiceReminderToggle voice={reminderVoice} />
        </div>
        <ReminderInbox
          state={state}
          recipient="patient"
          now={now}
          busy={busy}
          perform={reminderPerform}
          voice={reminderVoice}
          suspended={routineSuspended}
          compact
        />
        <div className="elder-profile">
          <Portrait size={88} />
          <span className="elder-greeting">
            {date(new Date(now))} · 陪伴在身边
          </span>
        </div>
        <h1>
          {pending
            ? event.assignee
              ? "家人正在跟进"
              : "周伯，您好"
            : showExpression
              ? "慢慢说，我在听"
              : "周伯，您好"}
        </h1>
        {showExpression ? (
          <div className="elder-expression">
            <Badge>预设表达演示</Badge>
            <p className="expression-quote">{speech.text || "准备表达…"}</p>
            {speech.status === "listening" ? (
              <>
                <Waveform active />
                <p>演示中：等待停顿后的续句…</p>
              </>
            ) : (
              <>
                <span className="expression-complete">
                  <Check size={15} />
                  已保留完整表达
                </span>
                <h2>要帮您联系周宁吗？</h2>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="elder-question">{text}</p>
            <button
              className={`elder-speak ${speaking ? "speaking" : ""}`}
              onClick={speak}
            >
              <Volume2 size={21} />
              {speaking ? "正在播放…" : "读给我听"}
            </button>
            {pending && !event.assignee && (
              <div className="elder-listening">
                <Waveform
                  active={event.confirmation.responseStatus === "pending"}
                />
                <span>{RESPONSE[event.confirmation.responseStatus]}</span>
              </div>
            )}
          </>
        )}
        {event?.assignee && pending && (
          <div className="elder-family">
            <Portrait variant="family" size={49} />
            <div>
              <strong>{event.assignee}已接手</strong>
              <p>{event.progress.at(-1)?.text || "正在安排后续联系与核实"}</p>
            </div>
            <CheckCheck size={22} />
          </div>
        )}
        {event?.status === "closed" && (
          <div className="elder-result">
            <ShieldCheck size={20} />
            <span>
              {CLOSE[event.closeReason]}
              <small>{event.closeNote}</small>
            </span>
          </div>
        )}
        {!pending && !showExpression && (
          <DailyPatient
            state={state}
            now={now}
            busy={busy || !connected}
            save={saveDaily}
            onQuestionChange={setDailyQuestion}
          />
        )}
        <div className="elder-actions">
          {helpRequested && !event.assignee ? (
            <div className="elder-contact-pending">
              <Phone size={22} />
              正在尝试联系家人
            </div>
          ) : (
            <button
              className="elder-help"
              disabled={busy || !connected}
              onClick={() =>
                pending
                  ? action("respond", { response: "help_requested" }, event)
                  : help()
              }
            >
              <Phone size={25} />
              {pending && !event.assignee
                ? "需要帮助，请联系家人"
                : "请联系家人"}
            </button>
          )}
          {pending && !event.assignee && !helpRequested && (
            <button
              className="elder-no"
              disabled={busy || !connected}
              onClick={() =>
                action("respond", { response: "no_help_claimed" }, event)
              }
            >
              暂不需要帮助
            </button>
          )}
          {!pending && !showExpression && (
            <button
              className="elder-no"
              disabled={busy}
              onClick={() => start("speech")}
            >
              <Mic size={18} />
              体验慢表达情境
            </button>
          )}
        </div>
        <div className="elder-reassurance">
          <Heart size={16} />
          <p>不用着急，我们一步一步来。</p>
        </div>
        <p className="elder-mode">
          比赛演示 · 语音播放使用小安的统一声音
          <br />
          语音输入、终端回执与联络为模拟，未接入百度 RTC
        </p>
      </main>
      <footer className="elder-footer">
        <button onClick={goBack}>
          <ArrowRight size={14} className="flip" />
          返回照护工作台
        </button>
        <span>老人端 · 单问题交互</span>
      </footer>
    </div>
  );
}

function DevicePreview({ event, onBack }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TAKE YOUR TIME. WE ARE HERE.</p>
          <h1>把复杂留给系统，把简单留给周伯</h1>
          <p>左侧是真实运行的老人端页面，与工作台共享事件状态。</p>
        </div>
        <a
          className="button secondary"
          href="?view=elder"
          target="_blank"
          rel="noreferrer"
        >
          <Smartphone size={16} />
          独立打开老人端 <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="device-preview-layout">
        <div className="device-preview-stage">
          <div className="phone-frame">
            <iframe src="?view=elder" title="老人端实时预览" />
          </div>
          <span className="device-preview-caption">
            390 px · 实时共享照护状态
          </span>
        </div>
        <div className="device-preview-notes">
          <Badge tone="green" dot>
            连接同一个照护空间
          </Badge>
          <h2>
            一次只问一个问题，
            <br />
            给表达多一点时间。
          </h2>
          <p>
            老人不需要理解复杂的告警与处置过程。每次确认，都用清楚的文字、温和的语音和明确的按钮。
          </p>
          <div className="preview-principles">
            <div>
              <span>01</span>
              <p>
                <strong>可以慢慢说</strong>
                <small>预设慢表达情境保留停顿后的续句。</small>
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>需要帮助，一次确认</strong>
                <small>明确求助后立即联络，不再反复追问。</small>
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>家人接手，看得见</strong>
                <small>工作台的接手与进展会同步到左侧。</small>
              </p>
            </div>
          </div>
          <div className="preview-current">
            <Radio size={18} />
            <div>
              <strong>
                {event && event.status !== "closed"
                  ? event.assignee
                    ? `${event.assignee}正在跟进`
                    : `${event.title} · ${STATUS[event.status]}`
                  : "当前没有待处理事件"}
              </strong>
              <small>语音输入为模拟；读给我听使用小安的统一声音。</small>
            </div>
          </div>
          <button className="button primary" onClick={onBack}>
            回到工作台，继续跟进 <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function Architecture({ config, mapStatus, setModal }) {
  const q = config?.qianfan;
  const cards = [
    {
      n: "01",
      icon: Cpu,
      en: "COMPUTE",
      title: "芯片与算力",
      products: ["昆仑芯", "百度智能云 BCC / BOS"],
      task: "承载模型与业务服务",
      desc: "为事件服务、模型推理和授权事件素材提供运行与存储资源。",
      actual: "当前：本机 Node 服务 + JSON 文件；未部署昆仑芯、BCC 或 BOS。",
      status: "待适配",
      verify: "兼容性 · 推理延迟 · 资源成本",
      link: "https://cloud.baidu.com/product/ape.html",
    },
    {
      n: "02",
      icon: Activity,
      en: "FRAMEWORK",
      title: "框架与算法",
      products: ["飞桨 PaddlePaddle", "PaddleDetection"],
      task: "把多模态信号变成异常证据",
      desc: "人体检测、跟踪与关键点模型，结合自研时序分析、IMU 融合及数据质量检查。",
      actual: "当前：预设姿态、IMU 与轨迹数据；未运行飞桨模型。",
      status: "待适配",
      verify: "事件检出 · 误报负担 · 设备缺失处理",
      link: "https://github.com/PaddlePaddle/PaddleDetection",
    },
    {
      n: "03",
      icon: Sparkles,
      en: "INTELLIGENCE",
      title: "模型与编排",
      products: ["文心大模型", "百度千帆"],
      task: "理解表达，组织照护交接",
      desc: "读取事件与联络状态，通过受控只读工具整理事实，生成交接摘要。",
      actual: q?.verified
        ? `当前：千帆接口已验证 · ${q.model}。可在计划助手或事件记录中查看对应调用结果。`
        : q?.configured
          ? "当前：已配置千帆凭证，等待第一次真实调用验证。"
          : "当前：千帆适配代码已就绪，尚未配置凭证；交接摘要使用本地模板。",
      status: q?.verified ? "已接入" : "待验证",
      verify: "实际调用结果 · 摘要事实一致性 · 超时恢复",
      link: "https://cloud.baidu.com/doc/qianfan-docs/s/Em983g3z2",
    },
    {
      n: "04",
      icon: Layers3,
      en: "APPLICATION",
      title: "应用与服务",
      products: ["百度 RTC", "百度地图 / 鹰眼", "小度 / 短信"],
      task: "完成确认、位置核实与联络",
      desc: "老人端适老化交互，家人端接手与跟进，照护任务与结果共享。",
      actual: `${mapStatus === "live" ? "百度地图 SDK 已加载，位置仍为模拟。" : config?.mapBrowserAk ? "地图 AK 已配置，加载结果请在工作台验证。" : "当前使用社区与家庭示意图。"} RTC、鹰眼、小度与短信尚未接入。`,
      status: "部分模拟",
      verify: "确认完成 · 接手耗时 · 进展记录",
      link: "https://cloud.baidu.com/product/RTC/multimodal.html",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BAIDU AI · FROM COMPUTE TO CARE</p>
          <h1>一层能力，一份具体的照护</h1>
          <p>沿着芯片—框架—模型—应用，查看有伴的技术链路与实际接入状态。</p>
        </div>
        <button
          className="button secondary"
          onClick={() => setModal("reference-stack")}
        >
          <BookOpen size={16} />
          方案原图
        </button>
      </div>
      <div className="architecture-intro">
        <span className="architecture-mark">
          <Layers3 size={34} strokeWidth={1.3} />
        </span>
        <div>
          <h2>百度 AI 全栈 × 有伴照护闭环</h2>
          <p>各层能力各司其职，自研事件引擎连接发现、确认、升级与持续跟进。</p>
        </div>
        <Badge>实际接入状态可核查</Badge>
      </div>
      <div className="architecture-grid">
        {cards.map((c) => (
          <article className="architecture-card" key={c.n}>
            <div className="architecture-card-top">
              <span>
                {c.n} / {c.en}
              </span>
              <Badge
                tone={
                  c.status === "已接入"
                    ? "green"
                    : c.status === "部分模拟"
                      ? "amber"
                      : "neutral"
                }
              >
                {c.status}
              </Badge>
            </div>
            <div className="architecture-title">
              <c.icon size={27} strokeWidth={1.4} />
              <h2>{c.title}</h2>
            </div>
            <div className="product-tags">
              {c.products.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </div>
            <h3>{c.task}</h3>
            <p>{c.desc}</p>
            <div className="actual-state">
              <Radio size={14} />
              <span>{c.actual}</span>
            </div>
            <div className="architecture-bottom">
              <small>验证：{c.verify}</small>
              <a
                href={c.link}
                target="_blank"
                rel="noreferrer"
                aria-label={`查看${c.title}官方文档`}
              >
                <ArrowUpRight size={18} />
              </a>
            </div>
          </article>
        ))}
      </div>
      <section className="self-built">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BUILT FOR CARE</p>
            <h2>贯穿全链路的自研能力</h2>
          </div>
          <button
            className="text-button"
            onClick={() => setModal("reference-flow")}
          >
            查看流程原图 <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="own-flow">
          {[
            "证据与对象关联",
            "基础确认",
            "超时与分级联络",
            "人员接手",
            "进展检查与结案",
          ].map((t, i) => (
            <React.Fragment key={t}>
              <span>
                <b>0{i + 1}</b>
                {t}
              </span>
              {i !== 4 && <ArrowRight size={16} />}
            </React.Fragment>
          ))}
        </div>
        <div className="rule-principles">
          <p>
            <Clock3 size={18} />
            <strong>规则掌握时钟</strong>
            <span>模型延迟、刷新页面不会重置截止时间。</span>
          </p>
          <p>
            <ShieldCheck size={18} />
            <strong>事实保留来源</strong>
            <span>模拟输入、模板生成、真实调用分别记录。</span>
          </p>
          <p>
            <Users size={18} />
            <strong>接手后持续跟进</strong>
            <span>送达、接手、移交与结案相互区分。</span>
          </p>
        </div>
      </section>
      <div className="architecture-notes">
        <CircleHelp size={16} />
        <p>
          本页描述实现状态与后续适配方向。调用文心 API
          不代表已直接部署昆仑芯或使用飞桨。当前尚无真实人群对照实验结果，演示通过率不作为检测准确率。
        </p>
      </div>
    </>
  );
}

function Settings({ state, config, refreshConfig, notify }) {
  const connections = [
    ["事件服务", "本地 Node 服务 / JSON 保存", "已运行", "green"],
    [
      "百度千帆",
      config?.qianfan.verified
        ? `已验证 · ${config.qianfan.model}`
        : config?.qianfan.configured
          ? "凭证已填写，等待真实请求验证"
          : "服务端适配已就绪，尚未配置凭证",
      config?.qianfan.verified ? "已验证" : "待接入",
      config?.qianfan.verified ? "green" : "neutral",
    ],
    [
      "百度地图",
      config?.mapBrowserAk
        ? "浏览器 AK 已配置，工作台加载后验证"
        : "使用虚构社区与家庭示意图",
      config?.mapBrowserAk ? "已配置" : "待接入",
      "neutral",
    ],
    [
      "飞桨 / PaddleDetection",
      "预设姿态证据；未运行真实视觉模型",
      "待适配",
      "neutral",
    ],
    [
      "RTC / 鹰眼 / 小度",
      "语音与位置使用演示适配，终端能力待验证",
      "待适配",
      "neutral",
    ],
    ["短信 / 医疗机构", "应用内模拟通知与模拟机构回执", "模拟", "amber"],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A LITTLE CONTEXT, BETTER CARE</p>
          <h1>认识周伯，连接照护</h1>
          <p>已填写、已连接与已验证，分别记录。</p>
        </div>
        <Badge>虚构演示档案</Badge>
      </div>
      <div className="settings-grid">
        <section className="panel profile-detail">
          <Portrait size={90} />
          <h2>
            周伯 <span>76 岁</span>
          </h2>
          <p>青禾社区 · 居家照护</p>
          <dl>
            <dt>沟通偏好</dt>
            <dd>{state.profile.preference}</dd>
            <dt>常用区域</dt>
            <dd>家中客厅、社区活动区</dd>
            <dt>第一联系人</dt>
            <dd>周宁 · 女儿 · 模拟身份</dd>
            <dt>备用联系人</dt>
            <dd>社区照护员 · 模拟身份</dd>
            <dt>医疗协助</dt>
            <dd>模拟值班服务台</dd>
          </dl>
          <div className="info-note">
            沟通偏好来自预设档案，不由模型推断疾病或严重程度。
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>服务与设备连接</h2>
            <button
              className="icon-button"
              aria-label="刷新连接状态"
              onClick={async () => {
                await refreshConfig();
                notify("连接配置已刷新。");
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="integration-list">
            {connections.map(([name, desc, status, tone]) => (
              <div key={name}>
                <span className="integration-icon">
                  {name.includes("千帆") ? (
                    <Sparkles size={20} />
                  ) : name.includes("事件") ? (
                    <Radio size={20} />
                  ) : name.includes("地图") ? (
                    <MapPin size={20} />
                  ) : (
                    <Layers3 size={20} />
                  )}
                </span>
                <div>
                  <strong>{name}</strong>
                  <p>{desc}</p>
                </div>
                <Badge tone={tone}>{status}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="settings-grid lower">
        <section className="panel">
          <div className="section-heading">
            <h2>本地服务配置</h2>
            <Code2 size={19} />
          </div>
          <p className="section-description">
            在项目目录将 .env.example 复制为
            .env，填写凭证后重启。当前演示无需凭证也能运行。
          </p>
          <div className="code-sample">
            <code>
              QIANFAN_API_KEY=你的服务端凭证
              <br />
              QIANFAN_MODEL=账号可用模型
              <br />
              BAIDU_MAP_BROWSER_AK=浏览器类型AK
            </code>
          </div>
          <p className="fine-print">
            千帆密钥仅由后端读取。地图浏览器 AK 按 SDK
            要求提供到前端，需配置域名白名单。
          </p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>手机与多端演示</h2>
            <Smartphone size={19} />
          </div>
          <p className="section-description">
            在本机打开老人端，或将 HOST 设置为 0.0.0.0 后，用同一可信 Wi-Fi
            的手机访问。
          </p>
          <a
            className="button secondary"
            href="?view=elder"
            target="_blank"
            rel="noreferrer"
          >
            <Smartphone size={16} />
            打开老人端 <ArrowUpRight size={14} />
          </a>
          {config?.networkUrls.map((url) => (
            <a
              className="network-url"
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              {url}
            </a>
          ))}
          <p className="fine-print">
            此版本提供演示角色切换，适用于本地答辩与受控网络，不作为真实照护服务部署。
          </p>
        </section>
      </div>
    </>
  );
}

function Demo({
  state,
  event,
  config,
  busy,
  start,
  perform,
  action,
  setModal,
  now,
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DEMO, UNDER CONTROL</p>
          <h1>让每个情境，都能再次发生</h1>
          <p>控制输入与演示时钟，观察同一套规则如何处理不同结果。</p>
        </div>
        <button className="button secondary" onClick={() => setModal("reset")}>
          <RotateCcw size={16} />
          复位本轮演示
        </button>
      </div>
      <div className="demo-run">
        <span className="run-indicator" />
        <strong>本轮演示</strong>
        <code>{state.runId.slice(0, 8)}</code>
        <Badge>{state.events.length} 个事件</Badge>
        <span className="demo-clock">
          <Clock3 size={15} />
          {time(new Date(now))}
          {state.clockOffset > 0 && (
            <small>已推进 {state.clockOffset / 1000} 秒</small>
          )}
        </span>
      </div>
      <SceneCards onStart={start} busy={busy} />
      <div className="demo-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>模拟老人回应</h2>
            <Badge>模拟</Badge>
          </div>
          <p className="section-description">
            回应进入真实事件规则。表示暂不需要帮助时，保留原升级截止时间。
          </p>
          <div className="demo-button-list">
            <button
              disabled={busy || !event || event.status === "closed"}
              onClick={() =>
                action(
                  "respond",
                  { response: "help_requested", source: "simulated" },
                  event,
                )
              }
            >
              <Phone size={18} />
              <span>
                <strong>“需要帮助，请联系家人”</strong>
                <small>立即进入联络升级</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              disabled={busy || !event || event.status === "closed"}
              onClick={() =>
                action(
                  "respond",
                  { response: "no_help_claimed", source: "simulated" },
                  event,
                )
              }
            >
              <MessageCircle size={18} />
              <span>
                <strong>“我暂时没事”</strong>
                <small>转人工核实，保留原截止时间</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              disabled={busy || !event || event.status === "closed"}
              onClick={() =>
                action(
                  "respond",
                  { response: "unclear", source: "simulated" },
                  event,
                )
              }
            >
              <Mic size={18} />
              <span>
                <strong>有声音，但回应不清晰</strong>
                <small>记录不确定性，继续核实</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>推进演示时间</h2>
            <Badge>服务端时钟</Badge>
          </div>
          <p className="section-description">
            推进本轮演示时钟，复现超时与进展提醒。不会修改已有截止时间。
          </p>
          <div className="clock-control">
            <Clock3 size={24} />
            <strong>{time(new Date(now))}</strong>
            <span>
              {state.clockOffset
                ? `相对实际时间 +${state.clockOffset / 1000} 秒`
                : "与实际时间同步"}
            </span>
          </div>
          <div className="time-buttons">
            {[5, 15, 45, 60].map((seconds) => (
              <button
                className="button secondary"
                key={seconds}
                disabled={busy}
                onClick={() => perform("/api/demo/advance", { seconds })}
              >
                +{seconds} 秒
              </button>
            ))}
          </div>
          <div className="time-presets">
            <span>
              确认 <strong>45s</strong>
            </span>
            <span>
              接手 <strong>30s</strong>
            </span>
            <span>
              进展 <strong>60s</strong>
            </span>
          </div>
          <p className="fine-print">仅为比赛演示参数，不作为真实照护时限。</p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>故障与恢复</h2>
            <Settings2 size={18} />
          </div>
          {[
            {
              name: "agent",
              title: "Agent 不可用",
              desc: "下一次摘要请求使用模板，规则持续运行",
            },
            {
              name: "notification",
              title: "通知结果未知",
              desc: "新送达回执标为未知，等待核查，不盲目重发",
            },
            {
              name: "microphone",
              title: "收音通道故障",
              desc: "下一次终端回执使用故障状态，转人工核实",
            },
          ].map((f) => (
            <label className="fault-toggle" key={f.name}>
              <span>
                <strong>{f.title}</strong>
                <small>{f.desc}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={state.faults[f.name]}
                disabled={busy}
                onChange={(e) =>
                  perform("/api/demo/fault", {
                    name: f.name,
                    enabled: e.target.checked,
                  })
                }
              />
              <i />
            </label>
          ))}
          <button
            className="button secondary full"
            disabled={busy || !event || event.status === "closed"}
            onClick={() => action("channel_failed", {}, event)}
          >
            <Mic size={15} />
            模拟当前事件收音失败
          </button>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>本轮可核查记录</h2>
            <FileText size={18} />
          </div>
          <div className="demo-stats">
            <div>
              <strong>
                {state.events.reduce((sum, e) => sum + e.timeline.length, 0)}
              </strong>
              <span>事件动态</span>
            </div>
            <div>
              <strong>
                {state.events.filter((e) => e.status === "closed").length}
              </strong>
              <span>已结案事件</span>
            </div>
            <div>
              <strong>
                {state.events.reduce(
                  (sum, e) =>
                    sum +
                    e.agentLogs.filter(
                      (l) => l.origin === "qianfan" && l.status === "completed",
                    ).length,
                  0,
                )}
              </strong>
              <span>千帆返回／工具记录</span>
            </div>
          </div>
          <a className="button primary full" href="/api/export" download>
            <ArrowDownToLine size={16} />
            导出完整事件 JSON
          </a>
          <p className="section-description">
            包含输入来源、规则版本、固定截止时间、联络回执、人工进展和 Agent
            实际调用。
          </p>
          <p className="fine-print">
            当前数据仅用于情境验收，尚无真实人群检测指标与增量对照结果。
          </p>
        </section>
      </div>
    </>
  );
}

function FamilyLogin() {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="loading-page">
      <Logo />
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await fetch("/api/session/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            location.reload();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          家庭访问口令
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary full" disabled={busy}>
          {busy ? "正在验证" : "进入家庭照护空间"}
        </button>
        <p className="fine-print">
          口令由家庭管理员通过本地 APP_ACCESS_CODE
          配置。医生分享链接只用于查看就医包。
        </p>
      </form>
    </div>
  );
}
