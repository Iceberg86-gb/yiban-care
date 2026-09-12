import { randomUUID } from "node:crypto";
import { CareError } from "./errors.js";
import { createHomeEvent, homeFeed, applyMedicationEvidence } from "./home.js";
import { TOUR_STEPS } from "../shared/mobile-tour.js";
import { beginWayfinding, wayfindingAction, routeChat } from "./wayfinding.js";
import { previewHydration } from "./mobile-reminders.js";
const iso = (n) => new Date(n).toISOString();

export function freshMobile() {
  return { demo: null, chat: [], reminderSeen: false };
}
function resume(engine) {
  if (engine.state.pausedAt != null) {
    engine.state.clockOffset = engine.state.pausedAt - engine.clock();
    engine.state.pausedAt = null;
  }
}
function retireDemo(engine) {
  const d = engine.state.mobile.demo;
  if (!d) return;
  for (const e of engine.state.events.filter(
    (e) => e.mobileDemoId === d.id && e.status !== "closed",
  )) {
    e.status = "closed";
    e.closedAt = iso(engine.now());
    e.closeReason = "demo_reset";
    e.closeNote = "演示已重置，未作安全判断。";
    e.version++;
    for (const c of e.contacts) {
      c.handlingStatus = "completed";
      c.resolution = "demo_reset";
    }
    engine.log(e, "本轮演示结束", e.closeNote, "演示控制", "demo");
  }
  const planIds = new Set(
    engine.state.planner.plans
      .filter((p) => p.mobileDemoId === d.id)
      .map((p) => p.id),
  );
  for (const p of engine.state.planner.plans.filter((p) => planIds.has(p.id))) {
    p.status = "cancelled";
    p.nextAt = null;
    p.version++;
  }
  for (const o of engine.state.planner.occurrences.filter((o) =>
    planIds.has(o.planId),
  )) {
    o.status = "withdrawn";
    o.version++;
  }
  engine.state.activeId =
    engine.state.events.find((e) => e.status !== "closed")?.id || null;
  if (
    engine.state.mobile.navigation &&
    ["confirming", "choosing", "guiding"].includes(
      engine.state.mobile.navigation.status,
    )
  ) {
    engine.state.mobile.navigation.status = "cancelled";
    engine.state.mobile.navigation.version++;
  }
  engine.state.home.map.replay = null;
  engine.state.home.monitor.pose = "站立";
}
export function mobileAction(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const m = (engine.state.mobile ||= freshMobile());
    if (
      ["pause", "resume", "reset"].includes(body.action) &&
      body.demoId !== m.demo?.id
    )
      throw new CareError("演示已切换，请使用当前场景。", 409);
    if (body.action === "pause") {
      if (!m.demo) throw new CareError("请先选择演示场景。");
      engine.state.pausedAt ??= engine.now();
      if (m.tour?.status === "running") m.tour.status = "paused";
    } else if (body.action === "resume") {
      resume(engine);
      if (m.tour?.status === "paused") {
        m.tour.status = "running";
        delete m.tour.error;
      }
    } else if (body.action === "reset") {
      retireDemo(engine);
      resume(engine);
      m.demo = null;
      m.tour = null;
      m.demoRecords = [];
      m.reminderSeen = false;
      m.reminderSnoozeUntil = null;
    } else if (body.action === "start") {
      m.tour = null;
      m.demoRecords = [];
      startScene(engine, body.kind);
    } else if (body.action === "tour_start") {
      if (!engine.state.home.rules.fall.enabled)
        throw new CareError("请先开启跌倒观察，再开始完整演示。");
      retireDemo(engine);
      resume(engine);
      m.demoRecords = [];
      m.tour = {
        id: randomUUID(),
        startedAt: iso(engine.now()),
        step: 0,
        status: "running",
        ...TOUR_STEPS[0],
      };
      startScene(engine, "chat");
    } else if (body.action === "hydration_preview") {
      previewHydration(engine);
    } else if (body.action === "snooze") {
      if (m.demo?.kind !== "medication")
        throw new CareError("当前没有用药提醒。");
      m.reminderSnoozeUntil = iso(engine.now() + 30000);
    } else if (body.action === "seen") {
      m.reminderSeen = true;
    } else if (body.action === "wayfinding") {
      wayfindingAction(engine, body);
    } else if (body.action === "chat") {
      const message = String(body.text || "")
        .trim()
        .slice(0, 500);
      if (!message) throw new CareError("请先输入想说的话。");
      if (routeChat(engine, message)) return;
      const response = /眼镜|找东西/.test(message)
        ? "别着急，我们一起找。演示画面中，眼镜在客厅茶几上，靠近蓝色水杯。"
        : /找到/.test(message)
          ? "找到就好。下次用完，我们还放在熟悉的位置。"
          : /散步|出去/.test(message)
            ? "好呀，您想沿着平时的社区花园路线走走吗？也可以先联系家人。"
            : /药/.test(message)
              ? "我们先一起核对今天的用药记录。不确定是否吃过时，可以请家人帮忙确认。"
              : /女儿|家人/.test(message)
                ? "我在这里。您可以点下方“联系家人”，让家人知道您需要陪伴。"
                : "我在听，您可以慢慢说。想聊聊今天，还是一起找找东西？";
      const salutation = engine.state.home.careProfile?.salutation || "周伯";
      m.chat.push(
        {
          id: randomUUID(),
          role: "user",
          text: message,
          at: iso(engine.now()),
        },
        {
          id: randomUUID(),
          role: "assistant",
          text: `${salutation}，${response}`,
          at: iso(engine.now()),
          source: "本地情境回复",
        },
      );
      m.chat = m.chat.slice(-60);
    } else throw new CareError("无效手机端操作。");
  });
}
export function tickMobile(engine) {
  const tourChanged = tickTour(engine);
  const d = engine.state.mobile?.demo;
  if (!d) return tourChanged;
  if (
    d.kind === "fall" &&
    !d.detected &&
    engine.now() - Date.parse(d.startedAt) >= 6500
  ) {
    const e = createHomeEvent(
      engine,
      "fall",
      "客厅场景模拟：老人失去平衡后倒地，低位持续；正在向本人确认。",
      { scenario: "fall", mobileDemoId: d.id },
    );
    e.mobileDemoId = d.id;
    d.detected = true;
    d.eventId = e.id;
    engine.state.home.monitor.pose = "低位姿态";
    engine.state.home.monitor.poseSince = iso(engine.now());
    return true;
  }
  if (
    d.kind === "location" &&
    !d.detected &&
    engine.state.home.map.geofenceEventId
  ) {
    const e = engine.state.events.find(
      (e) => e.id === engine.state.home.map.geofenceEventId,
    );
    if (e) {
      e.mobileDemoId = d.id;
      d.detected = true;
      d.eventId = e.id;
      return true;
    }
  }
  return tourChanged;
}

