import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  FileText,
  Heart,
  House,
  MapPin,
  Mic,
  Phone,
  Radio,
  ShieldCheck,
  Sparkles,
  UserRound,
  Volume2,
  X,
} from "lucide-react";

export const STATUS = {
  confirming: "正在确认",
  review_required: "待人工核实",
  escalated: "等待接手",
  handling: "正在处理",
  closed: "已结案",
};
export const RESPONSE = {
  pending: "等待回应",
  help_requested: "明确需要帮助",
  no_help_claimed: "表示暂不需要帮助",
  unclear: "回应不清晰",
  no_response: "未获得有效回应",
  unknown: "回应情况未知",
};
export const DELIVERY = {
  pending: "等待发送",
  sent: "正在发送",
  delivered: "消息已送达",
  failed: "发送失败",
  unknown: "送达状态待核实",
};
export const PROMPT = {
  pending: "等待终端回执",
  received: "终端已接收",
  playing: "正在播放",
  completed: "终端播放完成",
  failed: "播放失败",
  unknown: "播放状态未知",
};
export const CAPTURE = {
  pending: "等待通道状态",
  active: "收音通道可用",
  disabled: "麦克风关闭",
  failed: "收音失败",
  unknown: "通道状态未知",
};
export const CLOSE = {
  confirmed_safe: "人工确认安全",
  false_alarm: "经核实为误报",
  care_transferred: "已完成责任移交",
};
export const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";
export const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
      })
    : "—";
