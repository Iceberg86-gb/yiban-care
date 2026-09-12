import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
// Use a free local port so a running demo cannot receive this test's requests.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const port = probe.address().port;
await new Promise((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
const dir = mkdtempSync(join(tmpdir(), "yiban-auth-http-")),
  code = randomBytes(18).toString("hex"),
  base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    YIBAN_DATA_FILE: join(dir, "state.json"),
    APP_ACCESS_CODE: code,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup timeout")), 10000);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("已启动")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("server exited"));
    });
  });
  assert.equal((await fetch(base + "/api/state")).status, 401);
  const login = await fetch(base + "/api/session/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const state = await fetch(base + "/api/state", { headers: { cookie } }).then(
    (r) => r.json(),
  );
  assert.ok(state.home);
  const shared = await fetch(base + "/api/reports/share", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ runId: state.runId, days: 7 }),
  }).then((r) => r.json());
  const token = shared.url.split("/").at(-1);
  const info = await fetch(base + `/api/shared/${token}/info`).then((r) =>
    r.json(),
  );
  assert.deepEqual(
    Object.keys(info).sort(),
    ["demo", "end", "expiresAt", "person", "start"].sort(),
  );
  assert.equal((await fetch(base + "/api/state?share=" + token)).status, 401);
  const pdf = await fetch(base + `/api/shared/${token}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  await fetch(base + "/api/reports/revoke", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: state.runId,
      shareId: shared.state.home.shares.at(-1).id,
    }),
  });
  assert.equal((await fetch(base + `/api/shared/${token}/info`)).status, 404);
  console.log(
    JSON.stringify({
      familyUnauthorizedBlocked: true,
      familyLogin: true,
      doctorMetadataScoped: true,
      doctorCannotReadFamilyState: true,
      sharedPdfValid: true,
      revocationEnforced: true,
    }),
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
  rmSync(dir, { recursive: true, force: true });
}
