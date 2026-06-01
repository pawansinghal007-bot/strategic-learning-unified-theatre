import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "./config.js";

async function exists(p) {
  try {
    await fsp.stat(p);
    return true;
  } catch {
    return false;
  }
}

function homedirPath(...parts) {
  return path.join(os.homedir(), ...parts);
}

function resolveVSCodeUserDir() {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, "Code", "User");
    return homedirPath("AppData", "Roaming", "Code", "User");
  }

  if (platform === "darwin") {
    return homedirPath("Library", "Application Support", "Code", "User");
  }

  const xdg = process.env.XDG_CONFIG_HOME ?? homedirPath(".config");
  return path.join(xdg, "Code", "User");
}

function resolveVSCodeGlobalStorageDir() {
  return path.join(resolveVSCodeUserDir(), "globalStorage");
}

export async function resolveAuthPath(
  agentType,
  { profileName = null, preferExisting = false } = {},
) {
  const config = await loadConfig();
  const configuredPath = getConfiguredAuthPath(config, agentType);

  if (typeof configuredPath === "string" && configuredPath.trim()) {
    return configuredPath.trim();
  }

  const normalizedProfile = normalizeProfileName(profileName);

  if (agentType === "codex") return homedirPath(".codex", "auth.json");
  if (agentType === "trae") return homedirPath(".trae", "auth.json");

  if (agentType === "github") {
    const candidates = getGithubAuthCandidates(normalizedProfile);
    return await chooseExistingOrFirstCandidate(candidates, preferExisting);
  }

  if (agentType === "vscode") {
    const candidates = getVscodeAuthCandidates(normalizedProfile);
    return await chooseExistingOrFirstCandidate(candidates, preferExisting);
  }

  const configured = getConfiguredOtherAuthPath(config);
  if (typeof configured === "string" && configured.trim()) return configured;

  throw new Error(
    'No auth path configured for agentType "other". Set ~/.vscode-rotator/config.json',
  );
}

function getConfiguredAuthPath(config, agentType) {
  return (
    config?.authPaths?.[agentType] ??
    config?.agents?.[agentType]?.authPath ??
    config?.[`${agentType}AuthPath`]
  );
}

function normalizeProfileName(profileName) {
  const normalized = profileName ? String(profileName).trim() : null;
  return normalized && normalized.length > 0 ? normalized : null;
}

function getGithubAuthCandidates(normalizedProfile) {
  const userDir = resolveVSCodeUserDir();
  return [
    ...(normalizedProfile
      ? [
          path.join(
            userDir,
            "profiles",
            normalizedProfile,
            "globalStorage",
            "github.copilot",
            "auth.json",
          ),
          path.join(
            userDir,
            "profiles",
            normalizedProfile,
            "github.copilot",
            "auth.json",
          ),
        ]
      : []),
    path.join(resolveVSCodeGlobalStorageDir(), "github.copilot", "auth.json"),
    homedirPath(".github-copilot", "auth.json"),
  ];
}

function getVscodeAuthCandidates(normalizedProfile) {
  const userDir = resolveVSCodeUserDir();
  return [
    ...(normalizedProfile
      ? [
          path.join(
            userDir,
            "profiles",
            normalizedProfile,
            "globalStorage",
            "saml.secret",
          ),
          path.join(userDir, "profiles", normalizedProfile, "saml.secret"),
        ]
      : []),
    path.join(resolveVSCodeGlobalStorageDir(), "saml.secret"),
    path.join(os.homedir(), ".vscode", "argv.json"),
  ];
}

function getConfiguredOtherAuthPath(config) {
  return (
    config?.authPaths?.other ??
    config?.agents?.other?.authPath ??
    config?.otherAuthPath
  );
}

async function chooseExistingOrFirstCandidate(candidates, preferExisting) {
  if (preferExisting) {
    for (const candidate of candidates) {
      if (await exists(candidate)) return candidate;
    }
  }
  return candidates[0];
}

function resolvePathCandidates(binName) {
  const pathEnv = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = sanitizePathEntries(pathEnv, sep);
  return parts.map((p) => path.join(p, binName));
}