export function Badge({ children, tone = "neutral", dot = false }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <i />}
      {children}
    </span>
  );
}
export function Logo({ small = false }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <Heart size={25} strokeWidth={1.65} />
        <i />
      </span>
      <div>
        <strong>
          有伴<span> YOUBAN</span>
        </strong>
        {!small && <small>让照护，一直有回应</small>}
      </div>
    </div>
  );
}
export function Portrait({ size = 68, variant = "elder" }) {
  if (variant !== "elder")
    return (
      <span
        className={`initial-avatar ${variant}`}
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {variant === "family" ? (
          "宁"
        ) : variant === "medical" ? (
          <Heart size={size * 0.46} />
        ) : (
          "护"
        )}
      </span>
    );
  return (
    <svg
      className="portrait"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="周伯的虚构人物插画"
    >
      <circle cx="50" cy="50" r="50" fill="#e8e8d9" />
      <path d="M12 100c3-27 23-34 38-34s37 7 39 34" fill="#698077" />
      <path d="m35 72 15 16 15-16" fill="#f4f0e4" />
      <path d="M43 62h14v16l-7 8-7-8" fill="#d5ac87" />
      <ellipse cx="50" cy="43" rx="24" ry="28" fill="#eac7a0" />
      <ellipse cx="27" cy="46" rx="4" ry="7" fill="#eac7a0" />
      <ellipse cx="73" cy="46" rx="4" ry="7" fill="#eac7a0" />
      <path
        d="M26 39c-3-19 8-30 26-28 22 1 25 16 21 29l-6-9c-12 5-18-7-22-9-3 8-10 6-13 8Z"
        fill="#ecede5"
      />
      <path
        d="M31 35q8-4 14 0m10 0q8-4 14 0"
        fill="none"
        stroke="#919287"
        strokeWidth="2"
      />
      <g fill="none" stroke="#4c554e" strokeWidth="1.5">
        <rect x="30" y="38" width="17" height="12" rx="5" />
        <rect x="53" y="38" width="17" height="12" rx="5" />
        <path d="M47 42h6" />
      </g>
      <circle cx="39" cy="43" r="1.6" fill="#35433b" />
      <circle cx="61" cy="43" r="1.6" fill="#35433b" />
      <path
        d="m49 45-2 8h5m-9 5q7 6 14-1"
        fill="none"
        stroke="#ac7c62"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Waveform({ active = false, className = "" }) {
  return (
    <div
      className={`waveform ${active ? "active" : ""} ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: 27 }, (_, i) => (
        <i
          key={i}
          style={{
            "--height": `${8 + (Math.sin(i * 2.7) + 1) * 12 + (i % 4) * 3}px`,
            "--delay": `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}
export function Countdown({ deadline, now, label = "确认剩余" }) {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return (
    <div className={`countdown ${seconds < 15 ? "urgent" : ""}`}>
      <Clock3 size={14} />
      <span>{label}</span>
      <strong>
        {String(Math.floor(seconds / 60)).padStart(2, "0")}:
        {String(seconds % 60).padStart(2, "0")}
      </strong>
      <small>演示</small>
    </div>
  );
}
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const panel = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = [
          ...panel.current.querySelectorAll(
            'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
          ),
        ];
        if (!els.length) {
          e.preventDefault();
          return;
        }
        const first = els[0],
          last = els.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last.focus();
        }
        if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={panel}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <header className="modal-heading">
          <div>
            <p className="eyebrow">YOUBAN CARE</p>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function FloorPlan({ active }) {
  return (
    <svg
      className="floor-plan"
      viewBox="0 0 420 254"
      role="img"
      aria-label="虚构家庭平面示意图，客厅设备安装区域"
    >
      <defs>
        <pattern
          id="floor-grid"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <path d="M14 0H0V14" fill="none" stroke="#dedfd3" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect width="420" height="254" fill="#f1f2e9" />
      <rect width="420" height="254" fill="url(#floor-grid)" />
      <path
        d="M54 32H366V222H54Z"
        fill="#fafaf4"
        stroke="#bfc8bb"
        strokeWidth="4"
      />
      <path
        d="M54 109h83m37 0h37V32M270 32v80m0 36v74M54 175h63m34 0h60v47"
        stroke="#bfc8bb"
        strokeWidth="4"
        fill="none"
      />
      <rect
        x="67"
        y="45"
        width="62"
        height="45"
        rx="4"
        fill="#e8e9df"
        stroke="#c9cebf"
      />
      <rect x="69" y="48" width="20" height="37" rx="3" fill="#f9faf3" />
      <rect x="99" y="48" width="26" height="37" rx="3" fill="#f9faf3" />
      <text x="153" y="72" className="plan-text">
        卧室
      </text>
      <rect
        x="290"
        y="46"
        width="58"
        height="34"
        rx="3"
        fill="#e9ebdf"
        stroke="#cbd0c2"
      />
      <rect x="337" y="81" width="11" height="107" fill="#e9ebdf" />
      <text x="292" y="126" className="plan-text">
        厨房
      </text>
      <rect x="65" y="187" width="47" height="23" rx="4" fill="#e6eade" />
      <text x="136" y="205" className="plan-text">
        浴室
      </text>
      <rect
        x="177"
        y="119"
        width="68"
        height="24"
        rx="5"
        fill="#c3d0ba"
        stroke="#a6b99f"
      />
      <rect x="176" y="141" width="14" height="18" rx="3" fill="#c3d0ba" />
      <rect x="232" y="141" width="14" height="18" rx="3" fill="#c3d0ba" />
      <rect
        x="190"
        y="163"
        width="43"
        height="29"
        rx="9"
        fill="#eddfca"
        stroke="#d6c5ab"
      />
      <text x="116" y="143" className="plan-text strong">
        客厅
      </text>
      <circle
        cx="134"
        cy="160"
        r="29"
        fill={active ? "#c77f3c" : "#49775a"}
        opacity=".08"
      />
      <circle
        cx="134"
        cy="160"
        r="18"
        fill={active ? "#c77f3c" : "#49775a"}
        opacity=".14"
      />
      <circle
        cx="134"
        cy="160"
        r="7"
        fill={active ? "#b27840" : "#49775a"}
        stroke="white"
        strokeWidth="3"
      />
      <path d="M198 33h48" stroke="#91b8b0" strokeWidth="4" />
      <text x="20" y="237" fontSize="9" fill="#90998c">
        室内位置来自设备安装区域，非地图定位
      </text>
    </svg>
  );
}
export function Neighborhood({ active = false, expanded = false }) {
  return (
    <svg
      className={`neighborhood ${expanded ? "expanded" : ""}`}
      viewBox="0 0 540 320"
      role="img"
      aria-label="青禾社区虚构地图与模拟活动轨迹"
    >
      <rect width="540" height="320" fill="#eef0e4" />
      <g fill="#e0e7d5">
        <rect x="15" y="14" width="110" height="75" rx="17" />
        <rect x="18" y="195" width="90" height="100" rx="15" />
        <rect x="390" y="40" width="124" height="65" rx="18" />
        <rect x="382" y="214" width="135" height="89" rx="12" />
      </g>
      <path
        d="M-10 140h570M154-10v340M346-10v340"
        stroke="#fbfbf5"
        strokeWidth="26"
      />
      <path
        d="M-10 140h570M154-10v340M346-10v340"
        stroke="#dce0d5"
        strokeWidth="1"
        strokeDasharray="7 7"
      />
      <path
        d="M410-10q-16 49 12 106t-4 112q-22 69 6 122"
        fill="none"
        stroke="#d1e4de"
        strokeWidth="19"
      />
      <g fill="#dde1d5" stroke="#cdd3c5" strokeWidth="1.3">
        <rect x="189" y="30" width="54" height="55" rx="4" />
        <rect x="259" y="39" width="49" height="45" rx="4" />
        <rect x="192" y="178" width="48" height="59" rx="4" />
        <rect x="264" y="196" width="42" height="51" rx="4" />
        <rect x="30" y="35" width="56" height="34" rx="4" />
      </g>
      <circle
        cx="238"
        cy="151"
        r="101"
        fill="#41755a"
        fillOpacity=".035"
        stroke="#7c9b73"
        strokeWidth="1.4"
        strokeDasharray="5 5"
      />
      <text x="207" y="272" fontSize="12" fill="#73856b">
        预设活动范围
      </text>
      <text x="26" y="120" fontSize="11" fill="#909889">
        青禾路
      </text>
      <text x="392" y="193" fontSize="11" fill="#909889">
        东侧步道
      </text>
      <text x="189" y="21" fontSize="11" fill="#909889">
        青禾社区 · 虚构区域
      </text>
      <path
        d={active ? "M218 117v24h62l38 2 34 16 27 28" : "M218 117v24h61"}
        fill="none"
        stroke="#44755e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 7"
      />
      <circle cx="218" cy="116" r="15" fill="#fffdf6" stroke="#acc1a4" />
      <path d="m211 117 7-6 7 6v6h-14Z" fill="#739465" />
      <g transform={active ? "translate(379 187)" : "translate(278 140)"}>
        <circle r="24" fill={active ? "#c58c56" : "#527d67"} opacity=".12" />
        <circle
          r="13"
          fill={active ? "#b77943" : "#527d67"}
          stroke="#fff"
          strokeWidth="3"
        />
        <circle cy="-3" r="3" fill="#fff" />
        <path d="M-5 6q0-8 10 0" fill="#fff" />
      </g>
      <g fill="#adc29d">
        <circle cx="52" cy="238" r="10" />
        <circle cx="77" cy="258" r="13" />
        <circle cx="466" cy="61" r="12" />
        <circle cx="483" cy="272" r="13" />
        <circle cx="446" cy="251" r="9" />
      </g>
    </svg>
  );
}
export function MapView({ config, event, onMapStatus }) {
  const element = useRef(null);
  const [failed, setFailed] = useState(false);
  const locationEvent = event?.type === "location";
  const key = config?.mapBrowserAk;
  useEffect(() => {
    if (!key || event?.location.known === false) return;
    let disposed = false,
      map,
      script,
      timeout;
    const init = () => {
      if (disposed || !element.current) return;
      try {
        const B = window.BMapGL;
        map = new B.Map(element.current);
        const origin = new B.Point(116.402, 39.9235);
        const current = new B.Point(
          event?.location.longitude || 116.402,
          event?.location.latitude || 39.9235,
        );
        map.centerAndZoom(origin, 16);
        map.enableScrollWheelZoom();
        map.addOverlay(
          new B.Circle(origin, 120, {
            strokeColor: "#65836c",
            strokeWeight: 2,
            strokeStyle: "dashed",
            fillColor: "#97ad92",
            fillOpacity: 0.12,
          }),
        );
        map.addOverlay(new B.Marker(current));
        clearTimeout(timeout);
        setFailed(false);
        onMapStatus?.("live");
      } catch {
        setFailed(true);
        onMapStatus?.("failed");
      }
    };
    if (window.BMapGL) init();
    else {
      window.yibanMapReady = init;
      script = document.createElement("script");
      script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(key)}&callback=yibanMapReady`;
      script.onerror = () => {
        setFailed(true);
        onMapStatus?.("failed");
      };
      document.head.appendChild(script);
      timeout = setTimeout(() => {
        if (!disposed) {
          setFailed(true);
          onMapStatus?.("failed");
        }
      }, 12000);
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      script?.remove();
      map?.destroy?.();
      if (window.yibanMapReady === init) delete window.yibanMapReady;
    };
  }, [key, event?.id]);
  if (event?.location.known === false)
    return (
      <div className="unknown-location">
        <MapPin size={29} />
        <strong>位置尚待核实</strong>
        <p>
          这条信息来自照护记录，
          <br />
          未取得设备定位或现场位置。
        </p>
      </div>
    );
  if (key)
    return (
      <div className="map-container">
        <div ref={element} className={`live-map ${failed ? "hidden" : ""}`} />
        {failed && <Neighborhood active={locationEvent} />}
        <span className="map-source">
          {failed ? "地图加载失败 · 已用社区示意图" : "百度地图底图 · 模拟位置"}
        </span>
      </div>
    );
  return (
    <div className="map-container">
      {locationEvent ? (
        <Neighborhood active />
      ) : (
        <FloorPlan active={event && event.status !== "closed"} />
      )}
      <span className="map-source">
        {locationEvent ? "社区示意图 · 模拟轨迹" : "家庭示意图 · 模拟设备"}
      </span>
    </div>
  );
}
export function Evidence({ event }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="evidence-section">
      <button
        className="evidence-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>
          <Activity size={15} /> 查看感知依据
        </span>
        <span>
          {event.dailyAlertId ? "手动记录" : "模拟数据"}{" "}
          <ChevronDown size={15} className={open ? "rotate" : ""} />
        </span>
      </button>
      {open && (
        <div className="evidence-body">
          {event.evidence.map((e, i) => (
            <div className="evidence-row" key={e.title}>
              <span className="evidence-number">0{i + 1}</span>
              <div>
                <small>{e.title}</small>
                <strong>{e.value}</strong>
                <p>{e.detail}</p>
              </div>
            </div>
          ))}
          {event.type === "fall" && (
            <div className="imu-chart">
              <span>惯性变化 · 预设演示序列</span>
              <svg viewBox="0 0 300 52" aria-label="模拟惯性信号曲线">
                <path
                  d="M0 36h300M0 16h300"
                  stroke="#e2e7df"
                  strokeDasharray="3 4"
                />
                <path
                  d="M0 35 20 34 31 37 40 33 57 34 70 32 83 35 92 33 105 35 114 11 120 47 126 3 133 40 145 30 157 36 170 35 187 37 203 34 219 36 232 35 254 36 274 35 300 36"
                  fill="none"
                  stroke="#a27b4a"
                  strokeWidth="2"
                />
              </svg>
            </div>
          )}
          <p className="fine-print">
            {event.dailyAlertId
              ? "输入来自患者／家属手动记录或照护计划；规则实际执行，尚未完成现场核实。"
              : "输入：simulated · 处理：simulated。当前未运行飞桨或 YOLO 推理。"}
          </p>
        </div>
      )}
    </div>
  );
}
export function EventTimeline({ event, compact = false }) {
  if (!event)
    return (
      <div className="timeline-empty">
        <Clock3 size={24} />
        <p>事件发生后，这里会留下每一步照护记录。</p>
      </div>
    );
  const entries = compact
    ? event.timeline.slice(-5).reverse()
    : [...event.timeline].reverse();
  return (
    <div className="timeline-list">
      {entries.map((item, i) => (
        <div className={`timeline-item ${item.kind}`} key={item.id}>
          <span className="timeline-dot">
            {item.kind === "closed" || item.kind === "claim" ? (
              <Check size={11} />
            ) : null}
          </span>
          <time>{time(item.at)}</time>
          <div>
            <strong>{item.title}</strong>
            {!compact && <p>{item.detail}</p>}
            <small>{item.source}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
export function FlowSteps({ event }) {
  const labels = [
    "发现异常",
    "二次确认",
    "联络升级",
    "人员接手",
    "持续跟进",
    "记录结果",
  ];
  const index = !event
    ? -1
    : event.status === "closed"
      ? 5
      : event.status === "handling"
        ? event.progress.length
          ? 4
          : 3
        : event.status === "escalated"
          ? 2
          : 1;
  return (
    <div className="flow-steps">
      {labels.map((label, i) => (
        <div
          key={label}
          className={`${i <= index ? "done" : ""} ${i === index ? "current" : ""}`}
        >
          <span>
            {i === 2 && index > 2 && !event?.escalatedAt ? (
              "—"
            ) : i < index ? (
              <Check size={12} />
            ) : (
              `0${i + 1}`
            )}
          </span>
          <small>
            {i === 2 && index > 2 && !event?.escalatedAt ? "无需升级" : label}
          </small>
          {i < 5 && <i />}
        </div>
      ))}
    </div>
  );
}
