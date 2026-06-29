import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// Resolve paths relative to project root
const root = path.resolve(".");
const p = (...parts) => path.join(root, ...parts);

describe("Sprint 84 quality and scope guard", () => {
  it("master timeline file exists and is non-empty", () => {
    const timelinePath = p("master_timeline_sprints_1_97.md");
    expect(fs.existsSync(timelinePath)).toBe(true);
    const content = fs.readFileSync(timelinePath, "utf8");
    expect(content.length).toBeGreaterThan(100);
  });

  it("keeps sprint 83 scope document in repo", () => {
    const scopePath = p("docs/sprint-83-scope.md");
    expect(fs.existsSync(scopePath)).toBe(true);
    const content = fs.readFileSync(scopePath, "utf8");
    expect(content).toMatch(/Sprint 83/i);
  });

  it("adds all four sprint 84 planning documents", () => {
    const files = [
      "docs/sprint-84-scope.md",
      "docs/sprint-84-checklist.md",
      "docs/sprint-84-sonar-backlog.md",
      "docs/sprint-84-master-plan-update.md",
    ];
    for (const file of files) {
      expect(fs.existsSync(p(file)), `Missing: ${file}`).toBe(true);
    }
  });

  it("sonar backlog tracks 44 remaining issues and key rule families", () => {
    const backlog = fs.readFileSync(
      p("docs/sprint-84-sonar-backlog.md"),
      "utf8",
    );
    expect(backlog).toContain("44");
    expect(backlog).toContain("S1128");
    expect(backlog).toContain("S7772");
    expect(backlog).toContain("S2486");
    expect(backlog).toContain("S7748");
    expect(backlog).toContain("S7776");
  });

  it("ingest sprint history preserves top-level await guard", () => {
    const ingest = fs.readFileSync(
      p("src/knowledge/ingest/ingest-sprint-history.ts"),
      "utf8",
    );
    expect(ingest).toContain("await main");
    // VITEST guard must also be present (Sprint 83 test-safe behavior)
    expect(ingest).toMatch(/VITEST/);
  });

  it("vitest config still enforces 100% coverage thresholds", () => {
    const config = fs.readFileSync(p("vitest.config.ts"), "utf8");
    // Must contain 100 as a threshold value
    expect(config).toMatch(/100/);
    // Must not have been downgraded back to 70
    expect(config).not.toMatch(/statements\s*:\s*70/);
    expect(config).not.toMatch(/branches\s*:\s*70/);
    expect(config).not.toMatch(/functions\s*:\s*70/);
    expect(config).not.toMatch(/lines\s*:\s*70/);
  });

  it("sprint 84 master plan update records both sprints", () => {
    const update = fs.readFileSync(
      p("docs/sprint-84-master-plan-update.md"),
      "utf8",
    );
    expect(update).toContain("Sprint 83");
    expect(update).toContain("Status: Complete");
    expect(update).toContain("Sprint 84");
    expect(update).toContain("Status: Next");
  });
});
