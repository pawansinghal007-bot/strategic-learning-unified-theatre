/* v8 ignore file -- long-running process entrypoint covered through watcher and service lifecycle tests */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { WatcherDaemon } from "./watcher.js";
import { Reporter } from "../internal/reporter.js";
import { Journal } from "../internal/journal.js";
import { releaseLock } from "../lock.js";
import { createLogger } from "../logger.js";
import { initializePluginsForStartup } from "../startup-plugins.js";

const log = createLogger("daemon-runner");

const PROJECT_ROOT = "C:/SW Development/VS Code Agent/Solution";

// --------------------------------------------------
// Bootstrap
// --------------------------------------------------

process.chdir(PROJECT_ROOT);

function baseDir() {
  return path.join(os.homedir(), ".vscode-rotator");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, {
    recursive: true,
    mode: 0o700,
  });
}

async function appendLogLine(filePath, data) {
  try {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        ...data,
      }) + "\n";

    await fs.appendFile(filePath, line, {
      encoding: "utf8",
    });
  } catch (err) {
    console.error("FAILED TO WRITE LOG:", err);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);

    timer.unref?.();
  });
}

const dir = baseDir();

await ensureDir(dir);

const pidPath = path.join(dir, "daemon.pid");

const logPath = path.join(dir, "daemon.log");

await fs.writeFile(pidPath, String(process.pid), {
  encoding: "utf8",
  mode: 0o600,
});

await appendLogLine(logPath, {
  type: "bootstrap",
  message: "daemon-runner starting",
  cwd: process.cwd(),
  platform: process.platform,
  node: process.version,
  argv: process.argv,
});

log.info("daemon.bootstrap", {
  cwd: process.cwd(),
  pid: process.pid,
});

// --------------------------------------------------
// Shared State
// --------------------------------------------------

const journal = new Journal();

const reporter = new Reporter({
  journal,
});

let currentWatcher = null;

let shuttingDown = false;

let reportTimer = null;

// --------------------------------------------------
// Daily Reporting
// --------------------------------------------------

function startReportLoop() {
  let lastDay = new Date().toISOString().slice(0, 10);

  reportTimer = setInterval(async () => {
    if (shuttingDown) {
      return;
    }

    try {
      const now = new Date();

      const day = now.toISOString().slice(0, 10);

      if (day === lastDay) {
        return;
      }

      lastDay = day;

      const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      await reporter.daily(prev);

      await appendLogLine(logPath, {
        type: "daily_report",
        status: "success",
      });
    } catch (err) {
      await appendLogLine(logPath, {
        type: "daily_report",
        status: "error",
        error: String(err?.stack ?? err),
      });
    }
  }, 60_000);

  reportTimer.unref?.();
}

// --------------------------------------------------
// Watcher Event Binding
// --------------------------------------------------

function bindWatcherEvents(watcher) {
  watcher.on("switch", async (evt) => {
    log.info("rotation.switch", evt);

    await appendLogLine(logPath, {
      type: "switch",
      ...evt,
    });
  });

  watcher.on("cooldown", async (evt) => {
    log.warn("rotation.cooldown", evt);

    await appendLogLine(logPath, {
      type: "cooldown",
      ...evt,
    });
  });

  watcher.on("recover", async (evt) => {
    log.info("rotation.recover", evt);

    await appendLogLine(logPath, {
      type: "recover",
      ...evt,
    });
  });

  watcher.on("git_warn", async (evt) => {
    log.warn("git.warning", evt);

    await appendLogLine(logPath, {
      type: "git_warn",
      ...evt,
    });
  });

  watcher.on("enhance_cycle", async (evt) => {
    log.info("enhance.cycle", evt);

    await appendLogLine(logPath, {
      type: "enhance_cycle",
      ...evt,
    });
  });

  watcher.on("capture_success", async (evt) => {
    log.info("capture.success", {
      platform: evt.platform,
    });

    await appendLogLine(logPath, {
      type: "capture_success",
      platform: evt.platform,
    });
  });

  watcher.on("error", async (err) => {
    log.error("watcher.error", {
      error: err,
    });

    await appendLogLine(logPath, {
      type: "watcher_error",
      error: String(err?.stack ?? err),
    });
  });
}

