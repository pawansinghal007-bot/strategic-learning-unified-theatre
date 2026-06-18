/**
 * Sprint 76 — globalThis cleanup guard (Sonar javascript:S7764)
 * 
 * This test ensures that dashboard.js has been cleaned up to use globalThis
 * instead of window, addressing 50 violations of Sonar rule S7764.
 * 
 * Rule S7764: "Prefer `globalThis` over `window`"
 * Severity: MINOR
 * Risk: Low behavioral risk - purely a portability/consistency fix
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 76 — globalThis cleanup guard", () => {
  const dashboardPath = "src/ui/dashboard.js";
  const dashboardContent = read(dashboardPath);

  it("dashboard.js contains zero occurrences of bare window. (excluding typeof window)", () => {
    // Regex matches "window." but not "typeof window"
    // Uses negative lookbehind to exclude "typeof window"
    const windowPattern = /(?<!typeof\s)window\./g;
    const matches = dashboardContent.match(windowPattern);
    expect(matches).toBeNull();
  });

  it("dashboard.js contains at least 10 occurrences of globalThis.", () => {
    const globalThisPattern = /globalThis\./g;
    const matches = dashboardContent.match(globalThisPattern);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(10);
  });

  it("dashboard.js preserves sprint65-guard-only dataset operations", () => {
    // Verify dataset.localAiState is still present
    expect(dashboardContent).toContain("dataset.localAiState");
    // Verify dataset.releaseTruth is still present
    expect(dashboardContent).toContain("dataset.releaseTruth");
    // Verify dataset.complianceOutput is still present
    expect(dashboardContent).toContain("dataset.complianceOutput");
  });

  it("master_timeline_sprints_1_54.md contains Sprint 76 marker", () => {
    const timelineContent = read("master_timeline_sprints_1_54.md");
    expect(timelineContent).toContain("| 76");
  });

  it("strategic-learning-unified-theatre-master-instructions.md contains Sprint 76 Complete", () => {
    const instructionsContent = read("strategic-learning-unified-theatre-master-instructions.md");
    expect(instructionsContent).toContain("Sprint 76 Complete");
  });
});
