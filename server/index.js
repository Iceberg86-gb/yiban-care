import express from "express";
import { createSpeechService } from "./speech.js";
import { mobileAction } from "./mobile.js";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { CareEngine, CareError } from "./engine.js";
import { createAgent } from "./agent.js";
import { dailySummary, summaryMarkdown } from "../shared/daily.js";
import { loadVaultKey } from "./vault.js";
import { createAccessGate } from "./access.js";
import { medicationDemo } from "./home.js";
import {
  importMedical,
  confirmMedical,
  medicalDrafts,
  originalMedical,
  pdfBridge,
  visitPayload,
  createShare,
  resolveShare,
} from "./medical.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
const app = express();
app.disable("x-powered-by");
app.use("/api/medical/import", express.json({ limit: "8mb" }));
app.use("/api/home/config", express.json({ limit: "220kb" }));
app.use(express.json({ limit: "32kb" }));
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return res.status(403).json({ error: "仅允许同源演示操作。" });
    } catch {
      return res.status(403).json({ error: "无效来源。" });
    }
  }
  next();
});
const clients = new Set();
const statePath = resolve(
  root,
  process.env.YIBAN_DATA_FILE || "data/state.json",
);
const vaultKey = loadVaultKey(statePath + ".key");
const uploadDir = resolve(dirname(statePath), "medical-files");
const access = createAccessGate(process.env.APP_ACCESS_CODE || "");
const engine = new CareEngine({
  file: statePath,
  storageKey: vaultKey,
  onChange: (state) => {
    for (const res of clients)
      res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  },
});
const agent = createAgent(engine, {
  key: process.env.QIANFAN_API_KEY || "",
  model: process.env.QIANFAN_MODEL || "ernie-4.5-turbo-128k",
});
const speech = createSpeechService({
  key: process.env.BAIDU_TTS_API_KEY || "",
  secret: process.env.BAIDU_TTS_SECRET_KEY || "",
  voice: process.env.LOCAL_TTS_VOICE || "Tingting",
  speaker: process.env.BAIDU_TTS_SPEAKER || "4197",
});
engine.tick();
const timer = setInterval(() => {
  try {
    engine.tick();
  } catch {
    console.error("事件保存失败：请检查本地数据文件权限与磁盘空间。");
  }
}, 500);
app.post("/api/session/login", (req, res) => {
  const token = access.login(req.body.code);
  if (!token) return res.status(401).json({ error: "访问口令不正确。" });
  res.setHeader(
    "Set-Cookie",
    `yiban_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
  );
  res.json({ ok: true });
});
app.use("/api", (req, res, next) => {
  if (
    req.method === "GET" &&
    /^\/shared\/[a-f0-9]{48}\/(info|pdf)$/.test(req.path)
  )
    return next();
  if (!access.allowed(req.headers.cookie))
    return res
      .status(401)
      .json({ error: "请输入家庭访问口令。", code: "LOGIN_REQUIRED" });
  next();
});
app.get("/api/state", (_req, res) => {
  engine.tick();
  res.json(engine.snapshot());
});
app.get("/api/config", (_req, res) =>
  res.json({
    demo: true,
    storage: "本地 JSON 文件",
    qianfan: agent.status(),
    speech: speech.status(),
    mapBrowserAk: process.env.BAIDU_MAP_BROWSER_AK || "",
    security: {
      encryptedAtRest: true,
      algorithm: "AES-256-GCM",
      accessCodeEnabled: access.configured,
      doctorPackageLinks: true,
      note: access.configured
        ? "家庭API需要访问口令，分享链接仅返回就医包"
        : "当前为本地演示访问，未启用身份鉴权；医生范围只是独立分享入口",
    },
    networkUrls:
      host === "0.0.0.0"
        ? Object.values(networkInterfaces())
            .flat()
            .filter((n) => n.family === "IPv4" && !n.internal)
            .map((n) => `http://${n.address}:${port}/?view=elder`)
        : [],
  }),
);
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  clients.add(res);
  res.write(`event: state\ndata: ${JSON.stringify(engine.snapshot())}\n\n`);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});
