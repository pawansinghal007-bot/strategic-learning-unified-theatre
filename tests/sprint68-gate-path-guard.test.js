import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const dashboardJsPath = path.resolve("src/ui/dashboard.js");
const htmlPath = path.resolve("src/ui/provider-dashboard.html");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

describe("Sprint 68 gate-path guard: dead-variable cleanup", () => {
  const js = read(dashboardJsPath);

  it("zero var declarations remain in dashboard.js (Sprint 67 baseline)", () => {
    const matches = js.match(/^\s*var\s/gm) || [];
    expect(matches.length).toBe(0);
  });

  it("captureBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+captureBtn\s*=/);
  });

  it("demoBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+demoBtn\s*=/);
  });

  it("exportBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+exportBtn\s*=/);
  });

  it("copyBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+copyBtn\s*=/);
  });

  it("driftBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+driftBtn\s*=/);
  });

  it("benchmarkBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+benchmarkBtn\s*=/);
  });

  it("persistBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+persistBtn\s*=/);
  });

  it("liveReviewBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+liveReviewBtn\s*=/);
  });

  it("exportReviewBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+exportReviewBtn\s*=/);
  });

  it("verifyPersistenceBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+verifyPersistenceBtn\s*=/);
  });

  it("loadReleaseTruthBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+loadReleaseTruthBtn\s*=/);
  });

  it("exportReleaseTruthBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+exportReleaseTruthBtn\s*=/);
  });

  it("verifyReleaseBlockersBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+verifyReleaseBlockersBtn\s*=/);
  });

  it("loadReleaseReadinessBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+loadReleaseReadinessBtn\s*=/);
  });

  it("refreshSonarTruthBtn dead variable removed (T1 cleanup)", () => {
    expect(js).not.toMatch(/const\s+refreshSonarTruthBtn\s*=/);
  });
});

describe("Sprint 68 gate-path guard: no regression of Sprint 64-67 fixes", () => {
  const js = read(dashboardJsPath);

  it("zero setAttribute( calls remain (Sprint 64/65 regression check)", () => {
    const matches = js.match(/setAttribute\(/g) || [];
    expect(matches.length).toBe(0);
  });

  it("zero getAttribute on data-* attributes remain (Sprint 65 regression check)", () => {
    expect(js).not.toMatch(/getAttribute\s*\(\s*['"]data-/);
  });

  it("setWalkthroughState retains its default-parameter form (Sprint 67 S7760 fix)", () => {
    // Verify the exact signature with mode = "standby" default
    const match = js.match(/function setWalkthroughState\([^)]*\)/);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/mode\s*=\s*["']standby["']/);
  });
});

describe("Sprint 68 gate-path guard: blocked-truth wording unchanged", () => {
  it("release-output idle wording is unchanged", () => {
    const js = read(dashboardJsPath);
    expect(js).toContain("Release truth idle.");
  });

  it("no false-clean claim exists anywhere in dashboard.js or provider-dashboard.html", () => {
    const js = read(dashboardJsPath);
    const html = read(htmlPath);
    expect(js).not.toContain("Sonar verified clean");
    expect(html).not.toContain("Sonar verified clean");
  });

  it("setReleaseState function retains correct idle message", () => {
    const js = read(dashboardJsPath);
    // Verify setReleaseState uses the idle text
    const match = js.match(/function setReleaseState[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    expect(match[0]).toContain("Release truth idle.");
  });
});

describe("Sprint 68 gate-path guard: scope boundary respected", () => {
  const html = read(htmlPath);

  it("provider-dashboard.html was not expanded with new panels this sprint", () => {
    // Sprint 63 confirmed 6 panels: evidence, proof, walkthrough, compliance, review, release
    // Verify count unchanged
    const panelMatches =
      html.match(/data-testid="executive-[\w-]+-panel"/g) || [];
    const uniquePanels = [...new Set(panelMatches)];
    expect(uniquePanels.length).toBe(6);
  });

  it("provider-dashboard.html panels are: evidence, proof, walkthrough, compliance, review, release", () => {
    const expectedPanels = [
      "executive-evidence-panel",
      "executive-proof-panel",
      "executive-walkthrough-panel",
      "executive-compliance-panel",
      "executive-review-panel",
      "executive-release-panel",
    ];
    for (const panelName of expectedPanels) {
      expect(html).toContain(`data-testid="${panelName}"`);
    }
  });
});
