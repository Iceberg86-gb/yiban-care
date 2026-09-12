import { careDate, minuteOfDay, shiftDate } from "./daily.js";

export const PLAN_CATEGORIES = {
  medication: "用药记录",
  sleep: "睡眠记录",
  mood: "心情记录",
  appointment: "就诊安排",
  custom: "日常安排",
};
export const RECIPIENTS = { patient: "周伯 · 老人端", family: "周宁 · 家属端" };
export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
export function freshPlanner() {
  return {
    version: 0,
    messages: [],
    drafts: [],
    plans: [],
    occurrences: [],
    logs: [],
    requests: [],
    context: null,
  };
}
export function wallTime(ms, timeZone = "Asia/Shanghai") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}
export function wallInstant(date, time, timeZone = "Asia/Shanghai") {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)
  )
    throw new Error("请填写明确的日期与时间。");
  const desired = Date.parse(
    `${date}T${time.length === 5 ? time + ":00" : time}.000Z`,
  );
  if (!Number.isFinite(desired) || shiftDate(date, 0) !== date)
    throw new Error("日期无效。");
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const actual = Date.parse(
      `${careDate(guess, timeZone)}T${wallTime(guess, timeZone)}.000Z`,
    );
    guess += desired - actual;
  }
  if (
    careDate(guess, timeZone) !== date ||
    wallTime(guess, timeZone) !== (time.length === 5 ? time + ":00" : time)
  )
    throw new Error("这个当地时间不存在，请换一个时间。");
  return guess;
}
export function nextReminder(
  schedule,
  after,
  timeZone = "Asia/Shanghai",
  inclusive = false,
) {
  const eligible = (t) => (inclusive ? t >= after : t > after);
  if (schedule.type === "once")
    return eligible(Date.parse(schedule.at)) ? schedule.at : null;
  const today = careDate(after, timeZone);
  for (let i = 0; i < 9; i++) {
    const date = shiftDate(today, i),
      weekday = new Date(date + "T12:00:00Z").getUTCDay() || 7;
    if (schedule.type === "weekly" && !schedule.weekdays.includes(weekday))
      continue;
    const instant = wallInstant(date, schedule.time, timeZone);
    if (eligible(instant)) return new Date(instant).toISOString();
  }
  return null;
}
export function scheduleLabel(schedule, timeZone = "Asia/Shanghai") {
  if (schedule.type === "once")
    return `${careDate(Date.parse(schedule.at), timeZone)} ${wallTime(Date.parse(schedule.at), timeZone)}`;
  if (schedule.type === "daily") return `每天 ${schedule.time}`;
  return `每周${schedule.weekdays.map((n) => WEEKDAYS[n - 1]).join("、")} ${schedule.time}`;
}
export function reminderMessage(plan, overdue = false) {
  if (overdue)
    return `有一条过期提醒，原定于${scheduleLabel({ type: "once", at: plan.scheduledAt || plan.nextAt }, plan.timeZone)}。提醒内容是：${plan.title}。我们先核对现在的安排。`;
  if (["mobile-hydration", "hydration-preview"].includes(plan.managedBy))
    return String(plan.message || "到了您和家人约定的饮水提醒时间。").slice(
      0,
      200,
    );
  if (plan.category === "medication")
    return `${plan.recipient === "patient" ? "周伯，" : ""}到用药记录时间了。我们先核对医嘱和今天的记录。已经服过的话，请不要重复服药。`;
  return `${plan.recipient === "patient" ? "周伯，" : ""}到${plan.title}的时间了。按您之前的安排来就好。`;
}
export function dueReminders(state, recipient) {
  return (state.planner?.occurrences || [])
    .filter((o) => o.recipient === recipient && o.status === "pending")
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}
