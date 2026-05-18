import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function defaultPath() {
  return path.join(os.homedir(), ".vscode-rotator", "cooldowns.json");
}

export class CooldownScheduler {
  constructor({ filePath } = {}) {
    this.filePath = filePath ?? defaultPath();
    this.map = new Map();
  }

  async load() {
    if (!(await exists(this.filePath))) return;
    const raw = await fs.readFile(this.filePath, "utf8");
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") return;
    const entries = Object.entries(data);
    for (const [accountId, until] of entries) {
      const t = Number(until);
      if (Number.isFinite(t)) this.map.set(accountId, t);
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const obj = {};
    for (const [k, v] of this.map.entries()) obj[k] = v;
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    try {
      await fs.rename(tmp, this.filePath);
    } catch {
      try {
        await fs.unlink(this.filePath);
      } catch {}
      await fs.rename(tmp, this.filePath);
    }
  }

  async setCooldown(accountId, durationMs) {
    const until = Date.now() + Math.max(0, Number(durationMs) || 0);
    this.map.set(accountId, until);
    await this.save();
    return until;
  }

  async clearExpired() {
    const now = Date.now();
    const cleared = [];
    let changed = false;
    for (const [k, v] of this.map.entries()) {
      if (!Number.isFinite(v) || v <= now) {
        this.map.delete(k);
        cleared.push(k);
        changed = true;
      }
    }
    if (changed) await this.save();
    return cleared;
  }

  isOnCooldown(accountId) {
    const until = this.map.get(accountId);
    return Number.isFinite(until) ? until > Date.now() : false;
  }
}
