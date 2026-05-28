"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function parseHealthOk(output) {
  try {
    const health = JSON.parse(output);
    const status = String(health.overall || health.status || "").toLowerCase();
    return status === "ok" || status === "healthy";
  } catch {
    return false;
  }
}

function computeFailureRate(results) {
  const total = results.length;
  const failures = results.filter((result) => !result.ok).length;
  const pct = total === 0 ? 0 : Math.round((failures / total) * 100);
  return { total, failures, pct };
}

function assertRecovery(name, elapsedMs, sloMs) {
  if (elapsedMs > sloMs) {
    throw new Error(
      `[SLO VIOLATION] ${name} recovered in ${elapsedMs}ms, above ${sloMs}ms`,
    );
  }
}

function delay(ms) {
  const duration = Math.max(0, Number(ms) || 0);
  const target = Date.now() + duration;

  return new Promise((resolve) => {
    function finishWhenElapsed() {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        resolve();
        return;
      }
      setTimeout(finishWhenElapsed, remaining);
    }

    setTimeout(finishWhenElapsed, duration);
  });
}

function createChaosHome() {
  const chaosHome = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-rotator-chaos-"));
  fs.mkdirSync(path.join(chaosHome, ".vscode-rotator"), { recursive: true });
  return chaosHome;
}

module.exports = {
  parseHealthOk,
  computeFailureRate,
  assertRecovery,
  delay,
  createChaosHome,
};
