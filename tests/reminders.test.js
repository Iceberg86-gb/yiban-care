import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CareEngine } from "../server/engine.js";
import { createPlannerAgent } from "../server/planner-agent.js";
import { createAgent } from "../server/agent.js";
import { parseReminderLanguage } from "../server/reminder-language.js";
import { validatePlan } from "../server/plans.js";
import { nextReminder, wallInstant, dueReminders } from "../shared/plans.js";

const NOW = Date.parse("2026-09-12T02:00:00.000Z");
function fixture(options = {}) {
  let now = NOW;
  const engine = new CareEngine({ now: () => now, ...options });
  const agent = createPlannerAgent(engine);
  const f = {
    engine,
    agent,
    get p() {
      return engine.state.planner;
    },
    get draft() {
      return engine.state.planner.drafts
        .filter((d) => d.status === "proposed")
        .at(-1);
    },
    get plan() {
      return engine.state.planner.plans.at(-1);
    },
    get occurrence() {
      return engine.state.planner.occurrences.at(-1);
    },
    now: () => now,
    advance(ms) {
      now += ms;
      engine.tick();
    },
    async chat(text, requestId = randomUUID()) {
      return agent.interpret({ runId: engine.state.runId, text, requestId });
    },
    activate() {
      engine.activateReminder({
        runId: engine.state.runId,
        draftId: f.draft.id,
        version: f.draft.version,
      });
    },
    change(action, extra = {}) {
      engine.changeReminder({
        runId: engine.state.runId,
        planId: f.plan.id,
        version: f.plan.version,
        action,
        ...extra,
      });
    },
    act(action, extra = {}) {
      engine.reminderAction({
        runId: engine.state.runId,
        occurrenceId: f.occurrence.id,
        version: f.occurrence.version,
        action,
        ...extra,
      });
    },
  };
  return f;
}
function replyTool(name, args) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    }),
  );
}

