import { randomUUID } from "node:crypto";
import { CareError } from "./errors.js";
import {
  PLAN_CATEGORIES,
  RECIPIENTS,
  nextReminder,
  wallInstant,
  scheduleLabel,
  reminderMessage,
} from "../shared/plans.js";
import { careDate } from "../shared/daily.js";

const iso = (n) => new Date(n).toISOString();
export function validatePlan(input, now, timeZone) {
  if (!input || typeof input !== "object")
    throw new CareError("没有可用的提醒计划。");
  const title = String(input.title || "").trim();
  if (!title || title.length > 80)
    throw new CareError("请填写 1 到 80 字的提醒事项。");
  if (
    !Object.hasOwn(PLAN_CATEGORIES, input.category) ||
    !Object.hasOwn(RECIPIENTS, input.recipient)
  )
    throw new CareError("提醒类别或接收人无效。");
  const s = input.schedule;
  if (!s || !["once", "daily", "weekly"].includes(s.type))
    throw new CareError("请明确提醒频率。");
  let schedule;
  if (s.type === "once") {
    const at = Date.parse(s.at);
    if (
      !Number.isFinite(at) ||
      iso(at) !== s.at ||
      at <= now ||
      at > now + 366 * 86400000
    )
      throw new CareError("一次性提醒需要在未来一年内；时间已过时请重新调整。");
    schedule = { type: "once", at: iso(at) };
  } else {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
      throw new CareError("提醒时间需要精确到分钟。");
    if (
      s.type === "weekly" &&
      (!Array.isArray(s.weekdays) ||
        !s.weekdays.length ||
        s.weekdays.some((n) => !Number.isInteger(n) || n < 1 || n > 7))
    )
      throw new CareError("请至少选择一个有效的星期。");
    schedule = {
      type: s.type,
      time: s.time,
      ...(s.type === "weekly"
        ? { weekdays: [...new Set(s.weekdays)].sort((a, b) => a - b) }
        : {}),
    };
  }
  const nextAt = nextReminder(schedule, now, timeZone);
  if (!nextAt) throw new CareError("无法确定下一次提醒时间。");
  return {
    title,
    category: input.category,
    recipient: input.recipient,
    message: String(input.message || "")
      .trim()
      .slice(0, 200),
    schedule,
    timeZone,
    nextAt,
  };
}
export function proposalFromSpec(spec, referenceNow, timeZone) {
  let schedule;
  if (spec.delay_minutes !== undefined) {
    if (
      spec.repeat !== "once" ||
      spec.date ||
      spec.time ||
      spec.weekdays?.length
    )
      throw new CareError("相对时间不能同时指定另一套日期或重复规则。");
    if (
      !Number.isInteger(spec.delay_minutes) ||
      spec.delay_minutes < 1 ||
      spec.delay_minutes > 10080
    )
      throw new CareError("相对提醒支持 1 分钟到 7 天。");
    schedule = {
      type: "once",
      at: iso(referenceNow + spec.delay_minutes * 60000),
    };
  } else if (spec.repeat === "once") {
    try {
      schedule = {
        type: "once",
        at: iso(wallInstant(spec.date || "", spec.time || "", timeZone)),
      };
    } catch (e) {
      throw new CareError(e.message);
    }
  } else
    schedule = { type: spec.repeat, time: spec.time, weekdays: spec.weekdays };
  return validatePlan({ ...spec, schedule }, referenceNow, timeZone);
}
export function plannerLog(engine, entry) {
  engine.state.planner.logs.push({
    id: randomUUID(),
    at: iso(engine.now()),
    ...entry,
  });
}
export function saveAgentResult(
  engine,
  {
    runId,
    requestId,
    reply,
    proposal = null,
    context = null,
    mode,
    source,
    question = false,
  },
) {
  if (engine.state.runId !== runId) return false;
  return engine.transaction(() => {
    const p = engine.state.planner;
    if (p.requests.at(-1)?.id !== requestId) {
      const stale = p.requests.find((r) => r.id === requestId);
      if (stale) stale.status = "superseded";
      return;
    }
    let draft = null;
    if (proposal) {
      let checked;
      try {
        checked = validatePlan(
          proposal,
          engine.now(),
          engine.state.daily.timeZone,
        );
      } catch (e) {
        proposal = null;
        context = null;
        question = true;
        reply = `计划还没有启用：${e.message} 请给出新的明确时间。`;
      }
      if (checked) {
        for (const d of p.drafts.filter(
          (d) => d.status === "proposed" && d.origin !== "medical",
        ))
          d.status = "replaced";
        draft = {
          id: randomUUID(),
          version: 1,
          status: "proposed",
          createdAt: iso(engine.now()),
          requestId,
          origin: mode,
          ...checked,
        };
        p.drafts.push(draft);
        plannerLog(engine, {
          tool: "propose_reminder",
          origin: mode,
          status: "completed",
          result: `已生成可编辑草稿：${checked.title}；${scheduleLabel(checked.schedule, checked.timeZone)}。尚未启用。`,
          output: checked,
        });
      }
    }
    if (question)
      for (const d of p.drafts.filter(
        (d) => d.status === "proposed" && d.origin !== "medical",
      ))
        d.status = "replaced";
    p.context = context;
    p.messages.push({
      id: randomUUID(),
      role: "assistant",
      text: reply,
      at: iso(engine.now()),
      mode,
      source,
      question,
      draftId: draft?.id || null,
      requestId,
    });
    const request = p.requests.find((r) => r.id === requestId);
    if (request) request.status = "completed";
    p.version++;
  });
}
export function activateReminder(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const p = engine.state.planner,
      draft = p.drafts.find((d) => d.id === body.draftId);
    if (p.requests.at(-1)?.status === "running")
      throw new CareError("正在理解新的安排，请稍后核对最新草稿。", 409);
    if (!draft) throw new CareError("计划草稿不存在。", 404);
    if (draft.status === "activated") return false;
    if (draft.status !== "proposed" || draft.version !== body.version)
      throw new CareError("草稿已有更新，请使用最新的计划。", 409);
    const proposal = validatePlan(
      body.plan || draft,
      engine.now(),
      engine.state.daily.timeZone,
    );
    if (
      p.plans.some(
        (plan) =>
          plan.status === "active" &&
          plan.title === proposal.title &&
          plan.recipient === proposal.recipient &&
          JSON.stringify(plan.schedule) === JSON.stringify(proposal.schedule),
      )
    )
      throw new CareError("已有相同的提醒计划，避免重复启用。", 409);
    const plan = {
      id: randomUUID(),
      version: 1,
      scheduleVersion: 1,
      status: "active",
      createdAt: iso(engine.now()),
      updatedAt: iso(engine.now()),
      ...proposal,
      origin: draft.origin,
      draftId: draft.id,
      medicalItemId: draft.medicalItemId || null,
      lastAt: null,
    };
    p.plans.push(plan);
    draft.status = "activated";
    draft.planId = plan.id;
    draft.version++;
    p.context = null;
    plannerLog(engine, {
      tool: "activate_reminder",
      origin: "user",
      status: "completed",
      result: `已启用「${plan.title}」，下一次 ${plan.nextAt}。`,
      planId: plan.id,
    });
    p.messages.push({
      id: randomUUID(),
      role: "assistant",
      text: `已启用「${plan.title}」。${scheduleLabel(plan.schedule, plan.timeZone)}提醒${plan.recipient === "patient" ? "周伯" : "家属"}，按北京时间执行。`,
      at: iso(engine.now()),
      mode: "scheduler",
      source: "服务端计划已保存",
      planId: plan.id,
    });
    p.version++;
  });
}
function withdrawOccurrences(p, planId, reason) {
  for (const o of p.occurrences.filter(
    (o) => o.planId === planId && ["pending", "snoozed"].includes(o.status),
  )) {
    o.status = "withdrawn";
    o.reason = reason;
    o.version++;
  }
}
export function changeReminder(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const p = engine.state.planner,
      plan = p.plans.find((x) => x.id === body.planId);
    if (!plan) throw new CareError("计划不存在。", 404);
    if (plan.version !== body.version)
      throw new CareError("计划已更新，请查看最新内容后重试。", 409);
    if (plan.status === "cancelled") throw new CareError("计划已取消。", 409);
    switch (body.action) {
      case "pause":
        if (plan.status !== "active")
          throw new CareError("只有启用中的计划可以暂停。");
        plan.status = "paused";
        withdrawOccurrences(p, plan.id, "计划已暂停");
        break;
      case "resume":
        if (plan.status !== "paused") throw new CareError("当前计划没有暂停。");
        {
          const next = nextReminder(plan.schedule, engine.now(), plan.timeZone);
          if (!next)
            throw new CareError("原定时间已过，请修改时间后重新启用。");
          plan.nextAt = next;
          plan.status = "active";
        }
        break;
      case "cancel":
        plan.status = "cancelled";
        withdrawOccurrences(p, plan.id, "计划已取消");
        break;
      case "edit": {
        const checked = validatePlan(body.plan, engine.now(), plan.timeZone);
        withdrawOccurrences(p, plan.id, "计划已修改");
        Object.assign(plan, checked);
        plan.scheduleVersion++;
        plan.status = "active";
        break;
      }
      default:
        throw new CareError("无效的计划操作。");
    }
    plan.version++;
    plan.updatedAt = iso(engine.now());
    p.version++;
    plannerLog(engine, {
      tool: `${body.action}_reminder`,
      origin: "user",
      status: "completed",
      result: `「${plan.title}」：${{ pause: "已暂停", resume: "已恢复", cancel: "已取消", edit: "已更新" }[body.action]}。`,
      planId: plan.id,
    });
  });
}
export function reminderAction(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const p = engine.state.planner,
      o = p.occurrences.find((x) => x.id === body.occurrenceId);
    if (!o) throw new CareError("提醒不存在。", 404);
    if (o.status === "acknowledged" && body.action === "acknowledge")
      return false;
    if (o.version !== body.version || o.status !== "pending")
      throw new CareError("提醒状态已变化，请查看最新状态。", 409);
    if (body.action === "acknowledge") {
      o.status = "acknowledged";
      o.acknowledgedAt = iso(engine.now());
    } else if (body.action === "snooze") {
      if (![5, 10].includes(body.minutes))
        throw new CareError("可选择稍后 5 分钟或 10 分钟提醒。");
      o.status = "snoozed";
      o.snoozeUntil = iso(engine.now() + body.minutes * 60000);
    } else throw new CareError("无效的提醒操作。");
    o.version++;
    p.version++;
    plannerLog(engine, {
      tool: body.action + "_occurrence",
      origin: "user",
      status: "completed",
      result:
        body.action === "acknowledge"
          ? "已确认这条提醒，不自动记录服药或任务完成。"
          : `已延后 ${body.minutes} 分钟，原计划频率保持不变。`,
      occurrenceId: o.id,
    });
  });
}
export function recordReminderVoice(engine, body) {
  engine.checkRun(body.runId);
  if (
    !["playing", "completed", "failed"].includes(body.status) ||
    typeof body.receiptId !== "string" ||
    body.receiptId.length > 150
  )
    throw new CareError("无效的播报回执。");
  return engine.transaction(() => {
    const p = engine.state.planner,
      o = p.occurrences.find((o) => o.id === body.occurrenceId);
    if (!o) throw new CareError("提醒不存在。", 404);
    if (o.voiceReceipts.some((r) => r.id === body.receiptId)) return false;
    o.voiceReceipts.push({
      id: body.receiptId,
      status: body.status,
      at: iso(engine.now()),
      source: body.source === "server_tts" ? "server_tts" : "browser_tts",
      provider: ["baidu", "local"].includes(body.provider)
        ? body.provider
        : null,
    });
    p.version++;
  });
}
export function tickReminders(engine) {
  const p = engine.state.planner,
    now = engine.now();
  let changed = false;
  for (const o of p.occurrences) {
    if (o.status === "snoozed" && Date.parse(o.snoozeUntil) <= now) {
      const plan = p.plans.find((plan) => plan.id === o.planId);
      if (!plan || ["paused", "cancelled"].includes(plan.status)) {
        o.status = "withdrawn";
        o.reason = "原计划已暂停或取消";
      } else {
        o.status = "pending";
        o.attempt++;
        o.availableAt = iso(now);
        o.snoozeUntil = null;
      }
      o.version++;
      changed = true;
    }
  }
  for (const plan of p.plans) {
    if (plan.status !== "active" || Date.parse(plan.nextAt) > now) continue;
    const key = `${plan.id}:${plan.scheduleVersion}:${plan.nextAt}`;
    if (!p.occurrences.some((o) => o.key === key)) {
      const late = now - Date.parse(plan.nextAt) > 60000;
      const o = {
        id: randomUUID(),
        key,
        planId: plan.id,
        version: 1,
        attempt: 1,
        status: "pending",
        title: plan.title,
        category: plan.category,
        recipient: plan.recipient,
        scheduledAt: plan.nextAt,
        availableAt: iso(now),
        timeZone: plan.timeZone,
        overdue: late,
        message: reminderMessage({ ...plan, scheduledAt: plan.nextAt }, late),
        source: "server_scheduler",
        channel: "in_app",
        voiceReceipts: [],
      };
      p.occurrences.push(o);
      plannerLog(engine, {
        tool: "deliver_reminder",
        origin: "scheduler",
        status: "completed",
        result: `已提供应用内提醒：${plan.title}${late ? "（逾期补记）" : ""}；等待用户确认。`,
        occurrenceId: o.id,
      });
    }
    plan.lastAt = plan.nextAt;
    if (plan.schedule.type === "once") {
      plan.status = "completed";
      plan.nextAt = null;
    } else plan.nextAt = nextReminder(plan.schedule, now, plan.timeZone);
    plan.version++;
    changed = true;
  }
  if (changed) p.version++;
  return changed;
}
