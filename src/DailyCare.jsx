import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  FileText,
  Heart,
  Moon,
  Pill,
  Plus,
  Settings2,
  ShieldCheck,
  Smile,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge, Modal, STATUS } from "./components.jsx";
import {
  CATEGORIES,
  PRIORITIES,
  REPORTERS,
  careDate,
  currentSlot,
  dailySummary,
  familyRisks,
  freshDaily,
  latestRecords,
  recordKey,
} from "../shared/daily.js";
import "./daily.css";

const ICONS = {
  medication: Pill,
  sleep: Moon,
  mood: Smile,
  behavior: Activity,
};
const newId = () =>
  window.crypto?.randomUUID?.() ||
  `daily-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const shortDate = (d) => d.slice(5).replace("-", "/");
const labelOf = (r) => CATEGORIES[r.kind].values[r.value];
const recordSource = (r) =>
  `${REPORTERS[r.reporter]}${r.sourceMode === "simulated" ? " · 模拟样本" : ""}`;

export function DailyPatient({ state, now, busy, save, onQuestionChange }) {
  const d = state.daily || freshDaily(),
    today = careDate(now, d.timeZone);
  const [kind, setKind] = useState("medication"),
    [saved, setSaved] = useState(false);
  const slot = currentSlot(d, now),
    info = CATEGORIES[kind];
  useEffect(() => {
    onQuestionChange?.(
      `${kind === "medication" ? (d.medicationPlan.slots.find((s) => s.id === slot)?.label || "用药记录") + "。" : ""}${info.question}可以选择：${info.patient.map((v) => info.values[v]).join("，")}。`,
    );
  }, [kind, slot, onQuestionChange]);
  const current = latestRecords(d.records).find(
    (r) =>
      r.date === today &&
      r.kind === kind &&
      (kind !== "medication" || r.slot === slot),
  );
  const selectKind = (k) => {
    setKind(k);
    setSaved(false);
  };
  const submit = async (value) => {
    const result = await save({
      kind,
      value,
      slot: kind === "medication" ? slot : null,
      reporter: "patient",
      requestId: newId(),
    });
    if (result) setSaved(true);
  };
  return (
    <section className="patient-daily" aria-label="简单日常记录">
      <div className="patient-daily-heading">
        <span>今天记一下</span>
        <small>点一下就好</small>
      </div>
      <div className="patient-daily-tabs" role="tablist" aria-label="记录类别">
        {Object.entries(CATEGORIES).map(([key, cat]) => {
          const Icon = ICONS[key];
          return (
            <button
              key={key}
              role="tab"
              aria-selected={key === kind}
              onClick={() => selectKind(key)}
            >
              <Icon size={21} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
      <h2>{info.question}</h2>
      {kind === "medication" && (
        <p className="patient-slot">
          {d.medicationPlan.slots.find((s) => s.id === slot)?.label} ·{" "}
          {d.medicationPlan.enabled
            ? d.medicationPlan.label
            : "记录已有用药情况"}
        </p>
      )}
      <div className="patient-daily-options">
        {info.patient.map((value) => (
          <button
            disabled={busy || current?.value === value}
            className={current?.value === value ? "selected" : ""}
            onClick={() => submit(value)}
            key={value}
          >
            {current?.value === value && <CheckCheck size={21} />}
            <span>{info.values[value]}</span>
          </button>
        ))}
      </div>
      <div className="patient-record-feedback" role="status">
        {saved ? (
          <>
            <Check size={17} />
            记好了，家人可以帮您补充。
          </>
        ) : current ? (
          <>
            <Check size={17} />
            今天已记：{info.values[current.value] || "家属已补充"}。
          </>
        ) : (
          <>想不起来也没关系，让家人帮忙。</>
        )}
      </div>
      {saved && (
        <button
          className="patient-next"
          onClick={() =>
            selectKind(
              Object.keys(CATEGORIES)[
                (Object.keys(CATEGORIES).indexOf(kind) + 1) % 4
              ],
            )
          }
        >
          再记一项 <ArrowRight size={17} />
        </button>
      )}
    </section>
  );
}

export function DailyOverview({ state, now, onOpen }) {
  const d = state.daily || freshDaily(),
    today = careDate(now, d.timeZone),
    records = latestRecords(d.records).filter((r) => r.date === today);
  return (
    <section className="daily-overview">
      <div>
        <span className="daily-overview-icon">
          <Heart size={22} />
        </span>
        <p>
          <strong>日常的小记录，也是照护的一部分</strong>
          <small>
            今天 {new Set(records.map((r) => r.kind)).size}/4 类已记录 ·
            普通记录静默汇总
          </small>
        </p>
      </div>
      <div className="daily-overview-statuses">
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <span
            key={key}
            className={records.some((r) => r.kind === key) ? "recorded" : ""}
          >
            {records.some((r) => r.kind === key) ? <Check size={12} /> : <i />}
            {c.label}
          </span>
        ))}
      </div>
      <button className="text-button" onClick={onOpen}>
        记录与趋势 <ArrowRight size={15} />
      </button>
    </section>
  );
}

export function DailyFamilyPage({
  state,
  now,
  busy,
  perform,
  onEvent,
  section = "records",
  setSection,
}) {
  const d = state.daily || freshDaily(),
    today = careDate(now, d.timeZone);
  const [days, setDays] = useState(7),
    [kind, setKind] = useState("all"),
    [dialog, setDialog] = useState(null),
    [history, setHistory] = useState(false);
  const summary = useMemo(
    () => dailySummary(state, now, days),
    [state, Math.floor(now / 60000), days],
  );
  const risks = familyRisks(state),
    priorityRisks = risks.filter((r) => r.priority !== "observe");
  const records = (history ? d.records : latestRecords(d.records))
    .filter(
      (r) =>
        (kind === "all" || r.kind === kind) &&
        r.date >= summary.start &&
        r.date <= today,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.recordedAt.localeCompare(a.recordedAt),
    );
  const [showAll, setShowAll] = useState(false);
  const saveRecord = async (body) => {
    const result = await perform(
      "/api/daily/record",
      { ...body, reporter: "family", requestId: newId() },
      "记录已保存，相关趋势已更新。",
    );
    if (result) setDialog(null);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SMALL NOTES. A CLEARER PICTURE.</p>
          <h1>少一点填写，多一点了解</h1>
          <p>患者简单记，家属接着补。重要的变化优先提醒，日常细节自动整理。</p>
        </div>
        <button
          className="button primary"
          onClick={() => setDialog({ type: "record" })}
        >
          <Plus size={16} />
          家属补记
        </button>
      </div>
      <div className="daily-tabs" role="tablist" aria-label="日常照护页面">
        {[
          ["records", "日常记录", ClipboardList],
          ["risks", "分级提醒", Bell],
          ["summary", "趋势与就诊摘要", FileText],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={section === key}
            onClick={() => setSection(key)}
          >
            <Icon size={17} />
            {label}
            {key === "risks" && priorityRisks.length > 0 && (
              <b>{priorityRisks.length}</b>
            )}
          </button>
        ))}
        <span>照护时区 · 北京时间</span>
      </div>
      {section === "records" && (
        <>
          <div className="daily-four-cards">
            {Object.entries(CATEGORIES).map(([key, cat]) => {
              const Icon = ICONS[key],
                records = latestRecords(d.records).filter(
                  (r) => r.date === today && r.kind === key,
                );
              return (
                <button
                  className={`daily-category-card ${key}`}
                  onClick={() => setDialog({ type: "record", kind: key })}
                  key={key}
                >
                  <span className="daily-category-icon">
                    <Icon size={22} />
                  </span>
                  <small>{cat.label}</small>
                  <strong>
                    {records.length ? labelOf(records.at(-1)) : "今天还没记录"}
                  </strong>
                  <span>
                    {records.length
                      ? `${recordSource(records.at(-1))} · 可继续补充`
                      : "不确定也可以记录，让家人一起核实"}
                  </span>
                  <Plus size={15} />
                </button>
              );
            })}
          </div>
          <div className="daily-main-grid">
            <section className="panel daily-record-panel">
              <div className="section-heading">
                <h2>照护日记</h2>
                <div className="daily-filters">
                  <label>
                    <span className="sr-only">记录范围</span>
                    <select
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                    >
                      {[7, 14, 30].map((n) => (
                        <option key={n} value={n}>
                          近 {n} 天
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">筛选记录类别</span>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="all">全部类别</option>
                      {Object.entries(CATEGORIES).map(([k, c]) => (
                        <option value={k} key={k}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <label className="daily-history-toggle">
                <input
                  type="checkbox"
                  checked={history}
                  onChange={(e) => setHistory(e.target.checked)}
                />
                包含更新前的原始记录
              </label>
              {records.length ? (
                <div className="daily-record-list">
                  {(showAll ? records : records.slice(0, 12)).map((r) => {
                    const Icon = ICONS[r.kind],
                      superseded = d.records.some((x) => x.supersedes === r.id);
                    return (
                      <article key={r.id} className="daily-record-row">
                        <div className={`daily-row-icon ${r.kind}`}>
                          <Icon size={17} />
                        </div>
                        <div className="daily-row-main">
                          <div>
                            <strong>{labelOf(r)}</strong>
                            <Badge>
                              {CATEGORIES[r.kind].label}
                              {r.slot
                                ? ` · ${r.slot === "morning" ? "早间" : "晚间"}`
                                : ""}
                            </Badge>
                            {superseded && <Badge>已有更新</Badge>}
                          </div>
                          <small>
                            {shortDate(r.date)} · {recordSource(r)}
                            {r.hours !== null
                              ? ` · 家属补充 ${r.hours} 小时`
                              : ""}
                          </small>
                          {r.note && <p>{r.note}</p>}
                          {r.additions.map((a) => (
                            <p className="family-addition" key={a.id}>
                              <Users size={12} />
                              家属补充：{a.note}
                            </p>
                          ))}
                        </div>
                        <button
                          onClick={() =>
                            setDialog({ type: "supplement", record: r })
                          }
                          className="text-button"
                        >
                          补充 <Plus size={13} />
                        </button>
                      </article>
                    );
                  })}
                  {records.length > 12 && (
                    <button
                      className="button secondary full"
                      onClick={() => setShowAll(!showAll)}
                    >
                      {showAll
                        ? "收起记录"
                        : `查看全部 ${records.length} 条记录`}
                      <ChevronDown size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="daily-empty">
                  <ClipboardList size={32} />
                  <h3>从一条小记录开始</h3>
                  <p>
                    患者端点选后，会自动出现在这里。
                    <br />
                    家属也可以补记过去 90 天内的情况。
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => setDialog({ type: "record" })}
                  >
                    补记一条日常状态
                  </button>
                </div>
              )}
            </section>
            <aside className="daily-side">
              <section className="panel medication-plan-card">
                <div className="section-heading">
                  <h2>用药提醒计划</h2>
                  <Badge tone={d.medicationPlan.enabled ? "green" : "neutral"}>
                    {d.medicationPlan.enabled ? "已启用" : "未启用"}
                  </Badge>
                </div>
                <p>
                  {d.medicationPlan.enabled
                    ? d.medicationPlan.label
                    : "由家属按已有医嘱登记计划。未启用时，不根据缺少记录判断漏服。"}
                </p>
                {d.medicationPlan.slots
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <div className="medication-slot" key={s.id}>
                      <Pill size={16} />
                      <span>{s.label}</span>
                      <strong>{s.time}</strong>
                    </div>
                  ))}
                <p className="fine-print">
                  超出配置的提醒窗口后，提示家属核实。未记录不等于漏服；系统不建议补服或调整剂量。
                </p>
                <button
                  className="button secondary full"
                  onClick={() => setDialog({ type: "plan" })}
                >
                  <Settings2 size={15} />
                  设置用药计划
                </button>
              </section>
              <section className="quiet-note">
                <ShieldCheck size={24} />
                <h3>记录可以多，通知要有分寸</h3>
                <p>
                  普通心情、睡眠与用药记录静默保存。需要核实的用药和明显变化优先提醒；突然变化、走失与跌倒进入照护流程。
                </p>
                <button
                  className="text-button"
                  onClick={() => setSection("risks")}
                >
                  查看分级提醒 <ArrowRight size={14} />
                </button>
              </section>
              {!d.records.length && (
                <section className="sample-note">
                  <Sparkles size={19} />
                  <strong>先看看趋势长什么样</strong>
                  <p>
                    载入 14
                    天虚构样本，包含空缺、患者自记与家属补充。不会触发历史紧急通知。
                  </p>
                  <button
                    className="button secondary full"
                    disabled={busy}
                    onClick={() =>
                      perform("/api/daily/seed", {}, "14 天模拟记录已载入。")
                    }
                  >
                    载入演示样本
                  </button>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
      {section === "risks" && (
        <>
          <div className="risk-policy-banner">
            <span>
              <ShieldCheck size={27} />
            </span>
            <div>
              <h2>优先处理需要行动的变化</h2>
              <p>
                这里的分级用于安排照护优先级，不是疾病风险评分。家属端提醒使用应用内模拟通道。
              </p>
            </div>
          </div>
          <div className="risk-priority-legend">
            <span className="urgent">
              <i />
              尽快处理 · 走失、跌倒、突然明显变化
            </span>
            <span className="priority">
              <i />
              优先核实 · 漏服、到期未确认、明显变化
            </span>
            <span className="observe">
              <i />
              汇总关注 · 日常波动与持续观察
            </span>
          </div>
          <div className="risk-counters">
            <div>
              <strong>
                {risks.filter((r) => r.priority === "urgent").length}
              </strong>
              <span>尽快处理</span>
            </div>
            <div>
              <strong>
                {risks.filter((r) => r.priority === "priority").length}
              </strong>
              <span>优先核实</span>
            </div>
            <div>
              <strong>
                {risks.filter((r) => r.priority === "observe").length}
              </strong>
              <span>静默汇总关注</span>
            </div>
            <div>
              <strong>{d.notifications.length}</strong>
              <span>本轮优先提醒记录</span>
            </div>
          </div>
          <div className="daily-risk-list">
            {risks.map((r) => (
              <article className={`daily-risk-card ${r.priority}`} key={r.id}>
                <span className="risk-icon">
                  <Bell size={22} />
                </span>
                <div>
                  <div className="risk-title">
                    <h3>{r.title}</h3>
                    <Badge
                      tone={
                        r.priority === "urgent"
                          ? "red"
                          : r.priority === "priority"
                            ? "amber"
                            : "green"
                      }
                    >
                      {PRIORITIES[r.priority].label}
                    </Badge>
                    {r.linked && <Badge>{STATUS[r.linked.status]}</Badge>}
                  </div>
                  <p>{r.reason}</p>
                  {r.context && <p className="risk-context">{r.context}</p>}
                  <small>
                    {shortDate(careDate(Date.parse(r.createdAt), d.timeZone))} ·{" "}
                    {r.priority === "observe"
                      ? "加入日常汇总 · 未发送即时通知"
                      : "优先提醒家属 · 应用内模拟联络"}{" "}
                    · {r.recordIds.length} 条关联日常记录
                  </small>
                </div>
                {r.eventId ? (
                  <button
                    className="button secondary"
                    onClick={() => onEvent(r.eventId)}
                  >
                    查看并跟进 <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    onClick={() => setDialog({ type: "review", alert: r })}
                  >
                    记录核实结果
                  </button>
                )}
              </article>
            ))}
            {!risks.length && (
              <div className="panel daily-empty">
                <ShieldCheck size={37} />
                <h3>当前没有需要跟进的规则提醒</h3>
                <p>新记录会按规则检查，普通数据不会变成通知。</p>
              </div>
            )}
          </div>
          {d.alerts.some((a) => a.status === "reviewed") && (
            <details className="reviewed-alerts">
              <summary>
                已核实提醒 ·{" "}
                {d.alerts.filter((a) => a.status === "reviewed").length} 项
              </summary>
              {d.alerts
                .filter((a) => a.status === "reviewed")
                .map((a) => (
                  <p key={a.id}>
                    <CheckCheck size={14} />
                    <strong>{a.title}</strong>
                    <span>{a.reviewNote}</span>
                  </p>
                ))}
            </details>
          )}
        </>
      )}
      {section === "summary" && (
        <>
          <div className="summary-toolbar">
            <div>
              <h2>把分散的记录，整理成一次清楚的沟通</h2>
              <p>
                {summary.start} — {summary.end} · 随记录自动更新 ·
                本地结构化汇总
              </p>
            </div>
            <label>
              <span className="sr-only">摘要时间范围</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[7, 14, 30].map((n) => (
                  <option value={n} key={n}>
                    近 {n} 天
                  </option>
                ))}
              </select>
            </label>
            <a
              className="button primary"
              href={`/api/daily/summary?days=${days}&format=md`}
              download
            >
              <ArrowDownToLine size={16} />
              导出就诊摘要
            </a>
          </div>
          <div className="daily-summary-overview">
            <div>
              <span>
                {summary.recordedDays}
                <small>/{days} 天</small>
              </span>
              <p>有日常记录</p>
            </div>
            <div>
              <span>{summary.records.length}</span>
              <p>当前有效记录</p>
            </div>
            <div>
              <span>{summary.familyAdditions}</span>
              <p>家属补充说明</p>
            </div>
            <div>
              <span>{summary.simulatedRecords}</span>
              <p>模拟样本记录</p>
            </div>
          </div>
          <section className="panel trend-calendar">
            <div className="section-heading">
              <h2>日常趋势，一眼回顾</h2>
              <Badge>空白表示未记录</Badge>
            </div>
            <div className="calendar-scroll">
              <table>
                <thead>
                  <tr>
                    <th>记录类别</th>
                    {summary.grid.map((day) => (
                      <th key={day.date}>{shortDate(day.date)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CATEGORIES).map(([key, c]) => (
                    <tr key={key}>
                      <th>{c.label}</th>
                      {summary.grid.map((day) => {
                        const rs = day.records.filter((r) => r.kind === key);
                        return (
                          <td
                            key={day.date}
                            title={
                              rs.length
                                ? rs
                                    .map(
                                      (r) =>
                                        `${labelOf(r)} · ${recordSource(r)}`,
                                    )
                                    .join("；")
                                : `${day.date} ${c.label}未记录`
                            }
                          >
                            {rs.length ? (
                              rs.map((r) => (
                                <span
                                  key={r.id}
                                  className={`trend-dot ${["taken", "good", "calm", "usual"].includes(r.value) ? "positive" : ["missed", "sudden_change", "wandering", "fall_reported"].includes(r.value) ? "attention" : "changed"}`}
                                  aria-label={`${day.date} ${c.label}：${labelOf(r)}`}
                                >
                                  {r.slot === "evening"
                                    ? "晚"
                                    : r.slot === "morning"
                                      ? "早"
                                      : "●"}
                                </span>
                              ))
                            ) : (
                              <span className="trend-missing">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="trend-legend">
              <span>
                <i className="positive" />
                已报告的日常状态
              </span>
              <span>
                <i className="changed" />
                不适／不确定／变化
              </span>
              <span>
                <i className="attention" />
                需核实的重要记录
              </span>
              <span>每个日期按最新记录展示，原始记录保留</span>
            </div>
          </section>
          <div className="trend-insight-grid">
            {summary.trends.map((t) => {
              const Icon = ICONS[t.kind];
              return (
                <section className="panel trend-insight" key={t.kind}>
                  <Icon size={23} />
                  <h3>{CATEGORIES[t.kind].label}</h3>
                  <strong>{t.headline}</strong>
                  <p>{t.detail}</p>
                  <small>{t.coverage}</small>
                </section>
              );
            })}
          </div>
          <section className="panel visit-summary">
            <div className="section-heading">
              <div>
                <p className="eyebrow">READY FOR THE NEXT CONVERSATION</p>
                <h2>就诊沟通摘要</h2>
              </div>
              <Badge>非诊断性汇总</Badge>
            </div>
            <p className="visit-summary-text">{summary.text}</p>
            {(summary.importantHistory.length > 0 ||
              summary.supplements.length > 0) && (
              <details className="visit-source-details">
                <summary>
                  重要记录历史与家属补充 ·{" "}
                  {summary.importantHistory.length + summary.supplements.length}{" "}
                  条
                </summary>
                {summary.importantHistory.map((r) => (
                  <p key={r.id}>
                    <strong>
                      {shortDate(r.date)} · {labelOf(r)}
                    </strong>
                    <span>
                      {recordSource(r)} ·{" "}
                      {r.note || "原始报告保留，后续更改不会删除这条依据。"}
                    </span>
                  </p>
                ))}
                {summary.supplements.map((a) => (
                  <p key={a.id}>
                    <strong>
                      {shortDate(a.date)} · 家属补充{CATEGORIES[a.kind].label}
                    </strong>
                    <span>{a.note}</span>
                  </p>
                ))}
              </details>
            )}
            <div className="visit-summary-columns">
              <div>
                <h3>重要事件与照护进展</h3>
                {summary.events.length ? (
                  summary.events.map((e) => (
                    <button
                      className="summary-event-link"
                      key={e.id}
                      onClick={() => onEvent(e.id)}
                    >
                      <span>
                        {e.title} · {STATUS[e.status]}
                      </span>
                      <small>
                        {e.assignee || "尚未接手"}
                        {e.closeNote ? " · " + e.closeNote : ""}
                      </small>
                      <ArrowRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>本期没有事件记录，不代表期间没有发生异常。</p>
                )}
              </div>
              <div>
                <h3>尚待补充与核实</h3>
                <ul>
                  {summary.unknown.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="fine-print">
              症状、用药名称／剂量与变化原因仍需家属和医生核对。突然明显混乱等急性变化应立即寻求医疗帮助，不等待摘要生成。
            </p>
          </section>
        </>
      )}
      {dialog?.type === "record" && (
        <RecordEditor
          today={today}
          defaultKind={dialog.kind}
          daily={d}
          onClose={() => setDialog(null)}
          save={saveRecord}
          busy={busy}
        />
      )}
      {dialog?.type === "plan" && (
        <PlanEditor
          daily={d}
          busy={busy}
          onClose={() => setDialog(null)}
          save={async (body) => {
            const r = await perform(
              "/api/daily/plan",
              body,
              "用药提醒计划已更新。",
            );
            if (r) setDialog(null);
          }}
        />
      )}
      {dialog?.type === "supplement" && (
        <NoteDialog
          title="家属补充观察"
          subtitle={`${dialog.record.date} · ${CATEGORIES[dialog.record.kind].label} · ${labelOf(dialog.record)}`}
          busy={busy}
          onClose={() => setDialog(null)}
          save={async (note) => {
            const r = await perform(
              "/api/daily/supplement",
              {
                recordId: dialog.record.id,
                version: dialog.record.version,
                note,
              },
              "家属说明已附在原记录后。",
            );
            if (r) setDialog(null);
          }}
        />
      )}
      {dialog?.type === "review" && (
        <NoteDialog
          title="记录家属核实结果"
          subtitle={dialog.alert.title}
          busy={busy}
          onClose={() => setDialog(null)}
          save={async (note) => {
            const r = await perform(
              "/api/daily/review",
              { alertId: dialog.alert.id, note },
              "核实结果已保存。",
            );
            if (r) setDialog(null);
          }}
        />
      )}
    </>
  );
}

function RecordEditor({ today, defaultKind, daily, busy, onClose, save }) {
  const [kind, setKind] = useState(defaultKind || "medication"),
    [value, setValue] = useState(""),
    [date, setDate] = useState(today),
    [slot, setSlot] = useState("morning"),
    [hours, setHours] = useState(""),
    [note, setNote] = useState("");
  const high =
    kind === "behavior" &&
    ["sudden_change", "wandering", "fall_reported"].includes(value);
  return (
    <Modal
      title="家属接着补，记录更完整"
      subtitle="可以补记过去的情况。患者原始记录会保留，最新记录用于趋势展示。"
      onClose={onClose}
    >
      <form
        className="daily-form"
        onSubmit={(e) => {
          e.preventDefault();
          save({
            kind,
            value,
            date,
            slot: kind === "medication" ? slot : null,
            hours: kind === "sleep" ? hours : null,
            note,
          });
        }}
      >
        <div className="daily-form-pair">
          <label>
            记录类别
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setValue("");
              }}
            >
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <option key={key} value={key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            观察日期
            <input
              type="date"
              max={today}
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {kind === "medication" && (
          <label>
            用药时段
            <select value={slot} onChange={(e) => setSlot(e.target.value)}>
              {daily.medicationPlan.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.time}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          观察到的状态
          <select
            value={value}
            required
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="" disabled>
              请选择已知的情况
            </option>
            {Object.entries(CATEGORIES[kind].values).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {kind === "sleep" && (
          <label>
            大约睡了多久（可选，小时）
            <input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="不清楚可以留空"
            />
          </label>
        )}
        <label>
          补充说明（可选）
          <textarea
            value={note}
            rows={3}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：发生时间、周围情境、家属看到的表现…"
          />
        </label>
        {high && (
          <div className="info-note amber">
            {date === today
              ? "保存后会优先提醒家属并进入照护流程。"
              : "这是历史补记，会进入摘要，不触发当前紧急通知。"}
            {value === "sudden_change"
              ? " 如果正在突然出现明显混乱，应立即寻求医疗帮助。"
              : ""}
          </div>
        )}
        {value === "missed" && (
          <div className="info-note">
            记录为家属确认漏服。请按既定医嘱或咨询医生／药师处理，系统不建议补服或加倍。
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={busy || !value}>
            <Check size={16} />
            保存记录
          </button>
        </div>
      </form>
    </Modal>
  );
}
function NoteDialog({ title, subtitle, onClose, save, busy }) {
  const [note, setNote] = useState("");
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form
        className="daily-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(note);
        }}
      >
        <label>
          补充说明
          <textarea
            rows={4}
            required
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="写下实际看到的情况，以及已经采取的措施。"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={busy || !note.trim()}>
            保存说明
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PlanEditor({ daily, busy, onClose, save }) {
  const [plan, setPlan] = useState(structuredClone(daily.medicationPlan));
  return (
    <Modal
      title="由家属设定用药提醒"
      subtitle="只记录已有医嘱中的计划；药品选择、剂量与漏服处理由医生或药师指导。"
      onClose={onClose}
    >
      <form
        className="daily-form"
        onSubmit={(e) => {
          e.preventDefault();
          save({ ...plan, version: daily.version });
        }}
      >
        <label className="daily-checkbox">
          <input
            type="checkbox"
            checked={plan.enabled}
            onChange={(e) => setPlan({ ...plan, enabled: e.target.checked })}
          />
          启用演示用药提醒
        </label>
        <label>
          计划名称
          <input
            value={plan.label}
            maxLength={120}
            onChange={(e) => setPlan({ ...plan, label: e.target.value })}
          />
        </label>
        {plan.slots.map((s, i) => (
          <div className="daily-form-pair" key={s.id}>
            <label className="daily-checkbox">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    slots: plan.slots.map((x, j) =>
                      j === i ? { ...x, enabled: e.target.checked } : x,
                    ),
                  })
                }
              />
              {s.label}
            </label>
            <label>
              计划时间
              <input
                type="time"
                value={s.time}
                required
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    slots: plan.slots.map((x, j) =>
                      j === i ? { ...x, time: e.target.value } : x,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
        <label>
          超过计划时间多久提醒家属（分钟）
          <input
            type="number"
            min="0"
            max="120"
            step="1"
            required
            value={plan.graceMinutes}
            onChange={(e) =>
              setPlan({ ...plan, graceMinutes: Number(e.target.value) })
            }
          />
        </label>
        <div className="info-note">
          启用后会检查已到提醒窗口的记录。缺少记录只标为“待核实”，每个时段合并提醒；此参数为演示配置，不是药物处理时限。
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={busy}>
            保存计划
          </button>
        </div>
      </form>
    </Modal>
  );
}
