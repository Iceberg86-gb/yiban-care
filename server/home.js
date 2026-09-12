import { validVoice, validStyle } from "../shared/speech.js";
import { randomUUID } from "node:crypto";
import { syncHydrationPlans } from "./mobile-reminders.js";
import { CareError } from "./errors.js";
import {
  HOME_RULES,
  mapFacts,
  pointDistance,
  routeDistance,
  DEFAULT_ROUTE,
  homeReport,
  nextReportTime,
} from "../shared/home.js";
import {
  currentSlot,
  careDate,
  eventPriority,
  PRIORITIES,
} from "../shared/daily.js";
const iso = (n) => new Date(n).toISOString();
export function homeFeed(
  engine,
  title,
  detail,
  level = "normal",
  eventId = null,
  key = null,
) {
  const h = engine.state.home;
  if (key && h.feed.some((x) => x.key === key)) return;
  h.feed.push({
    id: randomUUID(),
    key,
    at: iso(engine.now()),
    title,
    detail,
    level,
    eventId,
    sourceMode: "simulated",
  });
  h.feed = h.feed.slice(-250);
  h.version++;
}
export function routeHomeContacts(engine, e, level) {
  for (const member of engine.state.home.members.filter(
    (m) => m.enabled && m.level === level,
  ))
    engine.task(
      e,
      level === 1 ? "family" : level === 2 ? "backup" : "observer",
      1,
      member,
    );
}
export function createHomeEvent(
  engine,
  type,
  detail,
  {
    immediate = false,
    scenario = type,
    cameraId = null,
    mobileDemoId = null,
  } = {},
) {
  const existing = engine.state.events.find(
    (e) =>
      e.homeRouting &&
      e.type === type &&
      e.status !== "closed" &&
      (mobileDemoId ? e.mobileDemoId === mobileDemoId : !e.mobileDemoId),
  );
  if (existing) {
    engine.log(existing, "补充感知证据", detail, "模拟感知输入", "evidence");
    existing.version++;
    if (immediate) engine.escalate(existing, "新的情境需要立即联络。");
    return existing;
  }
  const prior = engine.state.events.find(
    (e) => e.id === engine.state.activeId && e.status !== "closed",
  );
  const h = engine.state.home,
    e = engine.createEvent(type, randomUUID());
  e.homeRouting = true;
  if (mobileDemoId) e.mobileDemoId = mobileDemoId;
  e.homePolicy = structuredClone(h.policy);
  e.scenario = scenario;
  e.priority =
    scenario === "duplicate_medication" || scenario === "night_outing"
      ? "urgent"
      : eventPriority(e);
  if (
    prior &&
    PRIORITIES[eventPriority(prior)].rank > PRIORITIES[e.priority].rank
  )
    engine.state.activeId = prior.id;
  e.ruleVersion = "home-demo-2.0";
  e.confirmDeadline = iso(engine.now() + h.policy.confirmationSeconds * 1000);
  e.description = detail;
  e.timeline[0].detail = detail;
  e.timeline[1].detail = `模拟终端确认，窗口 ${h.policy.confirmationSeconds} 秒；服务端固定截止时间。`;
  e.simulatedConfidence = type === "fall" ? 0.94 : 0.89;
  e.dualSource = {
    vision:
      scenario === "single_source" ? "候选姿态（模拟）" : "行为候选（模拟）",
    imu:
      scenario === "single_source"
        ? "设备数据缺失"
        : type === "fall"
          ? "冲击特征一致（模拟）"
          : "用于补充动作证据（模拟）",
    result:
      scenario === "single_source"
        ? "证据不足，需人工核实"
        : "预设证据一致，仍需现场核实",
  };
  e.replay = {
    secondsBefore: 30,
    sourceMode: "simulated",
    processingMode: "simulated",
    label: "预设情境重建，不是实际录像",
  };
  const camera = h.devices.find(
    (d) => d.id === (cameraId || h.monitor.cameraId),
  );
  if (
    camera &&
    ["fall", "night_wandering", "sedentary", "bed_exit", "inactivity"].includes(
      type,
    )
  ) {
    e.place = `家中 · ${camera.zone}`;
    e.locationSource = `${camera.name}安装区域（模拟）`;
    e.cameraId = camera.id;
  }
  e.evidence = [
    {
      title: "视觉行为",
      value: e.dualSource.vision,
      detail,
      sourceMode: "simulated",
      processingMode: "simulated",
    },
    {
      title: "惯性证据",
      value: e.dualSource.imu,
      detail: e.dualSource.result,
      sourceMode: "simulated",
      processingMode: "simulated",
    },
  ];
  h.monitor.lastEventId = e.id;
  homeFeed(engine, e.title, detail, "danger", e.id, `detect:${e.id}`);
  if (immediate) engine.escalate(e, "该情境需要立即联络；患者侧确认并行。");
  captureReport(engine, "event", e.id);
  return e;
}
export function runHomeScenario(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home,
      kind = body.scenario;
    const valid = [...Object.keys(HOME_RULES), "bend", "single_source"];
    if (!valid.includes(kind)) throw new CareError("不支持该监控情境。");
    const rule = kind === "bend" || kind === "single_source" ? "fall" : kind;
    if (!h.rules[rule].enabled)
      throw new CareError("该识别项已关闭，可在“我的”中重新开启。");
    if (
      kind === "bend" &&
      h.corrections.some((c) => c.applied && c.pattern === "bend_normal_imu")
    ) {
      h.monitor.pose = "弯腰拾物";
      h.monitor.poseSince = iso(engine.now());
      homeFeed(
        engine,
        "弯腰拾物：命中演示纠错规则",
        "视觉弯腰与正常IMU，保留观察记录；此校正未经过真实模型验证。",
        "normal",
      );
      return;
    }
    const descriptions = {
      fall: "模拟画面出现由站立到低位的变化，手环出现预设冲击。",
      single_source: "模拟画面出现低位姿态，手环信号缺失，不能完成双源核实。",
      bend: "模拟弯腰捡物触发跌倒候选，用于展示家属纠错流程。",
      night_wandering: "夜间情境：重复离开床边并在房间走动，达到配置观察阈值。",
      sedentary: `坐卧持续超过个人演示阈值 ${h.rules.sedentary.minutes} 分钟。`,
      bed_exit: `离床后超过 ${h.rules.bed_exit.minutes} 分钟未归，需要确认。`,
      inactivity: `超过 ${h.rules.inactivity.minutes} 分钟未观察到明显活动，需核实设备覆盖。`,
    };
    const score =
      kind === "bend"
        ? 0.72
        : kind === "single_source"
          ? 0.87
          : kind === "fall"
            ? 0.94
            : 0.95;
    const threshold = { high: 0.65, medium: 0.8, low: 0.9 }[
      h.rules[rule].sensitivity
    ];
    if (score < threshold) {
      homeFeed(
        engine,
        "模拟候选未达当前灵敏度阈值",
        `${descriptions[kind]} 模拟分值${score}，阈值${threshold}，保留观察记录。`,
        "abnormal",
      );
      return;
    }
    const e = createHomeEvent(engine, rule, descriptions[kind], {
      scenario: kind,
      cameraId: body.cameraId,
    });
    e.simulatedConfidence = score;
    e.simulatedThreshold = threshold;
    h.monitor.pose =
      kind === "fall" || kind === "single_source"
        ? "低位姿态"
        : kind === "bend"
          ? "弯腰拾物"
          : kind === "night_wandering"
            ? "夜间徘徊"
            : kind === "bed_exit"
              ? "离床未归"
              : "坐卧";
    h.monitor.poseSince = iso(engine.now());
    h.monitor.confidence = e.simulatedConfidence;
    h.monitor.imu = e.dualSource.imu;
  });
}
export function saveHomeConfig(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home;
    if (body.version !== h.configVersion)
      throw new CareError("配置已更新，请核对后重试。", 409);
    switch (body.section) {
      case "policy": {
        const p = body.value;
        for (const [key, min, max] of [
          ["confirmationSeconds", 3, 120],
          ["tierTwoSeconds", 5, 300],
          ["emergencySeconds", 10, 600],
          ["routineRetrySeconds", 5, 300],
          ["routineAttempts", 1, 5],
          ["disconnectSeconds", 30, 600],
        ])
          if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max)
            throw new CareError("演示计时参数超出允许范围。");
        if (p.tierTwoSeconds >= p.emergencySeconds)
          throw new CareError("二级联络时间应早于急救升级提示。");
        h.policy = {
          ...h.policy,
          ...Object.fromEntries(
            [
              "confirmationSeconds",
              "tierTwoSeconds",
              "emergencySeconds",
              "routineRetrySeconds",
              "routineAttempts",
              "disconnectSeconds",
            ].map((k) => [k, p[k]]),
          ),
          emergencyCallEnabled: Boolean(p.emergencyCallEnabled),
        };
        break;
      }
      case "device": {
        const d = body.value;
        if (
          ![
            "camera",
            "band",
            "screen",
            "phone",
            "pressure",
            "glucose",
            "door",
            "sleep",
          ].includes(d.type) ||
          !String(d.name || "").trim()
        )
          throw new CareError("请填写设备名称与类型。");
        if (d.type === "camera" && /卫生间|浴室|厕所|更衣/.test(d.zone || ""))
          throw new CareError("敏感空间默认禁止摄像头布点。");
        const old = h.devices.find((x) => x.id === d.id);
        const device = {
          id: old?.id || randomUUID(),
          name: String(d.name).trim().slice(0, 70),
          type: d.type,
          zone: String(d.zone || "待确认").slice(0, 40),
          online: Boolean(d.online),
          enabled: Boolean(d.enabled),
          battery:
            d.type === "camera" || d.type === "screen"
              ? null
              : old?.battery || 80,
          worn: old?.worn ?? true,
          lastSync: old?.lastSync || iso(engine.now()),
          sourceMode: "simulated",
        };
        if (!device.online)
          device.offlineSince = old?.offlineSince || iso(engine.now());
        if (old) Object.assign(old, device);
        else h.devices.push(device);
        if (
          device.type === "band" &&
          h.devices.find((d) => d.type === "band")?.id === device.id
        ) {
          h.map.online = device.online && device.enabled;
          h.map.worn = device.worn;
        }
        break;
      }
      case "member": {
        const m = body.value;
        if (
          !String(m.name || "").trim() ||
          ![1, 2, 3].includes(m.level) ||
          !["子女", "其他家属", "在宅护工", "社区照护", "医生"].includes(m.role)
        )
          throw new CareError("请填写有效的成员信息与联络级别。");
        if (!/^[+0-9*# ()-]{0,30}$/.test(m.phone || ""))
          throw new CareError("联系电话格式不正确。");
        if (m.photo && !/^data:image\/(?:png|jpeg|webp);base64,/.test(m.photo))
          throw new CareError("只支持本地PNG、JPEG或WebP头像。");
        if (m.photo?.length > 180000)
          throw new CareError("头像过大，请选择小于120KB的图片。");
        const old = h.members.find((x) => x.id === m.id);
        const value = {
          id: old?.id || randomUUID(),
          name: String(m.name).trim().slice(0, 40),
          role: m.role,
          level: m.level,
          phone: m.phone || "",
          photo: m.photo || null,
          atHome: Boolean(m.atHome),
          enabled: Boolean(m.enabled),
        };
        const members = h.members
          .filter((x) => x.id !== value.id)
          .concat(value);
        if (!members.some((x) => x.level === 1 && x.enabled))
          throw new CareError("至少保留一位启用的一级联系人。");
        h.members = members;
        break;
      }
      case "careProfile": {
        const p = body.value;
        const previousVoice = h.careProfile?.speechVoice,
          previousStyle = h.careProfile?.speechStyle;
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.wake) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.bed) ||
          !Number.isInteger(p.waterMinutes) ||
          p.waterMinutes < 30 ||
          p.waterMinutes > 480 ||
          !Number.isFinite(p.speechRate) ||
          p.speechRate < 0.5 ||
          p.speechRate > 1.5 ||
          !Number.isFinite(p.volume) ||
          p.volume < 0 ||
          p.volume > 1
        )
          throw new CareError("请填写有效的作息、饮水间隔和语音偏好。");
        if (
          p.dialect != null &&
          !["普通话", "四川话", "粤语", "上海话"].includes(p.dialect)
        )
          throw new CareError("请选择支持的方言偏好。");
        if (
          !validVoice(p.speechVoice ?? "default") ||
          !validStyle(p.speechStyle ?? "neutral")
        )
          throw new CareError("请选择支持的音色与语气。");
        if (p.dialect != null) h.preferences.dialect = p.dialect;
        h.careProfile = Object.fromEntries(
          ["wake", "nap", "bed", "diet", "avoid", "salutation"].map((k) => [
            k,
            String(p[k] || "")
              .trim()
              .slice(0, 150),
          ]),
        );
        Object.assign(h.careProfile, {
          waterMinutes: p.waterMinutes,
          speechRate: p.speechRate,
          speechVoice: p.speechVoice ?? previousVoice ?? "default",
          speechStyle: p.speechStyle ?? previousStyle ?? "neutral",
          volume: p.volume,
          waterEnabled: Boolean(p.waterEnabled),
          voiceInputMode: p.voiceInputMode === "hold" ? "hold" : "tap",
        });
        syncHydrationPlans(engine, h.careProfile);
        break;
      }
      case "preferences": {
        const p = body.value;
        if (!["普通话", "四川话", "粤语", "上海话"].includes(p.dialect))
          throw new CareError("请选择支持展示的方言偏好。");
        h.preferences = {
          ...h.preferences,
          dialect: p.dialect,
          nightEventOnly: Boolean(p.nightEventOnly),
          reportFrequency: ["weekly", "monthly"].includes(p.reportFrequency)
            ? p.reportFrequency
            : h.preferences.reportFrequency || "weekly",
        };
        if (h.reportSchedule?.frequency !== h.preferences.reportFrequency)
          h.reportSchedule = {
            frequency: h.preferences.reportFrequency,
            nextAt: nextReportTime(engine.now(), h.preferences.reportFrequency),
          };
        h.privacy.nightEventOnly = Boolean(p.nightEventOnly);
        break;
      }
      case "rules": {
        for (const key of Object.keys(HOME_RULES)) {
          const r = body.value[key];
          if (
            !r ||
            typeof r.enabled !== "boolean" ||
            !["high", "medium", "low"].includes(r.sensitivity) ||
            !Number.isFinite(Number(r.minutes)) ||
            Number(r.minutes) < 0 ||
            Number(r.minutes) > 480
          )
            throw new CareError("识别项配置无效。");
          h.rules[key] = {
            ...h.rules[key],
            enabled: r.enabled,
            sensitivity: r.sensitivity,
            minutes: Number(r.minutes),
            version: h.rules[key].version + 1,
          };
        }
        break;
      }
      case "privacy": {
        const p = body.value;
        h.privacy.placementConfirmed = Boolean(p.placementConfirmed);
        h.privacy.nightEventOnly = Boolean(p.nightEventOnly);
        h.privacy.sensitiveZonesBlocked = true;
        if (p.informed) {
          h.privacy.informedAt = iso(engine.now());
          h.privacy.consentSource = "家属手动确认已告知（演示）";
          homeFeed(
            engine,
            "家属记录了知情告知",
            "仅记录家属报告，硬件实际播报告知待接入。",
            "normal",
          );
        }
        break;
      }
      case "map": {
        const v = body.value;
        if (
          !Number.isInteger(v.radius) ||
          v.radius < 100 ||
          v.radius > 1000 ||
          !Number.isInteger(v.tolerance) ||
          v.tolerance < 20 ||
          v.tolerance > 200
        )
          throw new CareError("围栏半径100-1000米，路线容差20-200米。");
        h.map.radius = v.radius;
        h.map.tolerance = v.tolerance;
        if (v.route) {
          if (
            !Array.isArray(v.route) ||
            v.route.length < 3 ||
            v.route.length > 20 ||
            v.route.some(
              (p) =>
                !Number.isFinite(p.x) ||
                !Number.isFinite(p.y) ||
                Math.abs(p.x) > 1500 ||
                Math.abs(p.y) > 1500,
            )
          )
            throw new CareError("路线点无效。");
          h.map.route = v.route.map((p) => ({ x: p.x, y: p.y }));
        }
        const current = mapFacts(h, engine.now());
        if (current.valid && !current.inside && !h.map.geofenceEventId) {
          const e = createHomeEvent(
            engine,
            "location",
            "更新围栏后，当前有效的模拟位置在围栏外，发起确认。",
            { scenario: "fence_changed" },
          );
          h.map.geofenceEventId = e.id;
        }
        break;
      }
      default:
        throw new CareError("不支持的配置项。");
    }
    h.configVersion++;
    h.version++;
  });
}
export function deviceCommand(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home;
    if (
      ![
        "tts",
        "talk",
        "hangup",
        "emergency",
        "carer_call",
        "informed",
      ].includes(body.kind)
    )
      throw new CareError("无效的终端操作。");
    const device =
      h.devices.find((d) => d.id === body.deviceId) ||
      h.devices.find((d) => d.type === "screen");
    if (!device) throw new CareError("没有可用演示终端。");
    const cmd = {
      id: randomUUID(),
      deviceId: device.id,
      kind: body.kind,
      text: String(body.text || "").slice(0, 300),
      createdAt: iso(engine.now()),
      dueAt: iso(engine.now() + 800),
      status: "pending",
      sourceMode: "simulated",
    };
    h.commands.push(cmd);
    homeFeed(
      engine,
      "模拟终端指令已排队",
      `${device.name} · ${body.kind}。未发起真实通话或硬件播放。`,
      "normal",
    );
  });
}
export function startMapReplay(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home,
      m = h.map,
      mode = body.mode;
    archiveTrip(h);
    if (
      ![
        "normal",
        "deviation",
        "night",
        "stationary",
        "off_wrist",
        "disconnect",
        "restore",
      ].includes(mode)
    )
      throw new CareError("不支持的轨迹情境。");
    const band = h.devices.find((d) => d.type === "band");
    if (!band) throw new CareError("请先添加手环设备。");
    if (mode === "off_wrist" || mode === "disconnect") {
      if (mode === "off_wrist") band.worn = false;
      else band.online = false;
      band.offlineSince = iso(engine.now());
      m.worn = band.worn;
      m.online = band.online;
      m.replay = null;
      m.scenario = mode;
      homeFeed(
        engine,
        "手环状态需要关注",
        `模拟${mode === "off_wrist" ? "离腕" : "断连"}，将按配置窗口核实。`,
        "abnormal",
      );
      return;
    }
    band.worn = true;
    band.online = true;
    delete band.offlineSince;
    delete band.offlineEventId;
    band.lastSync = iso(engine.now());
    m.worn = true;
    m.online = true;
    m.scenario = mode;
    m.geofenceEventId = null;
    if (mode === "restore") {
      m.replay = null;
      homeFeed(
        engine,
        "模拟设备连接恢复",
        "此前的未处理事件仍需人员核实。",
        "normal",
      );
      return;
    }
    const path =
      mode === "normal"
        ? DEFAULT_ROUTE
        : mode === "stationary"
          ? [{ x: 90, y: 35 }]
          : [
              { x: 0, y: 0 },
              { x: 90, y: 35 },
              { x: 130, y: 160 },
              { x: 320, y: 240 },
              { x: 420, y: 310 },
              { x: 540, y: 340 },
            ];
    m.points = [];
    m.replay = {
      runId: engine.state.runId,
      mode,
      path,
      index: 0,
      nextAt: iso(engine.now()),
      startedAt: iso(engine.now()),
      done: false,
    };
    m.stationarySince = mode === "stationary" ? iso(engine.now()) : null;
    homeFeed(
      engine,
      "开始轨迹情境",
      `${mode === "night" ? "夜间22:20" : mode === "normal" ? "常用路线" : mode === "stationary" ? "持续静止" : "偏离路线"} · 全部位置为虚构样本。`,
      "normal",
    );
  });
}
export function applyCorrection(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home,
      c = h.corrections.find((c) => c.id === body.correctionId);
    if (!c) throw new CareError("纠错记录不存在。");
    if (c.pattern !== "bend_normal_imu")
      throw new CareError("该纠错仅保存为待验证资料，不能自动调整其他规则。");
    if (c.applied) return false;
    c.applied = true;
    c.appliedAt = iso(engine.now());
    c.validation = "仅演示生效，真实模型待验证";
    h.version++;
    h.configVersion++;
    homeFeed(
      engine,
      "个体化演示规则已更新",
      "弯腰拾物与正常惯性组合将先保留观察，未完成真实模型训练。",
      "normal",
    );
  });
}
export function onHomeClosure(engine, e) {
  if (
    e.closeReason !== "false_alarm" ||
    engine.state.home.corrections.some((c) => c.eventId === e.id)
  )
    return;
  const h = engine.state.home;
  h.corrections.push({
    id: randomUUID(),
    eventId: e.id,
    at: e.closedAt,
    reason: e.closeNote,
    pattern:
      e.scenario === "bend" || /弯腰|捡物|拾物/.test(e.closeNote)
        ? "bend_normal_imu"
        : "needs_review",
    applied: false,
    validation: "家属标注，待验证",
  });
  h.version++;
}
export function medicationEvidence(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() =>
    applyMedicationEvidence(engine, {
      action: body.action,
      occurrenceId: body.occurrenceId,
    }),
  );
}
export function applyMedicationEvidence(engine, body) {
  const h = engine.state.home,
    o = engine.state.planner.occurrences.find(
      (o) => o.id === body.occurrenceId && o.category === "medication",
    );
  if (!o) throw new CareError("请先创建并触发一条用药记录提醒。");
  const task = h.routineTasks.find((t) => t.occurrenceId === o.id);
  if (!task) throw new CareError("用药任务尚未建立，请稍后重试。");
  if (body.action === "confirm") {
    if (!task.candidate) throw new CareError("尚未观察到动作链候选。");
    if (task.verified) return false;
    task.verified = true;
    task.verifiedAt = iso(engine.now());
    task.verifiedBy = body.demoOnly ? "演示脚本模拟家属核实" : "家属手动核实";
    if (o.status !== "withdrawn") {
      o.status = "acknowledged";
      o.acknowledgedAt = iso(engine.now());
      o.version++;
    }
    const slot = currentSlot(engine.state.daily, engine.now());
    const target = body.demoOnly
      ? (engine.state.mobile.demoRecords ||= [])
      : engine.state.daily.records;
    target.push({
      ...(body.demoOnly
        ? { demoOnly: true, tourId: engine.state.mobile.tour?.id }
        : {}),
      id: randomUUID(),
      version: 1,
      date: careDate(engine.now()),
      kind: "medication",
      value: "taken",
      slot,
      reporter: "family",
      recordedAt: iso(engine.now()),
      note: body.demoOnly
        ? "完整演示中的模拟核实，未写入真实日常记录。"
        : "家属在模拟动作证据后手动确认。",
      hours: null,
      sourceMode: "simulated",
      processingMode: "live",
      additions: [],
      supersedes: null,
    });
    engine.state.daily.version++;
    homeFeed(
      engine,
      "家属确认了服药记录",
      "依据：模拟动作链 + 家属手动核实。",
      "normal",
    );
  } else if (body.action === "sequence") {
    const plan = engine.state.planner.plans.find((p) => p.id === o.planId),
      key = plan?.medicalItemId || o.planId;
    const previous = h.medicationEvidence.findLast(
      (x) =>
        x.medicationKey === key &&
        x.phase === "complete" &&
        engine.now() - Date.parse(x.at) < 20 * 60000,
    );
    h.medicationEvidence.push({
      id: randomUUID(),
      occurrenceId: o.id,
      medicationKey: key,
      phase: "complete",
      steps: ["取药", "送口", "饮水"],
      at: iso(engine.now()),
      confidence: 0.91,
      sourceMode: "simulated",
    });
    task.candidate = true;
    task.candidateAt = iso(engine.now());
    homeFeed(
      engine,
      "观察到服药动作链（模拟）",
      "取药 → 送口 → 饮水；仅为候选，不证明吞服，等待家属核实。",
      "abnormal",
    );
    if (previous) {
      const e = createHomeEvent(
        engine,
        "medication",
        "短时间内再次出现同一用药项的模拟动作链，需要核对是否重复服药。",
        { immediate: true, scenario: "duplicate_medication" },
      );
      task.duplicateEventId = e.id;
      h.commands.push({
        id: randomUUID(),
        deviceId: "screen",
        kind: "tts",
        text: "请先核对药盒与用药记录，避免重复服用。",
        createdAt: iso(engine.now()),
        dueAt: iso(engine.now() + 800),
        status: "pending",
        sourceMode: "simulated",
      });
    }
  } else throw new CareError("无效的用药证据操作。");
  h.version++;
}
export function tickHome(engine) {
  const h = engine.state.home,
    now = engine.now();
  let changed = false;
  if (!h.reportHistory) {
    h.reportHistory = [];
    changed = true;
  }
  if (!h.reportSchedule) {
    h.reportSchedule = {
      frequency: "weekly",
      nextAt: nextReportTime(now, "weekly"),
    };
    changed = true;
  }
  if (now >= Date.parse(h.reportSchedule.nextAt)) {
    captureReport(engine, h.reportSchedule.frequency);
    h.reportSchedule.nextAt = nextReportTime(now, h.reportSchedule.frequency);
    changed = true;
  }
  for (const cmd of h.commands) {
    if (cmd.status === "pending" && Date.parse(cmd.dueAt) <= now) {
      const d = h.devices.find((d) => d.id === cmd.deviceId);
      cmd.status = d?.online && d?.enabled ? "completed_simulated" : "failed";
      cmd.completedAt = iso(now);
      changed = true;
    }
  }
  if (now >= Date.parse(h.nextSampleAt)) {
    const band = h.devices.find((d) => d.type === "band" && d.enabled);
    for (const d of h.devices.filter((d) => d.online && d.enabled))
      d.lastSync = iso(now);
    if (band?.online && band.worn) {
      h.vitals = {
        heartRate: 72 + Math.round(Math.sin(now / 60000) * 3),
        oxygen: 97,
        steps: 1240,
        lastSync: iso(now),
        sourceMode: "simulated",
      };
      if (h.map.scenario === "stationary" && h.map.points.length) {
        const p = h.map.points.at(-1);
        h.map.points.push({ ...p, at: iso(now) });
        h.map.points = h.map.points.slice(-100);
      }
    }
    h.nextSampleAt = iso(now + 30000);
    changed = true;
  }
  const replay = h.map.replay;
  if (
    replay &&
    replay.runId === engine.state.runId &&
    !replay.done &&
    now >= Date.parse(replay.nextAt)
  ) {
    const p = replay.path[replay.index];
    h.map.points.push({
      ...p,
      at: iso(now),
      accuracy: 15,
      coordType: "BD09",
      sourceMode: "simulated",
    });
    h.map.lastPositionAt = iso(now);
    replay.index++;
    replay.done = replay.index >= replay.path.length;
    if (replay.done && replay.mode !== "stationary") archiveTrip(h);
    replay.nextAt = iso(now + 2000);
    changed = true;
    const facts = mapFacts(h, now),
      last3 = h.map.points.slice(-3),
      deviated =
        last3.length === 3 &&
        last3.every((p) => routeDistance(p, h.map.route) > h.map.tolerance);
    if (facts.valid && (!facts.inside || deviated) && !h.map.geofenceEventId) {
      const night = replay.mode === "night",
        e = createHomeEvent(
          engine,
          "location",
          `${night ? "夜间22:20模拟情境，立即联络。" : deviated ? "连续3点偏离常用路线，先确认再升级。" : "模拟围栏越界，立即发起确认。"}距家 ${facts.distance} 米，路线偏离 ${facts.deviation} 米。`,
          {
            immediate: night,
            mobileDemoId:
              engine.state.mobile?.demo?.kind === "location"
                ? engine.state.mobile.demo.id
                : null,
            scenario: night ? "night_outing" : "route_deviation",
          },
        );
      e.place = "青禾社区 · 模拟轨迹位置";
      e.locationSource = "BD-09虚构轨迹与几何比较";
      e.location = {
        ...e.location,
        longitude:
          h.map.home.lng +
          p.x / (111320 * Math.cos((h.map.home.lat * Math.PI) / 180)),
        latitude: h.map.home.lat + p.y / 111320,
        capturedAt: iso(now),
        accuracy: 15,
      };
      h.map.geofenceEventId = e.id;
      if (night) {
        routeHomeContacts(engine, e, 2);
        e.tier2Sent = true;
      }
    }
  }
  const band = h.devices.find((d) => d.type === "band" && d.enabled);
  if (
    band &&
    (!band.online || !band.worn) &&
    band.offlineSince &&
    now - Date.parse(band.offlineSince) >= h.policy.disconnectSeconds * 1000 &&
    !band.offlineEventId
  ) {
    const e = createHomeEvent(
      engine,
      "device_offline",
      `手环${!band.worn ? "离腕" : "断连"}已达到 ${h.policy.disconnectSeconds} 秒，最后设备位置不能代表老人当前位置。`,
      { immediate: true },
    );
    e.place = "老人位置未知";
    e.locationSource = "设备离腕／断连，仅保留最后已知信息";
    e.location.known = false;
    band.offlineEventId = e.id;
    changed = true;
  }
  if (
    h.map.scenario === "stationary" &&
    h.map.stationarySince &&
    now - Date.parse(h.map.stationarySince) > 10 * 60000 &&
    !h.map.geofenceEventId
  ) {
    const e = createHomeEvent(
      engine,
      "location",
      "模拟手环连续静止超过10分钟，先通过语音与家属核实。",
      { scenario: "stationary" },
    );
    h.map.geofenceEventId = e.id;
    changed = true;
  }
  for (const e of engine.state.events.filter(
    (e) => e.homeRouting && e.status === "escalated",
  )) {
    let updated = false;
    if (now >= Date.parse(e.claimDeadline) && !e.tier2Sent) {
      routeHomeContacts(engine, e, 2);
      e.tier2Sent = true;
      engine.log(
        e,
        "追加二级联系人",
        "一级无人接手，追加护工与社区照护员。",
        "规则引擎",
        "alert",
      );
      updated = true;
    }
    if (
      e.emergencyDeadline &&
      now >= Date.parse(e.emergencyDeadline) &&
      !e.emergencyActive
    ) {
      e.emergencyActive = true;
      e.emergencyCard = structuredClone(h.emergency);
      engine.log(
        e,
        "急救升级提示",
        "首次联络后仍无人接手：展示120模拟入口、急救信息卡与在宅护工联络。未发起真实急救呼叫。",
        "规则引擎",
        "alert",
      );
      homeFeed(
        engine,
        "需要人工决定急救联络",
        "急救信息已前置；呼叫与受理均为演示。",
        "danger",
        e.id,
        `emergency:${e.id}`,
      );
      updated = true;
    }
    if (updated) {
      e.version++;
      if (e.summary) e.summary.stale = true;
      changed = true;
    }
  }
  for (const o of engine.state.planner.occurrences.filter(
    (o) =>
      o.category === "medication" && o.recipient === "patient" && !o.overdue,
  )) {
    const plan = engine.state.planner.plans.find((p) => p.id === o.planId);
    if (!plan?.medicalItemId && plan?.origin !== "simulated-care") continue;
    let t = h.routineTasks.find((t) => t.occurrenceId === o.id);
    if (!t) {
      t = {
        id: randomUUID(),
        occurrenceId: o.id,
        createdAt: iso(now),
        attempts: 1,
        nextAt: iso(now + h.policy.routineRetrySeconds * 1000),
        candidate: false,
        verified: false,
        eventId: null,
      };
      h.routineTasks.push(t);
      changed = true;
    }
    if (
      t.verified ||
      t.eventId ||
      o.status === "withdrawn" ||
      ["paused", "cancelled"].includes(plan?.status)
    )
      continue;
    if (now >= Date.parse(t.nextAt)) {
      if (t.attempts < h.policy.routineAttempts) {
        t.attempts++;
        t.nextAt = iso(now + h.policy.routineRetrySeconds * 1000);
        o.status = "pending";
        o.attempt++;
        o.availableAt = iso(now);
        o.version++;
        homeFeed(
          engine,
          `用药核实提醒 ${t.attempts}/${h.policy.routineAttempts}`,
          "未获得家属确认，不把动作或“知道了”当作已服药。",
          "abnormal",
        );
      } else {
        const e = createHomeEvent(
          engine,
          "medication",
          `经过 ${t.attempts} 次演示提醒仍未确认用药，请家属核实；不直接认定漏服。`,
          {
            immediate: true,
            scenario: "medication_unverified",
            mobileDemoId: plan?.mobileDemoId,
          },
        );
        t.eventId = e.id;
      }
      changed = true;
    }
  }
  if (changed) h.version++;
  return changed;
}
export function captureReport(engine, kind, eventId = null) {
  const h = engine.state.home;
  h.reportHistory ??= [];
  if (eventId && h.reportHistory.some((r) => r.eventId === eventId)) return;
  const days = kind === "monthly" ? 30 : 7,
    r = homeReport(engine.state, engine.now(), days);
  h.reportHistory.push({
    id: randomUUID(),
    kind,
    eventId,
    createdAt: new Date(engine.now()).toISOString(),
    start: r.start,
    end: r.end,
    days,
    metrics: structuredClone(r.metrics),
    facts: structuredClone(r.facts),
    score: structuredClone(r.score),
    sourceMode: "simulated",
    readAt: null,
  });
  h.reportHistory = h.reportHistory.slice(-30);
  homeFeed(
    engine,
    kind === "event"
      ? "已生成异常临时报告"
      : kind === "monthly"
        ? "本月照护报告已生成"
        : "本周照护报告已生成",
    `包含${r.facts.length}项有来源的统计关注，尚不构成医学结论。`,
    kind === "event" ? "abnormal" : "normal",
    eventId,
  );
}
function archiveTrip(home) {
  const m = home.map,
    r = m.replay;
  if (!r || r.archived || m.points.length < 2) return;
  const points = structuredClone(m.points),
    start = points[0].at,
    end = points.at(-1).at;
  let distance = 0,
    stops = [];
  for (let i = 1; i < points.length; i++) {
    distance += pointDistance(points[i], points[i - 1]);
    if (
      pointDistance(points[i], points[i - 1]) < 10 &&
      Date.parse(points[i].at) - Date.parse(points[i - 1].at) >= 120000
    )
      stops.push({
        at: points[i - 1].at,
        seconds: Math.round(
          (Date.parse(points[i].at) - Date.parse(points[i - 1].at)) / 1000,
        ),
      });
  }
  let anchor = 0;
  stops = [];
  for (let i = 1; i <= points.length; i++) {
    if (i === points.length || pointDistance(points[i], points[anchor]) > 10) {
      const duration =
        (Date.parse(points[i - 1].at) - Date.parse(points[anchor].at)) / 1000;
      if (duration >= 120)
        stops.push({ at: points[anchor].at, seconds: Math.round(duration) });
      anchor = i;
    }
  }
  m.trips ??= [];
  m.trips.push({
    id: randomUUID(),
    mode: r.mode,
    startAt: start,
    endAt: end,
    durationSeconds: Math.max(
      0,
      Math.round((Date.parse(end) - Date.parse(start)) / 1000),
    ),
    distance: Math.round(distance),
    points,
    route: structuredClone(m.route),
    radius: m.radius,
    tolerance: m.tolerance,
    stops,
    sourceMode: "simulated",
  });
  m.trips = m.trips.slice(-30);
  r.archived = true;
}
export function medicationDemo(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const at = iso(engine.now() + 1000);
    engine.state.planner.plans.push({
      id: randomUUID(),
      version: 1,
      scheduleVersion: 1,
      status: "active",
      createdAt: iso(engine.now()),
      updatedAt: iso(engine.now()),
      title: "用药动作核实演示",
      category: "medication",
      recipient: "patient",
      message: "模拟核对用药任务",
      schedule: { type: "once", at },
      timeZone: engine.state.daily.timeZone,
      nextAt: at,
      origin: "simulated-care",
      draftId: null,
      lastAt: null,
    });
    engine.state.planner.version++;
    homeFeed(
      engine,
      "开始模拟用药核实任务",
      "将在1秒后进入提醒，供动作链与三次升级演示。",
      "normal",
    );
  });
}
