import { randomUUID } from "node:crypto";
import { CareError } from "./errors.js";
import {
  CATEGORIES,
  PRIORITIES,
  careDate,
  shiftDate,
  minuteOfDay,
  latestRecords,
  recordKey,
  eventPriority,
} from "../shared/daily.js";

function validateDate(value, today) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
    shiftDate(value, 0) !== value ||
    value > today ||
    value < shiftDate(today, -89)
  )
    throw new CareError("请选择最近 90 天内的有效记录日期。");
}
export function saveDailyRecord(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const d = engine.state.daily,
      today = careDate(engine.now(), d.timeZone);
    if (
      !Object.hasOwn(CATEGORIES, body.kind) ||
      !["patient", "family"].includes(body.reporter)
    )
      throw new CareError("无效的记录类别或填写身份。");
    const def = CATEGORIES[body.kind];
    if (
      !Object.hasOwn(def.values, body.value) ||
      (body.reporter === "patient" && !def.patient.includes(body.value))
    )
      throw new CareError("请选择当前身份可以填写的状态。");
    const date = body.reporter === "patient" ? today : body.date;
    validateDate(date, today);
    const slot = body.kind === "medication" ? body.slot : null;
    if (
      body.kind === "medication" &&
      !d.medicationPlan.slots.some((s) => s.id === slot)
    )
      throw new CareError("请选择有效的用药时段。");
    if (typeof body.requestId !== "string" || body.requestId.length > 120)
      throw new CareError("缺少有效的操作编号。");
    const key = `daily:${body.requestId}`;
    if (engine.state.seenInputs.includes(key)) return false;
    const hours =
      body.reporter === "family" &&
      body.kind === "sleep" &&
      body.hours !== "" &&
      body.hours != null
        ? Number(body.hours)
        : null;
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24))
      throw new CareError("睡眠时长需要在 0 到 24 小时之间。");
    const r = {
      id: randomUUID(),
      version: 1,
      date,
      kind: body.kind,
      value: body.value,
      slot,
      reporter: body.reporter,
      note:
        body.reporter === "family"
          ? String(body.note || "")
              .trim()
              .slice(0, 1000)
          : "",
      hours,
      recordedAt: new Date(engine.now()).toISOString(),
      sourceMode: "live",
      processingMode: "live",
      additions: [],
    };
    const previous = latestRecords(d.records).find(
      (p) => recordKey(p) === recordKey(r),
    );
    if (
      r.reporter === "patient" &&
      r.kind === "sleep" &&
      typeof previous?.hours === "number"
    )
      r.hours = previous.hours;
    r.supersedes = previous?.id || null;
    d.records.push(r);
    if (
      (r.kind === "medication" && r.value === "taken") ||
      (r.kind === "behavior" && r.value === "usual")
    ) {
      for (const a of d.alerts.filter(
        (a) => a.status === "open" && a.recordIds.includes(previous?.id),
      )) {
        a.context =
          "日常记录已有更新，请家属核实后结束原提醒；原始异常报告仍保留。";
        a.recordIds.push(r.id);
        const linked = engine.state.events.find(
          (e) => e.id === a.eventId && e.status !== "closed",
        );
        if (linked) {
          linked.version++;
          linked.evidence.push({
            title: "后续日常记录",
            value: CATEGORIES[r.kind].values[r.value],
            detail: a.context,
            sourceMode: r.sourceMode,
            processingMode: "live",
          });
          engine.log(
            linked,
            "收到后续日常记录",
            a.context,
            r.reporter === "family" ? "家属记录" : "患者自记",
            "evidence",
          );
          if (linked.summary) linked.summary.stale = true;
        }
      }
    }
    d.version++;
    engine.state.seenInputs.push(key);
    evaluateDaily(engine);
  });
}
export function supplementRecord(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const d = engine.state.daily,
      r = d.records.find((r) => r.id === body.recordId);
    if (!r) throw new CareError("记录不存在。", 404);
    if (r.version !== body.version)
      throw new CareError("记录已有补充，请查看最新内容后重试。", 409);
    const note = String(body.note || "").trim();
    if (!note) throw new CareError("请填写家属补充说明。");
    r.additions.push({
      id: randomUUID(),
      at: new Date(engine.now()).toISOString(),
      reporter: "family",
      note: note.slice(0, 1000),
      sourceMode: "live",
    });
    r.version++;
    d.version++;
  });
}
export function saveMedicationPlan(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const d = engine.state.daily;
    if (body.version !== d.version)
      throw new CareError("照护记录已有更新，请核对后重新保存计划。", 409);
    if (
      typeof body.enabled !== "boolean" ||
      !Array.isArray(body.slots) ||
      body.slots.length !== 2
    )
      throw new CareError("请填写完整的用药提醒计划。");
    const grace = Number(body.graceMinutes);
    if (!Number.isInteger(grace) || grace < 0 || grace > 120)
      throw new CareError("演示提醒宽限时间应为 0 到 120 分钟。");
    const ids = new Set();
    for (const s of body.slots) {
      if (
        !["morning", "evening"].includes(s.id) ||
        ids.has(s.id) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ||
        typeof s.enabled !== "boolean"
      )
        throw new CareError("用药时段或时间格式不正确。");
      ids.add(s.id);
    }
    if (body.enabled && !body.slots.some((s) => s.enabled))
      throw new CareError("至少启用一个用药时段。");
    d.medicationPlan = {
      enabled: body.enabled,
      startDate:
        d.medicationPlan.enabled && d.medicationPlan.startDate
          ? d.medicationPlan.startDate
          : careDate(engine.now(), d.timeZone),
      graceMinutes: grace,
      label: String(body.label || "既定用药计划").slice(0, 120),
      slots: body.slots.map((s) => ({
        id: s.id,
        label: s.id === "morning" ? "早间用药" : "晚间用药",
        time: s.time,
        enabled: s.enabled,
      })),
    };
    d.version++;
    evaluateDaily(engine);
  });
}
function linkedEvent(engine, alert, record) {
  const type =
    alert.kind === "need_family"
      ? "help"
      : alert.kind === "wandering"
        ? "wandering"
        : alert.kind === "fall_reported"
          ? "fall"
          : alert.kind === "medication"
            ? "medication"
            : "cognitive_change";
  const previous = engine.state.activeId;
  const e = engine.createEvent(type, `daily-alert:${alert.id}`);
  e.priority = alert.priority;
  e.dailyAlertId = alert.id;
  e.description = alert.reason;
  e.sourceMode = record?.sourceMode || "live";
  e.processingMode = "live";
  e.evidence = [
    {
      title: record ? "日常记录" : "用药计划检查",
      value: alert.title,
      detail: alert.reason,
      sourceMode: e.sourceMode,
      processingMode: "live",
    },
  ];
  e.place = "位置尚待核实";
  e.locationSource = "来自照护记录，未取得位置数据";
  e.location = {
    known: false,
    longitude: null,
    latitude: null,
    coordType: "unknown",
    capturedAt: e.createdAt,
    worn: null,
    quality: "未知",
  };
  e.timeline[0].source = record
    ? record.reporter === "family"
      ? "家属记录"
      : "患者自记"
    : "用药计划规则";
  e.timeline[0].detail = alert.reason;
  if (type === "medication")
    e.confirmation.prompt = "周伯，需要家人帮您核对用药吗？";
  engine.escalate(e, `${PRIORITIES[alert.priority].label}：${alert.reason}`);
  if (type === "cognitive_change" && alert.priority === "urgent")
    engine.task(e, "medical");
  const priorEvent = engine.state.events.find(
    (x) => x.id === previous && x.status !== "closed",
  );
  if (
    priorEvent &&
    PRIORITIES[eventPriority(priorEvent)].rank >=
      PRIORITIES[alert.priority].rank
  )
    engine.state.activeId = previous;
  alert.eventId = e.id;
}
function upsertAlert(engine, candidate, record) {
  const d = engine.state.daily;
  let alert = d.alerts.find((a) => a.key === candidate.key);
  if (
    alert?.status === "reviewed" &&
    record &&
    !alert.recordIds.includes(record.id) &&
    candidate.priority !== "observe"
  )
    return upsertAlert(
      engine,
      { ...candidate, key: `${candidate.key}:${record.id}` },
      record,
    );
  if (alert) {
    const elevated =
      PRIORITIES[candidate.priority].rank > PRIORITIES[alert.priority].rank;
    const lower =
      PRIORITIES[candidate.priority].rank < PRIORITIES[alert.priority].rank;
    const ids = [...new Set([...alert.recordIds, ...candidate.recordIds])];
    const changed =
      ids.length !== alert.recordIds.length ||
      (!lower && alert.reason !== candidate.reason) ||
      elevated;
    if (!changed) return false;
    alert.recordIds = ids;
    if (lower)
      alert.context = `后续报告：${candidate.title}。原高优先级提醒继续保留，等待责任人核实。`;
    else {
      alert.reason = candidate.reason;
      alert.title = candidate.title;
    }
    alert.updatedAt = new Date(engine.now()).toISOString();
    const linked =
      alert.eventId &&
      engine.state.events.find(
        (e) => e.id === alert.eventId && e.status !== "closed",
      );
    if (linked) {
      linked.description = alert.reason;
      linked.evidence.push({
        title: "日常记录更新",
        value: candidate.title,
        detail: candidate.reason,
        sourceMode: record?.sourceMode || "live",
        processingMode: "live",
      });
      linked.version++;
      if (linked.summary) linked.summary.stale = true;
    }
    if (elevated) {
      alert.priority = candidate.priority;
      alert.title = candidate.title;
      alert.status = "open";
      alert.reviewNote = null;
    }
    if (elevated && candidate.priority !== "observe") {
      const existing =
        alert.eventId &&
        engine.state.events.find(
          (e) => e.id === alert.eventId && e.status !== "closed",
        );
      if (existing) {
        existing.priority = candidate.priority;
        existing.version++;
        engine.log(existing, "照护关注级别提升", candidate.reason);
        if (candidate.kind === "sudden_change")
          engine.task(existing, "medical");
        if (existing.summary) existing.summary.stale = true;
      } else linkedEvent(engine, alert, record);
      notifyFamily(engine, alert);
    }
    d.version++;
    return true;
  }
  alert = {
    id: randomUUID(),
    ...candidate,
    createdAt: new Date(engine.now()).toISOString(),
    updatedAt: new Date(engine.now()).toISOString(),
    status: "open",
    reviewNote: null,
    eventId: null,
    sourceMode: record?.sourceMode || "live",
  };
  d.alerts.push(alert);
  if (candidate.priority !== "observe") {
    linkedEvent(engine, alert, record);
    notifyFamily(engine, alert);
  }
  d.version++;
  return true;
}
function notifyFamily(engine, alert) {
  const d = engine.state.daily,
    key = `${alert.id}:${alert.priority}`;
  if (d.notifications.some((n) => n.key === key)) return;
  d.notifications.push({
    id: randomUUID(),
    key,
    alertId: alert.id,
    eventId: alert.eventId,
    title: alert.title,
    priority: alert.priority,
    at: new Date(engine.now()).toISOString(),
    channel: "in_app_simulated",
    recipient: "周宁",
  });
}
export function evaluateDaily(engine) {
  const d = engine.state.daily,
    now = engine.now(),
    today = careDate(now, d.timeZone),
    current = latestRecords(d.records);
  let changed = false;
  const todayRecords = current.filter((r) => r.date === today);
  for (const r of todayRecords) {
    let c = null;
    if (r.kind === "medication" && r.value === "missed")
      c = {
        key: `med:${today}:${r.slot}`,
        kind: "medication",
        priority: "priority",
        title: "已报告漏服药",
        reason: `家属确认${r.slot === "morning" ? "早间" : "晚间"}用药漏服，请核对既定医嘱并向医生或药师确认处理方式。系统不建议补服或加倍。`,
      };
    if (r.kind === "behavior") {
      const choices = {
        wandering: [
          "urgent",
          "疑似走失",
          "家属报告无法确认去向，请立即联络家人并核实位置。",
        ],
        fall_reported: [
          "urgent",
          "家属发现疑似跌倒",
          "家属报告疑似跌倒，请尽快到场或联系核实。",
        ],
        sudden_change: [
          "urgent",
          "突然出现明显状态变化",
          "家属报告突然明显混乱或交流困难，请立即寻求医疗帮助，同时通知家属；不等待日常汇总。",
        ],
        noticeable_change: [
          "priority",
          "与平时相比有明显变化",
          "家属记录了明显变化，需要尽快核实发生时间、情境，并与医生沟通。",
        ],
        different: [
          "observe",
          "患者感觉与平时不同",
          "先保留患者感受，交给家属补充观察。",
        ],
        need_family: [
          "priority",
          "患者希望家人看看",
          "患者表示需要家人协助，请联系核实。",
        ],
      };
      if (choices[r.value]) {
        const [priority, title, reason] = choices[r.value];
        c = {
          key: `behavior:${today}:${r.value === "sudden_change" || r.value === "noticeable_change" ? "change" : r.value}`,
          kind: r.value,
          priority,
          title,
          reason,
        };
      }
    }
    if (c)
      changed = upsertAlert(engine, { ...c, recordIds: [r.id] }, r) || changed;
  }
  const plan = d.medicationPlan;
  if (plan.enabled && today >= plan.startDate) {
    for (const day of [shiftDate(today, -1), today].filter(
      (day) => day >= plan.startDate,
    ))
      for (const slot of plan.slots.filter((s) => s.enabled)) {
        const due =
          Number(slot.time.slice(0, 2)) * 60 +
          Number(slot.time.slice(3)) +
          plan.graceMinutes;
        const elapsed =
          minuteOfDay(now, d.timeZone) + (day === today ? 0 : 1440);
        const r = current.find(
          (r) =>
            r.date === day && r.kind === "medication" && r.slot === slot.id,
        );
        if (
          elapsed >= due &&
          elapsed - due <= 1440 &&
          (!r || ["not_taken", "unsure"].includes(r.value))
        )
          changed =
            upsertAlert(
              engine,
              {
                key: `med:${day}:${slot.id}`,
                kind: "medication",
                priority: "priority",
                title: "用药记录需要核实",
                reason: `${day} ${slot.label}已超过配置的提醒窗口，${r ? "当前记录为“" + CATEGORIES.medication.values[r.value] + "”" : "尚未填写记录"}。这不等于已确认漏服，请家属核实。`,
                recordIds: r ? [r.id] : [],
              },
              r,
            ) || changed;
      }
  }
  for (const [kind, value, title] of [
    ["sleep", "poor", "近期多次记录没睡好"],
    ["mood", "low", "近期多次记录心情低落"],
    ["behavior", "restless", "近期多次记录日常行为变化"],
  ]) {
    const records = current.filter(
      (r) =>
        r.kind === kind &&
        r.value === value &&
        r.date >= shiftDate(today, -6) &&
        r.date <= today,
    );
    if (new Set(records.map((r) => r.date)).size >= 3)
      changed =
        upsertAlert(
          engine,
          {
            key: `trend:${kind}:rolling7`,
            kind,
            priority: "observe",
            title,
            reason: `近 7 天有 ${records.length} 天相关记录，加入汇总供家属观察，不发送即时通知。此阈值仅用于演示。`,
            recordIds: records.map((r) => r.id),
          },
          records.at(-1),
        ) || changed;
  }
  return changed;
}
export function reviewDailyAlert(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const a = engine.state.daily.alerts.find((a) => a.id === body.alertId);
    if (!a) throw new CareError("提醒不存在。", 404);
    if (
      a.eventId &&
      engine.state.events.some(
        (e) => e.id === a.eventId && e.status !== "closed",
      )
    )
      throw new CareError("这项提醒已进入照护流程，请先在事件中记录处理结果。");
    if (!String(body.note || "").trim())
      throw new CareError("请填写家属核实说明。");
    a.status = "reviewed";
    a.reviewNote = String(body.note).trim().slice(0, 1000);
    a.reviewedAt = new Date(engine.now()).toISOString();
    engine.state.daily.version++;
  });
}
export function seedDaily(engine, { runId }) {
  engine.checkRun(runId);
  return engine.transaction(() => {
    const d = engine.state.daily;
    if (d.records.length)
      throw new CareError(
        "已有日常记录，请先导出并复位后再载入样本，避免混入现有记录。",
        409,
      );
    const today = careDate(engine.now(), d.timeZone);
    for (let i = 14; i >= 1; i--) {
      const date = shiftDate(today, -i);
      for (const kind of Object.keys(CATEGORIES)) {
        if ((i === 4 && kind === "sleep") || (i === 8 && kind === "mood"))
          continue;
        const value =
          kind === "medication"
            ? i === 2 || i === 9
              ? "missed"
              : "taken"
            : kind === "sleep"
              ? i <= 5
                ? "poor"
                : "good"
              : kind === "mood"
                ? i <= 3
                  ? "low"
                  : "calm"
                : i === 3
                  ? "restless"
                  : "usual";
        d.records.push({
          id: randomUUID(),
          version: 1,
          date,
          kind,
          value,
          slot: kind === "medication" ? "morning" : null,
          reporter:
            value === "missed" ? "family" : i % 2 ? "patient" : "family",
          sourceMode: "simulated",
          processingMode: "live",
          recordedAt: new Date(engine.now()).toISOString(),
          hours: kind === "sleep" && i % 2 === 0 ? (i <= 5 ? 5.5 : 7.5) : null,
          note: "",
          additions:
            i === 3 && kind === "behavior"
              ? [
                  {
                    id: randomUUID(),
                    at: new Date(engine.now()).toISOString(),
                    reporter: "family",
                    sourceMode: "simulated",
                    note: "样本：夜间醒来后在屋内来回走动，家属陪同后安静。",
                  },
                ]
              : [],
          supersedes: null,
        });
      }
    }
    d.seeded = true;
    d.version++;
    evaluateDaily(engine);
  });
}
