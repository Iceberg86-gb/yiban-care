import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CareEngine } from "../server/engine.js";
import { createAgent } from "../server/agent.js";

function fixture(options = {}) {
  let clock = Date.parse("2026-09-12T10:00:00Z");
  const engine = new CareEngine({ now: () => clock, ...options });
  return {
    engine,
    get event() {
      return engine.state.events[0];
    },
    start(scenario = "fall", sourceEventId = "input-1") {
      engine.start({ runId: engine.state.runId, scenario, sourceEventId });
    },
    advance(ms) {
      clock += ms;
      engine.tick();
    },
    command(action, payload = {}, version = this.event.version) {
      engine.action({
        runId: engine.state.runId,
        eventId: this.event.id,
        version,
        action,
        payload,
      });
    },
    clock: () => clock,
  };
}

test("确认超时会升级；送达不会自动接手", () => {
  const f = fixture();
  f.start();
  f.advance(1500);
  assert.equal(f.event.confirmation.promptStatus, "completed");
  assert.equal(f.event.confirmation.captureStatus, "active");
  f.advance(44000);
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.confirmation.responseStatus, "no_response");
  assert.deepEqual(
    f.event.contacts.map((c) => c.role),
    ["family", "medical"],
  );
  f.advance(2000);
  assert.ok(f.event.contacts.every((c) => c.deliveryStatus === "delivered"));
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.assignee, null);
});
test("暂不需要帮助保留原截止时间，核实超时仍升级", () => {
  const f = fixture();
  f.start();
  const deadline = f.event.confirmDeadline;
  f.advance(10000);
  f.command("respond", { response: "no_help_claimed" });
  assert.equal(f.event.status, "review_required");
  assert.equal(f.event.confirmDeadline, deadline);
  f.advance(35000);
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.confirmation.responseStatus, "no_help_claimed");
});
test("明确求助无需等待计时立即升级", () => {
  const f = fixture();
  f.start();
  f.command("respond", { response: "help_requested" });
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.contacts.length, 2);
});
test("收音故障记录 unknown 并升级，不能伪装成未回应", () => {
  const f = fixture();
  f.start();
  const deadline = f.event.confirmDeadline;
  f.command("channel_failed");
  f.advance(50000);
  assert.equal(f.event.confirmation.captureStatus, "failed");
  assert.equal(f.event.confirmation.responseStatus, "unknown");
  assert.equal(f.event.confirmDeadline, deadline);
});
test("预设麦克风故障在模拟终端回执时触发", () => {
  const f = fixture();
  f.engine.fault({
    runId: f.engine.state.runId,
    name: "microphone",
    enabled: true,
  });
  f.start();
  f.advance(1500);
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.confirmation.responseStatus, "unknown");
});
test("家人接手后持续检查进展，不自动结案", () => {
  const f = fixture();
  f.start();
  f.command("respond", { response: "help_requested" });
  f.command("claim", {
    taskId: f.event.contacts.find((c) => c.role === "family").id,
  });
  assert.equal(f.event.status, "handling");
  assert.equal(f.event.assignee, "周宁");
  f.advance(61000);
  assert.equal(f.event.status, "handling");
  assert.equal(f.event.reminderCount, 1);
  assert.ok(f.event.contacts.some((c) => c.role === "backup"));
  const deadline = f.event.progressDeadline;
  f.advance(4000);
  f.command("progress", { text: "已到达现场" });
  assert.ok(f.event.progressDeadline > deadline);
  assert.equal(f.event.progress[0].source, "家人手动报告");
});
test("未接手时联络备用责任人，重复 tick 不重复建任务", () => {
  const f = fixture();
  f.start();
  f.advance(45000);
  f.advance(31000);
  assert.equal(f.event.contacts.filter((c) => c.role === "backup").length, 1);
  f.advance(90000);
  assert.equal(f.event.contacts.filter((c) => c.role === "backup").length, 1);
});
test("竞争接手通过版本校验拒绝旧请求", () => {
  const f = fixture();
  f.start();
  f.advance(45000);
  f.advance(31000);
  const version = f.event.version;
  f.command(
    "claim",
    { taskId: f.event.contacts.find((c) => c.role === "family").id },
    version,
  );
  assert.throws(
    () =>
      f.command(
        "claim",
        { taskId: f.event.contacts.find((c) => c.role === "backup").id },
        version,
      ),
    /刚刚有更新/,
  );
  assert.equal(f.event.assignee, "周宁");
});
test("医疗接单独立记录，不替代家人接手", () => {
  const f = fixture();
  f.start();
  f.advance(45000);
  f.command("claim", {
    taskId: f.event.contacts.find((c) => c.role === "medical").id,
  });
  assert.equal(f.event.assignee, null);
  assert.equal(f.event.status, "escalated");
  assert.ok(f.event.contacts.find((c) => c.role === "medical").receipt);
});
test("送达结果未知先核查，不能盲目重发", () => {
  const f = fixture();
  f.engine.fault({
    runId: f.engine.state.runId,
    name: "notification",
    enabled: true,
  });
  f.start("location");
  f.advance(45000);
  f.advance(2000);
  const task = f.event.contacts[0];
  assert.equal(task.deliveryStatus, "unknown");
  f.advance(2000);
  assert.equal(f.event.contacts.length, 1);
  f.command("resolve_receipt", { taskId: task.id });
  assert.equal(f.event.contacts[0].deliveryStatus, "delivered");
  assert.equal(f.event.contacts.length, 1);
});
test("结案需要责任人、核实记录与明确的医疗任务处理", () => {
  const f = fixture();
  f.start();
  assert.throws(
    () => f.command("close", { reason: "confirmed_safe", note: "到场核实" }),
    /先接手/,
  );
  f.command("respond", { response: "help_requested" });
  f.command("review_claim");
  assert.throws(
    () => f.command("close", { reason: "confirmed_safe", note: "到场核实" }),
    /医疗协助/,
  );
  f.command("close", {
    reason: "confirmed_safe",
    note: "家人到场，演示核实安全。",
    medicalResolution: "cancelled_after_review",
  });
  assert.equal(f.event.status, "closed");
  assert.equal(f.event.closeReason, "confirmed_safe");
  assert.equal(
    f.event.contacts.find((c) => c.role === "medical").resolution,
    "cancelled_after_review",
  );
  const count = f.event.timeline.length;
  f.advance(600000);
  assert.equal(f.event.timeline.length, count);
});
test("责任移交必须存在机构接单回执，且不展示为确认安全", () => {
  const f = fixture();
  f.start();
  f.advance(45000);
  f.command("review_claim");
  assert.throws(
    () => f.command("close", { reason: "care_transferred", note: "已移交" }),
    /接单回执/,
  );
  f.command("claim", {
    taskId: f.event.contacts.find((c) => c.role === "medical").id,
  });
  f.command("close", {
    reason: "care_transferred",
    note: "模拟机构已确认接收责任。",
  });
  assert.equal(f.event.closeReason, "care_transferred");
  assert.equal(f.event.transferReceiver, "模拟值班服务台");
});
test("重复来源事件去重，重叠情境被拒绝", () => {
  const f = fixture();
  f.start();
  f.start();
  assert.equal(f.engine.state.events.length, 1);
  assert.throws(() => f.start("location", "new"), /先处理当前事件/);
  assert.equal(f.engine.state.events.length, 1);
});
test("复位隔离旧场次回应与摘要", () => {
  const f = fixture();
  f.start();
  const e = structuredClone(f.event),
    runId = f.engine.state.runId;
  f.engine.reset({ runId });
  assert.throws(
    () =>
      f.engine.action({
        runId,
        eventId: e.id,
        version: e.version,
        action: "respond",
        payload: { response: "help_requested" },
      }),
    /场次已更新/,
  );
  assert.equal(
    f.engine.saveSummary(runId, e.id, { text: "迟到摘要" }, e.version),
    false,
  );
  assert.equal(f.engine.state.events.length, 0);
});
test("服务重启保留截止时间并恢复到期任务，恢复处理幂等", () => {
  const dir = mkdtempSync(join(tmpdir(), "yiban-engine-"));
  try {
    const file = join(dir, "state.json");
    const f = fixture({ file });
    f.start();
    const deadline = f.event.confirmDeadline;
    const id = f.event.id;
    const recovered = new CareEngine({ file, now: () => f.clock() + 50000 });
    recovered.tick();
    assert.equal(recovered.state.events[0].id, id);
    assert.equal(recovered.state.events[0].confirmDeadline, deadline);
    assert.equal(recovered.state.events[0].status, "escalated");
    assert.equal(recovered.state.events[0].contacts.length, 2);
    recovered.tick();
    assert.equal(recovered.state.events[0].contacts.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("保存失败回滚内存状态，不发布未保存状态", () => {
  let changes = 0;
  const f = fixture({ onChange: () => changes++ });
  f.start();
  const previous = f.engine.snapshot();
  f.engine.persist = () => {
    throw new Error("disk full");
  };
  assert.throws(
    () => f.command("respond", { response: "help_requested" }),
    /disk full/,
  );
  assert.deepEqual(f.engine.snapshot(), previous);
  assert.equal(changes, 1);
});
test("无效输入不污染状态", () => {
  const f = fixture();
  f.start();
  const previous = f.engine.snapshot();
  assert.throws(() => f.command("progress", { text: "已确认安全" }), /先接手/);
  assert.deepEqual(f.engine.snapshot(), previous);
});
test("慢表达在停顿后保留续句，确认联系家人后创建求助", () => {
  const f = fixture();
  f.start("speech");
  f.advance(1000);
  assert.equal(f.engine.state.expression.text, "我想……");
  f.advance(3000);
  assert.equal(f.engine.state.expression.status, "listening");
  f.advance(6000);
  assert.equal(f.engine.state.expression.text, "我想……找一下……我女儿。");
  assert.equal(f.engine.state.expression.status, "awaiting_confirmation");
  assert.equal(f.engine.state.events.length, 0);
  f.engine.requestHelp({ runId: f.engine.state.runId });
  assert.equal(f.event.type, "help");
  assert.equal(f.event.status, "escalated");
});
test("无凭证时交接卡使用明确标记的模板", async () => {
  const f = fixture();
  f.start();
  const a = createAgent(f.engine);
  await a.summarize(f.engine.state.runId, f.event.id);
  assert.equal(f.event.summary.mode, "template");
  assert.equal(a.status().verified, false);
  assert.ok(!f.event.agentLogs.some((l) => l.origin === "qianfan"));
  f.command("respond", { response: "no_help_claimed" });
  assert.equal(f.event.summary.stale, true);
});
test("千帆只读工具经过白名单，真实返回与来源被记录", async () => {
  const f = fixture();
  f.start();
  let calls = 0;
  const a = createAgent(f.engine, {
    key: "test-only",
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls++;
      if (calls === 1)
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "c1",
                      type: "function",
                      function: { name: "get_event_context", arguments: "{}" },
                    },
                    {
                      id: "c2",
                      type: "function",
                      function: { name: "close_event", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
        );
      assert.equal(body.messages.at(-1).role, "tool");
      assert.match(body.messages.at(-1).content, /拒绝/);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "周伯出现模拟疑似跌倒，正在确认，伤情未知。",
              },
            },
          ],
        }),
      );
    },
  });
  await a.summarize(f.engine.state.runId, f.event.id);
  assert.equal(calls, 2);
  assert.equal(f.event.summary.mode, "live");
  assert.equal(a.status().verified, true);
  assert.equal(f.event.status, "confirming");
  assert.ok(
    f.event.agentLogs.some(
      (l) => l.tool === "close_event" && l.status === "rejected",
    ),
  );
});
test("模型请求失败使用模板，基础升级照常执行", async () => {
  const f = fixture();
  f.start();
  const a = createAgent(f.engine, {
    key: "test-only",
    fetcher: async () => {
      f.advance(46000);
      return new Response("{}", { status: 503 });
    },
  });
  await a.summarize(f.engine.state.runId, f.event.id);
  assert.equal(f.event.status, "escalated");
  assert.equal(f.event.summary.mode, "template");
  assert.equal(f.event.summary.stale, true);
});
test("复位期间到达的模型响应被丢弃", async () => {
  const f = fixture();
  f.start();
  let release;
  const a = createAgent(f.engine, {
    key: "test-only",
    fetcher: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = a.summarize(f.engine.state.runId, f.event.id);
  f.engine.reset({ runId: f.engine.state.runId });
  release(
    new Response(
      JSON.stringify({ choices: [{ message: { content: "旧场次内容" } }] }),
    ),
  );
  await pending;
  assert.equal(f.engine.state.events.length, 0);
});

test("浏览器播放回执与模拟收音分开记录，并按来源去重", () => {
  const f = fixture();
  f.start();
  const data = {
    runId: f.engine.state.runId,
    eventId: f.event.id,
    status: "playing",
    sourceEventId: "tts-session-start",
  };
  f.engine.playback(data);
  const count = f.event.timeline.length;
  f.engine.playback(data);
  assert.equal(f.event.timeline.length, count);
  f.advance(2000);
  assert.equal(f.event.confirmation.promptStatus, "playing");
  assert.equal(f.event.confirmation.captureStatus, "active");
  f.engine.playback({
    ...data,
    status: "completed",
    sourceEventId: "tts-session-end",
  });
  assert.equal(f.event.confirmation.promptSource, "browser_tts");
  assert.equal(f.event.confirmation.captureSource, "simulated");
});

test("无凭证也可独立复现 Agent 故障注入", async () => {
  const f = fixture();
  f.start();
  f.engine.fault({ runId: f.engine.state.runId, name: "agent", enabled: true });
  await createAgent(f.engine).summarize(f.engine.state.runId, f.event.id);
  assert.match(f.event.summary.fallbackReason, /模拟 Agent 不可用/);
  assert.ok(f.event.agentLogs.some((l) => l.origin === "fault_injection"));
  assert.equal(f.event.status, "confirming");
});

test("连续复位使用递增场次序号，避免同毫秒旧快照覆盖", () => {
  const f = fixture();
  const initial = f.engine.state.generation;
  f.engine.reset({ runId: f.engine.state.runId });
  f.engine.reset({ runId: f.engine.state.runId });
  assert.equal(f.engine.state.generation, initial + 2);
});

test("结案只接受显式业务枚举，不接受对象继承属性", () => {
  const f = fixture();
  f.start("location");
  f.command("review_claim");
  assert.throws(
    () =>
      f.command("close", {
        reason: "constructor",
        note: "不能使用无效结案类型",
      }),
    /请选择结案原因/,
  );
  assert.equal(f.event.status, "handling");
});
