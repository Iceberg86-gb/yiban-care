import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CareEngine } from "../server/engine.js";
import {
  careDate,
  dailySummary,
  latestRecords,
  summaryMarkdown,
  familyRisks,
} from "../shared/daily.js";

function fixture(start = "2026-09-12T02:00:00Z", options = {}) {
  let now = Date.parse(start);
  const engine = new CareEngine({ ...options, now: () => now });
  const f = {
    engine,
    get daily() {
      return engine.state.daily;
    },
    get today() {
      return careDate(now);
    },
    get event() {
      return engine.state.events[0];
    },
    save(kind, value, extra = {}) {
      engine.saveDaily({
        runId: engine.state.runId,
        kind,
        value,
        reporter: "family",
        date: f.today,
        slot: "morning",
        requestId: randomUUID(),
        ...extra,
      });
    },
    advance(minutes) {
      now += minutes * 60000;
      engine.tick();
    },
    plan(extra = {}) {
      engine.savePlan({
        runId: engine.state.runId,
        version: f.daily.version,
        ...structuredClone(f.daily.medicationPlan),
        enabled: true,
        ...extra,
      });
    },
    command(action, payload = {}) {
      engine.action({
        runId: engine.state.runId,
        eventId: f.event.id,
        version: f.event.version,
        action,
        payload,
      });
    },
    summary(days = 7) {
      return dailySummary(engine.state, now, days);
    },
  };
  return f;
}
test("普通记录静默保存，患者无需填写细节，重复请求幂等", () => {
  const f = fixture(),
    requestId = "patient-tap-1";
  f.save("mood", "calm", { reporter: "patient", requestId });
  f.save("mood", "calm", { reporter: "patient", requestId });
  assert.equal(f.daily.records.length, 1);
  assert.equal(f.daily.records[0].reporter, "patient");
  assert.equal(f.daily.notifications.length, 0);
  assert.equal(f.engine.state.events.length, 0);
});
test("患者不能自行填写家属确认漏服、急性状态变化等家属选项", () => {
  const f = fixture();
  assert.throws(
    () => f.save("medication", "missed", { reporter: "patient" }),
    /当前身份/,
  );
  assert.throws(
    () => f.save("behavior", "sudden_change", { reporter: "patient" }),
    /当前身份/,
  );
  assert.equal(f.daily.records.length, 0);
});
test("家属补充保留患者原始值并校验版本", () => {
  const f = fixture();
  f.save("sleep", "poor", { reporter: "patient" });
  const r = structuredClone(f.daily.records[0]);
  f.engine.supplementDaily({
    runId: f.engine.state.runId,
    recordId: r.id,
    version: r.version,
    note: "夜间醒来两次，家属陪伴后重新入睡。",
  });
  assert.equal(f.daily.records[0].value, "poor");
  assert.equal(f.daily.records[0].reporter, "patient");
  assert.equal(f.daily.records[0].additions[0].reporter, "family");
  assert.throws(
    () =>
      f.engine.supplementDaily({
        runId: f.engine.state.runId,
        recordId: r.id,
        version: r.version,
        note: "旧版本补充",
      }),
    /已有补充/,
  );
});
test("未启用计划时，不把空记录或还没服药判为漏服", () => {
  const f = fixture();
  f.save("medication", "not_taken", { reporter: "patient" });
  f.advance(180);
  assert.equal(f.daily.alerts.length, 0);
  assert.equal(f.daily.notifications.length, 0);
});
test("到期未记录仅标为待核实，并合并同一用药时段的重复检查", () => {
  const f = fixture("2026-09-12T00:00:00Z");
  f.plan({
    slots: [
      { id: "morning", time: "09:00", enabled: true },
      { id: "evening", time: "20:00", enabled: false },
    ],
  });
  f.advance(89);
  assert.equal(f.daily.notifications.length, 0);
  f.advance(2);
  assert.equal(f.daily.alerts.length, 1);
  assert.match(f.daily.alerts[0].reason, /不等于已确认漏服/);
  assert.equal(f.event.type, "medication");
  f.advance(1);
  f.advance(1);
  assert.equal(f.daily.notifications.length, 1);
  assert.equal(f.daily.alerts.length, 1);
});
test("跨午夜宽限窗口在次日正确到期", () => {
  const f = fixture("2026-09-12T15:45:00Z");
  f.plan({
    graceMinutes: 30,
    slots: [
      { id: "morning", time: "08:00", enabled: false },
      { id: "evening", time: "23:50", enabled: true },
    ],
  });
  f.advance(30);
  assert.equal(f.daily.notifications.length, 0);
  f.advance(6);
  assert.equal(f.daily.notifications.length, 1);
  assert.match(f.daily.alerts[0].key, /2026-09-12:evening/);
});
test("明确漏服药优先提醒家属，但不生成服药剂量建议", () => {
  const f = fixture();
  f.save("medication", "missed");
  assert.equal(f.daily.notifications.length, 1);
  assert.equal(f.daily.alerts[0].priority, "priority");
  assert.match(f.daily.alerts[0].reason, /不建议补服或加倍/);
  assert.ok(!f.event.contacts.some((c) => c.role === "medical"));
});
test("突然明显变化立即进入照护流程，与现有事件不互相覆盖", () => {
  const f = fixture();
  f.engine.start({ runId: f.engine.state.runId, scenario: "fall" });
  const previousId = f.event.id;
  f.save("behavior", "sudden_change", {
    note: "突然说不清话，与平时明显不同。",
  });
  assert.equal(f.engine.state.events.length, 2);
  assert.equal(f.engine.state.activeId, previousId);
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.priority, "urgent");
  assert.equal(f.event.type, "cognitive_change");
  assert.equal(f.event.location.known, false);
  assert.equal(f.event.location.longitude, null);
  assert.ok(f.event.contacts.some((c) => c.role === "medical"));
  assert.match(f.daily.alerts[0].reason, /立即寻求医疗帮助/);
});
test("明显变化升级为突然变化时，只对升级通知一次", () => {
  const f = fixture();
  f.save("behavior", "noticeable_change");
  const id = f.event.id;
  f.save("behavior", "sudden_change");
  assert.equal(f.event.id, id);
  assert.equal(f.daily.notifications.length, 2);
  assert.equal(f.event.priority, "urgent");
  assert.ok(f.event.contacts.some((c) => c.role === "medical"));
  f.advance(2);
  assert.equal(f.daily.notifications.length, 2);
});
test("走失与跌倒报告优先，普通不适进入汇总关注", () => {
  const f = fixture();
  f.save("behavior", "different", { reporter: "patient" });
  assert.equal(f.daily.alerts[0].priority, "observe");
  assert.equal(f.daily.notifications.length, 0);
  f.save("behavior", "wandering");
  assert.equal(f.event.type, "wandering");
  assert.equal(f.event.priority, "urgent");
  f.save("behavior", "fall_reported");
  assert.equal(f.event.type, "fall");
  assert.equal(f.daily.notifications.length, 2);
});
test("患者希望家人看看，进入求助而非认知变化事件", () => {
  const f = fixture();
  f.save("behavior", "need_family", { reporter: "patient" });
  assert.equal(f.event.type, "help");
  assert.equal(f.daily.notifications.length, 1);
});
test("历史补记进入摘要，不造成当前紧急通知", () => {
  const f = fixture();
  f.save("behavior", "sudden_change", { date: "2026-09-10" });
  assert.equal(f.daily.notifications.length, 0);
  assert.equal(f.engine.state.events.length, 0);
  assert.equal(f.summary().importantHistory.length, 1);
});
test("多日睡眠变化只加入汇总，按日期计数且不即时推送", () => {
  const f = fixture();
  for (const date of ["2026-09-10", "2026-09-11", "2026-09-12"])
    f.save("sleep", "poor", { date });
  f.save("sleep", "poor");
  assert.equal(f.summary().stats.sleep.poor, 3);
  assert.equal(f.daily.notifications.length, 0);
  assert.equal(f.daily.alerts.filter((a) => a.kind === "sleep").length, 1);
});
test("记录覆盖与睡眠均值只计算已知样本，不把缺失当正常", () => {
  const f = fixture();
  f.save("sleep", "good", { hours: 8 });
  f.save("mood", "calm");
  f.save("sleep", "poor", {
    date: "2026-09-11",
    reporter: "family",
    hours: "",
  });
  const s = f.summary();
  assert.equal(s.recordedDays, 2);
  assert.equal(s.stats.sleep.meanHours, 8);
  assert.equal(s.stats.sleep.hoursSamples, 1);
  assert.equal(s.stats.medication.total, 0);
  assert.equal(s.grid.filter((d) => !d.records.length).length, 5);
});
test("日期与数值验证失败不污染记录", () => {
  const f = fixture();
  for (const date of ["2026-09-30", "2026-02-30", "2025-01-01"])
    assert.throws(() => f.save("sleep", "good", { date }), /有效记录日期/);
  assert.throws(() => f.save("sleep", "good", { hours: 25 }), /0 到 24/);
  assert.equal(f.daily.records.length, 0);
});
test("更新记录保留原始重要历史，不悄悄解除风险", () => {
  const f = fixture();
  f.save("medication", "missed");
  f.save("medication", "taken");
  const s = f.summary();
  assert.equal(latestRecords(f.daily.records).length, 1);
  assert.equal(s.stats.medication.missed, 0);
  assert.equal(s.stats.medication.taken, 1);
  assert.equal(s.importantHistory.length, 1);
  assert.match(summaryMarkdown(s), /家属确认漏服/);
  assert.equal(f.daily.alerts[0].status, "open");
  assert.match(f.daily.alerts[0].context, /已有更新/);
  assert.equal(f.daily.notifications.length, 1);
});
test("风险结案同步日常提醒状态，新异常可再次提醒", () => {
  const f = fixture();
  f.save("behavior", "wandering");
  const firstId = f.event.id;
  assert.throws(
    () =>
      f.engine.reviewDaily({
        runId: f.engine.state.runId,
        alertId: f.daily.alerts[0].id,
        note: "已核实",
      }),
    /事件中/,
  );
  f.command("review_claim");
  f.command("close", {
    reason: "confirmed_safe",
    note: "演示：家属找到并核实。",
  });
  assert.equal(f.daily.alerts[0].status, "reviewed");
  f.advance(1);
  assert.equal(f.daily.notifications.length, 1);
  f.save("behavior", "wandering");
  assert.notEqual(f.event.id, firstId);
  assert.equal(f.daily.notifications.length, 2);
  f.advance(1);
  assert.equal(f.daily.notifications.length, 2);
});
test("家属风险队列去重，已有跌倒排在用药核实之前", () => {
  const f = fixture();
  f.save("medication", "missed");
  f.engine.createEvent("fall", "fall-2");
  const risks = familyRisks(f.engine.state);
  assert.equal(risks.length, 2);
  assert.equal(risks[0].kind, "fall");
});
test("样本载入保留缺失与来源，不发送历史通知或覆盖已有记录", () => {
  const f = fixture();
  f.engine.seedDaily({ runId: f.engine.state.runId });
  assert.equal(f.daily.records.length, 54);
  assert.equal(f.daily.notifications.length, 0);
  assert.ok(f.daily.records.every((r) => r.sourceMode === "simulated"));
  assert.equal(f.summary(14).recordedDays, 13);
  assert.throws(
    () => f.engine.seedDaily({ runId: f.engine.state.runId }),
    /已有日常记录/,
  );
});
test("旧存档可迁移，新增记录与补充能重启恢复，复位拒绝旧消息", () => {
  const dir = mkdtempSync(join(tmpdir(), "yiban-daily-"));
  try {
    const file = join(dir, "state.json"),
      f = fixture(undefined, { file });
    const legacy = JSON.parse(readFileSync(file));
    delete legacy.daily;
    writeFileSync(file, JSON.stringify(legacy));
    const restored = fixture(undefined, { file });
    assert.equal(restored.daily.records.length, 0);
    restored.save("mood", "calm");
    const again = fixture(undefined, { file });
    assert.equal(again.daily.records.length, 1);
    const runId = again.engine.state.runId;
    again.engine.reset({ runId });
    assert.throws(
      () =>
        again.engine.saveDaily({
          runId,
          kind: "mood",
          value: "calm",
          reporter: "patient",
          requestId: "old",
        }),
      /场次已更新/,
    );
    assert.equal(again.daily.records.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("后续较轻的变化不降级原紧急提醒，重复检查不会循环写记录", () => {
  const f = fixture();
  f.save("behavior", "sudden_change");
  f.save("behavior", "noticeable_change");
  assert.equal(f.daily.alerts[0].priority, "urgent");
  assert.match(f.daily.alerts[0].title, /突然/);
  assert.match(f.daily.alerts[0].context, /原高优先级/);
  const version = f.daily.version;
  f.engine.tick();
  f.engine.tick();
  assert.equal(f.daily.version, version);
  assert.equal(f.daily.notifications.length, 1);
});
test("日常状态被更新后，就诊摘要仍包括原记录上的家属补充", () => {
  const f = fixture();
  f.save("sleep", "poor", { reporter: "patient" });
  const r = f.daily.records[0];
  f.engine.supplementDaily({
    runId: f.engine.state.runId,
    recordId: r.id,
    version: r.version,
    note: "凌晨两次醒来，家属陪伴。",
  });
  f.save("sleep", "good", { reporter: "patient" });
  const s = f.summary();
  assert.equal(s.familyAdditions, 1);
  assert.equal(s.supplements.length, 1);
  assert.match(summaryMarkdown(s), /凌晨两次醒来/);
});
test("患者更新睡眠感受时保留家属已填的同晚时长", () => {
  const f = fixture();
  f.save("sleep", "poor", { hours: 6 });
  f.save("sleep", "good", { reporter: "patient" });
  assert.equal(f.summary().stats.sleep.meanHours, 6);
  assert.equal(latestRecords(f.daily.records)[0].reporter, "patient");
});

test("并发日常风险优先展示高风险，结案一个后继续展示未处理事件", () => {
  const f = fixture();
  f.save("medication", "missed");
  const med = f.event.id;
  f.save("behavior", "wandering");
  assert.equal(f.engine.state.activeId, f.event.id);
  assert.notEqual(f.engine.state.activeId, med);
  f.command("review_claim");
  f.command("close", {
    reason: "confirmed_safe",
    note: "演示：已找到并核实。",
  });
  assert.equal(f.engine.state.activeId, med);
  assert.equal(
    f.engine.state.events.find((e) => e.id === med).status,
    "escalated",
  );
});
