import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function homeDir() {
  return process.env.HOME || os.homedir();
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export function configPath() {
  return path.join(homeDir(), ".vscode-rotator", "config.json");
}

export const DEFAULT_CONFIG = {
  watchedRepos: [],
  gitPollIntervalMs: 30000,
  storagePaths: [],
  storageIndexMaxAgeDays: 30,
  browserResponsesIngest: true,
  enhanceSchedule: null
};

export async function loadConfig() {
  const p = configPath();
  if (!(await exists(p))) return { ...DEFAULT_CONFIG };
  const raw = await fs.readFile(p, "utf8");
  try {
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? { ...DEFAULT_CONFIG, ...json } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(next) {
  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next ?? {}, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });
  try {
    await fs.rename(tmp, p);
  } catch {
    try {
      await fs.unlink(p);
    } catch {}
    await fs.rename(tmp, p);
  }
}
