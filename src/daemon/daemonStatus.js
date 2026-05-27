import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const DAEMON_PID_FILE = path.join(
  process.env.ROTATOR_STATE_DIR || process.cwd(),
  ".vscode-rotator",
  "daemon.pid",
);

function parsePid(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw === "") return null;
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export async function getDaemonStatus() {
  const result = {
    status: "ERROR",
    running: false,
    pid: null,
    reason: null,
  };

  try {
    const stat = await fs.stat(DAEMON_PID_FILE);
    if (!stat.isFile()) {
      return {
        ...result,
        status: "ERROR",
        reason: `PID path exists but is not a file: ${DAEMON_PID_FILE}`,
      };
    }
  } catch (err) {
    return {
      ...result,
      status: "DEGRADED",
      reason: `PID file missing: ${DAEMON_PID_FILE}`,
    };
  }

  let raw;
  try {
    raw = await fs.readFile(DAEMON_PID_FILE, "utf8");
  } catch (err) {
    return {
      ...result,
      status: "ERROR",
      reason: `Unable to read PID file: ${String(err?.message ?? err)}`,
    };
  }

  const pid = parsePid(raw);
  if (pid === null) {
    return {
      ...result,
      status: "ERROR",
      reason: `Invalid PID value in file: ${raw.trim()}`,
    };
  }

  try {
    process.kill(pid, 0);
    return {
      status: "OK",
      running: true,
      pid,
      reason: null,
    };
  } catch (err) {
    const code = err?.code;

    if (code === "ESRCH") {
      return {
        status: "DEGRADED",
        running: false,
        pid,
        reason: "PID file exists but the process is not running.",
      };
    }

    if (code === "EPERM") {
      return {
        status: "OK",
        running: true,
        pid,
        reason: null,
      };
    }

    return {
      status: "ERROR",
      running: false,
      pid,
      reason: String(err?.message ?? err),
    };
  }
}
