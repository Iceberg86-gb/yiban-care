import {
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { loadVaultKey, encryptState, decryptState } from "../server/vault.js";

// Stop all writers before running. Only known state-shaped snapshots are migrated.
const dir = resolve(process.argv[2] || "data");
let migrated = 0,
  verified = 0;
if (existsSync(dir))
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") && !name.endsWith(".json.tmp")) continue;
    const path = join(dir, name);
    let value;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    if (value.encryption === "AES-256-GCM") {
      if (existsSync(path + ".key")) {
        decryptState(value, loadVaultKey(path + ".key"));
        verified++;
      }
      continue;
    }
    if (
      value.schemaVersion !== 1 ||
      typeof value.runId !== "string" ||
      !Array.isArray(value.events)
    )
      continue;
    const key = loadVaultKey(path + ".key"),
      temporary = path + ".encrypting";
    writeFileSync(temporary, JSON.stringify(encryptState(value, key)), {
      mode: 0o600,
    });
    renameSync(temporary, path);
    migrated++;
  }
console.log(JSON.stringify({ migrated, verified }));
