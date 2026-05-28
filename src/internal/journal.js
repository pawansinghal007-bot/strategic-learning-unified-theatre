import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const AllowedTypes = new Set([
  "SWITCH",
  "COOLDOWN",
  "RECOVER",
  "GIT_WARN",
  "REPORT",
  "MANUAL"
]);

function defaultPath() {
  return path.join(process.env.HOME || os.homedir(), ".vscode-rotator", "PROGRESS.md");
}

async function ensureDir(p) {
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
}

export class Journal {
  constructor({ filePath } = {}) {
    this.filePath = filePath ?? defaultPath();
  }

  async append(event) {
    const type = String(event?.type ?? "").trim();
    if (!AllowedTypes.has(type)) {
      throw new Error(`Invalid journal event type: ${type}`);
    }
    const detail = String(event?.detail ?? "").replace(/\r?\n/g, " ").trim();
    const line = `- ${new Date().toISOString()} | ${type} | ${detail}\n`;
    await ensureDir(this.filePath);
    await fs.appendFile(this.filePath, line, { encoding: "utf8" });
  }

  async tail(n = 20) {
    const count = Math.max(0, Number(n) || 0);
    let raw = "";
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (err) {
      if (err?.code === "ENOENT") return [];
      throw err;
    }
    const lines = raw.split(/\r?\n/g).filter((l) => l.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - count));
  }

  async clear() {
    await ensureDir(this.filePath);
    const date = new Date().toISOString().slice(0, 10);
    const dir = path.dirname(this.filePath);
    const bak = path.join(dir, `PROGRESS-${date}.md.bak`);

    try {
      await fs.rename(this.filePath, bak);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
    }

    await fs.writeFile(this.filePath, "", { encoding: "utf8", mode: 0o600 });
    return bak;
  }
}
