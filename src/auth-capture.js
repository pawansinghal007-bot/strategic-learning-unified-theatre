import fs from "node:fs/promises";
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import {
  resolveAuthPath,
  resolveVSCodeBin,
  sanitizeEnvForSpawn,
} from "./internal/paths.js";

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
    /* istanbul ignore next -- defensive guard: timer/watcher/interval are always
       assigned by the time cleanup() can run, given this function's control flow */
    if (timer) clearTimeout(timer);
    /* istanbul ignore next -- defensive guard: see above */
    if (interval) clearInterval(interval);
    /* istanbul ignore next -- defensive guard: see above */
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
      /* istanbul ignore next -- defensive guard: canceled can't be true here given
         this function's control flow (cleanup() also clears the interval that
         schedules poll()) */
      if (canceled) return;
      const current = await checkCurrent();
      if (current) {
        cleanup();
        resolve(current);
      }
    };

    interval = setInterval(() => {
      /* istanbul ignore next -- defensive guard: see poll() above */
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
    stdio: "ignore",
    env: sanitizeEnvForSpawn(process.env),
  };

  let child;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(codeBin)) {
    child = spawn("cmd.exe", ["/c", codeBin, ...args], spawnOptions);
  } else {
    child = spawn(codeBin, args, spawnOptions);
  }

  child.unref();
}

export async function captureAuthBlob(
  agentType,
  { timeoutMs = 120000, launchEditor = false, profileName = null } = {},
) {
  const authPath = await resolveAuthPath(agentType, {
    preferExisting: true,
    profileName,
  });

  const original = (await fileExists(authPath))
    ? await readTrimmed(authPath)
    : null;

  if (!launchEditor) {
    if (original) {
      return original;
    }
    return await waitForAuthBlobChange(authPath, original, timeoutMs);
  }

  /* istanbul ignore else -- unreachable: if launchEditor were false, the
     `if (!launchEditor)` block above would already have returned */
  if (launchEditor) {
    await launchVSCode(profileName);
  }

  return await waitForAuthBlobChange(authPath, original, timeoutMs);
}
