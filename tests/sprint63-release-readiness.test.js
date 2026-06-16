import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';

const dashboardScriptPath = path.resolve("src/ui/dashboard.js");
const launchSpecPath = path.resolve("tests/human/launch.spec.js");
const themeSpecPath = path.resolve("tests/ui/theme-readability.spec.js");
const releaseSpecPath = path.resolve("tests/human/executive-release.spec.js");

describe("Sprint 63 release readiness regression guard", () => {
  const dashboard = loadDashboardSurface();
  // The dashboard's script was externalized to satisfy CSP (script-src 'self'),
  // so function definitions and runtime-generated message strings now live in
  // dashboard.js rather than inline in the HTML. Checks that need that JS
  // content are run against the combined source below.
  const dashboardScript = fs.readFileSync(dashboardScriptPath, "utf8");
  const dashboardSource = `${dashboard}\n${dashboardScript}`;

  it("includes executive release panel hooks", () => {
    expect(dashboard).toContain('data-testid="executive-release-panel"');
    expect(dashboard).toContain('data-testid="executive-release-title"');
    expect(dashboard).toContain('data-testid="release-scan-value"');
    expect(dashboard).toContain('data-testid="release-gate-value"');
    expect(dashboard).toContain('data-testid="release-issues-value"');
    expect(dashboard).toContain('data-testid="release-coverage-value"');
    expect(dashboard).toContain('data-testid="load-release-readiness-btn"');
    expect(dashboard).toContain('data-testid="verify-release-blockers-btn"');
    expect(dashboard).toContain('data-testid="refresh-sonar-truth-btn"');
    expect(dashboard).toContain('data-testid="release-readiness-output"');
    expect(dashboard).toContain('data-testid="release-blockers-output"');
  });

  it("includes release helper functions", () => {
    expect(dashboardSource).toContain("function setReleaseState(");
    expect(dashboardSource).toContain("function setReleaseBlockersState(");
    expect(dashboardSource).toContain(
      "function buildReleaseReadinessEvidence(",
    );
    expect(dashboardSource).toContain("function refreshReleaseTruth(");
  });

  it("release helper functions call normalizeStateToken with two arguments", () => {
    const setReleaseStateMatch = dashboardSource.match(
      /function setReleaseState[\s\S]*?\n\}/,
    );
    expect(setReleaseStateMatch).not.toBeNull();
    const body = setReleaseStateMatch[0];
    const calls = body.match(/normalizeStateToken\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/,/);
    }
  });

  it("preserves blocked truth messaging instead of false-clean messaging", () => {
    expect(dashboardSource).toContain("Release is currently blocked");
    expect(dashboardSource).toContain("Quality gate currently FAILED");
    expect(dashboardSource).toContain("Scoped issues zero is false");
    expect(dashboardSource).not.toContain("Sonar verified clean");
    expect(dashboardSource).not.toMatch(/release[^.]*\bis\b[^.]*\bclean\b/i);
  });

  it("issue count is presented as a historical snapshot, not a bare live number", () => {
    expect(dashboard).toMatch(/89\s*\(last scan\)/);
  });

  it("preserves timeline-output min-height fix from Sprint 59", () => {
    expect(dashboard).toContain("min-height: 32px");
  });

  it("preserves data-release-surface markers on prior outputs", () => {
    expect(dashboard).toContain('data-release-surface="review-evidence"');
    expect(dashboard).toContain('data-release-surface="review-export"');
    expect(dashboard).toContain('data-release-surface="proof-summary"');
    expect(dashboard).toContain('data-release-surface="compliance-evidence"');
    expect(dashboard).toContain('data-release-surface="timeline"');
  });

  it("playwright specs exist", () => {
    expect(fs.existsSync(launchSpecPath)).toBe(true);
    expect(fs.existsSync(themeSpecPath)).toBe(true);
    expect(fs.existsSync(releaseSpecPath)).toBe(true);
  });

  it("launch spec covers release surfaces truthfully", () => {
    const content = fs.readFileSync(launchSpecPath, "utf8");
    expect(content).toContain("executive-release-panel");
    expect(content).toContain("Release is currently blocked");
  });

  it("launch spec preserves Sprint 59-61 ready-state tests", () => {
    const content = fs.readFileSync(launchSpecPath, "utf8");
    expect(content).toContain("walkthrough flow starts in ready state");
    expect(content).toContain("compliance flow starts in ready state");
    expect(content).toContain("review flow starts in ready state");
  });

  it("theme spec covers release readability", () => {
    const content = fs.readFileSync(themeSpecPath, "utf8");
    expect(content).toContain("executive-release-panel");
    expect(content).toContain("release-blockers-output");
  });

  it("release spec covers blocked-truth interactions", () => {
    const content = fs.readFileSync(releaseSpecPath, "utf8");
    expect(content).toContain("load-release-readiness-btn");
    expect(content).toContain("verify-release-blockers-btn");
    expect(content).toContain("refresh-sonar-truth-btn");
    expect(content).toContain("Quality gate currently FAILED");
  });
});
