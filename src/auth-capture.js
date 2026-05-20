import fs from "node:fs/promises";
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { resolveAuthPath, resolveVSCodeBin } from "./paths.js";

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readTrimmed(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text.trim();
}

async function waitForAuthBlobChange(authPath, original, timeoutMs) {
  const directory = path.dirname(authPath);
  let canceled = false;
  let timer = null;
  let watcher = null;
  let interval = null;

  const cleanup = () => {
    canceled = true;
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    if (watcher) watcher.close();
  };

  const checkCurrent = async () => {
    try {
      const current = await readTrimmed(authPath);
      if (!current) return null;
      if (original === null || current !== original) return current;
    } catch {
      return null;
    }
    return null;
  };

  await fs.mkdir(directory, { recursive: true });
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for auth blob change."));
    }, timeoutMs);

    watcher = watch(directory, async (eventType, filename) => {
      if (canceled) return;
      if (!filename) return;
      if (path.basename(filename) !== path.basename(authPath)) return;

      const current = await checkCurrent();
      if (current) {
        cleanup();
        resolve(current);
      }
    });

    const poll = async () => {
      if (canceled) return;
      const current = await checkCurrent();
      if (current) {
        cleanup();
        resolve(current);
      }
    };

    interval = setInterval(() => {
      if (canceled) return;
      poll().catch(() => {});
    }, 1500);

    timer.unref?.();
    interval.unref?.();

    if (original === null) {
      poll().catch(() => {});
    }
  });
}

async function launchVSCode(profileName) {
  const codeBin = await resolveVSCodeBin();
  const args = [];
  if (profileName) args.push("--profile", profileName);

  const spawnOptions = {
    detached: true,
    stdio: "ignore"
  };

  let child;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(codeBin)) {
    child = spawn("cmd.exe", ["/c", codeBin, ...args], spawnOptions);
  } else {
    child = spawn(codeBin, args, spawnOptions);
  }

  child.unref();
}

export async function captureAuthBlob(agentType, { timeoutMs = 120000, launchEditor = false, profileName = null } = {}) {
  const authPath = await resolveAuthPath(agentType, { preferExisting: true, profileName });

  const original = (await fileExists(authPath)) ? await readTrimmed(authPath) : null;

  if (!launchEditor) {
    if (original) {
      return original;
    }
    return await waitForAuthBlobChange(authPath, original, timeoutMs);
  }

  if (launchEditor) {
    await launchVSCode(profileName);
  }

  return await waitForAuthBlobChange(authPath, original, timeoutMs);
}
