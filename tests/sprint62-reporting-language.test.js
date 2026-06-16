import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';

const qualityGatePath = path.resolve("scripts/check-sonar-quality-gate.mjs");
const issuesPath = path.resolve("scripts/export-sonar-issues.mjs");
const preflightPath = path.resolve("scripts/check-sonar-preflight.mjs");
const masterInstructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);

describe("Sprint 62 reporting language precision", () => {
  it('quality gate script says "Quality gate passed" (not "Sonar clean") on success', () => {
    const content = fs.readFileSync(qualityGatePath, "utf8");
    expect(content).toContain("Quality gate passed");
  });

  it('issues export script says "Scoped issues zero" (not "Sonar clean") on success', () => {
    const content = fs.readFileSync(issuesPath, "utf8");
    expect(content).toContain("Scoped issues zero");
  });

  it('preflight script says "preflight" success message (not "Sonar clean") on success', () => {
    const content = fs.readFileSync(preflightPath, "utf8");
    expect(content).toContain("preflight");
    expect(content).not.toMatch(/^console\.log\(['"]Sonar clean/m);
  });

  it('quality gate script uses "FAILED" (not just "error") in its failure messages', () => {
    const content = fs.readFileSync(qualityGatePath, "utf8");
    expect(content).toContain("FAILED");
  });

  it('issues export script uses "FAILED" (not just "error") in its failure messages', () => {
    const content = fs.readFileSync(issuesPath, "utf8");
    expect(content).toContain("FAILED");
  });

  it('preflight script uses "FAILED" (not just "error") in its failure messages', () => {
    const content = fs.readFileSync(preflightPath, "utf8");
    expect(content).toContain("FAILED");
  });

  it('master instructions Sprint 62 Complete entry (once written) should not say "Sonar clean" alone', () => {
    const content = fs.readFileSync(masterInstructionsPath, "utf8");
    if (!content.includes("## Sprint 62 Complete")) {
      return;
    }
    const sprint62Block = content.slice(
      content.indexOf("## Sprint 62 Complete"),
    );
    const nextSprint = sprint62Block.indexOf("\n## Sprint", 2);
    const block =
      nextSprint > -1 ? sprint62Block.slice(0, nextSprint) : sprint62Block;
    expect(block).not.toMatch(/Sonar clean\.$/m);
  });
});
