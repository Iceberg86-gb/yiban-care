import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CareEngine } from "../server/engine.js";
import { medicationDemo } from "../server/home.js";
import {
  mapFacts,
  homeReport,
  retrieveKnowledge,
  nextReportTime,
} from "../shared/home.js";
import {
  parseMedicalText,
  importMedical,
  confirmMedical,
  medicalDrafts,
  originalMedical,
  createShare,
  resolveShare,
  visitPayload,
} from "../server/medical.js";
import { encryptState, decryptState } from "../server/vault.js";
import { createAccessGate } from "../server/access.js";
import { createReportAgent } from "../server/report-agent.js";

const NOW = Date.parse("2026-09-12T02:00:00.000Z");
function fixture(options = {}) {
  let now = NOW;
  const engine = new CareEngine({ ...options, now: () => now });
  const f = {
    engine,
    get h() {
      return engine.state.home;
    },
    get event() {
      return engine.state.events[0];
    },
    advance(ms) {
      now += ms;
      engine.tick();
    },
    scenario(s = "fall") {
      engine.homeScenario({ runId: engine.state.runId, scenario: s });
    },
    map(mode) {
      engine.mapReplay({ runId: engine.state.runId, mode });
    },
    save(section, value) {
      engine.saveHome({
        runId: engine.state.runId,
        version: f.h.configVersion,
        section,
        value,
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
    now: () => now,
  };
  return f;
}
test("新监控8秒确认，一级全部触达，30秒追加二级，60秒急救提示", () => {
  const f = fixture();
  f.scenario();
  assert.equal(Date.parse(f.event.confirmDeadline) - NOW, 8000);
  f.advance(7999);
  assert.equal(f.event.status, "confirming");
  f.advance(1);
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.contacts.filter((c) => c.level === 1).length, 2);
  assert.equal(f.event.contacts.filter((c) => c.level === 3).length, 1);
  assert.equal(f.event.contacts.filter((c) => c.role === "medical").length, 1);
  f.advance(30000);
  assert.equal(f.event.contacts.filter((c) => c.level === 2).length, 2);
  f.advance(30000);
  assert.equal(f.event.emergencyActive, true);
  assert.ok(f.event.emergencyCard);
  assert.equal(f.h.commands.length, 0);
  const n = f.event.contacts.length;
  f.engine.tick();
  assert.equal(f.event.contacts.length, n);
});
test("一级成员接手后不再自动进入无人接手急救分支", () => {
  const f = fixture();
  f.scenario();
  f.advance(8000);
  f.command("claim", {
    taskId: f.event.contacts.find((c) => c.level === 1).id,
  });
  f.advance(61000);
  assert.equal(f.event.status, "handling");
  assert.notEqual(f.event.emergencyActive, true);
});
test("三级成员仅通报，不能冒充值守接手人", () => {
  const f = fixture();
  f.scenario();
  f.advance(8000);
  const member = f.event.contacts.find((c) => c.level === 3);
  assert.throws(() => f.command("claim", { taskId: member.id }), /仅接收通报/);
  assert.equal(f.event.assignee, null);
});
test("策略调整影响后续事件，不重置已有倒计时", () => {
  const f = fixture();
  f.scenario();
  const deadline = f.event.confirmDeadline;
  f.save("policy", { ...f.h.policy, confirmationSeconds: 15 });
  assert.equal(f.event.confirmDeadline, deadline);
  f.scenario("night_wandering");
  assert.equal(Date.parse(f.event.confirmDeadline) - NOW, 15000);
});
test("补充同类信号不会重复建事件或重新计时", () => {
  const f = fixture();
  f.scenario();
  const deadline = f.event.confirmDeadline;
  f.advance(2000);
  f.scenario("single_source");
  assert.equal(f.engine.state.events.length, 1);
  assert.equal(f.event.confirmDeadline, deadline);
});
test("灵敏度和开关真实影响演示候选，而非只改界面", () => {
  const f = fixture();
  f.save("rules", {
    ...f.h.rules,
    fall: { ...f.h.rules.fall, sensitivity: "medium" },
  });
  f.scenario("bend");
  assert.equal(f.engine.state.events.length, 0);
  assert.match(f.h.feed.at(-1).title, /未达/);
  f.save("rules", {
    ...f.h.rules,
    fall: { ...f.h.rules.fall, enabled: false },
  });
  assert.throws(() => f.scenario(), /已关闭/);
});
test("敏感区域不能绑定摄像头，配置校验有版本保护", () => {
  const f = fixture();
  assert.throws(
    () =>
      f.save("device", {
        name: "摄像头",
        type: "camera",
        zone: "卫生间",
        online: true,
        enabled: true,
      }),
    /敏感空间/,
  );
  const old = f.h.configVersion;
  f.save("preferences", { dialect: "四川话", nightEventOnly: true });
  assert.throws(
    () =>
      f.engine.saveHome({
        runId: f.engine.state.runId,
        version: old,
        section: "preferences",
        value: { dialect: "普通话" },
      }),
    /配置已更新/,
  );
});
test("成员配置至少保留一位一级责任人", () => {
  const f = fixture();
  const first = f.h.members.find((m) => m.id === "family");
  f.save("member", { ...first, enabled: false });
  assert.throws(
    () =>
      f.save("member", {
        ...f.h.members.find((m) => m.id === "son"),
        enabled: false,
      }),
    /一级联系人/,
  );
  assert.equal(f.h.members.filter((m) => m.level === 1 && m.enabled).length, 1);
});
test("设备指令明确为模拟回执，离线时失败", () => {
  const f = fixture();
  f.engine.deviceCommand({
    runId: f.engine.state.runId,
    kind: "tts",
    deviceId: "screen",
    text: "演示询问",
  });
  f.advance(1000);
  assert.equal(f.h.commands[0].status, "completed_simulated");
  f.save("device", {
    ...f.h.devices.find((d) => d.id === "screen"),
    online: false,
  });
  f.engine.deviceCommand({
    runId: f.engine.state.runId,
    kind: "talk",
    deviceId: "screen",
  });
  f.advance(1000);
  assert.equal(f.h.commands.at(-1).status, "failed");
});
test("误报原因保留为待验证资料，手动应用后仅演示校正", () => {
  const f = fixture();
  f.scenario("bend");
  f.command("review_claim");
  f.command("close", {
    reason: "false_alarm",
    note: "演示：弯腰拾物，家属确认误报。",
  });
  const c = f.h.corrections[0];
  assert.equal(c.applied, false);
  f.engine.applyCorrection({ runId: f.engine.state.runId, correctionId: c.id });
  f.scenario("bend");
  assert.equal(f.engine.state.events.length, 1);
  assert.match(f.h.feed.at(-1).detail, /未经过真实模型验证/);
});
test("常用路线回放可归档，保持围栏内时不产生告警", () => {
  const f = fixture();
  f.map("normal");
  for (let i = 0; i < 6; i++) f.advance(2000);
  assert.equal(f.engine.state.events.length, 0);
  assert.equal(f.h.map.trips.length, 1);
  assert.equal(f.h.map.trips[0].points.length, 6);
  assert.equal(mapFacts(f.h, f.now()).match, 100);
  assert.ok(f.h.map.trips[0].distance > 0);
});
test("偏离路线形成确认事件，夜间外出立即联络全部层级", () => {
  const f = fixture();
  f.map("deviation");
  for (let i = 0; i < 6; i++) f.advance(2000);
  assert.equal(f.event.type, "location");
  assert.equal(f.event.status, "confirming");
  const night = fixture();
  night.map("night");
  for (let i = 0; i < 6; i++) night.advance(2000);
  assert.equal(night.event.status, "escalated");
  assert.equal(night.event.contacts.filter((c) => c.memberId).length, 5);
  assert.equal(night.event.tier2Sent, true);
});
test("离腕和断连两分钟后告警，位置质量不冒充老人位置", () => {
  const f = fixture();
  f.map("off_wrist");
  assert.equal(mapFacts(f.h, f.now()).valid, false);
  f.advance(119000);
  assert.equal(f.engine.state.events.length, 0);
  f.advance(1000);
  assert.equal(f.event.type, "device_offline");
  assert.equal(f.event.location.known, false);
  f.advance(1000);
  assert.equal(f.engine.state.events.length, 1);
});
test("在设备管理关闭手环后地图也显示不可用", () => {
  const f = fixture();
  f.save("device", {
    ...f.h.devices.find((d) => d.id === "band"),
    online: false,
  });
  assert.equal(mapFacts(f.h, f.now()).valid, false);
});
test("新围栏能对当前可信样本触发确认，过期位置不触发", () => {
  const f = fixture();
  f.h.map.points = [
    { x: 200, y: 0, accuracy: 15, at: new Date(NOW).toISOString() },
  ];
  f.save("map", { radius: 100, tolerance: 80 });
  assert.equal(f.event.type, "location");
  const stale = fixture();
  stale.h.map.points = [
    { x: 200, y: 0, accuracy: 15, at: new Date(NOW - 180000).toISOString() },
  ];
  stale.save("map", { radius: 100, tolerance: 80 });
  assert.equal(stale.engine.state.events.length, 0);
});
test("复位隔离旧轨迹回放与事件", () => {
  const f = fixture();
  f.map("deviation");
  const runId = f.engine.state.runId;
  f.engine.reset({ runId });
  f.advance(10000);
  assert.equal(f.engine.state.events.length, 0);
  assert.equal(f.h.map.replay, null);
  assert.throws(
    () => f.engine.mapReplay({ runId, mode: "night" }),
    /场次已更新/,
  );
});
test("用药动作链只形成候选，家属核实后才写入记录", () => {
  const f = fixture();
  medicationDemo(f.engine, { runId: f.engine.state.runId });
  f.advance(1000);
  const o = f.engine.state.planner.occurrences[0];
  f.engine.medicationEvidence({
    runId: f.engine.state.runId,
    occurrenceId: o.id,
    action: "sequence",
  });
  assert.equal(f.engine.state.daily.records.length, 0);
  assert.equal(f.h.routineTasks[0].candidate, true);
  f.engine.medicationEvidence({
    runId: f.engine.state.runId,
    occurrenceId: o.id,
    action: "confirm",
  });
  assert.equal(f.engine.state.daily.records[0].reporter, "family");
  assert.equal(f.engine.state.daily.records[0].value, "taken");
  assert.equal(f.h.routineTasks[0].verified, true);
});
test("三次未核实提醒后升级家属，知道了不代替服药核实", () => {
  const f = fixture();
  medicationDemo(f.engine, { runId: f.engine.state.runId });
  f.advance(1000);
  let o = f.engine.state.planner.occurrences[0];
  f.engine.reminderAction({
    runId: f.engine.state.runId,
    occurrenceId: o.id,
    version: o.version,
    action: "acknowledge",
  });
  for (let i = 0; i < 3; i++) f.advance(30000);
  assert.equal(f.h.routineTasks[0].attempts, 3);
  assert.ok(f.h.routineTasks[0].eventId);
  assert.equal(f.engine.state.daily.records.length, 0);
  const n = f.engine.state.events.length;
  f.advance(30000);
  assert.equal(f.engine.state.events.length, n);
});
test("取消用药任务后停止追问，不再升级", () => {
  const f = fixture();
  medicationDemo(f.engine, { runId: f.engine.state.runId });
  f.advance(1000);
  const p = f.engine.state.planner.plans[0];
  f.engine.changeReminder({
    runId: f.engine.state.runId,
    planId: p.id,
    version: p.version,
    action: "cancel",
  });
  f.advance(120000);
  assert.equal(f.engine.state.events.length, 0);
});
test("疑似重复服药按同一用药项关联，不混淆不同任务", () => {
  const f = fixture();
  medicationDemo(f.engine, { runId: f.engine.state.runId });
  f.advance(1000);
  const first = f.engine.state.planner.occurrences[0];
  f.engine.medicationEvidence({
    runId: f.engine.state.runId,
    occurrenceId: first.id,
    action: "sequence",
  });
  medicationDemo(f.engine, { runId: f.engine.state.runId });
  f.advance(1000);
  const second = f.engine.state.planner.occurrences[1];
  f.engine.medicationEvidence({
    runId: f.engine.state.runId,
    occurrenceId: second.id,
    action: "sequence",
  });
  assert.equal(f.engine.state.events.length, 0);
  f.engine.medicationEvidence({
    runId: f.engine.state.runId,
    occurrenceId: first.id,
    action: "sequence",
  });
  assert.equal(f.event.scenario, "duplicate_medication");
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.priority, "urgent");
});
test("个人基线明确样本与模拟来源，空数据不产生健康分", () => {
  const f = fixture(),
    r = homeReport(f.engine.state, f.now(), 7);
  assert.equal(r.current.length, 7);
  assert.ok(r.metrics.some((m) => m.anomaly));
  assert.ok(r.metrics.every((m) => m.baselineN === 7));
  assert.equal(r.score.value, null);
  f.h.sensorHistory = [];
  const empty = homeReport(f.engine.state, f.now(), 30);
  assert.ok(empty.metrics.every((m) => m.value === null && !m.anomaly));
});
test("病历字段只从原文提取，不擅自补频率、剂量与时点", () => {
  const p = parseMedicalText(
    "诊断：示例诊断\n过敏史：待核实\n药品：示例药A；时间：08:00\n药品：示例药B；剂量：原文剂量；频率：每日；时间：09:00,21:00\n复诊：2026-10-10 10:00\n血压：132/78",
  );
  assert.equal(p.medications[0].frequency, "unspecified");
  assert.equal(p.medications[0].dose, "");
  assert.deepEqual(p.medications[1].times, ["09:00", "21:00"]);
  assert.equal(p.followUpDate, "2026-10-10");
  assert.equal(p.measurements.length, 1);
});
test("病历需核对后才能生成明确医嘱草稿，未明确频率不猜每日", async () => {
  const f = fixture(),
    dir = mkdtempSync(join(tmpdir(), "yiban-med-")),
    key = randomBytes(32);
  try {
    const r = await importMedical(
      f.engine,
      {
        runId: f.engine.state.runId,
        text: "药品：示例药A；时间：08:00",
        name: "演示资料",
      },
      { uploadDir: dir, key },
    );
    assert.throws(
      () =>
        medicalDrafts(f.engine, {
          runId: f.engine.state.runId,
          recordId: r.id,
        }),
      /先核对/,
    );
    confirmMedical(f.engine, {
      runId: f.engine.state.runId,
      recordId: r.id,
      version: r.version,
      reviewed: true,
      value: { ...r.parsed },
    });
    assert.throws(
      () =>
        medicalDrafts(f.engine, {
          runId: f.engine.state.runId,
          recordId: r.id,
        }),
      /频率与时间/,
    );
    const current = f.h.medicalRecords[0];
    confirmMedical(f.engine, {
      runId: f.engine.state.runId,
      recordId: r.id,
      version: current.version,
      reviewed: true,
      value: {
        ...current.confirmed,
        medications: current.confirmed.medications.map((m) => ({
          ...m,
          frequency: "daily",
        })),
        followUpDate: "2026-10-10",
        followUpTime: "09:00",
      },
    });
    medicalDrafts(f.engine, { runId: f.engine.state.runId, recordId: r.id });
    assert.equal(f.engine.state.planner.drafts.length, 2);
    assert.equal(f.engine.state.planner.plans.length, 0);
    const draft = f.engine.state.planner.drafts.find(
      (d) => d.category === "medication",
    );
    f.engine.activateReminder({
      runId: f.engine.state.runId,
      draftId: draft.id,
      version: draft.version,
    });
    assert.ok(f.engine.state.planner.plans[0].medicalItemId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("上传原文件加密保存，可用正确密钥恢复", async () => {
  const f = fixture(),
    dir = mkdtempSync(join(tmpdir(), "yiban-upload-")),
    key = randomBytes(32),
    text = "诊断：仅用于文件加密测试";
  try {
    const r = await importMedical(
      f.engine,
      {
        runId: f.engine.state.runId,
        name: "测试.txt",
        mime: "text/plain",
        base64: Buffer.from(text).toString("base64"),
      },
      { uploadDir: dir, key },
    );
    const stored = readFileSync(join(dir, r.fileId + ".json"), "utf8");
    assert.ok(!stored.includes(text));
    assert.equal(JSON.parse(stored).encryption, "AES-256-GCM");
    assert.equal(
      Buffer.from(
        originalMedical(f.engine, r.id, { uploadDir: dir, key }).base64,
        "base64",
      ).toString(),
      text,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("分层检索只使用已核对病历，保留来源与模式", () => {
  const f = fixture();
  f.h.medicalRecords = [
    {
      id: "unconfirmed",
      status: "needs_review",
      name: "不应被检索",
      text: "睡眠异常",
    },
    {
      id: "confirmed",
      status: "confirmed",
      name: "已核对资料",
      confirmed: { diagnoses: ["睡眠记录"], medications: [], measurements: [] },
    },
  ];
  const docs = retrieveKnowledge(f.h, ["nightWaking"]);
  assert.ok(!docs.some((d) => d.id === "unconfirmed"));
  assert.ok(docs.some((d) => d.id === "confirmed"));
  assert.ok(docs.some((d) => d.layer === "guideline" && d.url));
});
test("报告Agent不接受模型编造的事实或建议ID", async () => {
  const f = fixture(),
    agent = createReportAgent(f.engine, {
      key: "test-only",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        name: "select_report_focus",
                        arguments: JSON.stringify({
                          focus_ids: ["fake-diagnosis"],
                          suggestion_ids: ["double-dose"],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ),
    });
  await agent.generate({ runId: f.engine.state.runId, days: 7 });
  assert.equal(f.h.reportInterpretations.at(-1).mode, "template");
  assert.ok(
    !f.h.reportInterpretations.at(-1).focusIds.includes("fake-diagnosis"),
  );
});
test("运行存档AES-GCM迁移与重启恢复，错误密钥不静默重置", () => {
  const dir = mkdtempSync(join(tmpdir(), "yiban-vault-"));
  try {
    const file = join(dir, "state.json"),
      key = randomBytes(32),
      f = fixture({ file });
    f.scenario();
    const e = new CareEngine({ file, storageKey: key, now: () => NOW });
    const envelope = JSON.parse(readFileSync(file));
    assert.equal(envelope.encryption, "AES-256-GCM");
    assert.equal(envelope.events, undefined);
    assert.equal(decryptState(envelope, key).events.length, 1);
    assert.throws(
      () => new CareEngine({ file, storageKey: randomBytes(32) }),
      /无法解密/,
    );
    assert.equal(
      new CareEngine({ file, storageKey: key }).state.events.length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("访问口令与医生分享范围分别验证", () => {
  const gate = createAccessGate("test-code");
  assert.equal(gate.allowed(""), false);
  assert.equal(gate.login("wrong"), null);
  const token = gate.login("test-code");
  assert.equal(gate.allowed("yiban_session=" + token), true);
  assert.equal(gate.allowed("yiban_session=wrong"), false);
  assert.equal(createAccessGate("").allowed(""), true);
  const f = fixture();
  const result = createShare(f.engine, {
    runId: f.engine.state.runId,
    days: 7,
  });
  const share = resolveShare(f.engine, result.url.split("/").at(-1));
  assert.ok(share.payload.metrics);
  assert.equal(share.payload.devices, undefined);
  assert.equal(share.payload.members, undefined);
  assert.equal(share.payload.planner, undefined);
  share.active = false;
  assert.throws(
    () => resolveShare(f.engine, result.url.split("/").at(-1)),
    /失效/,
  );
});

test("默认周报与异常临时报告会保存快照，定时检查不会重复生成", () => {
  const f = fixture();
  f.scenario();
  assert.equal(f.h.reportHistory.filter((r) => r.kind === "event").length, 1);
  f.scenario();
  assert.equal(f.h.reportHistory.filter((r) => r.kind === "event").length, 1);
  const due = Date.parse(f.h.reportSchedule.nextAt);
  f.advance(due - NOW);
  assert.equal(f.h.reportHistory.filter((r) => r.kind === "weekly").length, 1);
  f.engine.tick();
  assert.equal(f.h.reportHistory.filter((r) => r.kind === "weekly").length, 1);
});
test("月报按北京时间跨月计算，切换周期会更新后续计划", () => {
  const f = fixture();
  assert.equal(nextReportTime(NOW, "monthly"), "2026-10-01T01:00:00.000Z");
  f.save("preferences", {
    dialect: "普通话",
    nightEventOnly: true,
    reportFrequency: "monthly",
  });
  assert.equal(f.h.reportSchedule.frequency, "monthly");
  assert.equal(f.h.reportSchedule.nextAt, "2026-10-01T01:00:00.000Z");
});
