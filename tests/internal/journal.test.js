import { Journal } from "../../src/internal/journal.js";
import fs from "node:fs/promises";
import path from "node:path";

const testDir = path.join(process.cwd(), "tests", "fixtures", "journal");

describe("Journal", () => {
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (e) {
      // ignore if already removed
    }
  });

  describe("constructor", () => {
    it("uses default path when no filePath provided", () => {
      const journal = new Journal();
      expect(journal.filePath).toContain(".vscode-rotator/PROGRESS.md");
    });

    it("uses provided filePath", () => {
      const journal = new Journal({ filePath: "/custom/path.md" });
      expect(journal.filePath).toBe("/custom/path.md");
    });
  });

  describe("append", () => {
    it("throws error for invalid event type", async () => {
      const journal = new Journal({ filePath: path.join(testDir, "test.md") });

      await expect(journal.append({ type: "INVALID" })).rejects.toThrow(
        "Invalid journal event type: INVALID",
      );
    });

    it("throws error for empty type", async () => {
      const journal = new Journal({ filePath: path.join(testDir, "test.md") });

      await expect(journal.append({ type: "" })).rejects.toThrow(
        "Invalid journal event type: ",
      );
    });

    it("appends valid SWITCH event", async () => {
      const journal = new Journal({ filePath: path.join(testDir, "test.md") });

      await journal.append({ type: "SWITCH", detail: "test detail" });

      const content = await fs.readFile(path.join(testDir, "test.md"), "utf8");
      expect(content).toMatch(
        /- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \| SWITCH \| test detail/,
      );
    });

    it("appends valid COOLDOWN event", async () => {
      const journal = new Journal({ filePath: path.join(testDir, "test.md") });

      await journal.append({ type: "COOLDOWN", detail: "cooldown detail" });

      const content = await fs.readFile(path.join(testDir, "test.md"), "utf8");
      expect(content).toMatch(
        /- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \| COOLDOWN \| cooldown detail/,
      );
    });

    it("normalizes line breaks in detail", async () => {
      const journal = new Journal({ filePath: path.join(testDir, "test.md") });

      await journal.append({
        type: "RECOVER",
        detail: "line1\r\nline2\nline3",
      });

      const content = await fs.readFile(path.join(testDir, "test.md"), "utf8");
      expect(content).toContain("line1 line2 line3");
    });

    it("trims whitespace from type and detail", async () => {
      const journal = new Journal({ filePath: path.join(testDir, "test.md") });

      await journal.append({ type: "  REPORT  ", detail: "  spaced detail  " });

      const content = await fs.readFile(path.join(testDir, "test.md"), "utf8");
      expect(content).toMatch(
        /- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \| REPORT \| spaced detail/,
      );
    });
  });

  describe("tail", () => {
    it("returns empty array when file does not exist", async () => {
      const journal = new Journal({
        filePath: path.join(testDir, "nonexistent.md"),
      });

      const result = await journal.tail(10);

      expect(result).toEqual([]);
    });

    it("returns last n lines", async () => {
      const filePath = path.join(testDir, "test.md");
      const journal = new Journal({ filePath });

      const lines = Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join(
        "\n",
      );
      await fs.writeFile(filePath, lines);

      const result = await journal.tail(5);

      expect(result).toEqual(["line8", "line9", "line10", "line11", "line12"]);
    });

    it("returns all lines when fewer than n", async () => {
      const filePath = path.join(testDir, "test.md");
      const journal = new Journal({ filePath });

      const lines = "line1\nline2\nline3";
      await fs.writeFile(filePath, lines);

      const result = await journal.tail(10);

      expect(result).toEqual(["line1", "line2", "line3"]);
    });

    it("filters empty lines", async () => {
      const filePath = path.join(testDir, "test.md");
      const journal = new Journal({ filePath });

      const lines = "line1\n\nline2\n\nline3";
      await fs.writeFile(filePath, lines);

      const result = await journal.tail(10);

      expect(result).toEqual(["line1", "line2", "line3"]);
    });

    it("handles Windows line endings", async () => {
      const filePath = path.join(testDir, "test.md");
      const journal = new Journal({ filePath });

      const lines = "line1\r\nline2\r\nline3";
      await fs.writeFile(filePath, lines);

      const result = await journal.tail(10);

      expect(result).toEqual(["line1", "line2", "line3"]);
    });

    it("returns empty array when n is 0 (line 45)", async () => {
      const filePath = path.join(testDir, "test.md");
      const journal = new Journal({ filePath });
      await fs.writeFile(filePath, "line1\nline2\nline3");

      const result = await journal.tail(0);

      expect(result).toEqual([]);
    });

    it("returns empty array when n is NaN (line 45)", async () => {
      const filePath = path.join(testDir, "test.md");
      const journal = new Journal({ filePath });
      await fs.writeFile(filePath, "line1\nline2");

      const result = await journal.tail(NaN);

      expect(result).toEqual([]);
    });

    it("rethrows non-ENOENT errors (line 52)", async () => {
      // Create the file then make it unreadable by replacing it with a directory
      const filePath = path.join(testDir, "unreadable.md");
      const journal = new Journal({ filePath });
      // Create a directory at the file path — readFile on a directory throws EISDIR
      await fs.mkdir(filePath, { recursive: true });

      await expect(journal.tail(10)).rejects.toThrow();
    });
  });

  describe("clear", () => {
    it("renames existing file to dated .bak and creates empty file (lines 52-64)", async () => {
      const filePath = path.join(testDir, "PROGRESS.md");
      const journal = new Journal({ filePath });
      await fs.writeFile(filePath, "some content", { encoding: "utf8" });

      const bak = await journal.clear();

      // backup file exists and has original content
      const bakContent = await fs.readFile(bak, "utf8");
      expect(bakContent).toBe("some content");

      // original file now exists and is empty
      const newContent = await fs.readFile(filePath, "utf8");
      expect(newContent).toBe("");

      // backup path follows naming convention PROGRESS-YYYY-MM-DD.md.bak
      expect(bak).toMatch(/PROGRESS-\d{4}-\d{2}-\d{2}\.md\.bak$/);
    });

    it("creates empty file when original does not exist (ENOENT swallowed)", async () => {
      const filePath = path.join(testDir, "nonexistent-progress.md");
      const journal = new Journal({ filePath });

      // should not throw even though file doesn't exist
      const bak = await journal.clear();

      const newContent = await fs.readFile(filePath, "utf8");
      expect(newContent).toBe("");
      expect(bak).toMatch(/\.bak$/);
    });

    it("returns the backup file path", async () => {
      const filePath = path.join(testDir, "PROGRESS.md");
      const journal = new Journal({ filePath });
      await fs.writeFile(filePath, "data");

      const bak = await journal.clear();

      expect(typeof bak).toBe("string");
      expect(bak).toContain(testDir);
    });
  });
});
