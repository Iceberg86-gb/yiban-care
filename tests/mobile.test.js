import test from "node:test";
import assert from "node:assert/strict";
import { CareEngine } from "../server/engine.js";
import { mobileAction } from "../server/mobile.js";
import { medicationOverview, CARE_PROFILE } from "../shared/mobile.js";
function setup() {
  let now = Date.parse("2026-09-12T02:00:00Z");
  const e = new CareEngine({ now: () => now });
  const cmd = (action, rest = {}) =>
    mobileAction(e, {
      runId: e.state.runId,
      action,
      demoId: e.state.mobile.demo?.id,
      ...rest,
    });
  const advance = (ms) => {
    now += ms;
    e.tick();
  };
  return { e, cmd, advance };
}
test("跌倒动画先播放，6.5秒后才检测；暂停同时冻结确认时限且只产生一个事件", () => {
  const { e, cmd, advance } = setup();
  cmd("start", { kind: "fall" });
  advance(4000);
  assert.equal(e.state.events.length, 0);
  cmd("pause");
  advance(60000);
  assert.equal(e.state.events.length, 0);
  cmd("resume");
  advance(2500);
  assert.equal(e.state.events.length, 1);
  let ev = e.state.events[0];
  assert.equal(ev.status, "confirming");
  const deadline = ev.confirmDeadline;
  cmd("pause");
  advance(60000);
  assert.equal(e.state.events[0].status, "confirming");
  cmd("resume");
  advance(8100);
  assert.equal(e.state.events[0].status, "escalated");
  assert.equal(e.state.events[0].confirmDeadline, deadline);
  assert.equal(e.state.events.length, 1);
});
test("切换与重置演示保留配置和已保存记录，旧场景控制请求被拒绝", () => {
  const { e, cmd, advance } = setup();
  e.state.home.careProfile = { ...CARE_PROFILE, salutation: "爸爸" };
  cmd("start", { kind: "fall" });
  const id = e.state.mobile.demo.id;
  advance(7000);
  cmd("start", { kind: "chat" });
  assert.equal(e.state.events[0].closeReason, "demo_reset");
  assert.equal(e.state.home.careProfile.salutation, "爸爸");
  assert.throws(() => cmd("pause", { demoId: id }), /演示已切换/);
  cmd("reset");
  assert.equal(e.state.mobile.demo, null);
  assert.equal(e.state.home.monitor.pose, "站立");
});
test("用药收到提醒不等于服药；动作线索候选由家属核实后写入记录", () => {
  const { e, cmd, advance } = setup();
  cmd("start", { kind: "medication" });
  advance(1100);
  cmd("seen");
  assert.equal(e.state.daily.records.length, 0);
  const t = e.state.home.routineTasks[0];
  assert.ok(t);
  e.medicationEvidence({
    runId: e.state.runId,
    action: "sequence",
    occurrenceId: t.occurrenceId,
  });
  assert.equal(medicationOverview(e.snapshot(), e.now(), 7).pending, 1);
  e.medicationEvidence({
    runId: e.state.runId,
    action: "confirm",
    occurrenceId: t.occurrenceId,
  });
  const s = medicationOverview(e.snapshot(), e.now(), 7);
  assert.equal(s.confirmed, 1);
  assert.equal(s.pending, 0);
  cmd("reset");
  assert.equal(e.state.daily.records.length, 1);
  advance(200000);
  assert.equal(e.state.home.routineTasks.filter((x) => x.eventId).length, 0);
});
test("路线回放按时推进并触发位置事件，暂停时位置保持不动", () => {
  const { e, cmd, advance } = setup();
  cmd("start", { kind: "location" });
  advance(1500);
  const count = e.state.home.map.points.length;
  cmd("pause");
  advance(50000);
  assert.equal(e.state.home.map.points.length, count);
  cmd("resume");
  for (let i = 0; i < 7; i++) advance(2000);
  const ev = e.state.events.find((e) => e.type === "location");
  assert.ok(ev);
  assert.equal(ev.mobileDemoId, e.state.mobile.demo.id);
  assert.equal(e.state.mobile.demo.eventId, ev.id);
});
test("支持新增血压计并持久化作息，非法值不会部分写入", () => {
  const { e } = setup();
  e.saveHome({
    runId: e.state.runId,
    version: e.state.home.configVersion,
    section: "device",
    value: {
      name: "电子血压计",
      type: "pressure",
      zone: "卧室",
      online: false,
      enabled: true,
    },
  });
  assert.equal(e.state.home.devices.at(-1).type, "pressure");
  e.saveHome({
    runId: e.state.runId,
    version: e.state.home.configVersion,
    section: "careProfile",
    value: { ...CARE_PROFILE, wake: "08:00" },
  });
  assert.equal(e.state.home.careProfile.wake, "08:00");
  assert.throws(
    () =>
      e.saveHome({
        runId: e.state.runId,
        version: e.state.home.configVersion,
        section: "careProfile",
        value: { ...CARE_PROFILE, wake: "33:00" },
      }),
    /有效/,
  );
  assert.equal(e.state.home.careProfile.wake, "08:00");
});
test("聊天由服务端保存，同一状态快照在患者和看护视图可重用", () => {
  const { e, cmd } = setup();
  cmd("chat", { text: "眼镜放在哪里" });
  const s = e.snapshot();
  assert.equal(s.mobile.chat.length, 2);
  assert.match(s.mobile.chat[1].text, /演示画面/);
});
test("手机演示不会接管或重置原有同类照护事件", () => {
  const { e, cmd, advance } = setup();
  e.homeScenario({ runId: e.state.runId, scenario: "fall" });
  const original = e.state.events[0].id;
  cmd("start", { kind: "fall" });
  advance(7000);
  assert.equal(e.state.events.length, 2);
  const originalStatus = e.state.events.find((ev) => ev.id === original).status;
  cmd("reset");
  assert.equal(
    e.state.events.find((ev) => ev.id === original).status,
    originalStatus,
  );
  assert.equal(
    e.state.events.filter((ev) => ev.closeReason === "demo_reset").length,
    1,
  );
});
test("用药计划未到期不计待核实，跨午夜宽限按完整时点计算", () => {
  const { e } = setup();
  e.state.daily.medicationPlan = {
    enabled: true,
    startDate: "2026-09-11",
    graceMinutes: 60,
    label: "晚间计划",
    slots: [
      { id: "morning", enabled: false, time: "08:00" },
      { id: "evening", enabled: true, time: "23:30" },
    ],
  };
  let s = medicationOverview(
    e.snapshot(),
    Date.parse("2026-09-11T16:10:00Z"),
    7,
  );
  assert.equal(s.pending, 0);
  s = medicationOverview(e.snapshot(), Date.parse("2026-09-11T16:40:00Z"), 7);
  assert.equal(s.pending, 1);
  assert.equal(s.missing[0].date, "2026-09-11");
});
test("暂停时拒绝推进时钟，旧runId也不能修改新场次", () => {
  const { e, cmd } = setup();
  cmd("start", { kind: "fall" });
  cmd("pause");
  assert.throws(
    () => e.advance({ runId: e.state.runId, seconds: 15 }),
    /先继续/,
  );
  const old = e.state.runId;
  e.reset({ runId: old });
  assert.throws(
    () => mobileAction(e, { runId: old, action: "start", kind: "fall" }),
    /场次已更新/,
  );
  assert.equal(e.state.pausedAt, null);
});

