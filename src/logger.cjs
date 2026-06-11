"use strict";
/**
 * Pure-CJS logger — mirrors logger.js without ESM imports.
 * Used by .cjs files (e.g. capture-handlers.cjs) that cannot require() ESM.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function redact(str) {
  if (typeof str !== "string") return str;
  return str.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
            .replace(/sk-[A-Za-z0-9]{20,}/g, "[REDACTED]");
}

function createLogger(name) {
  const logDir = path.join(os.homedir(), ".unified-theatre", "logs");
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const logFile = path.join(logDir, "app.log");

  function write(level, args) {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${name}] ${args.map(a =>
      typeof a === "string" ? redact(a) : JSON.stringify(a)
    ).join(" ")}\n`;
    try { fs.appendFileSync(logFile, line); } catch {}
    if (level === "error" || level === "warn") process.stderr.write(line);
  }

  return {
    info:  (...a) => write("info",  a),
    warn:  (...a) => write("warn",  a),
    error: (...a) => write("error", a),
    debug: (...a) => write("debug", a),
  };
}

module.exports = { createLogger };
