import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { redact } from "./utils/redactor.js";

const LEVELS = ["debug", "info", "warn", "error"];
const LOG_DIR = path.join(os.homedir(), ".vscode-rotator");
const LOG_PATH = path.join(LOG_DIR, "app.log");

function activeLevel() {
  const raw = String(process.env.ROTATOR_LOG_LEVEL || "info").toLowerCase();
  return LEVELS.includes(raw) ? raw : "info";
}

function shouldLog(level) {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(activeLevel());
}

function redactFieldValue(value) {
  return typeof value === "string" ? redact(value) : value;
}

function redactLogField(key, value) {
  if (String(key).toLowerCase() === "authblob") return "[REDACTED]";
  return redactFieldValue(value);
}

function writeLine(line) {
  try {
    const sink = process.env.ROTATOR_LOG_SINK === "file" ? "file" : "stdout";
    if (sink === "file") {
      mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
      appendFileSync(LOG_PATH, `${line}\n`, { encoding: "utf8", mode: 0o600 });
      chmodSync(LOG_PATH, 0o600);
      return;
    }
    process.stdout.write(`${line}\n`);
  } catch {
    try {
      console.error("[logger] write failed");
    } catch {}
  }
}

function normalizeError(error) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = { message: redact(message) };
  if (process.env.ROTATOR_LOG_STACKS && error instanceof Error && error.stack) {
    normalized.stack = redact(error.stack);
  }
  return normalized;
}

function buildEntry(moduleName, level, msg, fields = {}) {
  const safeFields = fields && typeof fields === "object" ? fields : {};
  const { correlationId, error, code, ...restFields } = safeFields;
  const rest = {};
  for (const [key, value] of Object.entries(restFields)) {
    rest[key] = redactLogField(key, value);
  }

  const entry = {
    ts: new Date().toISOString(),
    level,
    module: moduleName,
    msg: redact(String(msg ?? "")),
    correlationId,
    code: redactFieldValue(code),
    ...rest
  };

  const normalizedError = normalizeError(error);
  if (normalizedError) {
    entry.error = normalizedError;
  }

  return entry;
}

function createLogger(moduleName, options = {}) {
  const moduleLabel = String(moduleName || "unknown");

  const baseLog = (level, msg, fields = {}) => {
    if (!shouldLog(level)) return;

    const entry = buildEntry(moduleLabel, level, msg, fields);
    try {
      options.onEntry?.(entry);
    } catch {}

    writeLine(JSON.stringify(entry));
  };

  return {
    debug: (msg, fields) => baseLog("debug", msg, fields),
    info: (msg, fields) => baseLog("info", msg, fields),
    warn: (msg, fields) => baseLog("warn", msg, fields),
    error: (msg, fields) => baseLog("error", msg, fields)
  };
}

export { createLogger };
