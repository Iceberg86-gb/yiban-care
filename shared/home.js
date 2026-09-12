import { careDate, shiftDate, dailySummary } from "./daily.js";
import { nextReminder, wallInstant } from "./plans.js";

export const HOME_RULES = {
  fall: { label: "跌倒", sensitivity: "high", minutes: 0 },
  night_wandering: { label: "夜间徘徊", sensitivity: "high", minutes: 5 },
  sedentary: { label: "久坐／久卧", sensitivity: "medium", minutes: 120 },
  bed_exit: { label: "离床未归", sensitivity: "high", minutes: 10 },
  inactivity: { label: "长时间无活动", sensitivity: "medium", minutes: 60 },
};
export const GUIDANCE = [
  {
    id: "sleep-guide",
    layer: "guideline",
    title: "阿尔茨海默病与睡眠变化",
    source: "美国国家老龄研究所 NIA",
    url: "https://www.nia.nih.gov/health/sleep/managing-sleep-problems-alzheimers-disease",
    text: "记录夜间醒来、活动与白天睡眠情境，帮助家属与医生回顾变化。",
  },
  {
    id: "behavior-guide",
    layer: "guideline",
    title: "行为变化与照护情境",
    source: "NHS",
    url: "https://www.nhs.uk/conditions/dementia/living-with-dementia/behaviour/",
    text: "行为变化可能与环境、沟通和身体不适有关，不能仅据此推断病情进展。",
  },
  {
    id: "medicine-guide",
    layer: "guideline",
    title: "照护者的用药记录",
    source: "NHS",
    url: "https://www.nhs.uk/social-care-and-support/practical-tips-if-you-care-for-someone/medicines-tips-for-carers/",
    text: "核对既定用药方案与实际服用情况，有疑问时与医生或药师确认。",
  },
  {
    id: "acute-guide",
    layer: "guideline",
    title: "突然出现混乱",
    source: "NHS",
    url: "https://www.nhs.uk/symptoms/confusion/",
    text: "突然出现明显混乱需要立即寻求医疗帮助，不能等待周期报告或自行诊断。",
  },
];
export const HOME_ORIGIN = { lng: 116.4035, lat: 39.9227 };
export const DEFAULT_ROUTE = [
  { x: 0, y: 0 },
  { x: 90, y: 35 },
  { x: 130, y: 160 },
  { x: -90, y: 185 },
  { x: -170, y: 65 },
  { x: 0, y: 0 },
];
export function sampleHistory(now) {
  const today = careDate(now);
  return Array.from({ length: 60 }, (_, i) => {
    const ago = 59 - i,
      recent = ago < 7,
      wave = Math.sin(i * 1.7);
    return {
      date: shiftDate(today, -ago),
      steps: Math.round((recent ? 2100 : 3600) + wave * 240),
      outdoor: Math.round((recent ? 22 : 42) + wave * 4),
      deepSleep: Math.round((recent ? 15 : 21) + wave * 2),
      nightWaking: recent ? 3 + (ago % 2) : ago % 3 === 0 ? 2 : 1,
      heartRate: Math.round((ago < 3 ? 85 : 72) + wave * 2),
      systolic: Math.round(130 + wave * 4),
      diastolic: 78 + (i % 3),
      regularity: Math.abs((recent ? 40 : 15) + wave * 20) <= 30 ? 100 : 0,
      sourceMode: "simulated",
    };
  });
}
export function freshHome(now = Date.now()) {
  const at = new Date(now).toISOString();
  return {
    version: 0,
    configVersion: 0,
    createdAt: at,
    policy: {
      confirmationSeconds: 8,
      tierTwoSeconds: 30,
      emergencySeconds: 60,
      infoImmediately: true,
      emergencyCallEnabled: false,
      routineRetrySeconds: 30,
      routineAttempts: 3,
      disconnectSeconds: 120,
      nightStart: "22:00",
      nightEnd: "06:00",
    },
    devices: [
      {
        id: "camera-living",
        name: "小度智能摄像头 · 客厅",
        type: "camera",
        zone: "客厅",
        online: true,
        battery: null,
        lastSync: at,
        sourceMode: "simulated",
        enabled: true,
      },
      {
        id: "camera-bedroom",
        name: "卧室照护摄像头",
        type: "camera",
        zone: "卧室",
        online: true,
        battery: null,
        lastSync: at,
        sourceMode: "simulated",
        enabled: true,
      },
      {
        id: "band",
        name: "健康手环",
        type: "band",
        zone: "随身",
        online: true,
        worn: true,
        battery: 82,
        lastSync: at,
        sourceMode: "simulated",
        enabled: true,
      },
      {
        id: "screen",
        name: "小度智能屏",
        type: "screen",
        zone: "客厅",
        online: true,
        battery: null,
        lastSync: at,
        sourceMode: "simulated",
        enabled: true,
      },
      {
        id: "phone",
        name: "家属手机",
        type: "phone",
        zone: "周宁",
        online: true,
        battery: 76,
        lastSync: at,
        sourceMode: "simulated",
        enabled: true,
      },
    ],
    members: [
      {
        id: "family",
        name: "周宁",
        role: "子女",
        level: 1,
        phone: "138****0001",
        photo: null,
        atHome: false,
        enabled: true,
      },
      {
        id: "son",
        name: "周航",
        role: "其他家属",
        level: 1,
        phone: "138****0002",
        photo: null,
        atHome: false,
        enabled: true,
      },
      {
        id: "carer",
        name: "陈阿姨",
        role: "在宅护工",
        level: 2,
        phone: "138****0003",
        photo: null,
        atHome: true,
        enabled: true,
      },
      {
        id: "community",
        name: "社区照护员",
        role: "社区照护",
        level: 2,
        phone: "138****0004",
        photo: null,
        atHome: false,
        enabled: true,
      },
      {
        id: "doctor",
        name: "家庭医生",
        role: "医生",
        level: 3,
        phone: "138****0005",
        photo: null,
        atHome: false,
        enabled: true,
      },
    ],
    careProfile: {
      wake: "07:30",
      nap: "13:00–14:00",
      bed: "21:30",
      diet: "清淡饮食",
      waterMinutes: 120,
      avoid: "待家属核对",
      salutation: "周伯",
      speechRate: 0.85,
      speechVoice: "default",
      speechStyle: "neutral",
      volume: 0.8,
    },
    preferences: {
      dialect: "普通话",
      speechPauseSeconds: 8,
      sedentaryMinutes: 120,
      routeTolerance: 80,
      nightEventOnly: true,
      reportFrequency: "weekly",
    },
    rules: Object.fromEntries(
      Object.entries(HOME_RULES).map(([key, value]) => [
        key,
        { ...value, enabled: true, version: 1 },
      ]),
    ),
    privacy: {
      placementConfirmed: false,
      informedAt: null,
      consentSource: null,
      nightEventOnly: true,
      sensitiveZonesBlocked: true,
      doctorPackageOnly: true,
    },
    emergency: {
      age: 76,
      diagnoses: ["原型示例：阿尔茨海默中期，未经医学评估"],
      allergies: ["尚未填写，不能视为无过敏"],
      medications: [],
      reviewedAt: null,
      source: "虚构演示档案",
    },
    monitor: {
      cameraId: "camera-living",
      pose: "站立",
      poseSince: at,
      confidence: 0.92,
      imu: "活动平稳",
      lastEventId: null,
    },
    vitals: {
      heartRate: 72,
      oxygen: 97,
      steps: 1240,
      lastSync: at,
      sourceMode: "simulated",
    },
    nextSampleAt: new Date(now + 30000).toISOString(),
    sensorHistory: sampleHistory(now),
    map: {
      home: HOME_ORIGIN,
      radius: 300,
      tolerance: 80,
      route: DEFAULT_ROUTE,
      points: [
        {
          x: 0,
          y: 0,
          at,
          accuracy: 15,
          coordType: "BD09",
          sourceMode: "simulated",
        },
      ],
      lastPositionAt: at,
      battery: 82,
      worn: true,
      online: true,
      replay: null,
      scenario: null,
      geofenceEventId: null,
      trips: [],
    },
    feed: [],
    commands: [],
    corrections: [],
    personalNotes: [
      {
        id: "communication",
        title: "沟通偏好",
        text: "一次一个问题，允许停顿后续句。",
        source: "虚构档案配置",
      },
      {
        id: "routine",
        title: "日常作息",
        text: "预设07:30起床、白天社区散步，夜间在家；作息样本按±30分钟计划窗口统计。",
        source: "演示配置",
      },
      {
        id: "environment",
        title: "环境配置",
        text: "客厅、卧室可演示；敏感空间不布点。",
        source: "用户配置待确认",
      },
    ],
    medicalRecords: [],
    medicationEvidence: [],
    routineTasks: [],
    shares: [],
    reportInterpretations: [],
    reportHistory: [],
    reportSchedule: {
      frequency: "weekly",
      nextAt: nextReportTime(now, "weekly"),
    },
  };
}
export function nextReportTime(now, frequency) {
  if (frequency === "weekly")
    return nextReminder(
      { type: "weekly", time: "09:00", weekdays: [1] },
      now,
      "Asia/Shanghai",
    );
  const date = careDate(now);
  let first = date.slice(0, 7) + "-01";
  let at = wallInstant(first, "09:00", "Asia/Shanghai");
  if (at <= now) {
    const d = new Date(first + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    first = d.toISOString().slice(0, 10);
    at = wallInstant(first, "09:00", "Asia/Shanghai");
  }
  return new Date(at).toISOString();
}
export function pointDistance(a, b = { x: 0, y: 0 }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function routeDistance(p, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
export function mapFacts(home, now) {
  const map = home.map,
    point = map.points.at(-1),
    valid =
      point &&
      point.accuracy <= 100 &&
      now - Date.parse(point.at) <= 120000 &&
      map.online &&
      map.worn;
  const distances = map.points
    .filter((p) => p.accuracy <= 100)
    .map((p) => routeDistance(p, map.route));
  return {
    point,
    valid,
    ageSeconds: point
      ? Math.max(0, Math.round((now - Date.parse(point.at)) / 1000))
      : null,
    distance: point ? Math.round(pointDistance(point)) : null,
    inside: point ? pointDistance(point) <= map.radius : null,
    deviation: point ? Math.round(routeDistance(point, map.route)) : null,
    match: distances.length
      ? Math.round(
          (100 * distances.filter((d) => d <= map.tolerance).length) /
            distances.length,
        )
      : null,
    accuracy: point?.accuracy || null,
  };
}
const metrics = [
  { id: "steps", name: "日均步数", unit: "步", direction: "lower" },
  { id: "outdoor", name: "户外时长", unit: "分钟", direction: "lower" },
  { id: "deepSleep", name: "深睡占比", unit: "%", direction: "lower" },
  { id: "nightWaking", name: "夜间醒来", unit: "次", direction: "higher" },
  {
    id: "regularity",
    name: "作息规律度（计划窗）",
    unit: "%",
    direction: "lower",
  },
  { id: "systolic", name: "晨起收缩压", unit: "mmHg", direction: "higher" },
];
function stats(values) {
  const mean = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
  return {
    n: values.length,
    mean,
    sd:
      values.length > 1
        ? Math.sqrt(
            values.reduce((n, x) => n + (x - mean) ** 2, 0) /
              (values.length - 1),
          )
        : null,
  };
}
export function homeReport(state, now, days = 7) {
  const home = state.home || freshHome(now),
    end = careDate(now),
    start = shiftDate(end, 1 - days),
    previousStart = shiftDate(start, -days);
  const current = home.sensorHistory.filter(
      (r) => r.date >= start && r.date <= end,
    ),
    previous = home.sensorHistory.filter(
      (r) => r.date >= previousStart && r.date < start,
    ),
    recent3 = home.sensorHistory.filter(
      (r) => r.date >= shiftDate(end, -2) && r.date <= end,
    );
  const items = metrics.map((m) => {
    const a = stats(current.map((r) => r[m.id]).filter(Number.isFinite)),
      b = stats(previous.map((r) => r[m.id]).filter(Number.isFinite));
    const threshold =
      b.n >= 7 && b.sd > 0
        ? b.mean + (m.direction === "higher" ? 2 : -2) * b.sd
        : null;
    const consecutive =
      recent3.length === 3 &&
      recent3.every((r, i) => r.date === shiftDate(end, i - 2)) &&
      threshold !== null &&
      recent3.every((r) =>
        m.direction === "higher" ? r[m.id] > threshold : r[m.id] < threshold,
      );
    return {
      ...m,
      deltaUnit: m.unit === "%" ? "个百分点" : m.unit,
      value: a.mean === null ? null : Math.round(a.mean * 10) / 10,
      previous: b.mean === null ? null : Math.round(b.mean * 10) / 10,
      delta:
        a.mean === null || b.mean === null
          ? null
          : Math.round((a.mean - b.mean) * 10) / 10,
      currentN: a.n,
      baselineN: b.n,
      baselineMean: b.mean,
      baselineSD: b.sd,
      threshold,
      anomaly: consecutive,
      sourceMode: "simulated",
    };
  });
  const daily = dailySummary(state, now, days),
    events = state.events.filter(
      (e) =>
        careDate(Date.parse(e.createdAt)) >= start &&
        careDate(Date.parse(e.createdAt)) <= end,
    );
  const occ = (state.planner?.occurrences || []).filter(
      (o) =>
        careDate(Date.parse(o.scheduledAt)) >= start &&
        careDate(Date.parse(o.scheduledAt)) <= end,
    ),
    eligible = events.length + occ.length,
    done =
      events.filter((e) => e.status === "closed").length +
      occ.filter((o) => o.status === "acknowledged").length;
  const previousEvents = state.events.filter(
      (e) =>
        careDate(Date.parse(e.createdAt)) >= previousStart &&
        careDate(Date.parse(e.createdAt)) < start,
    ),
    previousOcc = (state.planner?.occurrences || []).filter(
      (o) =>
        careDate(Date.parse(o.scheduledAt)) >= previousStart &&
        careDate(Date.parse(o.scheduledAt)) < start,
    ),
    prevN = previousEvents.length + previousOcc.length,
    prevDone =
      previousEvents.filter((e) => e.status === "closed").length +
      previousOcc.filter((o) => o.status === "acknowledged").length;
  const score = eligible ? Math.round((done / eligible) * 100) : null,
    prevScore = prevN ? Math.round((prevDone / prevN) * 100) : null;
  const suggestions = [
    {
      id: "check-source",
      title: "先核对设备与记录是否完整",
      text: "确认手环佩戴、数据缺口和当天安排，再比较个人基线。",
      sourceIds: ["personal", "behavior-guide"],
    },
    {
      id: "review-medicine",
      title: "把用药执行情况交给家属核实",
      text: "核对已确认服用、未确认和疑似重复记录，带着原用药清单与医生或药师沟通。",
      sourceIds: ["medical", "medicine-guide"],
    },
    {
      id: "discuss-changes",
      title: "带着时间与情境向医生提问",
      text: "记录活动变化、夜间醒来与身体不适的发生时间，讨论是否需要进一步评估。",
      sourceIds: ["sleep-guide", "behavior-guide"],
    },
  ];
  const facts = items
    .filter((m) => m.anomaly)
    .map((m) => ({
      id: m.id,
      text: `${m.name}最近连续3个样本${m.direction === "higher" ? "高于" : "低于"}个人历史演示阈值（均值${m.direction === "higher" ? "+" : "-"}2σ）；基线 n=${m.baselineN}。`,
      sourceIds: [
        "personal",
        m.id === "nightWaking" ? "sleep-guide" : "behavior-guide",
      ],
    }));
  if (daily.stats.medication.missed || daily.stats.medication.unclear)
    facts.push({
      id: "medication",
      text: `本期有${daily.stats.medication.missed}条确认漏服、${daily.stats.medication.unclear}条尚不明确的用药记录，不能据此计算未记录时段的依从性。`,
      sourceIds: ["medical", "medicine-guide"],
    });
  return {
    days,
    start,
    end,
    generatedAt: new Date(now).toISOString(),
    sourceMode: "simulated",
    current,
    previous,
    metrics: items,
    facts,
    suggestions,
    daily,
    events,
    score: {
      value: score,
      previous: prevScore,
      delta: score !== null && prevScore !== null ? score - prevScore : null,
      done,
      total: eligible,
      label: "照护闭环指数",
      definition: "已处理事件与已确认提醒 / 本期应处理事项；不是病情评分",
    },
    corrections: home.corrections,
    emergency: home.emergency,
    medicalRecords: home.medicalRecords.filter((r) => r.status === "confirmed"),
    knowledge: {
      personal: home.personalNotes.length + home.corrections.length,
      medical: home.medicalRecords.filter((r) => r.status === "confirmed")
        .length,
      guidelines: GUIDANCE.length,
      retrievalMode: "关键词与结构化匹配，非向量RAG",
    },
    sources: GUIDANCE,
    retrieval: retrieveKnowledge(
      home,
      items
        .filter((m) => m.anomaly)
        .map((m) => m.id)
        .concat(daily.stats.medication.missed ? "medication" : []),
    ),
  };
}
export function retrieveKnowledge(home, focus) {
  const map = {
    steps: ["活动", "散步"],
    outdoor: ["户外", "散步"],
    deepSleep: ["睡眠", "夜间"],
    nightWaking: ["夜间", "睡眠"],
    regularity: ["作息", "起床"],
    medication: ["药", "用药"],
    systolic: ["血压"],
  };
  const words = [...new Set(focus.flatMap((k) => map[k] || []))];
  const docs = [
    ...home.personalNotes.map((d) => ({
      ...d,
      layer: "personal",
      source: d.source,
    })),
    ...home.corrections.map((d) => ({
      id: d.id,
      layer: "personal",
      title: "家属纠错",
      text: d.reason,
      source: "家属标注",
    })),
    ...home.medicalRecords
      .filter((r) => r.status === "confirmed")
      .map((r) => ({
        id: r.id,
        layer: "medical",
        title: r.name,
        text: [
          ...r.confirmed.diagnoses,
          ...r.confirmed.medications.map((m) => `${m.name} ${m.dose}`),
          ...(r.confirmed.measurements || []).map((m) => m.text),
        ].join("；"),
        source: "已由家属核对的文书",
      })),
    ...GUIDANCE,
  ];
  return ["personal", "medical", "guideline"].flatMap((layer) =>
    docs
      .filter((d) => d.layer === layer)
      .map((d) => ({
        ...d,
        score: words.filter((w) => (d.text + d.title).includes(w)).length,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((d) => ({
        id: d.id,
        layer,
        title: d.title,
        excerpt: d.text.slice(0, 220),
        source: d.source,
        url: d.url || null,
        match: d.score ? "关键词匹配" : "相关结构化上下文",
      })),
  );
}
