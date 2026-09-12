import { careDate, shiftDate } from "../shared/daily.js";
import { proposalFromSpec } from "./plans.js";

function number(s) {
  if (/^\d+$/.test(s)) return Number(s);
  const n = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (s === "十") return 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (a ? n[a] : 1) * 10 + (b ? n[b] : 0);
  }
  return n[s];
}
const CH = "[零〇一二两三四五六七八九十]+";
function category(text) {
  return /药/.test(text)
    ? "medication"
    : /睡眠|睡觉|睡前|休息/.test(text)
      ? "sleep"
      : /心情|情绪/.test(text)
        ? "mood"
        : /就诊|复诊|医院|医生|病历|摘要/.test(text)
          ? "appointment"
          : "custom";
}
function titleFor(text, kind) {
  if (kind === "medication") return "记录用药";
  if (kind === "sleep")
    return /睡觉|休息/.test(text) && !/记录/.test(text)
      ? "准备休息"
      : "记录睡眠";
  if (kind === "mood") return "记录心情";
  if (kind === "appointment")
    return /摘要/.test(text) ? "整理就诊摘要" : "就诊安排";
  let task = text
    .split(/提醒(?:一下)?(?:我|周伯|老人|患者|家属|家人|周宁)?(?:一下)?/)
    .at(-1)
    .trim();
  task = task.replace(
    new RegExp(
      `^(?:(?:每天|每日|明天|今天|后天|今晚|早上|上午|下午|晚上|中午|晚间|工作日|每周[一二三四五六日天])|(?:\\d{1,2}|${CH})(?:点|时)(?:半|一刻|三刻|(?:\\d{1,2}|${CH})分?)?|\\d{1,2}:[0-9]{2}|\\s)+`,
    ),
    "",
  );
  return task.replace(/^[，,。\s]+|[，,。\s]+$/g, "").slice(0, 80);
}
export function parseReminderLanguage(
  text,
  { now, timeZone = "Asia/Shanghai", context = null } = {},
) {
  const raw = text.trim(),
    today = careDate(now, timeZone);
  if (
    /(取消|删除|暂停|停止|不要|不用).*(提醒|计划)|(?:提醒|计划).*(取消|暂停)/.test(
      raw,
    )
  )
    return {
      kind: "clarify",
      reply:
        "请在对应计划卡上选择“暂停”或“取消”。如果有多个相似计划，这样能准确选中要处理的那一条。",
      context: null,
    };
  if (
    /(列出|查看|有哪些|有什么|我的|现在的).*(提醒|计划)|(?:提醒|计划).*(有哪些|列表)/.test(
      raw,
    )
  )
    return { kind: "list" };
  if (/(加倍|双倍|改成.*片|增加.*剂量|停药|换药)/.test(raw))
    return {
      kind: "clarify",
      reply:
        "我可以安排记录和核对既定用药计划的提醒，药物与剂量调整请先与医生或药师确认。",
      context: null,
    };
  const spec = context ? structuredClone(context) : {};
  delete spec.delay_minutes;
  const kind = category(raw);
  if (kind !== "custom" || /提醒/.test(raw)) {
    spec.category = kind;
    spec.title = titleFor(raw, kind);
    spec.message =
      kind === "medication"
        ? "请核对既定用药计划与服药记录。"
        : raw.includes("提醒")
          ? raw
              .split(
                /提醒(?:一下)?(?:我|周伯|老人|患者|家属|家人|周宁)?(?:一下)?/,
              )
              .at(-1)
              .slice(0, 160)
          : "";
  }
  spec.recipient = /周伯|老人|患者/.test(raw)
    ? "patient"
    : /家人|家属|周宁|提醒我/.test(raw)
      ? "family"
      : spec.recipient || "family";
  const ask = (reply) => ({ kind: "clarify", reply, context: spec });
  let timeProblem = null;
  const relative = raw.match(new RegExp(`(\\d+|${CH})\\s*(分钟|小时)后`));
  if (relative) {
    if (
      /每天|每日|每周|工作日/.test(raw) ||
      [...raw.matchAll(new RegExp(`(\\d+|${CH})\\s*(分钟|小时)后`, "g"))]
        .length > 1
    )
      return ask(
        "请先安排一条明确的提醒：几分钟后的一次提醒，或者固定时间的重复提醒。",
      );
    const value = number(relative[1]) * (relative[2] === "小时" ? 60 : 1);
    if (!Number.isInteger(value) || value < 1 || value > 10080)
      return ask("请使用 1 分钟到 7 天以内的相对时间。");
    spec.delay_minutes = value;
    spec.repeat = "once";
    delete spec.date;
    delete spec.time;
    delete spec.weekdays;
  } else {
    const times = [
      ...raw.matchAll(
        new RegExp(
          `(?:\\d{1,2}|${CH})\\s*(?:点|时)(?:半|一刻|三刻|(?:\\d{1,2}|${CH})分?)?|\\d{1,2}:[0-9]{2}`,
          "g",
        ),
      ),
    ];
    if (times.length > 1)
      return ask(
        "这句话里有多个时间。请先给我一条完整提醒，或把它们分成两次安排。",
      );
    const period = /晚上|晚间|每晚|今晚|下午/.test(raw)
      ? "pm"
      : /凌晨|午夜|早上|上午|早晨|每早|早间/.test(raw)
        ? "am"
        : /中午/.test(raw)
          ? "noon"
          : null;
    if (period) spec.period = period;
    if (times.length) {
      const token = times[0][0],
        colon = token.includes(":");
      let h,
        m = 0;
      if (colon) {
        [h, m] = token.split(":").map(Number);
      } else {
        const match = token.match(
          new RegExp(`^(\\d{1,2}|${CH})\\s*(?:点|时)(.*)$`),
        );
        h = number(match[1]);
        const suffix = match[2].trim();
        m =
          suffix === "半"
            ? 30
            : suffix === "一刻"
              ? 15
              : suffix === "三刻"
                ? 45
                : suffix
                  ? number(suffix.replace(/分$/, ""))
                  : 0;
      }
      if (
        !Number.isInteger(h) ||
        !Number.isInteger(m) ||
        h > 23 ||
        h < 0 ||
        m > 59 ||
        m < 0
      )
        timeProblem =
          "这个时间没有识别清楚，请使用“晚上八点半”或“20:30”这样的格式。";
      else if (!colon && !spec.period && h > 0 && h <= 12)
        timeProblem =
          "请再说明上午、下午还是晚上，或直接使用 24 小时制，例如“20:00”。";
      const effectivePeriod = period || (!colon ? spec.period : null);
      if (effectivePeriod === "am" && h > 12)
        timeProblem = "上午时段与这个小时数不一致，请再确认一下具体时间。";
      if (!timeProblem) {
        if ((effectivePeriod === "pm" || effectivePeriod === "noon") && h < 12)
          h += 12;
        if (effectivePeriod === "am" && h === 12) h = 0;
        spec.time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        spec.period = h >= 12 ? "pm" : "am";
      }
    }
    if (/每天|每日|天天|每晚|每早/.test(raw)) {
      spec.repeat = "daily";
      delete spec.date;
      delete spec.weekdays;
    }
    if (/工作日/.test(raw)) {
      spec.repeat = "weekly";
      spec.weekdays = [1, 2, 3, 4, 5];
      delete spec.date;
    } else if (/每周末/.test(raw)) {
      spec.repeat = "weekly";
      spec.weekdays = [6, 7];
      delete spec.date;
    } else {
      const weekMatches = [
        ...raw.matchAll(/(?:周|星期)([一二三四五六日天七])/g),
      ];
      if (weekMatches.length) {
        const map = {
            一: 1,
            二: 2,
            三: 3,
            四: 4,
            五: 5,
            六: 6,
            日: 7,
            天: 7,
            七: 7,
          },
          days = [...new Set(weekMatches.map((m) => map[m[1]]))];
        if (/每周|每星期/.test(raw)) {
          spec.repeat = "weekly";
          spec.weekdays = days;
          delete spec.date;
        } else if (days.length === 1) {
          const wd = new Date(today + "T12:00:00Z").getUTCDay() || 7;
          let offset = /下周|下星期/.test(raw)
            ? 7 - wd + days[0]
            : (days[0] - wd + 7) % 7;
          spec.repeat = "once";
          spec.date = shiftDate(today, offset);
          delete spec.weekdays;
        } else return ask("请说明是每周重复，还是分别在具体日期提醒。");
      } else if (/每周|每星期/.test(raw))
        return ask("每周几提醒？例如“每周三上午九点”。");
    }
    const offset = /后天/.test(raw)
      ? 2
      : /明天/.test(raw)
        ? 1
        : /今天|今晚/.test(raw)
          ? 0
          : null;
    const explicit = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    const monthDay = raw.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/);
    if (offset !== null || explicit || monthDay) {
      if (/每天|每日|每周|工作日/.test(raw))
        return ask(
          "同时出现了具体日期和重复规则，请说明这次是一次提醒还是固定重复提醒。",
        );
      spec.repeat = "once";
      spec.date =
        offset !== null
          ? shiftDate(today, offset)
          : explicit
            ? explicit[0]
            : `${monthDay[1] || today.slice(0, 4)}-${monthDay[2].padStart(2, "0")}-${monthDay[3].padStart(2, "0")}`;
      delete spec.weekdays;
    }
  }
  if (timeProblem) {
    delete spec.time;
    return ask(timeProblem);
  }
  if (
    !spec.title ||
    (/^(?:每天|每日|明天|今天|晚上|上午|下午|改成|调整)/.test(spec.title) &&
      spec.category === "custom")
  )
    return ask("希望提醒您做什么？可以说“提醒我喝水”或“提醒周伯记录心情”。");
  if (!spec.repeat)
    return ask(
      "这是哪一天的一次提醒，还是每天／每周重复？例如“明天上午九点”或“每天晚上八点”。",
    );
  if (spec.delay_minutes === undefined && !spec.time)
    return ask("具体几点提醒？请说明时段，例如“晚上八点”或“20:00”。");
  if (spec.repeat === "once" && !spec.date && spec.delay_minutes === undefined)
    return ask("具体在哪一天提醒？例如“明天上午九点”。");
  try {
    const proposal = proposalFromSpec(spec, now, timeZone);
    return {
      kind: "proposal",
      proposal,
      context: spec,
      reply:
        "我已把这句话整理成提醒草稿。请核对下方时间、频率与接收人，启用后会按计划提醒。",
    };
  } catch (e) {
    return ask(e.message + " 可以换一个明确的未来时间。");
  }
}