// --------------------------------------------------
// Watcher Lifecycle
// --------------------------------------------------

async function stopCurrentWatcher() {
  if (!currentWatcher) {
    return;
  }

  const watcher = currentWatcher;

  currentWatcher = null;

  try {
    await watcher.stop();

    await appendLogLine(logPath, {
      type: "watcher_stop",
      status: "success",
    });
  } catch (err) {
    await appendLogLine(logPath, {
      type: "watcher_stop",
      status: "error",
      error: String(err?.stack ?? err),
    });
  }
}

async function startWatcher() {
  const watcher = new WatcherDaemon();

  currentWatcher = watcher;

  bindWatcherEvents(watcher);

  await watcher.start();

  await appendLogLine(logPath, {
    type: "watcher_start",
    status: "success",
  });

  return watcher;
}

// --------------------------------------------------
// Cleanup
// --------------------------------------------------

async function cleanup(code = 0, reason = null) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  try {
    await appendLogLine(logPath, {
      type: "shutdown",
      code,
      reason: reason ? String(reason?.stack ?? reason) : null,
    });

    if (reportTimer) {
      clearInterval(reportTimer);

      reportTimer = null;
    }

    await stopCurrentWatcher();

    await releaseLock("switch");

    try {
      await fs.unlink(pidPath);
    } catch {}
  } catch (err) {
    console.error("CLEANUP FAILURE:", err);
  }

  process.exitCode = code;
}

// --------------------------------------------------
// Signal Handling
// --------------------------------------------------

process.on("SIGTERM", async () => {
  log.warn("process.sigterm", {});

  await cleanup(0, "SIGTERM");
});

process.on("SIGINT", async () => {
  log.warn("process.sigint", {});

  await cleanup(0, "SIGINT");
});

process.on("uncaughtException", async (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);

  await appendLogLine(logPath, {
    type: "uncaught_exception",
    error: String(err?.stack ?? err),
  });

  await cleanup(1, err);
});

process.on("unhandledRejection", async (reason) => {
  console.error("UNHANDLED REJECTION:", reason);

  await appendLogLine(logPath, {
    type: "unhandled_rejection",
    error: String(reason?.stack ?? reason),
  });

  await cleanup(1, reason);
});

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  startReportLoop();

  while (!shuttingDown) {
    try {
      log.info("daemon.watcher.start", {});

      await appendLogLine(logPath, {
        type: "watchdog_start",
      });

      // Initialize plugin capabilities before watcher starts
      await initializePluginsForStartup();

      await startWatcher();

      // IMPORTANT:
      // watcher.start() now returns immediately
      // instead of blocking forever

      while (!shuttingDown && currentWatcher?.running) {
        await delay(1000);
      }

      if (shuttingDown) {
        break;
      }

      log.warn("daemon.watcher.stopped", {});

      await appendLogLine(logPath, {
        type: "watchdog_child_exited",
      });
    } catch (err) {
      log.error("daemon.watchdog.crash", {
        error: err,
      });

      await appendLogLine(logPath, {
        type: "watchdog_crash",
        error: String(err?.stack ?? err),
      });
    } finally {
      await stopCurrentWatcher();
    }

    if (shuttingDown) {
      break;
    }

    await appendLogLine(logPath, {
      type: "watchdog_restart_delay",
      delayMs: 5000,
    });

    await delay(5000);
  }
}

// --------------------------------------------------
// Run
// --------------------------------------------------

main().catch(async (err) => {
  console.error("FATAL DAEMON ERROR:", err);

  await appendLogLine(logPath, {
    type: "fatal",
    error: String(err?.stack ?? err),
  });

  process.exitCode = 1;

  await cleanup(1, err);
});