const command = (fn) => (req, res, next) => {
  try {
    engine.tick();
    fn(req.body || {});
    res.json(engine.snapshot());
  } catch (error) {
    next(error);
  }
};
app.get("/api/speech/status", (_req, res) => res.json(speech.status()));
app.post("/api/speech", async (req, res, next) => {
  try {
    engine.checkRun(req.body.runId);
    const profile = engine.state.home.careProfile || {};
    const result = await speech.synthesize(
      req.body.text,
      req.body.rate ?? profile.speechRate,
      {
        voice: req.body.voice ?? profile.speechVoice ?? "default",
        emotion: req.body.emotion ?? profile.speechStyle ?? "neutral",
      },
    );
    engine.checkRun(req.body.runId);
    res.setHeader("Content-Type", result.type);
    res.setHeader("X-Voice-Provider", result.provider);
    res.setHeader("X-Voice-Fallback", result.fallback ? "1" : "0");
    res.setHeader("X-Voice-Speaker", result.speaker);
    res.setHeader("X-Voice-Fallback-Reason", result.fallbackReason || "");
    res.send(result.audio);
  } catch (error) {
    next(
      error instanceof CareError
        ? error
        : new CareError("语音暂不可用，请稍后重试。", 503),
    );
  }
});
app.post(
  "/api/mobile/action",
  command((body) => mobileAction(engine, body)),
);
app.post(
  "/api/demo/start",
  command((body) => engine.start(body)),
);
app.post(
  "/api/demo/reset",
  command((body) => engine.reset(body)),
);
app.post(
  "/api/demo/advance",
  command((body) => engine.advance(body)),
);
app.post(
  "/api/demo/fault",
  command((body) => engine.fault(body)),
);
app.post(
  "/api/events/action",
  command((body) => engine.action(body)),
);
app.post(
  "/api/events/playback",
  command((body) => engine.playback(body)),
);
app.post(
  "/api/help",
  command((body) => engine.requestHelp(body)),
);
app.post(
  "/api/daily/record",
  command((body) => engine.saveDaily(body)),
);
app.post(
  "/api/daily/supplement",
  command((body) => engine.supplementDaily(body)),
);
app.post(
  "/api/daily/plan",
  command((body) => engine.savePlan(body)),
);
app.post(
  "/api/daily/review",
  command((body) => engine.reviewDaily(body)),
);
app.post(
  "/api/daily/seed",
  command((body) => engine.seedDaily(body)),
);
app.get("/api/daily/summary", (req, res) => {
  const days = Number(req.query.days || 7);
  if (![7, 14, 30].includes(days))
    return res.status(400).json({ error: "仅支持 7、14 或 30 天汇总。" });
  const summary = dailySummary(engine.state, engine.now(), days);
  if (req.query.format === "md") {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="youban-visit-${summary.end}-${days}days.md"`,
    );
    return res
      .type("text/markdown; charset=utf-8")
      .send(summaryMarkdown(summary));
  }
  res.json(summary);
});
app.post("/api/agent/summary", async (req, res, next) => {
  try {
    const result = await agent.summarize(req.body.runId, req.body.eventId);
    res.json({ ...result, config: agent.status(), state: engine.snapshot() });
  } catch (error) {
    next(error);
  }
});
app.post("/api/agent/plan", async (req, res, next) => {
  try {
    const result = await agent.plan(req.body || {});
    res.json({ ...result, state: engine.snapshot(), config: agent.status() });
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/reminders/activate",
  command((body) => engine.activateReminder(body)),
);
app.post(
  "/api/reminders/change",
  command((body) => engine.changeReminder(body)),
);
app.post(
  "/api/reminders/action",
  command((body) => engine.reminderAction(body)),
);
app.post(
  "/api/reminders/voice",
  command((body) => engine.reminderVoice(body)),
);
app.post(
  "/api/home/scenario",
  command((body) => engine.homeScenario(body)),
);
app.post(
  "/api/home/config",
  command((body) => engine.saveHome(body)),
);
app.post(
  "/api/home/command",
  command((body) => engine.deviceCommand(body)),
);
app.post(
  "/api/home/map",
  command((body) => engine.mapReplay(body)),
);
app.post(
  "/api/home/correction",
  command((body) => engine.applyCorrection(body)),
);
app.post(
  "/api/home/medication-evidence",
  command((body) => engine.medicationEvidence(body)),
);
app.post(
  "/api/home/medication-demo",
  command((body) => medicationDemo(engine, body)),
);
app.post("/api/medical/import", async (req, res, next) => {
  try {
    await importMedical(engine, req.body, { uploadDir, key: vaultKey });
    res.json(engine.snapshot());
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/medical/confirm",
  command((body) => confirmMedical(engine, body)),
);
app.post(
  "/api/medical/reminders",
  command((body) => medicalDrafts(engine, body)),
);
app.get("/api/medical/:id/original", (req, res, next) => {
  try {
    const file = originalMedical(engine, req.params.id, {
      uploadDir,
      key: vaultKey,
    });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.type(file.mime).send(Buffer.from(file.base64, "base64"));
  } catch (e) {
    next(e);
  }
});
app.post("/api/agent/report", async (req, res, next) => {
  try {
    const result = await agent.report(req.body);
    res.json({ ...result, state: engine.snapshot(), config: agent.status() });
  } catch (e) {
    next(e);
  }
});
app.get("/api/reports/visit.pdf", async (req, res, next) => {
  try {
    const days = Number(req.query.days || 7);
    if (![7, 30].includes(days)) throw new CareError("请选择7或30天。");
    const result = await pdfBridge({
      operation: "create",
      payload: visitPayload(engine, days),
    });
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="youban-visit-demo.pdf"',
    );
    res.type("application/pdf").send(Buffer.from(result.base64, "base64"));
  } catch (e) {
    next(e);
  }
});
app.post("/api/reports/share", (req, res, next) => {
  try {
    const result = createShare(engine, req.body);
    res.json({ ...result, state: engine.snapshot() });
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/reports/revoke",
  command((body) => {
    engine.checkRun(body.runId);
    engine.transaction(() => {
      const share = engine.state.home.shares.find((s) => s.id === body.shareId);
      if (!share) throw new CareError("分享不存在。");
      share.active = false;
      engine.state.home.version++;
    });
  }),
);
app.get("/api/shared/:token/info", (req, res, next) => {
  try {
    const s = resolveShare(engine, req.params.token);
    res.json({
      person: s.payload.person,
      start: s.payload.start,
      end: s.payload.end,
      expiresAt: s.expiresAt,
      demo: true,
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/shared/:token/pdf", async (req, res, next) => {
  try {
    const s = resolveShare(engine, req.params.token);
    const result = await pdfBridge({ operation: "create", payload: s.payload });
    res.type("application/pdf").send(Buffer.from(result.base64, "base64"));
  } catch (e) {
    next(e);
  }
});
app.get("/api/export", (_req, res) => {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="youban-run-${engine.state.runId.slice(0, 8)}.json"`,
  );
  res.json({
    ...engine.snapshot(),
    exportedAt: new Date().toISOString(),
    notice: "虚构人物、模拟传感器、模拟联络与机构接单。请以逐项来源标记为准。",
    integrations: {
      qianfan: agent.status(),
      mapConfigured: Boolean(process.env.BAIDU_MAP_BROWSER_AK),
    },
  });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在。" }));
app.use((err, _req, res, _next) => {
  const known = err instanceof CareError;
  res
    .status(known ? err.status : err.type === "entity.parse.failed" ? 400 : 500)
    .json({
      error: known ? err.message : "请求未完成，请检查服务状态后重试。",
    });
});
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { port: port + 20000, host: "127.0.0.1" },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  if (!existsSync(resolve(root, "dist/index.html")))
    throw new Error("请先运行 npm run build，或使用 npm run dev。");
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
}
const server = app.listen(port, host, () =>
  console.log(
    `有伴演示已启动：http://localhost:${port} · 老人端：http://localhost:${port}/?view=elder`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    for (const res of clients) res.end();
    server.close(() => process.exit(0));
  });
