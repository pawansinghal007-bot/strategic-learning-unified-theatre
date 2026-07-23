import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ROOT = "C:/SW Development/VS Code Agent/Solution";
const DAEMON_PATH = path.join(
  process.cwd(),
  "src",
  "daemon",
  "daemon-runner.js",
);
const SECURITY_SCAN_INTERVAL_MS = 200;
const LOG_POLL_INTERVAL_MS = 50;
const LOG_POLL_TIMEOUT_MS = 20000;
const EXIT_TIMEOUT_MS = 15000;

const shouldRunIntegration =
  process.platform === "win32" &&
  existsSync(PROJECT_ROOT) &&
  path.resolve(PROJECT_ROOT) === path.resolve(process.cwd());

let childProcess = null;
let childExitPromise = null;
const tempDirs = new Set();

async function readJsonLines(filePath) {
  const content = await fs.readFile(filePath, "utf8");

  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function waitFor(predicate, timeoutMs) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, LOG_POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for predicate`);
}

async function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) {
        return;
      }
      settled = true;
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Child process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("exit", (code, signal) => {
      cleanup();
      clearTimeout(timeout);
      resolve({ code, signal });
    });

    child.on("error", (err) => {
      cleanup();
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function runDaemonShutdownTest(signal) {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-shutdown-"));
  tempDirs.add(tempHome);
  const logDir = path.join(tempHome, ".vscode-rotator");
  const logPath = path.join(logDir, "daemon.log");

  const env = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
    TMP: tempHome,
    TEMP: tempHome,
    VSCODE_ROTATOR_MOCK_LLM: "1",
    SECURITY_SCAN_INTERVAL_MS: String(SECURITY_SCAN_INTERVAL_MS),
  };

  childProcess = spawn(process.execPath, [DAEMON_PATH], {
    env,
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks = [];
  const stderrChunks = [];

  childProcess.stdout?.on("data", (chunk) =>
    stdoutChunks.push(chunk.toString()),
  );
  childProcess.stderr?.on("data", (chunk) =>
    stderrChunks.push(chunk.toString()),
  );

  childExitPromise = waitForExit(childProcess, EXIT_TIMEOUT_MS);

  await waitFor(async () => {
    try {
      const entries = await readJsonLines(logPath);
      return entries.some((entry) => entry.type === "security_scan");
    } catch {
      return false;
    }
  }, LOG_POLL_TIMEOUT_MS);

  childProcess.kill(signal);

  const exitResult = await childExitPromise;

  // Allow a brief post-exit pause so the shutdown line is fully clear of any in-flight timer
  // activity and we can assert that no later security_scan entries were emitted.
  await new Promise((resolve) =>
    setTimeout(resolve, SECURITY_SCAN_INTERVAL_MS * 3),
  );

  const entries = await readJsonLines(logPath);
  const shutdownEntries = entries.filter(
    (entry) => entry.type === "shutdown" && entry.reason === signal,
  );

  if (shutdownEntries.length === 0) {
    throw new Error(
      `Expected a shutdown log entry for ${signal}, got none. stdout: ${stdoutChunks.join("")}, stderr: ${stderrChunks.join("")}`,
    );
  }

  const shutdownEntry = shutdownEntries[shutdownEntries.length - 1];
  const shutdownTs = Date.parse(shutdownEntry.ts);

  const securityScanEntries = entries.filter(
    (entry) => entry.type === "security_scan",
  );
  expect(securityScanEntries.length).toBeGreaterThan(0);

  const lastSecurityScanEntry =
    securityScanEntries[securityScanEntries.length - 1];
  const lastSecurityScanTs = Date.parse(lastSecurityScanEntry.ts);

  expect(lastSecurityScanTs).toBeLessThanOrEqual(shutdownTs);
  expect(exitResult.code).toBe(0);
  expect(exitResult.signal).toBeNull();
}

async function cleanupChild() {
  if (childProcess && !childProcess.killed) {
    try {
      childProcess.kill("SIGKILL");
    } catch {
      // best-effort cleanup
    }
  }
}

async function cleanupTempDirs() {
  for (const dir of tempDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
  tempDirs.clear();
}

if (!shouldRunIntegration) {
  describe.skip("daemon shutdown integration", () => {
    it("skips because the hardcoded daemon project root is not available on this host", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("daemon shutdown integration", () => {
    afterEach(async () => {
      await cleanupChild();
      await cleanupTempDirs();
    });

    it("clears the security scan timer and records shutdown for SIGTERM", async () => {
      await runDaemonShutdownTest("SIGTERM");
    });

    it("clears the security scan timer and records shutdown for SIGINT", async () => {
      await runDaemonShutdownTest("SIGINT");
    });
  });
}
