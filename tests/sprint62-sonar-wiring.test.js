import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const pkgPath = path.resolve("package.json");
const utilsPath = path.resolve("scripts/sonar-utils.mjs");
const preflightPath = path.resolve("scripts/check-sonar-preflight.mjs");
const qualityGatePath = path.resolve("scripts/check-sonar-quality-gate.mjs");
const issuesPath = path.resolve("scripts/export-sonar-issues.mjs");

describe("Sprint 62 Sonar wiring", () => {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts || {};

  it("sonar:preflight script is wired to the preflight check", () => {
    expect(scripts["sonar:preflight"]).toBeDefined();
    expect(scripts["sonar:preflight"]).toContain("check-sonar-preflight");
    expect(scripts["sonar:preflight"]).not.toMatch(/^echo/i);
  });

  it("sonar:qualitygate script is wired to the quality gate check", () => {
    expect(scripts["sonar:qualitygate"]).toBeDefined();
    expect(scripts["sonar:qualitygate"]).toContain("check-sonar-quality-gate");
    expect(scripts["sonar:qualitygate"]).not.toMatch(/^echo/i);
  });

  it("sonar:issues script is wired to the issues export", () => {
    expect(scripts["sonar:issues"]).toBeDefined();
    expect(scripts["sonar:issues"]).toContain("export-sonar-issues");
    expect(scripts["sonar:issues"]).not.toMatch(/^echo/i);
  });

  it("test:sonar script chains preflight, scan, qualitygate, and issues", () => {
    expect(scripts["test:sonar"]).toBeDefined();
    expect(scripts["test:sonar"]).toContain("sonar:preflight");
    expect(scripts["test:sonar"]).toContain("sonar:scan");
    expect(scripts["test:sonar"]).toContain("sonar:qualitygate");
    expect(scripts["test:sonar"]).toContain("sonar:issues");
  });

  it("sonarscan is not a placeholder if it exists", () => {
    if (scripts["sonarscan"]) {
      expect(scripts["sonarscan"]).not.toMatch(/^echo/i);
      expect(scripts["sonarscan"]).not.toEqual("");
    }
  });

  it("sonarwait is not a placeholder if it exists", () => {
    if (scripts["sonarwait"]) {
      expect(scripts["sonarwait"]).not.toMatch(/^echo/i);
      expect(scripts["sonarwait"]).not.toEqual("");
    }
  });

  it("sonarexport is not a placeholder if it exists", () => {
    if (scripts["sonarexport"]) {
      expect(scripts["sonarexport"]).not.toMatch(/^echo/i);
      expect(scripts["sonarexport"]).not.toEqual("");
    }
  });

  it("existing test and coverage scripts are not removed", () => {
    expect(scripts["test"]).toBeDefined();
    const hasCoverage =
      scripts["coverage"] !== undefined ||
      scripts["test:coverage"] !== undefined;
    expect(hasCoverage).toBe(true);
  });

  it("sonar helper script files exist", () => {
    expect(fs.existsSync(utilsPath)).toBe(true);
    expect(fs.existsSync(preflightPath)).toBe(true);
    expect(fs.existsSync(qualityGatePath)).toBe(true);
    expect(fs.existsSync(issuesPath)).toBe(true);
  });

  it("sonar-utils exports readPropertiesFile, readReportTask, getSonarToken, authHeader, fetchJson", () => {
    const content = fs.readFileSync(utilsPath, "utf8");
    expect(content).toContain("readPropertiesFile");
    expect(content).toContain("readReportTask");
    expect(content).toContain("getSonarToken");
    expect(content).toContain("authHeader");
    expect(content).toContain("fetchJson");
  });

  it("quality gate script polls CE task API before checking gate status", () => {
    const content = fs.readFileSync(qualityGatePath, "utf8");
    expect(content).toContain("api/ce/task");
    expect(content).toContain("api/qualitygates/project_status");
  });

  it("quality gate script fails closed: exits non-zero on non-OK status", () => {
    const content = fs.readFileSync(qualityGatePath, "utf8");
    expect(content).toContain("process.exit(1)");
    expect(content).toContain("FAILED");
  });

  it("issues export script queries unresolved new-code issues and fails closed if any", () => {
    const content = fs.readFileSync(issuesPath, "utf8");
    expect(content).toContain("api/issues/search");
    expect(content).toContain("resolved=false");
    expect(content).toContain("inNewCodePeriod=true");
    expect(content).toContain("process.exit(1)");
  });

  it("preflight script checks git dirty state before allowing scan", () => {
    const content = fs.readFileSync(preflightPath, "utf8");
    expect(content).toContain("git status");
    expect(content).toContain("playwright-report");
    expect(content).toContain("coverage");
    expect(content).toContain("process.exit(1)");
  });
});
