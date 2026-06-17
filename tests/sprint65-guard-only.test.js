import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const dashboardJsPath = path.resolve("src/ui/dashboard.js");
const dashboardHtmlPath = path.resolve("src/ui/provider-dashboard.html");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

describe("Sprint 65 guard-only: compatibility hook preservation", () => {
  const html = read(dashboardHtmlPath);

  it("preserves all executive panel data-testid hooks added through Sprint 63", () => {
    const requiredPanels = [
      "executive-evidence-panel",
      "executive-proof-panel",
      "executive-walkthrough-panel",
      "executive-compliance-panel",
      "executive-review-panel",
      "executive-release-panel",
    ];
    for (const id of requiredPanels) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it("preserves release panel action button hooks", () => {
    expect(html).toContain('data-testid="load-release-truth-btn"');
    expect(html).toContain('data-testid="export-release-truth-btn"');
    expect(html).toContain('data-testid="verify-release-blockers-btn"');
    expect(html).toContain('data-testid="load-release-readiness-btn"');
    expect(html).toContain('data-testid="refresh-sonar-truth-btn"');
  });

  it("preserves release output element hooks", () => {
    expect(html).toContain('data-testid="release-readiness-output"');
    expect(html).toContain('data-testid="release-blockers-output"');
    expect(html).toContain('data-testid="release-output"');
  });

  it("preserves the timeline-output min-height fix from Sprint 59", () => {
    expect(html).toContain("min-height: 32px");
  });

  it("preserves Sprint 63 compatibility comment about executive release truth panel", () => {
    expect(html).toContain(
      "HUMAN TESTER 9 START: new executive release truth panel for Sprint 63",
    );
  });
});

describe("Sprint 65 guard-only: dataset-backed state markers (Sprint 64 migration)", () => {
  const js = read(dashboardJsPath);

  it("setReleaseState writes via .dataset for release output and panel", () => {
    const match = js.match(/function setReleaseState[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).toContain("dataset.releaseOutput");
    expect(body).toContain("dataset.releaseTruth");
  });

  it("setComplianceState writes via .dataset", () => {
    const match = js.match(/function setComplianceState[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).toContain("dataset.complianceOutput");
    expect(body).toContain("dataset.driftReviewState");
  });

  it("setReviewState writes via .dataset", () => {
    const match = js.match(/function setReviewState[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).toContain("dataset.reviewOutput");
    expect(body).toContain("dataset.reviewExportState");
  });

  it("setWalkthroughState writes via .dataset", () => {
    const match = js.match(/function setWalkthroughState[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).toContain("dataset.walkthroughOutput");
    expect(body).toContain("dataset.demoMode");
    expect(body).toContain("dataset.walkthroughStep");
  });

  it("setProofAction writes via .dataset for proof output and panel", () => {
    const match = js.match(/function setProofAction[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).toContain("dataset.proofOutput");
    expect(body).toContain("dataset.lastProofAction");
  });

  it("setLocalAiStatus writes via .dataset for local AI state", () => {
    const match = js.match(/function setLocalAiStatus[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const body = match[0];
    expect(body).toContain("dataset.localAiState");
  });

  it("normalizeStateToken is defined exactly once in dashboard.js", () => {
    const occurrences = (js.match(/function normalizeStateToken\(/g) || [])
      .length;
    expect(occurrences).toBe(1);
  });

  it("no function in dashboard.js is duplicated in provider-dashboard.html", () => {
    const html = read(dashboardHtmlPath);
    const jsFunctionNames = [...js.matchAll(/^function (\w+)\(/gm)].map(
      (m) => m[1],
    );
    const htmlFunctionNames = [...html.matchAll(/function (\w+)\(/g)].map(
      (m) => m[1],
    );
    const duplicates = jsFunctionNames.filter((name) =>
      htmlFunctionNames.includes(name),
    );
    expect(duplicates).toEqual([]);
  });

  it("Sprint 64 T1 residual fixes: compliance benchmark handler uses dataset", () => {
    // Line 865 in dashboard.js: output.dataset.complianceOutput = "mapped"
    expect(js).toContain('output.dataset.complianceOutput = "mapped"');
  });

  it("Sprint 64 T1 residual fixes: release readiness handler uses dataset", () => {
    // Line 1053 in dashboard.js: readinessOutput.dataset.releaseReadinessOutput = "blocked"
    expect(js).toContain("readinessOutput.dataset.releaseReadinessOutput");
  });

  it("Sprint 64 T1 residual fixes: refresh sonar truth handler uses dataset", () => {
    // Line 1072 in dashboard.js: releasePanel.dataset.releaseReadiness = "blocked"
    expect(js).toContain('releasePanel.dataset.releaseReadiness = "blocked"');
  });
});

describe("Sprint 65 guard-only: false-clean language prevention", () => {
  const html = read(dashboardHtmlPath);
  const js = read(dashboardJsPath);

  it('dashboard HTML never claims "Sonar verified clean"', () => {
    expect(html).not.toContain("Sonar verified clean");
  });

  it('dashboard.js never claims "Sonar verified clean"', () => {
    expect(js).not.toContain("Sonar verified clean");
  });

  it('dashboard HTML never claims a generic "clean" release state', () => {
    // Loose guard: "release...clean" as an adjacent phrase would indicate
    // a false-clean claim slipping into markup.
    expect(html).not.toMatch(/release[^<>{}]{0,40}\bclean\b/i);
  });

  it('dashboard.js never claims "release.*clean" without gating', () => {
    // refreshReleaseTruth must not hardcode a celebratory clean/passed string
    // as the unconditional outcome.
    const match = js.match(/function refreshReleaseTruth[\s\S]*?\n\}/);
    if (match) {
      const body = match[0];
      // Should not contain unconditioned "Clean" or "Passed" or "Verified Clean"
      expect(body).not.toMatch(/['"`]\s*Clean\s*['"`]/);
      expect(body).not.toMatch(/['"`]\s*Verified Clean\s*['"`]/);
    }
  });
});

describe("Sprint 65 guard-only: release-truth wording lock", () => {
  const html = read(dashboardHtmlPath);

  it("release-readiness-output element communicates blocked state", () => {
    expect(html).toContain(
      "Release is currently blocked by a failed Sonar quality gate",
    );
  });

  it("release-readiness-output element contains 89 open issues reference", () => {
    expect(html).toContain("89 open");
  });

  it("release-blockers-output element exists with blocker-related content", () => {
    expect(html).toContain("Release blockers not yet verified");
  });

  it("release-output element has initial idle state text", () => {
    expect(html).toContain("Release truth idle.");
  });

  it("loadReleaseReadinessBtn handler sets blocked state via dataset", () => {
    const js = read(dashboardJsPath);
    expect(js).toContain(
      "Quality gate currently FAILED with 89 open issues. Release is blocked until issues are resolved.",
    );
  });

  it("refreshSonarTruthBtn handler communicates release remains blocked", () => {
    const js = read(dashboardJsPath);
    expect(js).toContain(
      "Release remains blocked: Sonar quality gate truth re-checked and still shows 89 open issues.",
    );
  });

  it("release panel initial data-release-readiness-output attribute set to blocked", () => {
    expect(html).toContain('data-release-readiness-output="blocked"');
  });
});
