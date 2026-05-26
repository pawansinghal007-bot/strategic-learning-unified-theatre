const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const slo = require("./slo.js");

function runChild(bin, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];

    const child = spawn(bin, args, {
      env: Object.assign({}, process.env, extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });

    child.on("error", () => {
      resolve({ code: null, stdout: "", stderr: "" });
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createChaosHome() {
  const prefix = path.join(os.tmpdir(), `rotator-chaos-${Date.now()}-`);
  const chaosHome = fs.mkdtempSync(prefix);
  const rotator = path.join(chaosHome, ".vscode-rotator");
  fs.mkdirSync(rotator, { recursive: true, mode: 0o700 });
  return chaosHome;
}

function rotatorDir(home) {
  return path.join(home, ".vscode-rotator");
}

function configPath(home) {
  return path.join(rotatorDir(home), "config.json");
}

function experienceDbPath(home) {
  return path.join(rotatorDir(home), "experience.db");
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const backupPath = `${filePath}.bak-chaos`;
  fs.copyFileSync(filePath, backupPath);
}

function restoreFile(filePath) {
  const backupPath = `${filePath}.bak-chaos`;
  if (!fs.existsSync(backupPath)) {
    return;
  }
  fs.copyFileSync(backupPath, filePath);
  fs.unlinkSync(backupPath);
}

function parseHealthOk(stdout) {
  if (typeof stdout !== "string") {
    return false;
  }

  try {
    const json = JSON.parse(stdout);
    if (!json || typeof json !== "object") {
      return false;
    }

    const statusValue = (value) =>
      typeof value === "string" &&
      ["ok", "healthy"].includes(value.toLowerCase());

    if (statusValue(json.overall)) {
      return true;
    }

    if (statusValue(json.status)) {
      return true;
    }

    const accountStatus = json.account?.status;
    const daemonStatus = json.daemon?.status;
    const localLlmStatus = json.localLlm?.status;

    if (
      statusValue(accountStatus) &&
      statusValue(daemonStatus) &&
      statusValue(localLlmStatus)
    ) {
      return true;
    }

    if (statusValue(daemonStatus)) {
      return true;
    }

    if (statusValue(accountStatus)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function waitForHealthy({
  timeoutMs,
  label,
  chaosHome,
  healthArgs,
  nodeBin,
}) {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let attempt = 0;

  while (Date.now() <= deadline) {
    attempt += 1;
    const { stdout } = await runChild(nodeBin, healthArgs, { HOME: chaosHome });
    const healthy = parseHealthOk(stdout);
    console.debug(
      `[chaos] ${label} health poll attempt #${attempt}: healthy=${healthy}`,
    );
    if (healthy) {
      return { healthy: true, recoveryTimeMs: Date.now() - start };
    }

    await delay(slo.healthPollIntervalMs);
  }

  console.warn(`[chaos] ${label} did not become healthy within ${timeoutMs}ms`);
  return { healthy: false, recoveryTimeMs: timeoutMs };
}

function assertRecovery(label, recoveryTimeMs, sloMs) {
  if (recoveryTimeMs > sloMs) {
    throw new Error(
      `[SLO VIOLATION] ${label}: recoveryTimeMs=${recoveryTimeMs}ms > SLO=${sloMs}ms`,
    );
  }
}

function computeFailureRate(results) {
  const total = Array.isArray(results) ? results.length : 0;
  if (total === 0) {
    return { total: 0, failures: 0, pct: 0 };
  }

  const failures = results.filter(
    (result) => result && result.ok === false,
  ).length;
  const pct = Number(((failures / total) * 100).toFixed(2));
  return { total, failures, pct };
}

module.exports = {
  runChild,
  delay,
  createChaosHome,
  rotatorDir,
  configPath,
  experienceDbPath,
  backupFile,
  restoreFile,
  parseHealthOk,
  waitForHealthy,
  assertRecovery,
  computeFailureRate,
};
