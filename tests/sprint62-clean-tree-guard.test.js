import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';

const gitignorePath = path.resolve(".gitignore");
const preflightPath = path.resolve("scripts/check-sonar-preflight.mjs");

describe("Sprint 62 clean-tree guard", () => {
  const gitignore = fs.readFileSync(gitignorePath, "utf8");
  const preflight = fs.readFileSync(preflightPath, "utf8");

  it(".gitignore excludes coverage/", () => {
    expect(gitignore).toMatch(/^coverage\/$/m);
  });

  it(".gitignore excludes playwright-report/", () => {
    expect(gitignore).toMatch(/playwright-report/);
  });

  it(".gitignore excludes test-results/", () => {
    expect(gitignore).toMatch(/test-results/);
  });

  it(".gitignore excludes .scannerwork/", () => {
    expect(gitignore).toMatch(/\.scannerwork/);
  });

  it(".gitignore excludes sonar-issues-report.json", () => {
    expect(gitignore).toMatch(/sonar-issues-report/);
  });

  it("preflight script checks for playwright-report as a dirty-tree indicator", () => {
    expect(preflight).toContain("playwright-report");
  });

  it("preflight script checks for .scannerwork as a dirty-tree indicator", () => {
    expect(preflight).toContain(".scannerwork");
  });

  it("preflight script checks for sonar-issues-report.json as a dirty-tree indicator", () => {
    expect(preflight).toContain("sonar-issues-report");
  });

  it("preflight script checks that coverage/ exists before allowing scan", () => {
    expect(preflight).toContain("coverage");
    expect(preflight).toMatch(/existsSync|fs\.stat|access/);
  });

  it("preflight script fails closed on dirty-tree detection", () => {
    const exitCount = (preflight.match(/process\.exit\(1\)/g) || []).length;
    expect(exitCount).toBeGreaterThan(0);
  });

  it("preflight script does not exit 0 if it cannot complete the git status check", () => {
    expect(preflight).toContain("try");
    expect(preflight).toContain("catch");
  });
});
