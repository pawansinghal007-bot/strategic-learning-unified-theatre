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
  enhanceSchedule: null,
  vscodeLearn: {
    enabled: false,
    stagedSignalsDir: null,
    captureSources: ["diagnostic", "editor", "task", "git"],
    maxSignalAgeDays: 30,
    flushIntervalMs: 30000,
    debounceMs: 600000,
    maxFileSizeBytes: 102400,
    excludePatterns: ["**/test/**", "**/fixtures/**"],
    hardExcludePatterns: [
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/*.secret",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**"
    ],
    allowedExtensions: [
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".md",
      ".json",
      ".yaml",
      ".yml",
      ".txt"
    ]
  }
};

export async function loadConfig() {
  const p = configPath();
  if (!(await exists(p))) return { ...DEFAULT_CONFIG };
  const raw = await fs.readFile(p, "utf8");
  try {
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      return {
        ...DEFAULT_CONFIG,
        ...json,
        vscodeLearn: {
          ...DEFAULT_CONFIG.vscodeLearn,
          ...(json.vscodeLearn ?? {})
        }
      };
    }
    return { ...DEFAULT_CONFIG };
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
