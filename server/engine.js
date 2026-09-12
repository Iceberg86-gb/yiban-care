import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { CareError } from "./errors.js";
export { CareError } from "./errors.js";
import {
  freshDaily,
  PRIORITIES,
  eventPriority,
  eventUnknowns,
} from "../shared/daily.js";
import {
  saveDailyRecord,
  supplementRecord,
  saveMedicationPlan,
  reviewDailyAlert,
  seedDaily,
  evaluateDaily,
} from "./daily.js";
import { freshPlanner } from "../shared/plans.js";
import {
  activateReminder,
  changeReminder,
  reminderAction,
  recordReminderVoice,
  tickReminders,
} from "./plans.js";
import { freshHome } from "../shared/home.js";
import {
  runHomeScenario,
  saveHomeConfig,
  deviceCommand,
  startMapReplay,
  applyCorrection,
  onHomeClosure,
  tickHome,
  routeHomeContacts,
  medicationEvidence,
} from "./home.js";
import { freshMobile, tickMobile } from "./mobile.js";
import { encryptState, decryptState } from "./vault.js";
const iso = (value) => new Date(value).toISOString();
export const OPEN_STATES = [
  "confirming",
  "review_required",
  "escalated",
  "handling",
];
export const STATE_LABELS = {
  confirming: "正在确认",
  review_required: "待人工核实",
  escalated: "已升级联络",
  handling: "有人接手",
  closed: "已结案",
};
export const SCENARIOS = {
  night_wandering: {
    title: "夜间徘徊",
    place: "家中",
    locationSource: "模拟摄像头",
    rule: "NIGHT-01",
    description: "夜间出现持续走动，需要确认。",
  },
  sedentary: {
    title: "久坐／久卧超时",
    place: "家中",
    locationSource: "模拟摄像头",
    rule: "SIT-01",
    description: "持续坐卧超过个人演示阈值。",
  },
  bed_exit: {
    title: "离床未归",
    place: "家中卧室",
    locationSource: "模拟摄像头",
    rule: "BED-01",
    description: "离床后未在观察窗口内返回。",
  },
  inactivity: {
    title: "长时间无活动",
    place: "家中",
    locationSource: "模拟摄像头",
    rule: "IDLE-01",
    description: "需要核实设备覆盖和当前状态。",
  },
  device_offline: {
    title: "手环离腕／断连",
    place: "位置待核实",
    locationSource: "设备状态",
    rule: "DEVICE-01",
    description: "手环连接或佩戴状态不可用。",
  },
  medication: {
    title: "用药需要核实",
    place: "位置尚待核实",
    locationSource: "家属照护档案",
    rule: "MED-01",
    description: "日常用药记录需要家属优先核实。",
  },
  cognitive_change: {
    title: "明显状态变化",
    place: "位置尚待核实",
    locationSource: "家属照护记录",
    rule: "CHANGE-01",
    description: "与平时相比出现明显变化，需要家属及时核实。",
  },
  wandering: {
    title: "疑似走失",
    place: "去向待核实",
    locationSource: "家属手动报告",
    rule: "WANDER-01",
    description: "家属无法确认去向，需要优先联络并寻找。",
  },
  fall: {
    title: "疑似跌倒",
    place: "家中 · 客厅",
    locationSource: "客厅设备安装区域",
    rule: "FALL-01",
    description: "姿态变化与惯性冲击同时出现，需要进一步确认。",
  },
  location: {
    title: "位置异常",
    place: "青禾社区 · 东侧步道",
    locationSource: "模拟佩戴设备 · BD-09 坐标",
    rule: "GEO-01",
    description: "连续位置点超出预设活动范围，未登记陪同出行。",
  },
  help: {
    title: "老人主动求助",
    place: "家中 · 客厅",
    locationSource: "家庭终端安装区域",
    rule: "HELP-01",
    description: "周伯明确提出联系家人的需求。",
  },
};
function freshState(now = Date.now()) {
  return {
    schemaVersion: 1,
    generation: 0,
    runId: randomUUID(),
    revision: 0,
    clockOffset: 0,
    createdAt: iso(now),
    events: [],
    activeId: null,
    expression: null,
    settings: {
      confirmationSeconds: 45,
      claimSeconds: 30,
      progressSeconds: 60,
      ruleVersion: "demo-1.0",
    },
    profile: {
      id: "zhoubo",
      name: "周伯",
      age: 76,
      community: "青禾社区",
      preference: "请说慢一些，一次问一个问题；允许停顿后继续表达。",
      family: "周宁",
      relationship: "女儿",
      mode: "虚构演示档案",
    },
    faults: { agent: false, notification: false, microphone: false },
    seenInputs: [],
    daily: freshDaily(),
    planner: freshPlanner(),
    home: freshHome(now),
    mobile: freshMobile(),
    pausedAt: null,
  };
}

