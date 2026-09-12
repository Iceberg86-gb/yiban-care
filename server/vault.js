import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { dirname } from "node:path";

export function loadVaultKey(path) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error("本地加密密钥格式不正确。");
  chmodSync(path, 0o600);
  return key;
}
export function encryptState(value, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    body = Buffer.from(JSON.stringify(value));
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
  return {
    encryption: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
}
export function decryptState(value, key) {
  if (value?.encryption !== "AES-256-GCM") return value;
  if (!key) throw new Error("此存档已加密，需要对应的本地密钥。");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  try {
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(value.data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new Error("存档无法解密，请保留原文件并检查本地密钥。");
  }
}
