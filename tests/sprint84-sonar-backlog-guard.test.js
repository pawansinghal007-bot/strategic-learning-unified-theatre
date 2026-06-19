import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const backlogPath = path.resolve("docs/sprint-84-sonar-backlog.md");

describe("Sprint 84 Sonar backlog guard", () => {
  it("keeps the backlog grouped by cleanup type", () => {
    const content = fs.readFileSync(backlogPath, "utf8");
    expect(content).toContain("Group A: mechanical cleanup");
    expect(content).toContain("Group B: readability and consistency");
    expect(content).toContain("Group C: structural refactors");
  });

  it("keeps validation commands documented", () => {
    const content = fs.readFileSync(backlogPath, "utf8");
    expect(content).toContain("npx vitest run");
    expect(content).toContain("npx tsc --noEmit");
    expect(content).toContain("sonar-scanner");
  });

  it("protects compatibility and scope-guard behavior", () => {
    const content = fs.readFileSync(backlogPath, "utf8");
    expect(content).toContain("Do not change compatibility strings");
    expect(content).toContain("Do not weaken ingest guard behavior");
  });
});
