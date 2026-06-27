/**
 * tests/security-risks-barrel.test.js
 *
 * Coverage target: src/security/risks/index.ts (currently 0%)
 * Tests barrel export of security risks modules
 */

import { describe, expect, it } from "vitest";

describe("Security risks barrel export", () => {
  it("exports runDependencyCheck function", async () => {
    const { runDependencyCheck } =
      await import("../src/security/risks/index.js");
    expect(runDependencyCheck).toBeDefined();
    expect(typeof runDependencyCheck).toBe("function");
  });

  it("exports runTrivyImage function", async () => {
    const { runTrivyImage } = await import("../src/security/risks/index.js");
    expect(runTrivyImage).toBeDefined();
    expect(typeof runTrivyImage).toBe("function");
  });

  it("exports loadRiskBaseline function", async () => {
    const { loadRiskBaseline } = await import("../src/security/risks/index.js");
    expect(loadRiskBaseline).toBeDefined();
    expect(typeof loadRiskBaseline).toBe("function");
  });

  it("exports loadRiskSuppressions function", async () => {
    const { loadRiskSuppressions, isSuppressed } =
      await import("../src/security/risks/index.js");
    expect(loadRiskSuppressions).toBeDefined();
    expect(isSuppressed).toBeDefined();
  });

  it("exports mapSeverityFromCvss function", async () => {
    const { mapSeverityFromCvss } =
      await import("../src/security/risks/index.js");
    expect(mapSeverityFromCvss).toBeDefined();
    expect(typeof mapSeverityFromCvss).toBe("function");
  });

  it("exports normalizeDependencyCheckFinding function", async () => {
    const { normalizeDependencyCheckFinding } =
      await import("../src/security/risks/index.js");
    expect(normalizeDependencyCheckFinding).toBeDefined();
    expect(typeof normalizeDependencyCheckFinding).toBe("function");
  });

  it("exports normalizeTrivyFinding function", async () => {
    const { normalizeTrivyFinding } =
      await import("../src/security/risks/index.js");
    expect(normalizeTrivyFinding).toBeDefined();
    expect(typeof normalizeTrivyFinding).toBe("function");
  });

  it("exports RiskFinding type", async () => {
    const { RiskFinding } = await import("../src/security/risks/index.js");
    expect(RiskFinding).toBeDefined();
  });

  it("exports RiskScanner type", async () => {
    const { RiskScanner } = await import("../src/security/risks/index.js");
    expect(RiskScanner).toBeDefined();
  });

  it("exports RiskSuppression type", async () => {
    const { RiskSuppression } = await import("../src/security/risks/index.js");
    expect(RiskSuppression).toBeDefined();
  });
});
