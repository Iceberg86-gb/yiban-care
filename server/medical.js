import { randomUUID, createHash, randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CareError } from "./errors.js";
import { encryptState, decryptState } from "./vault.js";
import { homeReport } from "../shared/home.js";
import { nextReminder, wallInstant } from "../shared/plans.js";
import { careDate, shiftDate } from "../shared/daily.js";
const runtime =
  "/Users/gods./.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const script = fileURLToPath(new URL("./pdf_bridge.py", import.meta.url));
export function pdfBridge(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.PDF_PYTHON || (existsSync(runtime) ? runtime : "python3"),
      [script],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new CareError("PDF处理超时，请使用较小的资料。"));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.length > 20000000) {
        child.kill();
        reject(new CareError("PDF输出过大。"));
      }
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString().slice(0, 1000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new CareError("PDF运行环境不可用，请检查Python依赖。"));
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(out);
        if (data.error) reject(new CareError(data.error));
        else resolve(data);
      } catch {
        reject(new CareError("PDF处理失败，扫描件可先转录文字。"));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
export function parseMedicalText(text) {
  const result = {
    diagnoses: [],
    allergies: [],
    medications: [],
    followUpDate: "",
    followUpTime: "",
    measurements: [],
    evidence: [],
  };
  String(text)
    .split(/\r?\n/)
    .forEach((line, index) => {
      const s = line.trim();
      let m;
      if ((m = s.match(/^(?:入院|出院|临床)?诊断\s*[:：]\s*(.+)$/)))
        result.diagnoses.push(m[1].slice(0, 200));
      if ((m = s.match(/^(?:药物)?过敏(?:史)?\s*[:：]\s*(.+)$/)))
        result.allergies.push(m[1].slice(0, 200));
      if ((m = s.match(/^(?:药品|用药|药物|药名)\s*[:：]\s*([^；;，,]+)/))) {
        const times = [...s.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(
            (x) => `${x[1].padStart(2, "0")}:${x[2]}`,
          ),
          dose = s.match(/(?:剂量|用量)\s*[:：]\s*([^；;，,]+)/);
        result.medications.push({
          id: randomUUID(),
          name: m[1].trim().slice(0, 100),
          dose: dose ? dose[1].trim().slice(0, 100) : "",
          times: [...new Set(times)],
          sourceLine: index + 1,
          sourceText: s.slice(0, 500),
          frequency: /每日|每天|一天/.test(s) ? "daily" : "unspecified",
        });
      }
      if (/复诊|随访/.test(s)) {
        const date = s.match(/(20\d{2})[-年](\d{1,2})[-月](\d{1,2})日?/);
        if (date) {
          const value = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
          try {
            if (shiftDate(value, 0) === value) result.followUpDate = value;
          } catch {}
        }
        const time = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        if (time)
          result.followUpTime = `${time[1].padStart(2, "0")}:${time[2]}`;
      }
      if (/^(?:血压|血糖|血氧|心率|糖化血红蛋白)\s*[:：]/.test(s))
        result.measurements.push({
          text: s.slice(0, 300),
          sourceLine: index + 1,
        });
      if (/诊断|过敏|药品|用药|药物|复诊|随访|血压|血糖/.test(s))
        result.evidence.push({ line: index + 1, text: s.slice(0, 500) });
    });
  return result;
}
export async function importMedical(engine, body, { uploadDir, key }) {
  engine.checkRun(body.runId);
  const runId = body.runId;
  let text = String(body.text || "").trim(),
    name = String(body.name || "手动病历文字").slice(0, 120),
    mime = body.mime || "text/plain",
    needsTranscription = false,
    fileInfo = null;
  if (text.length > 50000) throw new CareError("文字请控制在5万字以内。");
  if (body.base64) {
    if (
      typeof body.base64 !== "string" ||
      body.base64.length > 7500000 ||
      !/^[A-Za-z0-9+/=\s]+$/.test(body.base64)
    )
      throw new CareError("文件过大或格式不正确，最多5MB。");
    const bytes = Buffer.from(body.base64, "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new CareError("文件最多5MB。");
    if (mime === "application/pdf") {
      if (bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new CareError("不是有效的PDF文件。");
      const result = await pdfBridge({
        operation: "extract",
        base64: body.base64,
      });
      text = result.text;
      needsTranscription = result.needsTranscription;
    } else if (["text/plain", "text/markdown"].includes(mime))
      text = bytes.toString("utf8");
    else if (["image/png", "image/jpeg", "image/webp"].includes(mime))
      needsTranscription = !text;
    else
      throw new CareError(
        "支持PDF、TXT、MD、PNG、JPEG、WebP；扫描件需要文字转录。",
      );
    fileInfo = { id: randomUUID(), name, mime, base64: body.base64 };
  }
  if (!text && !fileInfo) throw new CareError("请上传资料或粘贴文字。");
  engine.checkRun(runId);
  const parsed = parseMedicalText(text);
  const record = {
    id: randomUUID(),
    version: 1,
    name,
    mime,
    text: text.slice(0, 50000),
    parsed,
    status: needsTranscription ? "needs_transcription" : "needs_review",
    createdAt: new Date(engine.now()).toISOString(),
    sourceMode: "uploaded",
    parser: "本地文字规则提取，需家属核对；扫描OCR未接入",
    fileId: fileInfo?.id || null,
  };
  if (fileInfo) {
    mkdirSync(uploadDir, { recursive: true });
    writeFileSync(
      join(uploadDir, fileInfo.id + ".json"),
      JSON.stringify(encryptState(fileInfo, key)),
      { mode: 0o600 },
    );
  }
  engine.transaction(() => {
    engine.state.home.medicalRecords.push(record);
    engine.state.home.version++;
  });
  return record;
}
export function confirmMedical(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home,
      r = h.medicalRecords.find((x) => x.id === body.recordId);
    if (!r) throw new CareError("资料不存在。");
    if (r.version !== body.version)
      throw new CareError("资料已有更新，请核对最新内容。", 409);
    if (body.reviewed !== true) throw new CareError("请对照原文核实后确认。");
    const v = body.value;
    if (
      !Array.isArray(v.diagnoses) ||
      !Array.isArray(v.allergies) ||
      !Array.isArray(v.medications) ||
      v.medications.length > 20
    )
      throw new CareError("结构化内容无效。");
    const medications = v.medications.map((m) => {
      if (
        !String(m.name || "").trim() ||
        !Array.isArray(m.times) ||
        m.times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
      )
        throw new CareError("药物名称或时间无效；未明确时间可留空。");
      return {
        id: m.id || randomUUID(),
        name: String(m.name).trim().slice(0, 100),
        dose: String(m.dose || "").slice(0, 100),
        times: [...new Set(m.times)],
        frequency: m.frequency === "daily" ? "daily" : "unspecified",
      };
    });
    if (v.followUpDate) {
      try {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(v.followUpDate) ||
          shiftDate(v.followUpDate, 0) !== v.followUpDate
        )
          throw new Error();
      } catch {
        throw new CareError("复诊日期无效。");
      }
    }
    if (v.followUpTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.followUpTime))
      throw new CareError("复诊时间无效。");
    r.confirmed = {
      diagnoses: v.diagnoses.map(String).map((s) => s.slice(0, 200)),
      allergies: v.allergies.map(String).map((s) => s.slice(0, 200)),
      medications,
      measurements: Array.isArray(v.measurements)
        ? v.measurements.slice(0, 30).map((m) => ({
            text: String(m.text || "").slice(0, 300),
            source: "家属核对",
          }))
        : [],
      followUpDate: String(v.followUpDate || ""),
      followUpTime: String(v.followUpTime || ""),
    };
    r.status = "confirmed";
    r.reviewedAt = new Date(engine.now()).toISOString();
    r.version++;
    h.emergency = {
      ...h.emergency,
      diagnoses: r.confirmed.diagnoses.length
        ? r.confirmed.diagnoses
        : ["尚未填写"],
      allergies: r.confirmed.allergies.length
        ? r.confirmed.allergies
        : ["尚未填写，不能视为无过敏"],
      medications,
      reviewedAt: r.reviewedAt,
      source: `家属核对：${r.name}`,
    };
    h.version++;
  });
}
export function medicalDrafts(engine, body) {
  engine.checkRun(body.runId);
  return engine.transaction(() => {
    const h = engine.state.home,
      r = h.medicalRecords.find((x) => x.id === body.recordId);
    if (!r || r.status !== "confirmed")
      throw new CareError("请先核对并确认病历资料。");
    let count = 0;
    for (const m of r.confirmed.medications.filter(
      (m) => m.frequency === "daily",
    ))
      for (const time of m.times) {
        const key = `medical:${r.id}:${m.id}:${time}`;
        if (engine.state.planner.drafts.some((d) => d.medicalKey === key))
          continue;
        const schedule = { type: "daily", time },
          draft = {
            id: randomUUID(),
            version: 1,
            status: "proposed",
            title: `记录用药：${m.name}`,
            category: "medication",
            recipient: "patient",
            message: "请核对既定医嘱与服药记录。",
            schedule,
            timeZone: engine.state.daily.timeZone,
            nextAt: nextReminder(
              schedule,
              engine.now(),
              engine.state.daily.timeZone,
            ),
            createdAt: new Date(engine.now()).toISOString(),
            origin: "medical",
            medicalItemId: m.id,
            medicalKey: key,
          };
        engine.state.planner.drafts.push(draft);
        count++;
      }
    if (r.confirmed.followUpDate && r.confirmed.followUpTime) {
      const key = `followup:${r.id}:${r.confirmed.followUpDate}:${r.confirmed.followUpTime}`;
      if (!engine.state.planner.drafts.some((d) => d.medicalKey === key)) {
        let at;
        try {
          at = wallInstant(
            r.confirmed.followUpDate,
            r.confirmed.followUpTime,
            engine.state.daily.timeZone,
          );
        } catch {}
        if (at && at > engine.now()) {
          engine.state.planner.drafts.push({
            id: randomUUID(),
            version: 1,
            status: "proposed",
            title: "按病历安排复诊",
            category: "appointment",
            recipient: "family",
            message: "请核对已确认的复诊安排。",
            schedule: { type: "once", at: new Date(at).toISOString() },
            timeZone: engine.state.daily.timeZone,
            nextAt: new Date(at).toISOString(),
            createdAt: new Date(engine.now()).toISOString(),
            origin: "medical",
            medicalKey: key,
          });
          count++;
        }
      }
    }
    if (!count)
      throw new CareError(
        "没有新的明确提醒时点。请核对用药频率与时间、复诊时间，或查看已有草稿。",
      );
    engine.state.planner.version++;
    h.version++;
  });
}
export function originalMedical(engine, id, { uploadDir, key }) {
  const r = engine.state.home.medicalRecords.find((x) => x.id === id);
  if (!r?.fileId) throw new CareError("没有原始文件。", 404);
  return decryptState(
    JSON.parse(readFileSync(join(uploadDir, r.fileId + ".json"), "utf8")),
    key,
  );
}
export function visitPayload(engine, days = 7) {
  const r = homeReport(engine.state, engine.now(), days);
  return {
    person: {
      name: engine.state.profile.name,
      age: engine.state.home.emergency.age,
    },
    caregiver:
      engine.state.home.members.find((m) => m.level === 1 && m.enabled)?.name ||
      "",
    start: r.start,
    end: r.end,
    generatedAt: r.generatedAt,
    emergency: r.emergency,
    metrics: r.metrics,
    facts: r.facts,
    suggestions: r.suggestions,
    score: r.score,
    daily: { stats: r.daily.stats },
    events: r.events.map((e) => ({
      date: careDate(Date.parse(e.createdAt)),
      title: e.title,
      status: {
        confirming: "正在确认",
        review_required: "待核实",
        escalated: "等待接手",
        handling: "跟进中",
        closed: "已结案",
      }[e.status],
      result: e.closeNote || e.progress.at(-1)?.text || "",
    })),
    familyNotes: r.daily.supplements
      .map((a) => `${a.date} ${a.note}`)
      .slice(0, 5),
    labNotes: r.medicalRecords
      .flatMap((record) =>
        (record.confirmed.measurements || []).map(
          (m) => `${record.name}：${m.text}`,
        ),
      )
      .slice(0, 5),
    sources: r.sources,
  };
}
export function createShare(engine, body) {
  engine.checkRun(body.runId);
  if (![7, 30].includes(Number(body.days)))
    throw new CareError("请选择7或30天就医包。");
  const token = randomBytes(24).toString("hex"),
    tokenHash = createHash("sha256").update(token).digest("hex"),
    payload = visitPayload(engine, Number(body.days));
  engine.transaction(() => {
    engine.state.home.shares.push({
      id: randomUUID(),
      tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      active: true,
      payload,
    });
    engine.state.home.version++;
  });
  return {
    url: `/doctor/${token}`,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}
export function resolveShare(engine, token) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new CareError("分享链接无效。", 404);
  const hash = createHash("sha256").update(token).digest("hex"),
    s = engine.state.home.shares.find(
      (s) =>
        s.tokenHash === hash &&
        s.active &&
        Date.parse(s.expiresAt) > Date.now(),
    );
  if (!s) throw new CareError("就医包链接已失效或撤销。", 404);
  return s;
}
