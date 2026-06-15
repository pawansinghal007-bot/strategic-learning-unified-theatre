import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const dashboardPath = path.resolve("src/ui/provider-dashboard.html");
const launchSpecPath = path.resolve("tests/human/launch.spec.js");
const themeSpecPath = path.resolve("tests/ui/theme-readability.spec.js");
const proofSpecPath = path.resolve("tests/human/executive-proof.spec.js");
const complianceSpecPath = path.resolve(
  "tests/human/executive-compliance.spec.js",
);

describe("Sprint 60 Human Tester 7 regression guard", () => {
  const dashboard = fs.readFileSync(dashboardPath, "utf8");

  it("includes executive compliance panel hooks", () => {
    expect(dashboard).toContain('data-testid="executive-compliance-panel"');
    expect(dashboard).toContain('data-testid="executive-compliance-title"');
    expect(dashboard).toContain('data-testid="compliance-benchmark-value"');
    expect(dashboard).toContain('data-testid="load-drift-history-btn"');
    expect(dashboard).toContain('data-testid="map-compliance-benchmarks-btn"');
    expect(dashboard).toContain('data-testid="persist-demo-state-btn"');
    expect(dashboard).toContain('data-testid="compliance-output"');
    expect(dashboard).toContain('data-testid="drift-history-output"');
  });

  it("preserves compliance helpers", () => {
    expect(dashboard).toContain("function setComplianceState(");
    expect(dashboard).toContain("function setDriftHistoryState(");
    expect(dashboard).toContain("function setDemoPersistenceState(");
    expect(dashboard).toContain("function buildDriftHistorySummary(");
    expect(dashboard).toContain("data-demo-persistence");
    expect(dashboard).toContain("data-drift-review-state");
    expect(dashboard).toContain("data-drift-history-state");
  });

  it("preserves compliance surface markers", () => {
    expect(dashboard).toContain('data-compliance-surface="governance"');
    expect(dashboard).toContain('data-compliance-surface="timeline"');
    expect(dashboard).toContain('data-compliance-surface="knowledge"');
    expect(dashboard).toContain('data-compliance-surface="audit"');
    expect(dashboard).toContain('data-compliance-surface="security-overview"');
    expect(dashboard).toContain('data-compliance-surface="security-drift"');
  });

  it("preserves timeline-output min-height fix from Sprint 59", () => {
    expect(dashboard).toContain("min-height: 32px");
  });

  it("playwright specs exist", () => {
    expect(fs.existsSync(launchSpecPath)).toBe(true);
    expect(fs.existsSync(themeSpecPath)).toBe(true);
    expect(fs.existsSync(proofSpecPath)).toBe(true);
    expect(fs.existsSync(complianceSpecPath)).toBe(true);
  });

  it("launch spec covers compliance surfaces", () => {
    const content = fs.readFileSync(launchSpecPath, "utf8");
    expect(content).toContain("executive-compliance-panel");
    expect(content).toContain("drift-history-output");
  });

  it("theme spec covers compliance readability", () => {
    const content = fs.readFileSync(themeSpecPath, "utf8");
    expect(content).toContain("executive-compliance-panel");
    expect(content).toContain("compliance-output");
    expect(content).toContain("drift-history-output");
  });

  it("proof spec covers drift-proof alignment", () => {
    const content = fs.readFileSync(proofSpecPath, "utf8");
    expect(content).toContain("load-drift-history-btn");
    expect(content).toContain("Drift History Loaded");
  });

  it("proof spec preserves Sprint 58/59 test names", () => {
    const content = fs.readFileSync(proofSpecPath, "utf8");
    expect(content).toContain("local AI status sync updates proof flow");
    expect(content).toContain(
      "proof flow starts in initialized state after DOMContentLoaded",
    );
    expect(content).toContain(
      "capture proof state button click updates last action and output",
    );
    expect(content).toContain("proof and walkthrough surfaces stay aligned");
  });

  it("compliance spec covers benchmark and persistence flows", () => {
    const content = fs.readFileSync(complianceSpecPath, "utf8");
    expect(content).toContain("map-compliance-benchmarks-btn");
    expect(content).toContain("persist-demo-state-btn");
    expect(content).toContain("OWASP Top 10: mapped");
    expect(content).toContain("Walkthrough state persisted");
  });
});
