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
    const day =
      date instanceof Date
        ? date.toISOString().slice(0, 10)
        : typeof date === "string"
          ? date.slice(0, 10)
          : new Date().toISOString().slice(0, 10);

    let raw = "";
    try {
      raw = await fs.readFile(this.journal.filePath, "utf8");
    } catch (err) {
      if (err?.code === "ENOENT") raw = "";
      else throw err;
    }

    const lines = raw.split(/\r?\n/g).filter((l) => l.startsWith("- "));
    let switches = 0;
    let cooldowns = 0;
    let recovers = 0;
    let gitWarns = 0;

    for (const line of lines) {
      const m = line.match(/^- ([^ ]+) \| ([A-Z_]+) \|/);
      if (!m) continue;
      const [_, ts, type] = m;
      if (!isSameDay(ts, day)) continue;
      if (type === "SWITCH") switches++;
      else if (type === "COOLDOWN") cooldowns++;
      else if (type === "RECOVER") recovers++;
      else if (type === "GIT_WARN") gitWarns++;
    }

    const section = [
      "",
      `## ${day} Summary`,
      `- Switches: ${switches}`,
      `- Cooldowns: ${cooldowns}`,
      `- Recovers: ${recovers}`,
      `- Git warnings: ${gitWarns}`,
      ""
    ].join("\n");

    await fs.appendFile(this.journal.filePath, section, { encoding: "utf8" });
    await this.journal.append({ type: "REPORT", detail: `daily summary for ${day}` });
  }
}

