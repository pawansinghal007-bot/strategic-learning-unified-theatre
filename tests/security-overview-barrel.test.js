/**
 * tests/security-overview-barrel.test.js
 *
 * Coverage target: src/security/security-overview/index.ts (currently 0%)
 * Tests barrel export of security overview modules
 */

import { describe, expect, it } from "vitest";

describe("Security overview barrel export", () => {
  it("exports schema module", async () => {
    const { securityOverviewSchema } =
      await import("../src/security/security-overview/index.js");
    expect(securityOverviewSchema).toBeDefined();
  });

  it("exports baseline module", async () => {
    const { loadBaseline } =
      await import("../src/security/security-overview/index.js");
    expect(loadBaseline).toBeDefined();
  });

  it("exports suppressions module", async () => {
    const { loadSuppressions, isSuppressed } =
      await import("../src/security/security-overview/index.js");
    expect(loadSuppressions).toBeDefined();
    expect(isSuppressed).toBeDefined();
  });

  it("exports normalizer module", async () => {
    const { normalizeFinding } =
      await import("../src/security/security-overview/index.js");
    expect(normalizeFinding).toBeDefined();
  });

  it("exports triage module", async () => {
    const { triageFinding } =
      await import("../src/security/security-overview/index.js");
    expect(triageFinding).toBeDefined();
  });

  it("exports drift module", async () => {
    const { detectDrift } =
      await import("../src/security/security-overview/index.js");
    expect(detectDrift).toBeDefined();
  });

  it("exports ai-explain module", async () => {
    const { explainWithAI } =
      await import("../src/security/security-overview/index.js");
    expect(explainWithAI).toBeDefined();
  });

  it("exports drift-history module", async () => {
    const { loadDriftHistory } =
      await import("../src/security/security-overview/index.js");
    expect(loadDriftHistory).toBeDefined();
  });

  it("exports auto-scan module", async () => {
    const { runAutoScan } =
      await import("../src/security/security-overview/index.js");
    expect(runAutoScan).toBeDefined();
  });
});
