import fs from "node:fs/promises";

import { Journal } from "./journal.js";

function isSameDay(iso, day) {
  return typeof iso === "string" && iso.slice(0, 10) === day;
}

export class Reporter {
  constructor({ journal } = {}) {
    this.journal = journal ?? new Journal();
  }

  async daily(date) {
    let day;
    if (date instanceof Date) {
      day = date.toISOString().slice(0, 10);
    } else if (typeof date === "string") {
      day = date.slice(0, 10);
    } else {
      day = new Date().toISOString().slice(0, 10);
    }

    let raw = "";
    try {
      raw = await fs.readFile(this.journal.filePath, "utf8");
    } catch (err) {
      if (err?.code === "ENOENT") raw = "";
      else throw err;
    }

    const lines = raw.split(/\r?\n/g).filter((l) => l.startsWith("- "));
    const counts = { SWITCH: 0, COOLDOWN: 0, RECOVER: 0, GIT_WARN: 0 };

    for (const line of lines) {
      const m = /^- ([^ ]+) \| ([A-Z_]+) \|/.exec(line);
      if (!m) continue;
      const [, ts, type] = m;
      if (!isSameDay(ts, day)) continue;
      if (Object.prototype.hasOwnProperty.call(counts, type)) counts[type]++;
    }

    const section = [
      "",
      `## ${day} Summary`,
      `- Switches: ${counts.SWITCH}`,
      `- Cooldowns: ${counts.COOLDOWN}`,
      `- Recovers: ${counts.RECOVER}`,
      `- Git warnings: ${counts.GIT_WARN}`,
      ""
    ].join("\n");

    await fs.appendFile(this.journal.filePath, section, { encoding: "utf8" });
    await this.journal.append({ type: "REPORT", detail: `daily summary for ${day}` });
  }
}