function startScene(engine, kind) {
  const m = engine.state.mobile;
  if (!["fall", "location", "medication", "chat", "wayfinding"].includes(kind))
    throw new CareError("无效场景。");
  if (kind === "fall" && !engine.state.home.rules.fall.enabled)
    throw new CareError("请先在危险行为设置中开启跌倒识别。");
  retireDemo(engine);
  resume(engine);
  const at = engine.now();
  m.demo = {
    id: randomUUID(),
    kind: kind,
    startedAt: iso(at),
    detected: false,
  };
  m.reminderSeen = false;
  m.reminderSnoozeUntil = null;
  if (kind === "wayfinding") beginWayfinding(engine);
  if (kind === "location") {
    const map = engine.state.home.map;
    map.online = true;
    map.worn = true;
    map.scenario = "deviation";
    map.geofenceEventId = null;
    map.points = [
      { x: 0, y: 0, at: iso(at), accuracy: 15, sourceMode: "simulated" },
    ];
    map.lastPositionAt = iso(at);
    map.replay = {
      runId: engine.state.runId,
      mode: "deviation",
      path: [
        { x: 0, y: 0 },
        { x: 90, y: 35 },
        { x: 130, y: 160 },
        { x: 220, y: 145 },
        { x: 245, y: 120 },
        { x: 260, y: 90 },
        { x: Math.max(420, map.radius + 100), y: 310 },
      ],
      index: 0,
      nextAt: iso(at + 1500),
      startedAt: iso(at),
      done: false,
    };
  }
  if (kind === "medication") {
    engine.state.planner.plans.push({
      id: randomUUID(),
      mobileDemoId: m.demo.id,
      version: 1,
      scheduleVersion: 1,
      status: "active",
      createdAt: iso(at),
      updatedAt: iso(at),
      title: "家人用药提醒",
      category: "medication",
      recipient: "patient",
      message: "周伯，到了计划用药时间，请按家人核对的方案服用。",
      schedule: { type: "once", at: iso(at + 1000) },
      timeZone: engine.state.daily.timeZone,
      nextAt: iso(at + 1000),
      origin: "simulated-care",
      draftId: null,
      lastAt: null,
    });
    engine.state.planner.version++;
  }
  homeFeed(
    engine,
    "开始手机场景演示",
    {
      fall: "客厅疑似跌倒",
      location: "偏离日常路线",
      wayfinding: "确认目的地与全程语音陪同",
      medication: "用药提醒与核实",
      chat: "小安日常陪伴",
    }[kind],
  );
}