export function sanitizePathEntries(
  pathEnv,
  sep = process.platform === "win32" ? ";" : ":",
) {
  const parts = String(pathEnv || "").split(sep).filter(Boolean);
  const allowed = new Set(getAllowedPathRoots());

  const extraAllowed = getExtraAllowedPaths(sep);
  for (const p of extraAllowed) allowed.add(path.resolve(p));

  const safe = [];
  for (const part of parts) {
    const resolved = resolvePathEntry(part);
    if (!resolved) continue;

    if (allowed.has(resolved) || isSafePathEntry(resolved)) {
      safe.push(resolved);
    }
  }

  if (safe.length === 0) {
    safe.push(...Array.from(allowed));
  }

  return safe;
}

function getAllowedPathRoots() {
  const platformAllowed = {
    linux: [
      "/usr/bin",
      "/bin",
      "/usr/local/bin",
      "/snap/bin",
      "/opt/homebrew/bin",
      "/var/lib/flatpak/exports/bin",
    ],
    darwin: [
      "/usr/bin",
      "/bin",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/Applications/Visual Studio Code.app/Contents/Resources/app/bin",
    ],
    win32: [
      process.env.WINDIR
        ? path.join(process.env.WINDIR, "System32")
        : String.raw`C:\Windows\System32`,
      process.env.ProgramFiles || String.raw`C:\Program Files`,
      process.env["ProgramFiles(x86)"] || String.raw`C:\Program Files (x86)`,
    ],
  };

  let plat = "linux";
  if (process.platform === "darwin") {
    plat = "darwin";
  } else if (process.platform === "win32") {
    plat = "win32";
  }

  return (platformAllowed[plat] || []).map((p) => path.resolve(p));
}

function getExtraAllowedPaths(sep) {
  return process.env.VSCODE_ROTATOR_ALLOW_PATH?.split(sep).filter(Boolean) ?? [];
}

function resolvePathEntry(part) {
  try {
    return path.resolve(part);
  } catch {
    return null;
  }
}

function isSafePathEntry(resolved) {
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return false;

    if (process.platform === "win32") {
      const normalized = String(resolved).toLowerCase();
      return (
        normalized.includes("program files") ||
        normalized.includes("windows")
      );
    }

    const mode = stat.mode & 0o777;
    const worldWritable = (mode & 0o002) !== 0;
    return !worldWritable;
  } catch {
    return false;
  }
}

export function resolveBinary(binName, extraCandidates = []) {
  const candidates = [...extraCandidates, ...resolvePathCandidates(binName)];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

export function sanitizeEnvForSpawn(env = process.env) {
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = sanitizePathEntries(env.PATH ?? "", sep);
  return {
    ...env,
    PATH: parts.join(sep),
  };
}

export async function resolveVSCodeBin() {
  const overridden = process.env.VSCODE_ROTATOR_CODE_BIN;
  if (typeof overridden === "string" && overridden.trim()) return overridden;

  const platform = process.platform;
  const candidates = [
    ...(platform === "win32"
      ? [
          ...resolvePathCandidates("code.cmd"),
          ...resolvePathCandidates("code.exe"),
          ...resolvePathCandidates("code"),
          ...[process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
            .filter(Boolean)
            .flatMap((root) => [
              path.join(root, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
              path.join(root, "Microsoft VS Code", "bin", "code.cmd"),
              path.join(
                root,
                "Programs",
                "Microsoft VS Code Insiders",
                "bin",
                "code-insiders.cmd",
              ),
            ]),
        ]
      : [
          ...resolvePathCandidates("code"),
          "/usr/local/bin/code",
          "/opt/homebrew/bin/code",
          "/usr/bin/code",
          "/snap/bin/code",
          "/var/lib/flatpak/exports/bin/com.visualstudio.code",
          homedirPath(
            ".local",
            "share",
            "flatpak",
            "exports",
            "bin",
            "com.visualstudio.code",
          ),
          ...(platform === "darwin"
            ? [
                "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
              ]
            : []),
        ]),
  ];

  for (const p of candidates) {
    if (await exists(p)) return p;
  }

  throw new Error("VS Code binary not found (code)");
}
