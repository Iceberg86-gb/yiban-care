export const CATEGORIES = {
  medication: {
    label: "用药",
    question: "这一次的药，吃过了吗？",
    patient: ["taken", "not_taken", "unsure"],
    values: {
      taken: "已按计划服用",
      not_taken: "还没服用",
      unsure: "记不清了",
      missed: "家属确认漏服",
    },
  },
  sleep: {
    label: "睡眠",
    question: "昨晚睡得怎么样？",
    patient: ["good", "poor", "unsure"],
    values: { good: "睡得不错", poor: "没睡好", unsure: "记不清了" },
  },
  mood: {
    label: "心情",
    question: "现在心情怎么样？",
    patient: ["calm", "low", "anxious"],
    values: { calm: "心情还不错", low: "有点低落", anxious: "有点不安" },
  },
  behavior: {
    label: "日常变化",
    question: "今天感觉和平时一样吗？",
    patient: ["usual", "different", "need_family"],
    values: {
      usual: "和平时一样",
      different: "感觉有些不一样",
      need_family: "想让家人看看",
      restless: "反复走动／夜间不安",
      noticeable_change: "与平时相比有明显变化",
      sudden_change: "突然明显混乱／交流困难",
      wandering: "无法确认去向／疑似走失",
      fall_reported: "发现疑似跌倒",
    },
  },
};
export const PRIORITIES = {
  urgent: { label: "尽快处理", rank: 3 },
  priority: { label: "优先核实", rank: 2 },
  observe: { label: "汇总关注", rank: 1 },
};
export const REPORTERS = { patient: "患者自记", family: "家属记录" };
export function eventPriority(e) {
  return (
    e.priority ||
    (["fall", "location", "wandering"].includes(e.type) ? "urgent" : "priority")
  );
}
export function eventUnknowns(e) {
  if (["confirmed_safe", "false_alarm"].includes(e.closeReason))
    return ["结案依据为家人手动报告，未独立验证。"];
  if (e.type === "medication")
    return [
      "实际药品、剂量与服药情况仍需核对",
      "漏服处理方式需由医生或药师确认",
    ];
  if (e.type === "cognitive_change")
    return ["变化发生时间与原因尚待核实", "尚未完成专业评估"];
  if (["location", "wandering"].includes(e.type))
    return ["当前准确位置与陪同情况尚待核实", "尚未完成独立现场核实"];
  if (e.type === "help") return ["具体协助需求与当前情况仍需联系核实"];
  return ["尚未确认是否受伤", "尚未完成独立现场核实"];
}
export function careDate(now, timeZone = "Asia/Shanghai") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(now))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function minuteOfDay(now, timeZone = "Asia/Shanghai") {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(now))
      .map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute);
}
export function freshDaily() {
  return {
    version: 0,
    timeZone: "Asia/Shanghai",
    records: [],
    alerts: [],
    notifications: [],
    seeded: false,
    medicationPlan: {
      enabled: false,
      startDate: null,
      graceMinutes: 30,
      label: "既定用药计划",
      slots: [
        { id: "morning", label: "早间用药", time: "08:00", enabled: true },
        { id: "evening", label: "晚间用药", time: "20:00", enabled: true },
      ],
    },
  };
}
export function recordKey(r) {
  return `${r.date}:${r.kind}:${r.kind === "medication" ? r.slot : "day"}`;
}
export function latestRecords(records) {
  const current = new Map();
  for (const r of records) current.set(recordKey(r), r);
  return [...current.values()];
}
export function currentSlot(daily, now) {
  const minutes = minuteOfDay(now, daily.timeZone);
  const slots = daily.medicationPlan.slots
    .filter((s) => s.enabled)
    .sort((a, b) => a.time.localeCompare(b.time));
  return (
    slots
      .filter(
        (s) =>
          Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) <= minutes,
      )
      .at(-1)?.id ||
    slots[0]?.id ||
    "morning"
  );
}
export function familyRisks(state) {
  const daily = state.daily || freshDaily();
  const mapped = daily.alerts
    .filter((a) => a.status === "open")
    .map((a) => ({
      ...a,
      linked: a.eventId ? state.events.find((e) => e.id === a.eventId) : null,
    }));
  const linked = new Set(mapped.map((a) => a.eventId).filter(Boolean));
  const events = state.events
    .filter((e) => e.status !== "closed" && !linked.has(e.id))
    .map((e) => ({
      id: e.id,
      eventId: e.id,
      kind: e.type,
      priority: eventPriority(e),
      title: e.title,
      reason: e.description,
      createdAt: e.createdAt,
      status: "open",
      linked: e,
      recordIds: [],
      sourceMode: e.sourceMode,
    }));
  return [...mapped, ...events].sort(
    (a, b) =>
      PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
export function dailySummary(state, now, days = 7) {
  const daily = state.daily || freshDaily();
  const end = careDate(now, daily.timeZone),
    start = shiftDate(end, 1 - days);
  const dates = Array.from({ length: days }, (_, i) => shiftDate(start, i));
  const all = latestRecords(daily.records),
    records = all.filter((r) => r.date >= start && r.date <= end);
  const medication = records.filter((r) => r.kind === "medication");
  const sleep = records.filter((r) => r.kind === "sleep");
  const mood = records.filter((r) => r.kind === "mood");
  const behavior = records.filter((r) => r.kind === "behavior");
  const recordedDays = new Set(records.map((r) => r.date)).size;
  const hours = sleep.map((r) => r.hours).filter((n) => typeof n === "number");
  const previous = all.filter(
    (r) => r.date >= shiftDate(start, -days) && r.date < start,
  );
  const stats = {
    medication: {
      taken: medication.filter((r) => r.value === "taken").length,
      missed: medication.filter((r) => r.value === "missed").length,
      unclear: medication.filter((r) =>
        ["not_taken", "unsure"].includes(r.value),
      ).length,
      total: medication.length,
    },
    sleep: {
      poor: sleep.filter((r) => r.value === "poor").length,
      total: sleep.length,
      meanHours: hours.length
        ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) /
          10
        : null,
      hoursSamples: hours.length,
    },
    mood: {
      low: mood.filter((r) => r.value === "low").length,
      anxious: mood.filter((r) => r.value === "anxious").length,
      total: mood.length,
    },
    behavior: {
      changed: behavior.filter((r) => r.value !== "usual").length,
      total: behavior.length,
    },
  };
  const trends = [
    {
      kind: "medication",
      headline: medication.length
        ? `已报告服药 ${stats.medication.taken} 次，确认漏服 ${stats.medication.missed} 次`
        : "还没有用药记录",
      detail: `${stats.medication.unclear} 次还未明确。计数仅覆盖已填写的用药时段，不等于服药依从率。`,
    },
    {
      kind: "sleep",
      headline: sleep.length
        ? `${sleep.length} 个已记录夜晚中，${stats.sleep.poor} 晚没睡好`
        : "还没有睡眠记录",
      detail: hours.length
        ? `家属补充睡眠时长的 ${hours.length} 晚，平均 ${stats.sleep.meanHours} 小时。`
        : "暂未补充睡眠小时数，保留主观感受。",
    },
    {
      kind: "mood",
      headline: mood.length
        ? `低落 ${stats.mood.low} 天，不安 ${stats.mood.anxious} 天`
        : "还没有心情记录",
      detail: `基于 ${mood.length} 个有记录的日期，未记录日期保留为空。`,
    },
    {
      kind: "behavior",
      headline: behavior.length
        ? `${stats.behavior.changed} 天记录了和平时不同的表现`
        : "还没有日常变化记录",
      detail: "只描述观察到的变化，不生成认知评分或病情分期。",
    },
  ].map((t) => {
    const prior = previous.filter((r) => r.kind === t.kind);
    const current = records.filter((r) => r.kind === t.kind);
    return {
      ...t,
      coverage: `本期 ${new Set(current.map((r) => r.date)).size}/${days} 天有记录；上一周期 ${new Set(prior.map((r) => r.date)).size}/${days} 天有记录。`,
    };
  });
  const events = state.events.filter((e) => {
    const d = careDate(Date.parse(e.createdAt), daily.timeZone);
    return d >= start && d <= end;
  });
  const unknown = [
    `本期 ${days - recordedDays} 天完全未记录；其他日期也可能存在未填写的类别。`,
    "患者自记与家属记录均为报告，不能代替实际观察或医学评估。",
  ];
  if (!daily.medicationPlan.enabled)
    unknown.push("尚未启用家属用药计划，不能判断未记录时段是否漏服。");
  const summary = {
    start,
    end,
    days,
    timeZone: daily.timeZone,
    generatedAt: new Date(now).toISOString(),
    recordedDays,
    records,
    stats,
    trends,
    events,
    risks: familyRisks(state),
    unknown,
    grid: dates.map((date) => ({
      date,
      records: records.filter((r) => r.date === date),
    })),
    sourceVersion: daily.version,
    medicationPlan: structuredClone(daily.medicationPlan),
    importantHistory: daily.records.filter(
      (r) =>
        r.date >= start &&
        r.date <= end &&
        [
          "missed",
          "sudden_change",
          "wandering",
          "fall_reported",
          "noticeable_change",
        ].includes(r.value),
    ),
    simulatedRecords: records.filter((r) => r.sourceMode === "simulated")
      .length,
    familyAdditions: daily.records
      .filter((r) => r.date >= start && r.date <= end)
      .reduce((n, r) => n + r.additions.length, 0),
    supplements: daily.records
      .filter((r) => r.date >= start && r.date <= end)
      .flatMap((r) =>
        r.additions.map((a) => ({
          ...a,
          date: r.date,
          kind: r.kind,
          recordValue: r.value,
        })),
      ),
  };
  summary.text = `近 ${days} 天（${start} 至 ${end}）中，${recordedDays} 天有记录。${trends.map((t) => t.headline + "。").join("")}本期记录照护事件 ${events.length} 起，当前仍有 ${summary.risks.filter((r) => r.priority !== "observe").length} 项风险需要优先跟进。`;
  return summary;
}
export function summaryMarkdown(s) {
  const lines = [
    "# 有伴 · 就诊沟通摘要",
    "",
    `对象：周伯（虚构演示档案）`,
    `记录范围：${s.start} 至 ${s.end} · ${s.timeZone}`,
    `生成时间：${s.generatedAt}`,
    "来源：本地结构化自动汇总，不是医学诊断。",
    "",
    "## 本期概况",
    s.text,
    "",
    `样本：${s.records.length} 条当前有效记录，其中 ${s.simulatedRecords} 条为模拟样本；家属补充 ${s.familyAdditions} 条。`,
    "",
    "## 日常趋势",
  ];
  for (const t of s.trends)
    lines.push(
      `### ${CATEGORIES[t.kind].label}`,
      t.headline,
      t.detail,
      t.coverage,
      "",
    );
  lines.push("## 当前用药计划（家属填写）");
  if (s.medicationPlan.enabled)
    lines.push(
      `${s.medicationPlan.label}；${s.medicationPlan.slots
        .filter((x) => x.enabled)
        .map((x) => `${x.label} ${x.time}`)
        .join("，")}。药物名称与剂量需与实际医嘱核对。`,
    );
  else lines.push("尚未启用家属用药计划；仅汇总已报告的用药记录。");
  lines.push("", "## 重要事件与处理");
  for (const e of s.events)
    lines.push(
      `- ${e.createdAt}｜${e.title}｜${{ confirming: "正在确认", review_required: "待核实", escalated: "等待接手", handling: "正在跟进", closed: "已结案" }[e.status] || e.status}｜责任人 ${e.assignee || "尚未接手"}｜最近进展：${e.progress?.at(-1)?.text || "尚未报告"}｜${e.closeNote || "尚未结案"}`,
    );
  if (!s.events.length)
    lines.push("本期没有事件记录，不代表期间没有发生异常。");
  lines.push("", "## 当前仍需跟进（包含期前未闭环事项）");
  for (const r of s.risks)
    lines.push(`- [${PRIORITIES[r.priority].label}] ${r.title}：${r.reason}`);
  if (!s.risks.length) lines.push("当前没有待处理的规则提醒。");
  lines.push("", "## 重要记录历史（保留后续更新前的报告）");
  if (!s.importantHistory.length) lines.push("本期没有这类记录。");
  for (const r of s.importantHistory)
    lines.push(
      `- ${r.date}｜${labelOfHistory(r)}｜${REPORTERS[r.reporter]}｜${r.sourceMode === "simulated" ? "模拟样本" : "手动记录"}｜${r.note || "未补充情境说明"}`,
    );
  lines.push("", "## 家属补充要点（含原始记录上的补充）");
  if (!s.supplements.length) lines.push("本期暂未附加家属说明。");
  for (const a of s.supplements)
    lines.push(
      `- ${a.date}｜${CATEGORIES[a.kind].label}｜家属补充于 ${a.at}：${a.note}`,
    );
  lines.push("", "## 记录依据");
  for (const r of s.records) {
    lines.push(
      `- ${r.date}｜${CATEGORIES[r.kind].label}${r.slot ? " / " + r.slot : ""}｜${CATEGORIES[r.kind].values[r.value]}｜${REPORTERS[r.reporter]}｜${r.sourceMode === "simulated" ? "模拟样本" : "手动填写"}｜${r.note || "无补充说明"}${typeof r.hours === "number" ? `｜${r.hours} 小时` : ""}`,
    );
    for (const a of r.additions) lines.push(`  家属补充（${a.at}）：${a.note}`);
  }
  lines.push(
    "",
    "## 尚待补充与核实",
    ...s.unknown.map((x) => "- " + x),
    "",
    "## 就诊时可核对的问题",
    "- 现有用药计划与已记录的漏服／不确定时段。",
    "- 睡眠、心情与行为变化的时间、情境及家属观察。",
    "- 突发变化与已采取的照护措施。",
    "",
    "突然出现明显混乱等急性变化时应立即寻求医疗帮助，不等待摘要整理完成。",
  );
  return lines.join("\n");
}
function labelOfHistory(r) {
  return `${CATEGORIES[r.kind].label}：${CATEGORIES[r.kind].values[r.value]}`;
}
