import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "./config.js";

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

function resolveVSCodeGlobalStorageDir() {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, "Code", "User", "globalStorage");
    return homedirPath("AppData", "Roaming", "Code", "User", "globalStorage");
  }

  if (platform === "darwin") {
    return homedirPath(
      "Library",
      "Application Support",
      "Code",
      "User",
      "globalStorage"
    );
  }

  const xdg = process.env.XDG_CONFIG_HOME ?? homedirPath(".config");
  return path.join(xdg, "Code", "User", "globalStorage");
}

export async function resolveAuthPath(agentType) {
  if (agentType === "codex") return homedirPath(".codex", "auth.json");
  if (agentType === "trae") return homedirPath(".trae", "auth.json");

  if (agentType === "vscode") {
    return path.join(resolveVSCodeGlobalStorageDir(), "saml.secret");
  }

  const config = await loadConfig();
  const configured =
    config?.authPaths?.other ??
    config?.agents?.other?.authPath ??
    config?.otherAuthPath;

  if (typeof configured === "string" && configured.trim()) return configured;

  throw new Error(
    'No auth path configured for agentType "other". Set ~/.vscode-rotator/config.json'
  );
}

function resolvePathCandidates(binName) {
  const pathEnv = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = pathEnv.split(sep).filter(Boolean);
  return parts.map((p) => path.join(p, binName));
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
      candidates.push(path.join(root, "Programs", "Microsoft VS Code", "bin", "code.cmd"));
      candidates.push(path.join(root, "Microsoft VS Code", "bin", "code.cmd"));
      candidates.push(
        path.join(root, "Programs", "Microsoft VS Code Insiders", "bin", "code-insiders.cmd")
      );
    }
  } else {
    candidates.push(...resolvePathCandidates("code"));
    candidates.push("/usr/local/bin/code");
    candidates.push("/opt/homebrew/bin/code");
    candidates.push("/usr/bin/code");
    candidates.push("/snap/bin/code");
    candidates.push("/var/lib/flatpak/exports/bin/com.visualstudio.code");
    candidates.push(homedirPath(".local", "share", "flatpak", "exports", "bin", "com.visualstudio.code"));

    if (platform === "darwin") {
      candidates.push(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
      );
    }
  }

  for (const p of candidates) {
    if (await exists(p)) return p;
  }

  throw new Error("VS Code binary not found (code)");
}
