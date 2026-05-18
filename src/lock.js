import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function resolveBaseDir(baseDir) {
  return baseDir ?? path.join(os.homedir(), ".vscode-rotator");
}

function resolveLockPath(name, baseDir) {
  const dir = resolveBaseDir(baseDir);
  const fileName = name.endsWith(".lock") ? name : `${name}.lock`;
  return path.join(dir, fileName);
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireLock(name = "switch", { baseDir } = {}) {
  const lockPath = resolveLockPath(name, baseDir);
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });

  const pid = String(process.pid);

  try {
    const handle = await fs.open(lockPath, "wx", 0o600);
    try {
      await handle.writeFile(pid, "utf8");
    } finally {
      await handle.close();
    }
    return lockPath;
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;

    let existingPid = null;
    try {
      const contents = await fs.readFile(lockPath, "utf8");
      const parsed = Number.parseInt(contents.trim(), 10);
      existingPid = Number.isFinite(parsed) ? parsed : null;
    } catch {}

    if (existingPid && isProcessAlive(existingPid)) {
      throw new Error(`Lock exists: ${lockPath} (pid ${existingPid})`);
    }

    try {
      await fs.unlink(lockPath);
    } catch {}

    const handle = await fs.open(lockPath, "wx", 0o600);
    try {
      await handle.writeFile(pid, "utf8");
    } finally {
      await handle.close();
    }
    return lockPath;
  }
}

export async function releaseLock(name = "switch", { baseDir } = {}) {
  const lockPath = resolveLockPath(name, baseDir);
  try {
    await fs.unlink(lockPath);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

