import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "./config.js";
import fs from "node:fs";

async function exists(p) {
  try {
    await fs.stat(p);
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
  const configuredPath =
    config?.authPaths?.[agentType] ??
    config?.agents?.[agentType]?.authPath ??
    config?.[`${agentType}AuthPath`];

  if (typeof configuredPath === "string" && configuredPath.trim()) {
    return configuredPath.trim();
  }

  if (agentType === "codex") return homedirPath(".codex", "auth.json");
  if (agentType === "trae") return homedirPath(".trae", "auth.json");

  if (agentType === "github") {
    const userDir = resolveVSCodeUserDir();
    const normalizedProfile = profileName ? String(profileName).trim() : null;
    const candidates = [];

    if (normalizedProfile) {
      candidates.push(
        path.join(
          userDir,
          "profiles",
          normalizedProfile,
          "globalStorage",
          "github.copilot",
          "auth.json",
        ),
      );
      candidates.push(
        path.join(
          userDir,
          "profiles",
          normalizedProfile,
          "github.copilot",
          "auth.json",
        ),
      );
    }

    candidates.push(
      path.join(resolveVSCodeGlobalStorageDir(), "github.copilot", "auth.json"),
    );
    candidates.push(homedirPath(".github-copilot", "auth.json"));

    if (preferExisting) {
      for (const candidate of candidates) {
        if (await exists(candidate)) return candidate;
      }
    }

    return candidates[0];
  }

  if (agentType === "vscode") {
    const userDir = resolveVSCodeUserDir();
    const candidates = [];
    const normalizedProfile = profileName ? String(profileName).trim() : null;

    if (normalizedProfile) {
      candidates.push(
        path.join(
          userDir,
          "profiles",
          normalizedProfile,
          "globalStorage",
          "saml.secret",
        ),
      );
      candidates.push(
        path.join(userDir, "profiles", normalizedProfile, "saml.secret"),
      );
    }

    candidates.push(path.join(resolveVSCodeGlobalStorageDir(), "saml.secret"));
    candidates.push(path.join(os.homedir(), ".vscode", "argv.json"));

    if (preferExisting) {
      for (const candidate of candidates) {
        if (await exists(candidate)) return candidate;
      }
    }

    return candidates[0];
  }

  const configured =
    config?.authPaths?.other ??
    config?.agents?.other?.authPath ??
    config?.otherAuthPath;

  if (typeof configured === "string" && configured.trim()) return configured;

  throw new Error(
    'No auth path configured for agentType "other". Set ~/.vscode-rotator/config.json',
  );
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
  const parts = String(pathEnv || "")
    .split(sep)
    .filter(Boolean);
  const allowed = new Set();

  // Platform-known safe directories (non-exhaustive)
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
        : "C:\\Windows\\System32",
      process.env.ProgramFiles || "C:\\Program Files",
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    ],
  };

  const plat =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win32"
        : "linux";
  for (const p of platformAllowed[plat] || []) allowed.add(path.resolve(p));

  // Allow explicit override of allowed PATH entries via env
  const extra =
    process.env.VSCODE_ROTATOR_ALLOW_PATH?.split(sep).filter(Boolean) ?? [];
  for (const p of extra) allowed.add(path.resolve(p));

  const safe = [];
  for (const part of parts) {
    try {
      const resolved = path.resolve(part);
      if (allowed.has(resolved)) {
        safe.push(resolved);
        continue;
      }

      // Best-effort safety check: ensure directory exists and is not world-writable on POSIX
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        if (process.platform === "win32") {
          // On Windows, allow Program Files and System directories; otherwise include but log via comment.
          if (
            String(resolved).toLowerCase().includes("program files") ||
            String(resolved).toLowerCase().includes("windows")
          ) {
            safe.push(resolved);
            continue;
          }
          // For user-writable dirs on Windows, skip unless explicitly allowed
        } else {
          // POSIX: check world-writable bit (others write)
          const mode = stat.mode & 0o777;
          const worldWritable = (mode & 0o002) !== 0;
          if (!worldWritable) {
            safe.push(resolved);
            continue;
          }
        }
      }
    } catch {
      // ignore stat errors
    }
  }

  // If we found nothing safe, fall back to platformAllowed entries (best-effort)
  if (safe.length === 0) {
    for (const s of Array.from(allowed)) safe.push(s);
  }

  return safe;
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
  const candidates = [];

  if (platform === "win32") {
    candidates.push(...resolvePathCandidates("code.cmd"));
    candidates.push(...resolvePathCandidates("code.exe"));
    candidates.push(...resolvePathCandidates("code"));

    const local = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const pf86 = process.env["ProgramFiles(x86)"];
    const rootCandidates = [local, pf, pf86].filter(Boolean);

    for (const root of rootCandidates) {
      candidates.push(
        path.join(root, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
      );
      candidates.push(path.join(root, "Microsoft VS Code", "bin", "code.cmd"));
      candidates.push(
        path.join(
          root,
          "Programs",
          "Microsoft VS Code Insiders",
          "bin",
          "code-insiders.cmd",
        ),
      );
    }
  } else {
    candidates.push(...resolvePathCandidates("code"));
    candidates.push("/usr/local/bin/code");
    candidates.push("/opt/homebrew/bin/code");
    candidates.push("/usr/bin/code");
    candidates.push("/snap/bin/code");
    candidates.push("/var/lib/flatpak/exports/bin/com.visualstudio.code");
    candidates.push(
      homedirPath(
        ".local",
        "share",
        "flatpak",
        "exports",
        "bin",
        "com.visualstudio.code",
      ),
    );

    if (platform === "darwin") {
      candidates.push(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
      );
    }
  }

  for (const p of candidates) {
    if (await exists(p)) return p;
  }

  throw new Error("VS Code binary not found (code)");
}
