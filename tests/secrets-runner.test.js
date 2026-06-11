import { describe, it, expect } from "vitest";
import { loadBaselineFingerprints } from "../src/security/secrets/baseline.js";
import { matchSuppression } from "../src/security/secrets/suppressions.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("Sprint 44 secrets helpers — baseline", () => {
  it("loads baseline fingerprints from PascalCase array json", async () => {
    const file = path.join(os.tmpdir(), `baseline-${Date.now()}.json`);
    await fs.writeFile(
      file,
      JSON.stringify([{ Fingerprint: "abc" }, { fingerprint: "def" }]),
      "utf8",
    );
    const out = await loadBaselineFingerprints(file);
    expect(out.has("abc")).toBe(true);
    expect(out.has("def")).toBe(true);
    await fs.rm(file, { force: true });
  });

  it("returns empty set when baselinePath is null", async () => {
    const out = await loadBaselineFingerprints(null);
    expect(out.size).toBe(0);
  });

  it("returns empty set when baseline file is missing", async () => {
    const out = await loadBaselineFingerprints(
      "/tmp/nonexistent-baseline-xyz.json",
    );
    expect(out.size).toBe(0);
  });

  it("handles baseline json with findings wrapper", async () => {
    const file = path.join(os.tmpdir(), `baseline-wrapped-${Date.now()}.json`);
    await fs.writeFile(
      file,
      JSON.stringify({ findings: [{ Fingerprint: "wrapped-fp" }] }),
      "utf8",
    );
    const out = await loadBaselineFingerprints(file);
    expect(out.has("wrapped-fp")).toBe(true);
    await fs.rm(file, { force: true });
  });
});

describe("Sprint 44 secrets helpers — suppressions", () => {
  it("matches suppression by fingerprint", () => {
    const finding = {
      fingerprint: "fp-1",
      file: "a.js",
      ruleId: "generic-api-key",
      id: "x",
      description: "d",
      severity: "low",
      category: "generic",
      startLine: 1,
      endLine: 1,
      startColumn: 0,
      endColumn: 0,
      secretPreview: null,
      match: null,
      tags: [],
      baselineMatched: false,
      suppressed: false,
      suppressionReason: null,
    };

    const out = matchSuppression(finding, [
      {
        fingerprint: "fp-1",
        reason: "accepted test fixture",
        createdAt: Date.now(),
      },
    ]);

    expect(out?.reason).toBe("accepted test fixture");
  });

  it("matches suppression by file + ruleId", () => {
    const finding = {
      fingerprint: "fp-x",
      file: "fixtures/demo.env",
      ruleId: "generic-api-key",
      id: "x",
      description: "d",
      severity: "low",
      category: "generic",
      startLine: 1,
      endLine: 1,
      startColumn: 0,
      endColumn: 0,
      secretPreview: null,
      match: null,
      tags: [],
      baselineMatched: false,
      suppressed: false,
      suppressionReason: null,
    };

    const out = matchSuppression(finding, [
      {
        file: "fixtures/demo.env",
        ruleId: "generic-api-key",
        reason: "fixture",
        createdAt: Date.now(),
      },
    ]);

    expect(out?.reason).toBe("fixture");
  });

  it("returns null when no suppression matches", () => {
    const finding = {
      fingerprint: "no-match",
      file: "src/something.ts",
      ruleId: "some-rule",
      id: "x",
      description: "d",
      severity: "low",
      category: "generic",
      startLine: 1,
      endLine: 1,
      startColumn: 0,
      endColumn: 0,
      secretPreview: null,
      match: null,
      tags: [],
      baselineMatched: false,
      suppressed: false,
      suppressionReason: null,
    };

    const out = matchSuppression(finding, [
      { fingerprint: "other-fp", reason: "x", createdAt: Date.now() },
    ]);

    expect(out).toBeNull();
  });
});
