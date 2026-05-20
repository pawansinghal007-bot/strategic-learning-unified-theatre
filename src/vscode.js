import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveVSCodeBin } from "./paths.js";

const execFileAsync = promisify(execFile);

function parsePidsFromText(text) {
  return text
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export async function findProcesses() {
  const platform = process.platform;

  if (platform === "win32") {
    try {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI",
        "IMAGENAME eq Code.exe",
        "/FO",
        "CSV",
        "/NH"
      ]);

      return stdout
        .split(/\r?\n/g)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.split('","').map((s) => s.replaceAll('"', "")))
        .map((cols) => Number.parseInt(cols[1], 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    } catch {
      return [];
    }
  }

  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", "Visual Studio Code"]);
    const pids = parsePidsFromText(stdout);
    if (pids.length) return pids;
  } catch {}

  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", "code"]);
    return parsePidsFromText(stdout);
  } catch {
    return [];
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function gracefulClose(pid) {
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } catch {
      // Fall back below if taskkill fails.
    }
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {}

  await sleep(3000);

  try {
    process.kill(pid, 0);
  } catch {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

export async function launchWithProfile(profileName) {
  const { spawn } = await import("node:child_process");
  const codeBin = await resolveVSCodeBin();
  const child = spawn(codeBin, ["--profile", profileName], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