function tickTour(engine) {
  const m = engine.state.mobile,
    t = m?.tour;
  if (!t || t.status !== "running") return false;
  const next = TOUR_STEPS[t.step + 1];
  if (!next || engine.now() - Date.parse(t.startedAt) < next.at * 1000)
    return false;
  if (
    next.op === "start" &&
    next.kind === "fall" &&
    !engine.state.home.rules.fall.enabled
  ) {
    t.status = "paused";
    t.caption = "跌倒观察已关闭。请在“我的”中开启，再继续演示。";
    engine.state.pausedAt = engine.now();
    return true;
  }
  const d = m.demo,
    e = engine.state.events.find(
      (e) => e.id === d?.eventId && e.mobileDemoId === d.id,
    );
  const task = engine.state.home.routineTasks.find((task) =>
    engine.state.planner.occurrences.some(
      (o) =>
        o.id === task.occurrenceId &&
        engine.state.planner.plans.some(
          (p) => p.id === o.planId && p.mobileDemoId === d?.id,
        ),
    ),
  );
  if (["sequence", "verify"].includes(next.op) && !task) return false;
  if (["help", "claim", "arrive", "close"].includes(next.op) && !e)
    return false;
  const act = (action, payload = {}) => {
    if (e.status === "closed") return;
    const count = e.timeline.length;
    engine.applyEventAction({
      eventId: e.id,
      version: e.version,
      action,
      payload,
    });
    for (const item of e.timeline.slice(count)) {
      item.source = "完整演示脚本（模拟）";
      item.title = "演示：" + item.title;
    }
    e.tourId = t.id;
  };
  if (next.op === "start") startScene(engine, next.kind);
  else if (next.op === "chat" || next.op === "found") {
    const name = engine.state.home.careProfile?.salutation || "周伯";
    const pair =
      next.op === "chat"
        ? [
            "小安，我的眼镜放哪里了？",
            `${name}，别着急，我们一起找。找物演示里，眼镜在客厅茶几上。`,
          ]
        : ["我找到了", `${name}，找到就好。今天也按自己的节奏慢慢来。`];
    pair.forEach((text, i) =>
      m.chat.push({
        id: randomUUID(),
        role: i ? "assistant" : "user",
        text,
        at: iso(engine.now()),
        source: "完整演示脚本",
        tourId: t.id,
      }),
    );
    m.chat = m.chat.slice(-60);
  } else if (next.op === "seen") m.reminderSeen = true;
  else if (next.op === "sequence" && !task.candidate)
    applyMedicationEvidence(engine, {
      action: "sequence",
      occurrenceId: task.occurrenceId,
    });
  else if (next.op === "verify" && !task.verified)
    applyMedicationEvidence(engine, {
      action: "confirm",
      occurrenceId: task.occurrenceId,
      demoOnly: true,
    });
  else if (
    next.op === "help" &&
    e.confirmation.responseStatus !== "help_requested"
  )
    act("respond", { response: "help_requested", source: "simulated" });
  else if (next.op === "claim" && e.status !== "handling") act("review_claim");
  else if (next.op === "arrive") {
    if (e.status !== "handling" && e.status !== "closed") act("review_claim");
    if (e.status === "handling")
      act("progress", {
        text: e.type === "location" ? "已找到老人" : "已到达现场",
        note: "完整演示中的预设进展，非真实人员回执。",
      });
  } else if (next.op === "close" && e.status !== "closed") {
    if (e.status !== "handling") act("review_claim");
    act("close", {
      reason: "confirmed_safe",
      note:
        e.type === "location"
          ? "脚本模拟：家属找到老人并陪同返回。此结果仅用于演示。"
          : "脚本模拟：家属到场核实并完成处理。此结果仅用于演示。",
      medicalResolution: "cancelled_after_review",
    });
    e.closeReason = "demo_completed";
  }
  t.step++;
  Object.assign(t, next);
  t.detail = next.detail || null;
  if (next.op === "complete") t.status = "completed";
  return true;
}
