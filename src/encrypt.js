import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";

let machineIdCache = null;
let keyCache = null;

function getMachineId() {
  if (machineIdCache) return machineIdCache;
  const platform = process.platform;

  if (platform === "win32") {
    try {
      const out = execSync(
        "powershell -NoProfile -Command \"(Get-CimInstance Win32_ComputerSystemProduct).UUID\"",
        { stdio: ["ignore", "pipe", "ignore"], timeout: 1000 }
      )
        .toString("utf8")
        .trim();
      if (out) {
        machineIdCache = out;
        return machineIdCache;
      }
    } catch {}

    try {
      const out = execSync("wmic csproduct get uuid", {
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1000
      })
        .toString("utf8")
        .split(/\r?\n/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-1)[0];
      if (out) {
        machineIdCache = out;
        return machineIdCache;
      }
    } catch {}
  }

  if (platform === "darwin") {
    try {
      const out = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk -F\\\" '/IOPlatformUUID/{print $(NF-1)}'",
        { stdio: ["ignore", "pipe", "ignore"], timeout: 1000 }
      )
        .toString("utf8")
        .trim();
      if (out) {
        machineIdCache = out;
        return machineIdCache;
      }
    } catch {}
  }

  if (platform === "linux") {
    const candidates = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
    for (const p of candidates) {
      try {
        const out = fs.readFileSync(p, "utf8").trim();
        if (out) {
          machineIdCache = out;
          return machineIdCache;
        }
      } catch {}
    }
  }

  const fallback = [
    platform,
    os.hostname(),
    os.userInfo?.().username ?? "",
    os.arch()
  ].join("|");

  machineIdCache = crypto.createHash("sha256").update(fallback).digest("hex");
  return machineIdCache;
}

function getKey() {
  if (keyCache) return keyCache;
  const machineId = getMachineId();
  keyCache = crypto.scryptSync(machineId, "strategic-learning-unified-theatre", 32);
  return keyCache;
}

export function encrypt(plaintext) {
  if (typeof plaintext !== "string") {
    throw new TypeError("encrypt(plaintext) expects a string");
  }

  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decrypt({ iv, tag, ciphertext }) {
  if (!iv || !tag || !ciphertext) {
    throw new TypeError("decrypt({iv,tag,ciphertext}) expects all fields");
  }

  const key = getKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final()
  ]);

  return plaintext.toString("utf8");
}