export class CareEngine {
  constructor({
    file = null,
    now = () => Date.now(),
    onChange = () => {},
    storageKey = null,
  } = {}) {
    this.file = file;
    this.clock = now;
    this.onChange = onChange;
    this.storageKey = storageKey;
    this.state =
      file && existsSync(file)
        ? decryptState(JSON.parse(readFileSync(file, "utf8")), storageKey)
        : freshState(this.clock());
    if (this.state.schemaVersion !== 1 || !Array.isArray(this.state.events))
      throw new Error("事件存档格式不兼容，请备份 data/state.json 后再启动。");
    this.state.generation ??= 0;
    this.state.daily ??= freshDaily();
    this.state.planner ??= freshPlanner();
    this.state.home ??= freshHome(this.now());
    this.state.mobile ??= freshMobile();
    for (const r of this.state.planner.requests.filter(
      (r) => r.status === "running",
    )) {
      r.status = "interrupted";
      this.state.planner.messages.push({
        id: randomUUID(),
        role: "assistant",
        text: "上次计划理解因服务重启中断，请重新发送。已启用的提醒仍会恢复。",
        at: iso(this.now()),
        mode: "scheduler",
        source: "服务恢复",
        requestId: r.id,
      });
    }
    this.persist();
  }
  now() {
    return this.state.pausedAt ?? this.clock() + this.state.clockOffset;
  }
  homeScenario(body) {
    return runHomeScenario(this, body);
  }
  saveHome(body) {
    return saveHomeConfig(this, body);
  }
  deviceCommand(body) {
    return deviceCommand(this, body);
  }
  mapReplay(body) {
    return startMapReplay(this, body);
  }
  applyCorrection(body) {
    return applyCorrection(this, body);
  }
  medicationEvidence(body) {
    return medicationEvidence(this, body);
  }
  activateReminder(body) {
    return activateReminder(this, body);
  }
  changeReminder(body) {
    return changeReminder(this, body);
  }
  reminderAction(body) {
    return reminderAction(this, body);
  }
  reminderVoice(body) {
    return recordReminderVoice(this, body);
  }
  saveDaily(body) {
    return saveDailyRecord(this, body);
  }
  supplementDaily(body) {
    return supplementRecord(this, body);
  }
  savePlan(body) {
    return saveMedicationPlan(this, body);
  }
  reviewDaily(body) {
    return reviewDailyAlert(this, body);
  }
  seedDaily(body) {
    return seedDaily(this, body);
  }
  persist() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(
      temp,
      JSON.stringify(
        this.storageKey
          ? encryptState(this.state, this.storageKey)
          : this.state,
        null,
        2,
      ),
      { mode: 0o600 },
    );
    renameSync(temp, this.file);
  }
  snapshot() {
    return structuredClone({ ...this.state, now: iso(this.now()) });
  }
  transaction(fn) {
    const before = structuredClone(this.state);
    let result;
    try {
      result = fn();
      if (result === false) return false;
      this.state.revision++;
      this.persist();
    } catch (error) {
      this.state = before;
      throw error;
    }
    this.onChange(this.snapshot());
    return result;
  }
  checkRun(runId) {
    if (runId !== this.state.runId)
      throw new CareError(
        "演示场次已更新，请刷新状态后重试。旧场次消息已忽略。",
        409,
      );
  }
  event(id) {
    const e = this.state.events.find((item) => item.id === id);
    if (!e) throw new CareError("找不到当前事件。", 404);
    return e;
  }
  log(e, title, detail, source = "规则引擎", kind = "rule") {
    e.timeline.push({
      id: randomUUID(),
      at: iso(this.now()),
      title,
      detail,
      source,
      kind,
    });
  }
  task(e, role, round = 1, member = null) {
    const key = `${e.id}:${member?.id || role}:in_app_simulated:${round}`;
    if (e.contacts.some((item) => item.idempotencyKey === key)) return;
    const names = {
      family: "周宁",
      backup: "社区照护员",
      medical: "模拟值班服务台",
    };
    e.contacts.push({
      id: randomUUID(),
      role,
      name: member?.name || names[role],
      memberId: member?.id || null,
      level: member?.level || null,
      informOnly: member?.level === 3,
      atHome: member?.atHome || false,
      channels: member
        ? {
            push: "simulated",
            phone: member.level < 3 ? "simulated" : "not_requested",
            dndBypass: "not_integrated",
          }
        : null,
      deliveryStatus: "sent",
      handlingStatus: "unclaimed",
      createdAt: iso(this.now()),
      deliverAt: iso(this.now() + 1800),
      idempotencyKey: key,
      round,
      sourceMode: "simulated",
      receipt: null,
    });
    this.log(
      e,
      role === "medical"
        ? "创建医疗协助任务"
        : `正在联络${member?.name || names[role]}`,
      "应用内模拟通知；等待送达回执。",
      "模拟联络通道",
      "contact",
    );
  }
  escalate(e, reason) {
    if (["escalated", "handling", "closed"].includes(e.status)) return;
    e.status = "escalated";
    e.escalatedAt = iso(this.now());
    e.claimDeadline = iso(
      this.now() +
        (e.homePolicy?.tierTwoSeconds || this.state.settings.claimSeconds) *
          1000,
    );
    if (e.homeRouting)
      e.emergencyDeadline = iso(
        this.now() + e.homePolicy.emergencySeconds * 1000,
      );
    this.log(e, "进入升级联络", reason, "规则引擎", "alert");
    if (e.homeRouting) {
      routeHomeContacts(this, e, 1);
      if (e.homePolicy.infoImmediately) routeHomeContacts(this, e, 3);
    } else this.task(e, "family");
    if (e.type === "fall") this.task(e, "medical");
  }
  createEvent(type, sourceEventId) {
    const sc = SCENARIOS[type];
    if (!sc) throw new CareError("不支持这个情境。");
    const at = iso(this.now());
    const e = {
      id: randomUUID(),
      number: `YB-${String(this.state.events.length + 1).padStart(3, "0")}`,
      version: 1,
      type,
      title: sc.title,
      description: sc.description,
      status: "confirming",
      rule: sc.rule,
      ruleVersion: this.state.settings.ruleVersion,
      runId: this.state.runId,
      sourceEventId,
      subjectId: "zhoubo",
      bindingStatus: "confirmed_demo",
      sourceMode: "simulated",
      processingMode: "simulated",
      capturedAt: at,
      receivedAt: at,
      createdAt: at,
      place: sc.place,
      locationSource: sc.locationSource,
      location: {
        longitude: 116.4035,
        latitude: 39.9227,
        coordType: "BD09",
        capturedAt: at,
        quality: "模拟数据",
        worn: true,
      },
      confirmDeadline: iso(
        this.now() + this.state.settings.confirmationSeconds * 1000,
      ),
      confirmation: {
        promptStatus: "pending",
        captureStatus: "pending",
        responseStatus: "pending",
        responseText: "",
        prompt: "周伯，您现在需要帮助吗？",
        promptSource: "simulated",
        captureSource: "simulated",
        responseSource: null,
        receiptAt: iso(this.now() + 1200),
      },
      evidence:
        type === "fall"
          ? [
              {
                title: "人体姿态",
                value: "由站立转为低位",
                detail: "预设关键点序列 · 未运行视觉模型",
                sourceMode: "simulated",
                processingMode: "simulated",
              },
              {
                title: "惯性变化",
                value: "冲击后活动减少",
                detail: "预设 IMU 序列 · 无真实穿戴设备",
                sourceMode: "simulated",
                processingMode: "simulated",
              },
              {
                title: "对象关联",
                value: "演示对象：周伯",
                detail: "虚构设备绑定 · 现场情况待核实",
                sourceMode: "simulated",
                processingMode: "simulated",
              },
            ]
          : type === "location"
            ? [
                {
                  title: "连续位置",
                  value: "连续 3 点位于围栏外",
                  detail: "情境引擎回放 · 非鹰眼报警",
                  sourceMode: "simulated",
                  processingMode: "simulated",
                },
                {
                  title: "位置质量",
                  value: "预设精度 15 米",
                  detail: "BD-09 演示坐标 · 非真实老人位置",
                  sourceMode: "simulated",
                  processingMode: "simulated",
                },
                {
                  title: "出行安排",
                  value: "未登记陪同",
                  detail: "虚构档案配置 · 需联系家人核实",
                  sourceMode: "simulated",
                  processingMode: "simulated",
                },
              ]
            : [
                {
                  title: "主动表达",
                  value: "希望联系家人",
                  detail: "演示需求，由按钮明确确认",
                  sourceMode: "simulated",
                  processingMode: "live",
                },
              ],
      contacts: [],
      timeline: [],
      agentLogs: [],
      progress: [],
      assignee: null,
      summary: null,
      reminderCount: 0,
    };
    this.state.events.unshift(e);
    this.state.activeId = e.id;
    this.log(
      e,
      "发现需要关注的信号",
      `${sc.description} 数据来源：模拟情境。`,
      "情境引擎",
      "evidence",
    );
    this.log(
      e,
      "发起基础确认",
      "询问已排队；演示确认窗口 45 秒，由服务端维护。",
    );
    e.agentLogs.push({
      id: randomUUID(),
      at,
      tool: "ask_confirmation",
      origin: "rule",
      status: "completed",
      result: "规则引擎已创建确认任务，等待终端回执。",
    });
    if (type === "help") {
      e.confirmation.responseStatus = "help_requested";
      e.confirmation.responseText = "请联系家人";
      e.confirmation.responseSource = "manual";
      this.escalate(e, "收到明确求助，立即联络；确认过程并行。");
    }
    return e;
  }
  start({ runId, scenario, sourceEventId = randomUUID() }) {
    this.checkRun(runId);
    return this.transaction(() => {
      if (!["fall", "location", "speech"].includes(scenario))
        throw new CareError("不支持这个情境。");
      const inputKey = `${runId}:scenario:${sourceEventId}`;
      if (this.state.seenInputs.includes(inputKey)) return false;
      if (this.state.events.some((e) => OPEN_STATES.includes(e.status)))
        throw new CareError(
          "请先处理当前事件，或在演示控制台复位后开始新情境。",
          409,
        );
      this.state.seenInputs.push(inputKey);
      this.state.expression = null;
      if (scenario === "speech") {
        this.state.activeId = null;
        this.state.expression = {
          id: randomUUID(),
          startedAt: iso(this.now()),
          stage: 0,
          status: "listening",
          text: "",
          sourceMode: "simulated",
          processingMode: "simulated",
          waitingSeconds: 0,
        };
      } else this.createEvent(scenario, sourceEventId);
    });
  }
  reset({ runId }) {
    this.checkRun(runId);
    return this.transaction(() => {
      this.state = {
        ...freshState(this.clock()),
        generation: this.state.generation + 1,
      };
    });
  }
  advance({ runId, seconds }) {
    this.checkRun(runId);
    if (![5, 15, 30, 45, 60, 90].includes(seconds))
      throw new CareError("无效的演示时间步长。");
    this.transaction(() => {
      if (this.state.pausedAt != null)
        throw new CareError("请先继续演示，再推进时间。");
      this.state.clockOffset += seconds * 1000;
      const e = this.state.events.find((x) => x.id === this.state.activeId);
      if (e && e.status !== "closed") {
        e.version++;
        this.log(
          e,
          `演示时钟推进 ${seconds} 秒`,
          "仅用于复现超时分支，原有截止时间保持不变。",
          "演示控制台",
          "demo",
        );
      }
    });
    this.tick();
  }
  fault({ runId, name, enabled }) {
    this.checkRun(runId);
    if (!Object.hasOwn(this.state.faults, name) || typeof enabled !== "boolean")
      throw new CareError("无效的故障设置。");
    this.transaction(() => {
      this.state.faults[name] = enabled;
    });
  }
  requestHelp({ runId }) {
    this.checkRun(runId);
    return this.transaction(() => {
      const existing = this.state.events.find((e) =>
        OPEN_STATES.includes(e.status),
      );
      if (existing) {
        existing.version++;
        existing.confirmation.responseStatus = "help_requested";
        existing.confirmation.responseText = "请联系家人";
        existing.confirmation.responseSource = "manual";
        this.escalate(existing, "老人端点击需要帮助，立即联络。");
        return;
      }
      this.createEvent("help", randomUUID());
      if (this.state.expression) this.state.expression.status = "confirmed";
    });
  }
  playback({ runId, eventId, status, sourceEventId, source, provider }) {
    this.checkRun(runId);
    if (
      !["playing", "completed", "failed"].includes(status) ||
      typeof sourceEventId !== "string"
    )
      throw new CareError("无效的播放回执。");
    return this.transaction(() => {
      const playbackSource =
        source === "server_tts" ? "server_tts" : "browser_tts";
      const key = `${runId}:${playbackSource}:${sourceEventId}`;
      const e = this.event(eventId);
      if (this.state.seenInputs.includes(key) || e.status === "closed")
        return false;
      this.state.seenInputs.push(key);
      e.confirmation.promptStatus = status;
      e.confirmation.promptSource = playbackSource;
      e.confirmation.voiceProvider = ["baidu", "local"].includes(provider)
        ? provider
        : null;
      this.log(
        e,
        "收到浏览器播放回执",
        `本机语音：${status}。未调用百度 RTC；播放完成不证明老人已经理解。`,
        "浏览器语音回调",
        "channel",
      );
      e.version++;
      if (e.summary) e.summary.stale = true;
    });
  }
  action(body) {
    this.checkRun(body.runId);
    return this.transaction(() => this.applyEventAction(body));
  }
  // Internal mutation for a caller that already owns a state transaction.
  applyEventAction({ eventId, version, action, payload = {} }) {
    const e = this.event(eventId);
    if (e.version !== version)
      throw new CareError("事件刚刚有更新，请查看最新状态后重试。", 409);
    if (e.status === "closed")
      throw new CareError("事件已结案，不能继续修改。", 409);
    switch (action) {
      case "respond": {
        const status = payload.response;
        if (!["help_requested", "no_help_claimed", "unclear"].includes(status))
          throw new CareError("无效的确认回应。");
        e.confirmation.responseStatus = status;
        e.confirmation.responseSource =
          payload.source === "simulated" ? "simulated" : "manual";
        e.confirmation.responseText = {
          help_requested: "需要帮助，请联系家人",
          no_help_claimed: "暂不需要帮助",
          unclear: "听到声音，但未获得清晰回应",
        }[status];
        this.log(
          e,
          "收到确认回应",
          e.confirmation.responseText,
          payload.source === "simulated" ? "模拟老人回应" : "老人端按钮",
          "response",
        );
        if (status === "help_requested")
          this.escalate(e, "收到明确求助，立即联络。");
        else if (["confirming", "review_required"].includes(e.status)) {
          e.status = "review_required";
          this.log(e, "需要人工核实", "保留原升级截止时间，等待照护者核实。");
        }
        break;
      }
      case "channel_failed":
        e.confirmation.captureStatus = "failed";
        e.confirmation.responseStatus = "unknown";
        e.confirmation.captureSource = "simulated";
        this.log(
          e,
          "收音通道不可用",
          "无法判断是否回应，已通知照护者核实；原截止时间不变。",
          "模拟终端回执",
          "alert",
        );
        this.escalate(e, "确认通道故障，转照护者核实。");
        break;
      case "playback": {
        if (!["playing", "completed", "failed"].includes(payload.status))
          throw new CareError("无效的播放状态。");
        e.confirmation.promptStatus = payload.status;
        e.confirmation.promptSource = "browser_tts";
        this.log(
          e,
          "终端播放状态更新",
          `浏览器语音：${payload.status}。播放完成不代表老人已听到或理解。`,
          "浏览器播放回执",
          "channel",
        );
        break;
      }
      case "claim": {
        const c = e.contacts.find((t) => t.id === payload.taskId);
        if (!c) throw new CareError("联络任务不存在。");
        if (c.informOnly)
          throw new CareError("该成员仅接收通报，不属于值守接手人。");
        if (c.handlingStatus === "accepted") return false;
        if (c.role !== "medical" && e.assignee)
          throw new CareError(`已由${e.assignee}接手。`, 409);
        c.handlingStatus = "accepted";
        c.acceptedAt = iso(this.now());
        c.receipt = `SIM-${randomUUID().slice(0, 8)}`;
        this.log(
          e,
          `${c.name}已接手`,
          c.role === "medical"
            ? `模拟机构接单回执 ${c.receipt}；尚未完成移交。`
            : "人员手动承担任务，等待进一步进展。",
          c.role === "medical" ? "模拟机构回执" : "家人／照护者手动操作",
          "claim",
        );
        if (c.role !== "medical") {
          e.status = "handling";
          e.assignee = c.name;
          e.acceptedAt = iso(this.now());
          e.progressDeadline = iso(
            this.now() + this.state.settings.progressSeconds * 1000,
          );
        }
        break;
      }
      case "review_claim":
        if (!["confirming", "review_required", "escalated"].includes(e.status))
          throw new CareError("当前事件已有责任人。");
        this.task(e, "family");
        {
          const c = e.contacts.find((t) => t.role === "family");
          c.handlingStatus = "accepted";
          c.acceptedAt = iso(this.now());
          c.receipt = `SIM-${randomUUID().slice(0, 8)}`;
        }
        e.status = "handling";
        e.assignee = "周宁";
        e.acceptedAt = iso(this.now());
        e.progressDeadline = iso(
          this.now() + this.state.settings.progressSeconds * 1000,
        );
        this.log(
          e,
          "周宁接手核实",
          "家人主动接手，开始跟进处理进展。",
          "家人手动操作",
          "claim",
        );
        break;
      case "progress": {
        if (e.status !== "handling" || !e.assignee)
          throw new CareError("请先接手任务，再更新处理进展。");
        const options = [
          "正在联系老人",
          "已取得联系",
          "已到达现场",
          "已找到老人",
          "已联系医疗协助",
        ];
        if (!options.includes(payload.text))
          throw new CareError("请选择有效的进展。");
        e.progress.push({
          at: iso(this.now()),
          text: payload.text,
          source: "家人手动报告",
        });
        e.progressDeadline = iso(
          this.now() + this.state.settings.progressSeconds * 1000,
        );
        this.log(
          e,
          payload.text,
          String(payload.note || "等待进一步核实和处理。").slice(0, 500),
          "家人手动报告",
          "progress",
        );
        break;
      }
      case "resolve_receipt": {
        const c = e.contacts.find((t) => t.id === payload.taskId);
        if (!c || c.deliveryStatus !== "unknown")
          throw new CareError("此任务无需核查送达状态。");
        c.deliveryStatus = "delivered";
        c.deliveredAt = iso(this.now());
        this.log(
          e,
          "模拟送达状态已核实",
          `已取得${c.name}的模拟送达回执，未重复发送。`,
          "模拟联络通道",
          "contact",
        );
        break;
      }
      case "close": {
        if (e.status !== "handling")
          throw new CareError("请先接手并核实事件，再记录结案。");
        const labels = {
          confirmed_safe: "人工确认安全",
          false_alarm: "经核实为误报",
          care_transferred: "已完成责任移交",
        };
        if (!Object.hasOwn(labels, payload.reason))
          throw new CareError("请选择结案原因。");
        if (!String(payload.note || "").trim())
          throw new CareError("请填写核实结果或移交说明。");
        const medical = e.contacts.filter(
          (c) => c.role === "medical" && c.handlingStatus !== "completed",
        );
        if (payload.reason === "care_transferred") {
          if (
            !medical.some((c) => c.handlingStatus === "accepted" && c.receipt)
          )
            throw new CareError("需要模拟机构接单回执后，才能记录责任移交。");
        } else if (
          medical.length &&
          payload.medicalResolution !== "cancelled_after_review"
        )
          throw new CareError("请明确记录未完成医疗协助任务的处理方式。");
        for (const c of e.contacts) {
          c.resolution =
            c.role === "medical" && payload.reason !== "care_transferred"
              ? "cancelled_after_review"
              : c.handlingStatus === "accepted"
                ? "completed"
                : "closed_after_review";
          c.handlingStatus = "completed";
        }
        if (medical.length)
          this.log(
            e,
            "医疗协助任务已更新",
            payload.reason === "care_transferred"
              ? "根据模拟接单回执记录移交完成。"
              : "责任人核实后明确结束模拟医疗协助任务。",
            "家人手动报告",
            "progress",
          );
        e.status = "closed";
        e.closedAt = iso(this.now());
        e.closeReason = payload.reason;
        e.closeNote = String(payload.note).slice(0, 1000);
        e.transferReceiver =
          payload.reason === "care_transferred"
            ? medical.find((c) => c.receipt)?.name
            : null;
        this.log(
          e,
          labels[payload.reason],
          e.closeNote,
          "家人手动报告",
          "closed",
        );
        const linkedAlert = this.state.daily.alerts.find(
          (a) => a.eventId === e.id,
        );
        if (linkedAlert) {
          linkedAlert.status = "reviewed";
          linkedAlert.reviewNote = e.closeNote;
          linkedAlert.reviewedAt = e.closedAt;
          this.state.daily.version++;
        }
        onHomeClosure(this, e);
        if (this.state.activeId === e.id) {
          const next = this.state.events
            .filter((x) => x.status !== "closed")
            .sort(
              (a, b) =>
                PRIORITIES[eventPriority(b)].rank -
                  PRIORITIES[eventPriority(a)].rank ||
                a.createdAt.localeCompare(b.createdAt),
            )[0];
          if (next) this.state.activeId = next.id;
        }
        break;
      }
      default:
        throw new CareError("不支持这个操作。");
    }
    e.version++;
    if (e.summary) e.summary.stale = true;
  }
  tick() {
    const now = this.now();
    return this.transaction(() => {
      let changed = false;
      const speech = this.state.expression;
      if (speech && speech.status === "listening") {
        const elapsed = now - Date.parse(speech.startedAt);
        const stage =
          elapsed >= 9500
            ? 4
            : elapsed >= 6500
              ? 3
              : elapsed >= 3300
                ? 2
                : elapsed >= 500
                  ? 1
                  : 0;
        if (stage !== speech.stage) {
          speech.stage = stage;
          speech.text = [
            "",
            "我想……",
            "我想……找一下……",
            "我想……找一下……我女儿。",
            "我想……找一下……我女儿。",
          ][stage];
          if (stage === 4) speech.status = "awaiting_confirmation";
          changed = true;
        }
      }
      changed = evaluateDaily(this) || changed;
      changed = tickReminders(this) || changed;
      for (const e of this.state.events) {
        if (e.status === "closed") continue;
        let eventChanged = false;
        const c = e.confirmation;
        if (
          (c.promptStatus === "pending" || c.captureStatus === "pending") &&
          now >= Date.parse(c.receiptAt)
        ) {
          if (c.promptStatus === "pending") c.promptStatus = "completed";
          if (c.captureStatus === "pending")
            c.captureStatus = this.state.faults.microphone
              ? "failed"
              : "active";
          this.log(
            e,
            "收到模拟终端回执",
            `${["browser_tts", "server_tts"].includes(c.promptSource) ? "播放状态以浏览器回执为准" : "模拟播放完成"}；${c.captureStatus === "active" ? "模拟收音可用" : "收音故障"}。`,
            "模拟终端",
            "channel",
          );
          if (c.captureStatus === "failed") {
            c.responseStatus = "unknown";
            this.escalate(e, "收音通道故障，转照护者核实。");
          }
          eventChanged = true;
        }
        if (
          ["confirming", "review_required"].includes(e.status) &&
          now >= Date.parse(e.confirmDeadline)
        ) {
          if (c.responseStatus === "pending")
            c.responseStatus =
              c.captureStatus === "active" ? "no_response" : "unknown";
          this.escalate(
            e,
            c.responseStatus === "no_response"
              ? "确认窗口到期，未获得有效回应。"
              : "核实窗口到期，仍需照护者介入。",
          );
          eventChanged = true;
        }
        for (const contact of e.contacts) {
          if (
            contact.deliveryStatus === "sent" &&
            now >= Date.parse(contact.deliverAt)
          ) {
            contact.deliveryStatus = this.state.faults.notification
              ? "unknown"
              : "delivered";
            if (contact.deliveryStatus === "delivered")
              contact.deliveredAt = iso(now);
            this.log(
              e,
              contact.deliveryStatus === "delivered"
                ? `${contact.name}的消息已送达`
                : `${contact.name}的送达状态未知`,
              contact.deliveryStatus === "delivered"
                ? "模拟送达回执；接手状态独立记录。"
                : "模拟供应商超时，等待核查结果，不自动重复发送。",
              "模拟联络通道",
              "contact",
            );
            eventChanged = true;
          }
        }
        if (
          !e.homeRouting &&
          e.status === "escalated" &&
          now >= Date.parse(e.claimDeadline) &&
          !e.contacts.some((c) => c.role === "backup")
        ) {
          this.task(e, "backup");
          this.log(
            e,
            "联络备用责任人",
            "第一联系人未在演示窗口内接手。",
            "规则引擎",
            "alert",
          );
          eventChanged = true;
        }
        if (e.status === "handling" && now >= Date.parse(e.progressDeadline)) {
          e.reminderCount++;
          e.progressDeadline = iso(
            now + this.state.settings.progressSeconds * 1000,
          );
          this.log(
            e,
            "需要更新处理进展",
            `已接手但进展检查窗口到期，第 ${e.reminderCount} 次提醒。`,
            "规则引擎",
            "alert",
          );
          this.task(e, "backup");
          eventChanged = true;
        }
        if (eventChanged) {
          e.version++;
          if (e.summary) e.summary.stale = true;
          changed = true;
        }
      }
      changed = tickMobile(this) || changed;
      changed = tickHome(this) || changed;
      changed = tickMobile(this) || changed;
      return changed;
    });
  }
  recordAgent(runId, eventId, entry) {
    if (runId !== this.state.runId) return false;
    const e = this.state.events.find((e) => e.id === eventId);
    if (!e) return false;
    return this.transaction(() => {
      e.agentLogs.push({ id: randomUUID(), at: iso(this.now()), ...entry });
    });
  }
  saveSummary(runId, eventId, summary, sourceVersion) {
    if (runId !== this.state.runId) return false;
    const e = this.state.events.find((e) => e.id === eventId);
    if (!e) return false;
    return this.transaction(() => {
      e.summary = {
        ...summary,
        generatedAt: iso(this.now()),
        sourceVersion,
        stale: e.version !== sourceVersion,
      };
      e.agentLogs.push({
        id: randomUUID(),
        at: iso(this.now()),
        tool: "create_handoff_summary",
        origin: summary.mode === "live" ? "qianfan" : "template",
        status: "completed",
        result:
          summary.mode === "live"
            ? "千帆返回交接摘要；事实卡保留原始结构化记录。"
            : "本地模板生成交接卡，未调用大模型。",
      });
    });
  }
}

export function handoffFacts(e) {
  return {
    event: e.title,
    person: "周伯（虚构档案）",
    place: e.place,
    locationSource: e.locationSource,
    locationAt: e.location.capturedAt,
    status: STATE_LABELS[e.status],
    evidence: e.evidence.map(
      (x) => `${x.title}：${x.value}（${x.sourceMode}）`,
    ),
    confirmation: e.confirmation,
    assignee: e.assignee || "尚未接手",
    contacts: e.contacts.map((c) => ({
      name: c.name,
      delivery: c.deliveryStatus,
      handling: c.handlingStatus,
      receipt: c.receipt,
    })),
    progress: e.progress,
    unknowns: eventUnknowns(e),
    closeReason: e.closeReason || null,
    closeNote: e.closeNote || null,
    transferReceiver: e.transferReceiver || null,
    sourceMode: e.sourceMode,
  };
}