test("中文每天、明天、每周与相对时间可转为明确草稿", () => {
  const daily = parseReminderLanguage("每天晚上八点提醒周伯记录用药", {
    now: NOW,
  });
  assert.equal(daily.proposal.recipient, "patient");
  assert.deepEqual(daily.proposal.schedule, { type: "daily", time: "20:00" });
  const once = parseReminderLanguage("明天上午九点提醒我整理就诊摘要", {
    now: NOW,
  });
  assert.equal(once.proposal.schedule.at, "2026-09-13T01:00:00.000Z");
  const weekly = parseReminderLanguage("每周三下午三点半提醒我查看照护记录", {
    now: NOW,
  });
  assert.deepEqual(weekly.proposal.schedule, {
    type: "weekly",
    time: "15:30",
    weekdays: [3],
  });
  const relative = parseReminderLanguage("十分钟后提醒我喝水", { now: NOW });
  assert.equal(relative.proposal.schedule.at, "2026-09-12T02:10:00.000Z");
});
test("时间含糊时询问，补充后保留事项和重复方式", () => {
  const first = parseReminderLanguage("每天八点提醒我喝水", { now: NOW });
  assert.equal(first.kind, "clarify");
  assert.equal(first.context.repeat, "daily");
  const second = parseReminderLanguage("晚上八点", {
    now: NOW,
    context: first.context,
  });
  assert.equal(second.proposal.title, "喝水");
  assert.equal(second.proposal.schedule.time, "20:00");
});
test("草稿可继续用语言改时间，24小时格式不继承旧晚上时段", () => {
  const first = parseReminderLanguage("每天晚上八点提醒我记录睡眠", {
    now: NOW,
  });
  const second = parseReminderLanguage("改成晚上九点", {
    now: NOW,
    context: first.context,
  });
  assert.equal(second.proposal.schedule.time, "21:00");
  const third = parseReminderLanguage("改成09:00", {
    now: NOW,
    context: second.context,
  });
  assert.equal(third.proposal.schedule.time, "09:00");
});
test("缺少频率、过去日期、多时间或否定请求不擅自安排", () => {
  for (const text of [
    "晚上八点提醒我喝水",
    "今天上午九点提醒我喝水",
    "每天晚上八点和九点提醒我记录",
    "取消每天晚上八点的提醒",
    "每天一分钟后提醒我喝水",
  ])
    assert.notEqual(
      parseReminderLanguage(text, { now: NOW }).kind,
      "proposal",
      text,
    );
});
test("工作日和下周日期按北京时间计算", () => {
  const weekdays = parseReminderLanguage("工作日上午九点提醒我喝水", {
    now: NOW,
  });
  assert.deepEqual(weekdays.proposal.schedule.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(weekdays.proposal.nextAt, "2026-09-14T01:00:00.000Z");
  const nextWeek = parseReminderLanguage("下周一上午九点提醒我复诊", {
    now: NOW,
  });
  assert.equal(nextWeek.proposal.schedule.at, "2026-09-14T01:00:00.000Z");
});
test("生成草稿不会开始提醒，启用与重复提交幂等", async () => {
  const f = fixture();
  await f.chat("一分钟后提醒我记录心情", "same-request");
  await f.chat("一分钟后提醒我记录心情", "same-request");
  assert.equal(f.p.messages.length, 2);
  assert.equal(f.p.plans.length, 0);
  assert.equal(f.p.drafts.length, 1);
  const draft = structuredClone(f.draft);
  f.activate();
  f.engine.activateReminder({
    runId: f.engine.state.runId,
    draftId: draft.id,
    version: draft.version,
  });
  assert.equal(f.p.plans.length, 1);
});
test("一次提醒按时触发且不把确认当成已服药", async () => {
  const f = fixture();
  await f.chat("一分钟后提醒周伯记录用药");
  f.activate();
  f.advance(59000);
  assert.equal(f.p.occurrences.length, 0);
  f.advance(1000);
  assert.equal(f.occurrence.status, "pending");
  assert.equal(f.plan.status, "completed");
  assert.equal(dueReminders(f.engine.state, "patient").length, 1);
  assert.equal(dueReminders(f.engine.state, "family").length, 0);
  f.act("acknowledge");
  assert.equal(f.occurrence.status, "acknowledged");
  assert.equal(f.engine.state.daily.records.length, 0);
  f.advance(60000);
  assert.equal(f.p.occurrences.length, 1);
});
test("每日提醒触发后保存下一天，不因反复检查重复通知", async () => {
  const f = fixture();
  await f.chat("每天10:01提醒我喝水");
  f.activate();
  f.advance(60000);
  assert.equal(f.p.occurrences.length, 1);
  assert.equal(f.plan.nextAt, "2026-09-13T02:01:00.000Z");
  f.advance(500);
  assert.equal(f.p.occurrences.length, 1);
  f.advance(86400000);
  assert.equal(f.p.occurrences.length, 2);
});
test("延后只影响当前提醒，不修改原计划", async () => {
  const f = fixture();
  await f.chat("每天10:01提醒我喝水");
  f.activate();
  f.advance(60000);
  const next = f.plan.nextAt;
  f.act("snooze", { minutes: 5 });
  assert.equal(f.occurrence.status, "snoozed");
  assert.equal(f.plan.nextAt, next);
  f.advance(300000);
  assert.equal(f.occurrence.status, "pending");
  assert.equal(f.occurrence.attempt, 2);
  assert.equal(f.p.occurrences.length, 1);
});
test("暂停与取消会停止待确认、延后和未来提醒", async () => {
  const f = fixture();
  await f.chat("每天10:01提醒我喝水");
  f.activate();
  f.advance(60000);
  f.act("snooze", { minutes: 5 });
  f.change("pause");
  assert.equal(f.occurrence.status, "withdrawn");
  f.advance(600000);
  assert.equal(f.p.occurrences.length, 1);
  f.change("resume");
  assert.equal(f.plan.nextAt, "2026-09-13T02:01:00.000Z");
  f.change("cancel");
  f.advance(86400000);
  assert.equal(f.p.occurrences.length, 1);
});
test("一次计划暂停后时间已过，恢复时要求重新调整", async () => {
  const f = fixture();
  await f.chat("一分钟后提醒我喝水");
  f.activate();
  f.change("pause");
  f.advance(120000);
  assert.throws(() => f.change("resume"), /原定时间已过/);
  assert.equal(f.plan.status, "paused");
});
test("计划修改有版本校验，新时间替代旧时间", async () => {
  const f = fixture();
  await f.chat("每天10:01提醒我喝水");
  f.activate();
  const before = structuredClone(f.plan);
  f.change("edit", {
    plan: { ...f.plan, schedule: { type: "daily", time: "10:05" } },
  });
  assert.throws(
    () =>
      f.engine.changeReminder({
        runId: f.engine.state.runId,
        planId: before.id,
        version: before.version,
        action: "cancel",
      }),
    /计划已更新/,
  );
  f.advance(60000);
  assert.equal(f.p.occurrences.length, 0);
  f.advance(240000);
  assert.equal(f.p.occurrences.length, 1);
});
test("相同计划不能重复启用，已过期草稿不能启动", async () => {
  const f = fixture();
  await f.chat("每天晚上八点提醒我喝水");
  f.activate();
  await f.chat("每天晚上八点提醒我喝水");
  assert.throws(() => f.activate(), /已有相同/);
  await f.chat("一分钟后提醒我喝水");
  f.advance(120000);
  assert.throws(() => f.activate(), /时间已过/);
});
test("复位后，旧聊天结果和旧确认不能影响新场次", async () => {
  const f = fixture();
  await f.chat("一分钟后提醒我喝水");
  f.activate();
  f.advance(60000);
  const runId = f.engine.state.runId,
    occ = structuredClone(f.occurrence);
  f.engine.reset({ runId });
  assert.throws(
    () =>
      f.engine.reminderAction({
        runId,
        occurrenceId: occ.id,
        version: occ.version,
        action: "acknowledge",
      }),
    /场次已更新/,
  );
  assert.equal(f.p.plans.length, 0);
});
test("服务重启恢复计划，逾期仅补一条并推进下一次", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yiban-plans-"));
  try {
    const file = join(dir, "state.json"),
      f = fixture({ file });
    await f.chat("每天10:01提醒我记录用药");
    f.activate();
    const recovered = new CareEngine({ file, now: () => NOW + 3 * 86400000 });
    recovered.tick();
    assert.equal(recovered.state.planner.occurrences.length, 1);
    assert.equal(recovered.state.planner.occurrences[0].overdue, true);
    assert.match(recovered.state.planner.occurrences[0].message, /过期|过时/);
    recovered.tick();
    assert.equal(recovered.state.planner.occurrences.length, 1);
    const twice = new CareEngine({ file, now: () => NOW + 3 * 86400000 });
    twice.tick();
    assert.equal(twice.state.planner.occurrences.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("播报回执按真实回调记录并去重，不直接确认提醒", async () => {
  const f = fixture();
  await f.chat("一分钟后提醒我喝水");
  f.activate();
  f.advance(60000);
  const body = {
    runId: f.engine.state.runId,
    occurrenceId: f.occurrence.id,
    status: "completed",
    receiptId: "voice-1",
  };
  f.engine.reminderVoice(body);
  f.engine.reminderVoice(body);
  assert.equal(f.occurrence.voiceReceipts.length, 1);
  assert.equal(f.occurrence.status, "pending");
});
test("启用新计划不改变照护事件的紧急截止时间", async () => {
  const f = fixture();
  f.engine.start({ runId: f.engine.state.runId, scenario: "fall" });
  const deadline = f.engine.state.events[0].confirmDeadline;
  await f.chat("一分钟后提醒我喝水");
  f.activate();
  assert.equal(f.engine.state.events[0].confirmDeadline, deadline);
  f.advance(60000);
  assert.equal(f.engine.state.events[0].status, "escalated");
  assert.equal(f.p.occurrences.length, 1);
});
test("本地解析标明来源，没有虚构千帆调用", async () => {
  const f = fixture();
  await f.chat("明天上午九点提醒我整理就诊摘要");
  assert.equal(f.p.messages.at(-1).mode, "local");
  assert.match(f.p.messages.at(-1).source, /未配置千帆/);
  assert.equal(f.agent.status().verified, false);
  assert.ok(!f.p.logs.some((l) => l.origin === "qianfan"));
});
test("千帆受控工具返回草稿，仍需启用才有计划", async () => {
  const f = fixture(),
    a = createPlannerAgent(f.engine, {
      key: "test-only",
      fetcher: async () =>
        replyTool("propose_reminder", {
          title: "喝水",
          category: "custom",
          recipient: "family",
          repeat: "daily",
          time: "20:00",
        }),
    });
  await a.interpret({
    runId: f.engine.state.runId,
    requestId: "q1",
    text: "每天晚上八点提醒我喝水",
  });
  assert.equal(f.draft.origin, "qianfan");
  assert.equal(a.status().verified, true);
  assert.equal(f.p.plans.length, 0);
  assert.ok(
    f.p.logs.some(
      (l) => l.tool === "planner_request" && l.status === "completed",
    ),
  );
});
test("未授权模型工具被拒绝，不直接更改计划或截止时间", async () => {
  const f = fixture(),
    a = createPlannerAgent(f.engine, {
      key: "test-only",
      fetcher: async () => replyTool("activate_reminder", { title: "错误" }),
    });
  await a.interpret({
    runId: f.engine.state.runId,
    requestId: "q2",
    text: "每天晚上八点提醒我喝水",
  });
  assert.equal(f.p.plans.length, 0);
  assert.ok(f.p.logs.some((l) => l.status === "rejected"));
  assert.equal(f.draft.origin, "local");
});
test("模型失败降级不阻止已启用的计划到点触发", async () => {
  const f = fixture();
  await f.chat("一分钟后提醒我喝水");
  f.activate();
  const a = createPlannerAgent(f.engine, {
    key: "test-only",
    fetcher: async () => {
      f.advance(60000);
      return new Response("{}", { status: 503 });
    },
  });
  await a.interpret({
    runId: f.engine.state.runId,
    requestId: "failed",
    text: "明天上午九点提醒我整理就诊摘要",
  });
  assert.equal(f.p.occurrences.length, 1);
  assert.equal(f.draft.origin, "local");
  assert.equal(a.status().lastResult, "failed");
});
test("模型结果晚于新的请求时，不覆盖新的草稿", async () => {
  const f = fixture();
  let release;
  const a = createPlannerAgent(f.engine, {
    key: "test-only",
    fetcher: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const old = a.interpret({
    runId: f.engine.state.runId,
    requestId: "old",
    text: "每天晚上八点提醒我喝水",
  });
  await f.chat("每天晚上九点提醒我记录心情", "new");
  const id = f.draft.id;
  release(
    replyTool("propose_reminder", {
      title: "喝水",
      category: "custom",
      recipient: "family",
      repeat: "daily",
      time: "20:00",
    }),
  );
  await old;
  assert.equal(f.draft.id, id);
  assert.equal(f.p.requests[0].status, "superseded");
});
test("模型等待期间复位，迟到响应被丢弃", async () => {
  const f = fixture();
  let release;
  const a = createPlannerAgent(f.engine, {
    key: "test-only",
    fetcher: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const old = a.interpret({
    runId: f.engine.state.runId,
    requestId: "reset",
    text: "每天晚上八点提醒我喝水",
  });
  f.engine.reset({ runId: f.engine.state.runId });
  release(
    replyTool("propose_reminder", {
      title: "喝水",
      category: "custom",
      recipient: "family",
      repeat: "daily",
      time: "20:00",
    }),
  );
  await old;
  assert.equal(f.p.drafts.length, 0);
  assert.equal(f.p.messages.length, 0);
});
test("模型等待期间提醒时间已过，转澄清而不是保存无效草稿", async () => {
  const f = fixture();
  const a = createPlannerAgent(f.engine, {
    key: "test-only",
    fetcher: async () => {
      f.advance(120000);
      return replyTool("propose_reminder", {
        title: "喝水",
        category: "custom",
        recipient: "family",
        repeat: "once",
        delay_minutes: 1,
      });
    },
  });
  await a.interpret({
    runId: f.engine.state.runId,
    requestId: "late",
    text: "一分钟后提醒我喝水",
  });
  assert.equal(f.draft, undefined);
  assert.equal(f.p.messages.at(-1).question, true);
  assert.equal(f.p.requests.at(-1).status, "completed");
});
test("日期时间验证拒绝不存在日期、过去时间和无效星期", () => {
  assert.throws(() => wallInstant("2026-02-30", "09:00"), /日期无效/);
  assert.throws(
    () =>
      validatePlan(
        {
          title: "喝水",
          category: "custom",
          recipient: "family",
          schedule: { type: "once", at: "2026-09-12T01:00:00.000Z" },
        },
        NOW,
        "Asia/Shanghai",
      ),
    /时间已过/,
  );
  assert.throws(
    () =>
      validatePlan(
        {
          title: "喝水",
          category: "custom",
          recipient: "family",
          schedule: { type: "weekly", time: "09:00", weekdays: [0] },
        },
        NOW,
        "Asia/Shanghai",
      ),
    /星期/,
  );
});
test("共享千帆接入状态可反映计划 Agent 的真实调用验证", async () => {
  const f = fixture(),
    a = createAgent(f.engine, {
      key: "test-only",
      fetcher: async () =>
        replyTool("propose_reminder", {
          title: "喝水",
          category: "custom",
          recipient: "family",
          repeat: "daily",
          time: "20:00",
        }),
    });
  await a.plan({
    runId: f.engine.state.runId,
    requestId: "shared",
    text: "每天晚上八点提醒我喝水",
  });
  assert.equal(a.status().verified, true);
  assert.equal(a.status().planner.verified, true);
});
test("旧存档迁移保留事件，未完成的理解请求标为中断", () => {
  const dir = mkdtempSync(join(tmpdir(), "yiban-plan-migration-"));
  try {
    const file = join(dir, "state.json"),
      f = fixture({ file });
    const state = JSON.parse(readFileSync(file));
    delete state.planner;
    writeFileSync(file, JSON.stringify(state));
    const migrated = new CareEngine({ file });
    assert.equal(migrated.state.runId, f.engine.state.runId);
    assert.equal(migrated.state.planner.plans.length, 0);
    migrated.state.planner.requests.push({
      id: "pending",
      status: "running",
      text: "未完成",
    });
    migrated.persist();
    const recovered = new CareEngine({ file });
    assert.equal(recovered.state.planner.requests[0].status, "interrupted");
    assert.match(recovered.state.planner.messages.at(-1).text, /服务重启/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
