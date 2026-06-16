import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';

const launchSpecPath = path.resolve("tests/human/launch.spec.js");
const themeSpecPath = path.resolve("tests/ui/theme-readability.spec.js");
const proofSpecPath = path.resolve("tests/human/executive-proof.spec.js");
const reviewSpecPath = path.resolve("tests/human/executive-review.spec.js");

describe("Sprint 61 Human Tester 8 regression guard", () => {
  const dashboard = loadDashboardSurface();

  it("includes executive review panel hooks", () => {
    expect(dashboard).toContain('data-testid="executive-review-panel"');
    expect(dashboard).toContain('data-testid="executive-review-title"');
    expect(dashboard).toContain('data-testid="review-drift-source-value"');
    expect(dashboard).toContain('data-testid="review-benchmark-source-value"');
    expect(dashboard).toContain('data-testid="load-live-review-btn"');
    expect(dashboard).toContain('data-testid="export-review-evidence-btn"');
    expect(dashboard).toContain('data-testid="verify-review-persistence-btn"');
    expect(dashboard).toContain('data-testid="review-output"');
    expect(dashboard).toContain('data-testid="review-export-output"');
  });

  it("preserves review helper functions", () => {
    expect(dashboard).toContain("function buildLiveReviewEvidence(");
    expect(dashboard).toContain("function setReviewState(");
    expect(dashboard).toContain("function setReviewPersistenceState(");
    expect(dashboard).toContain("function setReviewExportState(");
    expect(dashboard).toContain("data-review-export-state");
    expect(dashboard).toContain("data-review-persistence-check");
  });

  it("preserves review surface markers", () => {
    expect(dashboard).toContain('data-review-surface="drift-history"');
    expect(dashboard).toContain('data-review-surface="compliance-output"');
    expect(dashboard).toContain('data-review-surface="proof-summary"');
    expect(dashboard).toContain('data-review-surface="governance"');
    expect(dashboard).toContain('data-review-surface="timeline"');
    expect(dashboard).toContain('data-review-surface="knowledge"');
  });

  it("preserves timeline-output min-height fix from Sprint 59", () => {
    expect(dashboard).toContain("min-height: 32px");
  });

  it("applies the init-order bugfix for review persistence (Sprint 60 lesson)", () => {
    expect(dashboard).toMatch(
      /setReviewPersistenceState\(\s*['"]Standby['"]\s*,\s*null\s*\)/,
    );
  });

  it("playwright specs exist", () => {
    expect(fs.existsSync(launchSpecPath)).toBe(true);
    expect(fs.existsSync(themeSpecPath)).toBe(true);
    expect(fs.existsSync(proofSpecPath)).toBe(true);
    expect(fs.existsSync(reviewSpecPath)).toBe(true);
  });

  it("launch spec covers review surfaces", () => {
    const content = fs.readFileSync(launchSpecPath, "utf8");
    expect(content).toContain("executive-review-panel");
    expect(content).toContain("review-output");
    expect(content).toContain("review flow starts in ready state");
  });

  it("launch spec preserves Sprint 59/60 ready-state tests", () => {
    const content = fs.readFileSync(launchSpecPath, "utf8");
    expect(content).toContain("walkthrough flow starts in ready state");
    expect(content).toContain("compliance flow starts in ready state");
  });

  it("theme spec covers review readability", () => {
    const content = fs.readFileSync(themeSpecPath, "utf8");
    expect(content).toContain("executive-review-panel");
    expect(content).toContain("review-export-output");
  });

  it("proof spec covers live review alignment", () => {
    const content = fs.readFileSync(proofSpecPath, "utf8");
    expect(content).toContain("load-live-review-btn");
    expect(content).toContain("Live Review Loaded");
  });

  it("proof spec preserves Sprint 58-60 test names", () => {
    const content = fs.readFileSync(proofSpecPath, "utf8");
    expect(content).toContain("local AI status sync updates proof flow");
    expect(content).toContain(
      "proof flow starts in initialized state after DOMContentLoaded",
    );
    expect(content).toContain(
      "capture proof state button click updates last action and output",
    );
    expect(content).toContain("proof and walkthrough surfaces stay aligned");
    expect(content).toContain("drift review updates proof state");
  });

  it("review spec covers export and persistence flows", () => {
    const content = fs.readFileSync(reviewSpecPath, "utf8");
    expect(content).toContain("export-review-evidence-btn");
    expect(content).toContain("verify-review-persistence-btn");
    expect(content).toContain("Executive Review Evidence");
    expect(content).toContain("Review persistence verified");
  });
});
