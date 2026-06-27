import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reporter } from "../src/internal/reporter.js";

// ── fs mock ──────────────────────────────────────────────────────────────────
vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    appendFile: vi.fn(),
  },
}));

// ── Journal stub ─────────────────────────────────────────────────────────────
function makeJournal(filePath = "/tmp/journal.md") {
  return {
    filePath,
    append: vi.fn().mockResolvedValue(undefined),
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────
const DAY = "2024-03-15";
const ts = (day = DAY) => `${day}T10:00:00.000Z`;

function journalLine(type, day = DAY) {
  return `- ${ts(day)} | ${type} | some detail`;
}

function makeLines(...types) {
  return types.map((t) => journalLine(t)).join("\n");
}

async function runDaily(reporter, date = DAY) {
  // capture what was appended to the file
  const fs = (await import("node:fs/promises")).default;
  const calls = [];
  fs.appendFile.mockImplementation(async (...args) => {
    calls.push(args[1]);
  });
  await reporter.daily(date);
  return calls;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Reporter", () => {
  let fs;
  let journal;
  let reporter;

  beforeEach(async () => {
    fs = (await import("node:fs/promises")).default;
    vi.clearAllMocks();
    fs.appendFile.mockResolvedValue(undefined);
    journal = makeJournal();
    reporter = new Reporter({ journal });
  });

  // ── constructor ─────────────────────────────────────────────────────────────
  describe("constructor", () => {
    it("uses provided journal", () => {
      expect(reporter.journal).toBe(journal);
    });

    it("creates a default Journal when none is provided", async () => {
      // Journal itself is not mocked; we just check the instance is created
      const { Journal } = await import("../src/internal/journal.js");
      const r = new Reporter();
      expect(r.journal).toBeInstanceOf(Journal);
    });
  });

  // ── date normalisation ──────────────────────────────────────────────────────
  describe("daily() — date argument handling", () => {
    beforeEach(() => {
      fs.readFile.mockResolvedValue("");
    });

    it("accepts a Date object", async () => {
      const appended = await runDaily(reporter, new Date(`${DAY}T00:00:00Z`));
      expect(appended[0]).toContain(`## ${DAY} Summary`);
    });

    it("accepts a full ISO string and slices to YYYY-MM-DD", async () => {
      const appended = await runDaily(reporter, `${DAY}T12:34:56.000Z`);
      expect(appended[0]).toContain(`## ${DAY} Summary`);
    });

    it("accepts a plain YYYY-MM-DD string", async () => {
      const appended = await runDaily(reporter, DAY);
      expect(appended[0]).toContain(`## ${DAY} Summary`);
    });

    it("defaults to today when no date is passed", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await reporter.daily();
      expect(fs.appendFile).toHaveBeenCalledWith(
        journal.filePath,
        expect.stringContaining(`## ${today} Summary`),
        { encoding: "utf8" },
      );
    });

    it("defaults to today when date is null", async () => {
      const today = new Date().toISOString().slice(0, 10);
      await reporter.daily(null);
      expect(fs.appendFile).toHaveBeenCalledWith(
        journal.filePath,
        expect.stringContaining(`## ${today} Summary`),
        { encoding: "utf8" },
      );
    });
  });

  // ── file-read error handling ────────────────────────────────────────────────
  describe("daily() — readFile error handling", () => {
    it("treats ENOENT as an empty journal (no throw)", async () => {
      const err = Object.assign(new Error("not found"), { code: "ENOENT" });
      fs.readFile.mockRejectedValue(err);
      await expect(reporter.daily(DAY)).resolves.toBeUndefined();
    });

    it("rethrows non-ENOENT errors", async () => {
      const err = Object.assign(new Error("permission denied"), {
        code: "EACCES",
      });
      fs.readFile.mockRejectedValue(err);
      await expect(reporter.daily(DAY)).rejects.toThrow("permission denied");
    });
  });

  // ── counting logic ──────────────────────────────────────────────────────────
  describe("daily() — event counting", () => {
    it("counts zero for an empty journal", async () => {
      fs.readFile.mockResolvedValue("");
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 0");
      expect(section).toContain("Cooldowns: 0");
      expect(section).toContain("Recovers: 0");
      expect(section).toContain("Git warnings: 0");
    });

    it("counts one SWITCH", async () => {
      fs.readFile.mockResolvedValue(makeLines("SWITCH"));
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 1");
    });

    it("counts one COOLDOWN", async () => {
      fs.readFile.mockResolvedValue(makeLines("COOLDOWN"));
      const [section] = await runDaily(reporter);
      expect(section).toContain("Cooldowns: 1");
    });

    it("counts one RECOVER", async () => {
      fs.readFile.mockResolvedValue(makeLines("RECOVER"));
      const [section] = await runDaily(reporter);
      expect(section).toContain("Recovers: 1");
    });

    it("counts one GIT_WARN", async () => {
      fs.readFile.mockResolvedValue(makeLines("GIT_WARN"));
      const [section] = await runDaily(reporter);
      expect(section).toContain("Git warnings: 1");
    });

    it("counts multiple events of the same type", async () => {
      fs.readFile.mockResolvedValue(
        makeLines("SWITCH", "SWITCH", "SWITCH", "COOLDOWN"),
      );
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 3");
      expect(section).toContain("Cooldowns: 1");
    });

    it("counts all four types simultaneously", async () => {
      fs.readFile.mockResolvedValue(
        makeLines("SWITCH", "COOLDOWN", "RECOVER", "GIT_WARN"),
      );
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 1");
      expect(section).toContain("Cooldowns: 1");
      expect(section).toContain("Recovers: 1");
      expect(section).toContain("Git warnings: 1");
    });

    it("ignores events from a different day", async () => {
      const otherDay = "2024-03-14";
      const lines = [
        journalLine("SWITCH", otherDay),
        journalLine("COOLDOWN", otherDay),
        journalLine("SWITCH", DAY),
      ].join("\n");
      fs.readFile.mockResolvedValue(lines);
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 1");
      expect(section).toContain("Cooldowns: 0");
    });

    it("ignores lines that don't start with '- '", async () => {
      const raw = [
        "# heading",
        "plain text",
        `  - ${ts()} | SWITCH | indented`,
        journalLine("RECOVER"),
      ].join("\n");
      fs.readFile.mockResolvedValue(raw);
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 0");
      expect(section).toContain("Recovers: 1");
    });

    it("ignores unknown event types (does not throw)", async () => {
      fs.readFile.mockResolvedValue(makeLines("UNKNOWN_TYPE"));
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 0");
    });

    it("handles CRLF line endings", async () => {
      const raw = makeLines("SWITCH", "GIT_WARN").replace(/\n/g, "\r\n");
      fs.readFile.mockResolvedValue(raw);
      const [section] = await runDaily(reporter);
      expect(section).toContain("Switches: 1");
      expect(section).toContain("Git warnings: 1");
    });
  });

  // ── output format ───────────────────────────────────────────────────────────
  describe("daily() — output format", () => {
    beforeEach(() => {
      fs.readFile.mockResolvedValue("");
    });

    it("section starts and ends with a blank line", async () => {
      const [section] = await runDaily(reporter);
      expect(section).toMatch(/^\n/);
      expect(section).toMatch(/\n$/);
    });

    it("appends the section to the journal file", async () => {
      await reporter.daily(DAY);
      expect(fs.appendFile).toHaveBeenCalledWith(
        journal.filePath,
        expect.stringContaining(`## ${DAY} Summary`),
        { encoding: "utf8" },
      );
    });

    it("calls journal.append with type REPORT", async () => {
      await reporter.daily(DAY);
      expect(journal.append).toHaveBeenCalledWith({
        type: "REPORT",
        detail: `daily summary for ${DAY}`,
      });
    });

    it("reads from journal.filePath", async () => {
      await reporter.daily(DAY);
      expect(fs.readFile).toHaveBeenCalledWith(journal.filePath, "utf8");
    });
  });
});
