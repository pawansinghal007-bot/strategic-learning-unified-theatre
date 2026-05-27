import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseLastCommitLine, parseStatusSummary } from "../src/internal/git-monitor.js";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");

describe("git monitor parsing", () => {
  it("parses ahead/behind and uncommitted count from status -sb --porcelain", async () => {
    const raw = await fs.readFile(path.join(fixturesDir, "git-status-ahead-behind.txt"), "utf8");
    const s = parseStatusSummary(raw);
    expect(s.branch).toBe("main");
    expect(s.ahead).toBe(2);
    expect(s.behind).toBe(1);
    expect(s.uncommitted).toBe(2);
  });

  it("parses last commit line", async () => {
    const raw = await fs.readFile(path.join(fixturesDir, "git-log-line.txt"), "utf8");
    const c = parseLastCommitLine(raw);
    expect(c.sha).toHaveLength(40);
    expect(c.msg).toBe("Fix thing");
    expect(c.date).toMatch(/T/);
  });
});
