import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
export function createAccessGate(code = "") {
  const sessions = new Map();
  const configured = Boolean(code);
  function login(value) {
    if (configured) {
      const a = createHash("sha256")
          .update(String(value || ""))
          .digest(),
        b = createHash("sha256").update(code).digest();
      if (!timingSafeEqual(a, b)) return null;
    }
    const token = randomBytes(24).toString("hex");
    sessions.set(token, Date.now() + 86400000);
    return token;
  }
  function allowed(cookie = "") {
    if (!configured) return true;
    const token = cookie
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("yiban_session="))
      ?.slice(14);
    return Boolean(token && sessions.get(token) > Date.now());
  }
  return { configured, login, allowed };
}
