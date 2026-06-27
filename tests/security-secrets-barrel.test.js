/**
 * tests/security-secrets-barrel.test.js
 *
 * Coverage target: src/security/secrets/index.ts (currently 0%)
 * Tests barrel export of security secrets modules
 */

import { describe, expect, it } from "vitest";

describe("Security secrets barrel export", () => {
  it("exports runSecretsScan function", async () => {
    const { runSecretsScan } = await import("../src/security/secrets/index.js");
    expect(runSecretsScan).toBeDefined();
    expect(typeof runSecretsScan).toBe("function");
  });

  it("exports loadBaselineFingerprints function", async () => {
    const { loadBaselineFingerprints } =
      await import("../src/security/secrets/index.js");
    expect(loadBaselineFingerprints).toBeDefined();
    expect(typeof loadBaselineFingerprints).toBe("function");
  });

  it("exports loadSuppressions function", async () => {
    const { loadSuppressions, matchSuppression } =
      await import("../src/security/secrets/index.js");
    expect(loadSuppressions).toBeDefined();
    expect(matchSuppression).toBeDefined();
  });

  it("exports SecretFinding type", async () => {
    const { SecretFinding } = await import("../src/security/secrets/index.js");
    expect(SecretFinding).toBeDefined();
  });

  it("exports SecretsScanResult type", async () => {
    const { SecretsScanResult } =
      await import("../src/security/secrets/index.js");
    expect(SecretsScanResult).toBeDefined();
  });

  it("exports SecretsScanSummary type", async () => {
    const { SecretsScanSummary } =
      await import("../src/security/secrets/index.js");
    expect(SecretsScanSummary).toBeDefined();
  });

  it("exports SecretsSuppressionEntry type", async () => {
    const { SecretsSuppressionEntry } =
      await import("../src/security/secrets/index.js");
    expect(SecretsSuppressionEntry).toBeDefined();
  });

  it("exports SecretSeverity type", async () => {
    const { SecretSeverity } = await import("../src/security/secrets/index.js");
    expect(SecretSeverity).toBeDefined();
  });
});
