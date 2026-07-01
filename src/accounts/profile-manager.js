import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as childProcess from "node:child_process";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";

import { AccountStore } from "./store.js";
import { resolveVSCodeBin } from "../internal/paths.js";

async function installExtension(codeBin, profileName, extensionName) {
  await new Promise((resolve, reject) => {
    childProcess.execFile(
      codeBin,
      ["--profile", profileName, "--install-extension", extensionName],
      { windowsHide: true },
      (error) => {
        if (error) reject(error instanceof Error ? error : new Error(String(error)));
        else resolve();
      },
    );
  });
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function resolveProfilesDir() {
  const platform = process.platform;

  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, "Code", "User", "profiles");
    return path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "Code",
      "User",
      "profiles",
    );
  }

  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Code",
      "User",
      "profiles",
    );
  }

  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, "Code", "User", "profiles");
}

async function readTemplate(templateName) {
  const file = templateName?.trim() ? templateName.trim() : "default";
  const templatePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "profile-templates",
    `${file}.json`,
  );
  const raw = await fs.readFile(templatePath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    extensions: Array.isArray(parsed.extensions)
      ? parsed.extensions.filter((s) => typeof s === "string")
      : [],
    colorTheme:
      typeof parsed.colorTheme === "string" ? parsed.colorTheme : null,
    iconTheme: typeof parsed.iconTheme === "string" ? parsed.iconTheme : null,
  };
}

async function writeProfileSettings(profileDir, template) {
  await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
  const settingsPath = path.join(profileDir, "settings.json");

  const settings = {};
  if (template.colorTheme)
    settings["workbench.colorTheme"] = template.colorTheme;
  if (template.iconTheme) settings["workbench.iconTheme"] = template.iconTheme;

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function listFilesRecursively(rootDir) {
  const out = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listFilesRecursively(p)));
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}

export class ProfileManager {
  constructor({ store, profilesDir } = {}) {
    this.store = store ?? new AccountStore();
    this.profilesDir = profilesDir ?? resolveProfilesDir();
  }

  async list() {
    if (!(await exists(this.profilesDir))) return [];
    const entries = await fs.readdir(this.profilesDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async create(name, templateName = "default") {
    if (!name || !String(name).trim())
      throw new Error("Profile name is required");
    const profileName = String(name).trim();

    const template = await readTemplate(templateName);
    const profileDir = path.join(this.profilesDir, profileName);
    await writeProfileSettings(profileDir, template);

    const codeBin = await resolveVSCodeBin();
    for (const ext of template.extensions) {
      try {
        await installExtension(codeBin, profileName, ext);
      } catch (err) {
        if (err?.code !== "ENOENT") {
          throw err;
        }
      }
    }

    return profileName;
  }

  async delete(name) {
    const profileName = String(name).trim();
    if (!profileName) throw new Error("Profile name is required");
    const profileDir = path.join(this.profilesDir, profileName);
    await fs.rm(profileDir, { recursive: true, force: true });
  }

  async link(accountId, profileName) {
    const name = profileName === null ? null : String(profileName).trim();
    if (name !== null && !name) throw new Error("profileName is required");
    return await this.store.update(accountId, { profileName: name });
  }

  async exportSnapshot(profileName, zipPath) {
    const name = String(profileName).trim();
    if (!name) throw new Error("Profile name is required");
    if (!zipPath || !String(zipPath).trim())
      throw new Error("zipPath is required");

    const profileDir = path.join(this.profilesDir, name);
    if (!(await exists(profileDir)))
      throw new Error(`Profile not found: ${name}`);

    const files = await listFilesRecursively(profileDir);
    const data = {};
    for (const abs of files) {
      const rel = path.relative(profileDir, abs).replaceAll("\\", "/");
      data[rel] = new Uint8Array(await fs.readFile(abs));
    }

    const zipped = zipSync(data, { level: 6 });
    await fs.mkdir(path.dirname(zipPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(zipPath, Buffer.from(zipped), { mode: 0o600 });
  }

  async importSnapshot(zipPath, profileName) {
    if (!zipPath || !String(zipPath).trim())
      throw new Error("zipPath is required");
    const name = String(profileName).trim();
    if (!name) throw new Error("Profile name is required");

    const buf = new Uint8Array(await fs.readFile(zipPath));
    const files = unzipSync(buf);
    const profileDir = path.join(this.profilesDir, name);

    await fs.rm(profileDir, { recursive: true, force: true });
    await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });

    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(profileDir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
      await fs.writeFile(abs, Buffer.from(content), { mode: 0o600 });
    }

    return name;
  }
}
