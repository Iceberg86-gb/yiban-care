import { randomUUID } from "node:crypto";
import { hydrationTimes } from "../shared/mobile.js";
import { nextReminder } from "../shared/plans.js";
const iso = (n) => new Date(n).toISOString();
export function syncHydrationPlans(engine, profile) {
  const p = engine.state.planner,
    now = engine.now(),
    times = profile.waterEnabled ? hydrationTimes(profile) : [],
    keep = new Set(times);
  for (const plan of p.plans.filter(
    (p) => p.managedBy === "mobile-hydration" && !keep.has(p.schedule.time),
  )) {
    plan.status = "cancelled";
    plan.nextAt = null;
    plan.version++;
    for (const o of p.occurrences.filter(
      (o) => o.planId === plan.id && ["pending", "snoozed"].includes(o.status),
    )) {
      o.status = "withdrawn";
      o.version++;
    }
  }
  for (const time of times) {
    const schedule = { type: "daily", time },
      message = `${profile.salutation || "周伯"}，到了您和家人约定的饮水提醒时间。`,
      old = p.plans.find(
        (p) => p.managedBy === "mobile-hydration" && p.schedule.time === time,
      );
    if (old) {
      const reactivated = old.status !== "active";
      old.status = "active";
      old.message = message;
      old.updatedAt = iso(now);
      old.version++;
      if (reactivated) {
        old.scheduleVersion++;
        old.nextAt = nextReminder(schedule, now, engine.state.daily.timeZone);
      }
    } else
      p.plans.push({
        id: randomUUID(),
        managedBy: "mobile-hydration",
        version: 1,
        scheduleVersion: 1,
        status: "active",
        createdAt: iso(now),
        updatedAt: iso(now),
        title: "饮水提醒",
        category: "custom",
        recipient: "patient",
        message,
        schedule,
        timeZone: engine.state.daily.timeZone,
        nextAt: nextReminder(schedule, now, engine.state.daily.timeZone),
        origin: "family-settings",
        draftId: null,
        lastAt: null,
      });
  }
  p.version++;
}
export function previewHydration(engine) {
  const at = engine.now(),
    profile = engine.state.home.careProfile || {};
  const pending = engine.state.planner.plans.find(
    (p) => p.managedBy === "hydration-preview" && p.status === "active",
  );
  if (pending) return;
  engine.state.planner.plans.push({
    id: randomUUID(),
    managedBy: "hydration-preview",
    version: 1,
    scheduleVersion: 1,
    status: "active",
    createdAt: iso(at),
    updatedAt: iso(at),
    title: "饮水提醒 · 体验",
    category: "custom",
    recipient: "patient",
    message: `${profile.salutation || "周伯"}，这是饮水提醒的体验消息，家人一直在。`,
    schedule: { type: "once", at: iso(at + 1000) },
    timeZone: engine.state.daily.timeZone,
    nextAt: iso(at + 1000),
    origin: "family-settings",
    draftId: null,
    lastAt: null,
  });
  engine.state.planner.version++;
}
