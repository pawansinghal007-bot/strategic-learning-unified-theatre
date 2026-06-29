import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const normalizerPath = path.resolve(
  "src/security/security-overview/normalizer.ts",
);
const driftPath = path.resolve("src/security/security-overview/drift.ts");
const instructionsPath = path.resolve(
  "strategic-learning-unified-theatre-master-instructions.md",
);
const timelinePath = path.resolve("master_timeline_sprints_1_97.md");

describe("Sprint 80 plan and scope guard", () => {
  it("normalizer uses helper-based string narrowing instead of direct object coercion", () => {
    const text = fs.readFileSync(normalizerPath, "utf8");
    expect(text).toContain("function asTrimmedString");
    expect(text).toContain("function buildFallbackFingerprint");
    expect(text).toContain("function defaultScannerForKind");
  });

  it("normalizer does not contain nested ternary scanner selection", () => {
    const text = fs.readFileSync(normalizerPath, "utf8");
    expect(text).not.toContain('? "gitleaks"');
    expect(text).toContain("defaultScannerForKind(kind)");
  });

  it("drift uses direct boolean expression for baselineLoaded", () => {
    const text = fs.readFileSync(driftPath, "utf8");
    expect(text).toContain("baselineLoaded: baselineSnapshot !== null");
    expect(text).not.toContain("baselineSnapshot === null ? false : true");
  });

  it("drift uses positive guard clauses for triage and resolved metadata", () => {
    const text = fs.readFileSync(driftPath, "utf8");
    expect(text).toContain(
      'if ("triageStatus" in f && f.triageStatus != null) return;',
    );
    expect(text).toContain(
      'if ("resolvedAt" in f && f.resolvedAt != null) return;',
    );
  });

  it("instructions doc records Sprint 80 as planned or active", () => {
    const text = fs.readFileSync(instructionsPath, "utf8");
    expect(text).toMatch(/Sprint 80/i);
  });

  it("timeline table includes Sprint 80 row", () => {
    const text = fs.readFileSync(timelinePath, "utf8");
    expect(text).toMatch(/80.*[Ss]ecurity/);
  });
});
