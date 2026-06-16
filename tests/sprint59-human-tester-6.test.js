import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';

const launchSpecPath = path.resolve("tests/human/launch.spec.js");
const themeSpecPath = path.resolve("tests/ui/theme-readability.spec.js");
const proofSpecPath = path.resolve("tests/human/executive-proof.spec.js");
const walkthroughSpecPath = path.resolve(
  "tests/human/executive-walkthrough.spec.js",
);

describe("Sprint 59 Human Tester 6 regression guard", () => {
  const dashboard = loadDashboardSurface();

  it("includes executive walkthrough panel hooks", () => {
    expect(dashboard).toContain('data-testid="executive-walkthrough-panel"');
    expect(dashboard).toContain('data-testid="executive-walkthrough-title"');
    expect(dashboard).toContain('data-testid="walkthrough-step-value"');
    expect(dashboard).toContain('data-testid="start-demo-mode-btn"');
    expect(dashboard).toContain('data-testid="export-proof-summary-btn"');
    expect(dashboard).toContain('data-testid="copy-proof-summary-btn"');
    expect(dashboard).toContain('data-testid="walkthrough-output"');
    expect(dashboard).toContain('data-testid="proof-summary-output"');
  });

  it("preserves proof and walkthrough synchronization helpers", () => {
    expect(dashboard).toContain("function setProofAction(");
    expect(dashboard).toContain("function setWalkthroughState(");
    expect(dashboard).toContain("function buildProofSummary(");
    expect(dashboard).toContain("function setProofSummaryState(");
    expect(dashboard).toContain("data-demo-mode");
    expect(dashboard).toContain("data-walkthrough-step");
    expect(dashboard).toContain("data-proof-summary-state");
  });

  it("preserves walkthrough surface markers", () => {
    expect(dashboard).toContain('data-walkthrough-surface="governance"');
    expect(dashboard).toContain('data-walkthrough-surface="timeline"');
    expect(dashboard).toContain('data-walkthrough-surface="knowledge"');
    expect(dashboard).toContain('data-walkthrough-surface="audit"');
    expect(dashboard).toContain('data-walkthrough-surface="security"');
    expect(dashboard).toContain('data-walkthrough-surface="security-drift"');
    expect(dashboard).toContain('data-walkthrough-surface="knowledge-panel"');
  });

  it("playwright specs exist", () => {
    expect(fs.existsSync(launchSpecPath)).toBe(true);
    expect(fs.existsSync(themeSpecPath)).toBe(true);
    expect(fs.existsSync(proofSpecPath)).toBe(true);
    expect(fs.existsSync(walkthroughSpecPath)).toBe(true);
  });

  it("launch spec covers walkthrough surfaces", () => {
    const content = fs.readFileSync(launchSpecPath, "utf8");
    expect(content).toContain("executive-walkthrough-panel");
    expect(content).toContain("proof-summary-output");
  });

  it("theme spec covers walkthrough readability", () => {
    const content = fs.readFileSync(themeSpecPath, "utf8");
    expect(content).toContain("executive-walkthrough-panel");
    expect(content).toContain("walkthrough-output");
    expect(content).toContain("proof-summary-output");
  });

  it("proof spec covers walkthrough alignment", () => {
    const content = fs.readFileSync(proofSpecPath, "utf8");
    expect(content).toContain("start-demo-mode-btn");
    expect(content).toContain("Executive demo mode enabled");
  });

  it("walkthrough spec covers export and copy flows", () => {
    const content = fs.readFileSync(walkthroughSpecPath, "utf8");
    expect(content).toContain("export-proof-summary-btn");
    expect(content).toContain("copy-proof-summary-btn");
    expect(content).toContain("Executive Proof Summary");
    expect(content).toContain("Sprint 59 walkthrough export prepared.");
  });
});