test("90秒完整演示自动完成双端流程，演示核实不覆盖日常记录", () => {
  const { e, cmd, advance } = setup();
  const prior = e.state.daily.records.length;
  cmd("tour_start");
  for (let i = 0; i < 179; i++) advance(500);
  assert.equal(e.state.mobile.tour.status, "running");
  advance(500);
  assert.equal(e.state.mobile.tour.status, "completed");
  assert.equal(e.state.mobile.tour.step, 20);
  assert.equal(e.state.mobile.tour.detail, null);
  assert.equal(e.state.daily.records.length, prior);
  assert.equal(e.state.mobile.demoRecords.length, 1);
  const events = e.state.events.filter(
    (x) => x.tourId === e.state.mobile.tour.id,
  );
  assert.equal(events.length, 2);
  assert.ok(events.every((x) => x.closeReason === "demo_completed"));
  assert.equal(medicationOverview(e.snapshot(), e.now(), 7).demoCount, 1);
});
test("完整演示暂停后不切换章节，继续后按原进度执行，重置会停止脚本", () => {
  const { e, cmd, advance } = setup();
  cmd("tour_start");
  advance(9000);
  const step = e.state.mobile.tour.step;
  cmd("pause");
  advance(300000);
  assert.equal(e.state.mobile.tour.step, step);
  cmd("resume");
  advance(2000);
  assert.equal(e.state.mobile.tour.step, step + 1);
  cmd("reset");
  advance(300000);
  assert.equal(e.state.mobile.tour, null);
  assert.equal(e.state.mobile.demo, null);
});
test("饮水设置生成日间提醒，重复保存不复制计划，关闭撤回未完成提醒", () => {
  const { e, advance } = setup();
  const save = (value) =>
    e.saveHome({
      runId: e.state.runId,
      version: e.state.home.configVersion,
      section: "careProfile",
      value,
    });
  const profile = {
    ...CARE_PROFILE,
    wake: "08:00",
    bed: "22:00",
    waterMinutes: 120,
    waterEnabled: true,
    salutation: "李叔",
  };
  save(profile);
  const plans = e.state.planner.plans.filter(
    (p) => p.managedBy === "mobile-hydration",
  );
  assert.equal(plans.length, 6);
  assert.deepEqual(
    plans.map((p) => p.schedule.time),
    ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
  );
  save(profile);
  assert.equal(e.state.planner.plans.length, 6);
  assert.ok(plans.every((p) => p.message.includes("李叔")));
  advance(2 * 3600000);
  assert.ok(e.state.planner.occurrences.length > 0);
  save({ ...profile, waterEnabled: false });
  assert.ok(e.state.planner.plans.every((p) => p.status === "cancelled"));
  assert.ok(e.state.planner.occurrences.every((o) => o.status === "withdrawn"));
});
test("饮水体验可在患者端收到一次提醒，称呼与语音偏好原子保存", () => {
  const { e, cmd, advance } = setup();
  e.saveHome({
    runId: e.state.runId,
    version: e.state.home.configVersion,
    section: "careProfile",
    value: {
      ...CARE_PROFILE,
      salutation: "陈爷爷",
      dialect: "四川话",
      voiceInputMode: "hold",
    },
  });
  cmd("hydration_preview");
  advance(1100);
  const o = e.state.planner.occurrences[0];
  assert.ok(o.message.includes("陈爷爷"));
  assert.equal(o.recipient, "patient");
  assert.equal(e.state.home.preferences.dialect, "四川话");
  assert.throws(() =>
    e.saveHome({
      runId: e.state.runId,
      version: e.state.home.configVersion,
      section: "careProfile",
      value: { ...CARE_PROFILE, salutation: "坏值", dialect: "未知方言" },
    }),
  );
  assert.equal(e.state.home.careProfile.salutation, "陈爷爷");
});
test("演示中关闭跌倒规则会暂停并说明原因，不会静默卡住或改回配置", () => {
  const { e, cmd, advance } = setup();
  cmd("tour_start");
  for (let i = 0; i < 72; i++) advance(500);
  e.state.home.rules.fall.enabled = false;
  advance(3000);
  assert.equal(e.state.mobile.tour.status, "paused");
  assert.match(e.state.mobile.tour.caption, /跌倒观察已关闭/);
  assert.equal(e.state.home.rules.fall.enabled, false);
});
test("较大安全区域仍可演示偏离位置异常，保留自定义范围", () => {
  const { e, cmd, advance } = setup();
  e.state.home.map.radius = 1000;
  e.state.home.map.tolerance = 200;
  cmd("start", { kind: "location" });
  for (let i = 0; i < 30; i++) advance(500);
  assert.ok(e.state.mobile.demo.eventId);
  assert.equal(e.state.home.map.radius, 1000);
  assert.equal(e.state.home.map.tolerance, 200);
});
