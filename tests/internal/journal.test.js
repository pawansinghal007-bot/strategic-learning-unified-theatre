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
  });
});
