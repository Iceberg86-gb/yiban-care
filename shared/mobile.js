import { wallInstant } from "./plans.js";
import { careDate, shiftDate, latestRecords, currentSlot } from "./daily.js";
export const CARE_PROFILE = {
  wake: "07:30",
  nap: "13:00–14:00",
  bed: "21:30",
  diet: "清淡饮食",
  waterMinutes: 120,
  waterEnabled: false,
  voiceInputMode: "tap",
  avoid: "待家属核对",
  salutation: "周伯",
  speechRate: 0.85,
  speechVoice: "default",
  speechStyle: "neutral",
  volume: 0.8,
};
export function medicationOverview(state, now, days) {
  const daily = state.daily,
    end = careDate(now, daily.timeZone),
    start = shiftDate(end, 1 - days);
  const records = latestRecords(daily.records).filter(
    (r) => r.kind === "medication" && r.date >= start && r.date <= end,
  );
  const demoRows = (state.mobile?.demoRecords || []).filter(
    (r) =>
      r.tourId === state.mobile?.tour?.id && r.date >= start && r.date <= end,
  );
  const rows = [...records, ...demoRows];
  const tasks = state.home.routineTasks.filter((t) => {
    const o = state.planner.occurrences.find((o) => o.id === t.occurrenceId);
    const date = careDate(
      Date.parse(o?.scheduledAt || t.createdAt),
      daily.timeZone,
    );
    return o && o.status !== "withdrawn" && date >= start && date <= end;
  });
  const candidates = tasks.filter((t) => t.candidate && !t.verified);
  const key = (r) => (r.demoOnly ? `demo:${r.id}` : `${r.date}:${r.slot}`);
  const recorded = new Set(rows.map(key)),
    pendingKeys = new Set(
      rows.filter((r) => ["unsure", "not_taken"].includes(r.value)).map(key),
    );
  const missing = [];
  let planned = 0;
  if (daily.medicationPlan.enabled) {
    for (let i = 0; i < days; i++) {
      const date = shiftDate(start, i);
      if (
        daily.medicationPlan.startDate &&
        date < daily.medicationPlan.startDate
      )
        continue;
      for (const s of daily.medicationPlan.slots.filter((s) => s.enabled)) {
        planned++;
        const due =
          wallInstant(date, s.time, daily.timeZone) +
          daily.medicationPlan.graceMinutes * 60000;
        if (now >= due && !recorded.has(`${date}:${s.id}`)) {
          const row = { date, slot: s.id, time: s.time };
          missing.push(row);
          pendingKeys.add(key(row));
        }
      }
    }
  }
  for (const t of candidates) {
    const at = Date.parse(t.createdAt);
    pendingKeys.add(
      `${careDate(at, daily.timeZone)}:${currentSlot(daily, at)}`,
    );
  }
  return {
    rows,
    tasks,
    candidates,
    missing,
    confirmed: rows.filter((r) => r.value === "taken").length,
    pending: pendingKeys.size,
    planned: daily.medicationPlan.enabled
      ? planned + demoRows.length
      : new Set([...recorded, ...pendingKeys]).size,
    hasPlan: daily.medicationPlan.enabled,
    demoCount: demoRows.length,
    start,
    end,
  };
}
export function demoElapsed(demo, now) {
  return demo ? Math.max(0, now - Date.parse(demo.startedAt)) : 0;
}

export function hydrationTimes(profile) {
  if (
    !Number.isFinite(profile.waterMinutes) ||
    profile.waterMinutes < 30 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.wake) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.bed)
  )
    return [];
  const minute = (value) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minute(profile.wake),
    end = minute(profile.bed) + (minute(profile.bed) <= start ? 1440 : 0),
    times = [];
  for (
    let m = start + profile.waterMinutes;
    m < end;
    m += profile.waterMinutes
  ) {
    const n = m % 1440;
    times.push(
      `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
    );
  }
  return times;
}
export function careBrief(summary, medication) {
  const facts = [];
  if (summary.stats.sleep.total)
    facts.push(
      `${summary.stats.sleep.total} 个已记录夜晚中，${summary.stats.sleep.poor} 晚睡眠欠佳`,
    );
  if (summary.stats.mood.low)
    facts.push(`有 ${summary.stats.mood.low} 天记录心情低落`);
  if (summary.stats.behavior.changed)
    facts.push(`有 ${summary.stats.behavior.changed} 天记录日常行为变化`);
  if (medication.pending)
    facts.push(`${medication.pending} 条用药记录待家人核实`);
  return facts.length
    ? facts.join("；") + "。"
    : summary.recordedDays
      ? "本期已填写的记录暂无集中变化，继续按日记录即可。"
      : "本期还没有日常记录，先和家人一起记下今天的情况。";
}
