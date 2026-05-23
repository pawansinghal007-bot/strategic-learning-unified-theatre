import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WatcherDaemon } from "./watcher.js";
import { Reporter } from "./reporter.js";
import { Journal } from "./journal.js";
import { releaseLock } from "./lock.js";

function baseDir() {
  return path.join(os.homedir(), ".vscode-rotator");
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true, mode: 0o700 });
}

async function appendLogLine(filePath, obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n";
  await fs.appendFile(filePath, line, { encoding: "utf8" });
}

const dir = baseDir();
await ensureDir(dir);

const pidPath = path.join(dir, "daemon.pid");
const logPath = path.join(dir, "daemon.log");

await fs.writeFile(pidPath, String(process.pid), { encoding: "utf8", mode: 0o600 });

const daemon = new WatcherDaemon();
const journal = new Journal();
const reporter = new Reporter({ journal });

let lastDay = new Date().toISOString().slice(0, 10);
const reportTimer = setInterval(() => {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (day !== lastDay) {
    const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    reporter.daily(prev).catch(() => {});
    lastDay = day;
  }
}, 60_000);

daemon.on("switch", async (evt) => {
  await appendLogLine(logPath, { type: "switch", ...evt });
});
daemon.on("cooldown", async (evt) => {
  await appendLogLine(logPath, { type: "cooldown", ...evt });
});
daemon.on("recover", async (evt) => {
  await appendLogLine(logPath, { type: "recover", ...evt });
});
daemon.on("git_warn", async (evt) => {
  await appendLogLine(logPath, { type: "git_warn", ...evt });
});
daemon.on("error", async (err) => {
  await appendLogLine(logPath, { type: "error", message: String(err?.message ?? err) });
});

async function cleanup(code = 0, reason = null) {
  try {
    if (reason) {
      await appendLogLine(logPath, { type: "shutdown", reason: String(reason) });
    } else {
      await appendLogLine(logPath, { type: "shutdown" });
    }
    clearInterval(reportTimer);
    await daemon.stop();
    await releaseLock("switch");
    try {
      await fs.unlink(pidPath);
    } catch {}
  } catch {}
  process.exit(code);
}

process.on("SIGTERM", async () => cleanup(0));
process.on("SIGINT", async () => cleanup(0));
process.on("uncaughtException", async (err) => cleanup(1, err));
process.on("unhandledRejection", async (reason) => cleanup(1, reason));

await appendLogLine(logPath, { type: "start", pid: process.pid });
await daemon.start();
