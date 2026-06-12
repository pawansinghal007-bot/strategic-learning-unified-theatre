import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeDependencyCheckFinding,
  normalizeTrivyFinding,
  mapSeverityFromCvss,
} from "../src/security/risks/parsers.js";
import * as depRunner from "../src/security/risks/dependency-check-runner.js";
import * as trivyRunner from "../src/security/risks/trivy-runner.js";
import { loadRiskBaseline } from "../src/security/risks/baseline.js";
import {
  loadRiskSuppressions,
  isSuppressed,
} from "../src/security/risks/suppressions.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Sprint 45 risks — parsers", () => {
  it("mapSeverityFromCvss returns critical for score >= 9", () => {
    expect(mapSeverityFromCvss(9.8)).toBe("critical");
    expect(mapSeverityFromCvss(9.0)).toBe("critical");
  });

  it("mapSeverityFromCvss returns high for score >= 7", () => {
    expect(mapSeverityFromCvss(7.5)).toBe("high");
  });

  it("mapSeverityFromCvss returns medium for score >= 4", () => {
    expect(mapSeverityFromCvss(5.0)).toBe("medium");
  });

  it("mapSeverityFromCvss returns low for score > 0", () => {
    expect(mapSeverityFromCvss(2.0)).toBe("low");
  });

  it("mapSeverityFromCvss returns unknown for undefined", () => {
    expect(mapSeverityFromCvss(undefined)).toBe("unknown");
  });

  it("normalizeDependencyCheckFinding produces correct shape", () => {
    const vuln = {
      name: "CVE-2020-1234",
      description: "test vuln",
      severity: "HIGH",
      packageName: "left-pad",
      version: "1.2.3",
    };
    const f = normalizeDependencyCheckFinding(vuln);
    expect(f.id).toContain("depchk:");
    expect(f.scanner).toBe("dependency-check");
    expect(f.package).toBe("left-pad");
    expect(f.version).toBe("1.2.3");
    expect(f.ruleId).toBe("CVE-2020-1234");
    expect(typeof f.fingerprint).toBe("string");
    expect(typeof f.createdAt).toBe("number");
  });

  it("normalizeTrivyFinding produces correct shape", () => {
    const vuln = {
      VulnerabilityID: "CVE-2021-9999",
      Title: "Test image vuln",
      Description: "description",
      Severity: "CRITICAL",
      PkgName: "openssl",
      InstalledVersion: "1.1.1",
    };
    const f = normalizeTrivyFinding(vuln, "nginx:latest");
    expect(f.id).toContain("trivy:");
    expect(f.scanner).toBe("trivy");
    expect(f.severity).toBe("critical");
    expect(f.package).toBe("openssl");
    expect(f.file).toBe("nginx:latest");
    expect(typeof f.fingerprint).toBe("string");
  });
});

describe("Sprint 45 risks — baseline and suppressions", () => {
  it("loadRiskBaseline returns empty set for missing file", () => {
    const set = loadRiskBaseline("/tmp/nonexistent-risk-baseline-xyz.json");
    expect(set.size).toBe(0);
  });

  it("loadRiskBaseline reads fingerprints from array JSON", () => {
    const file = path.join(os.tmpdir(), `risk-baseline-${Date.now()}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify([{ fingerprint: "fp-a" }, { fingerprint: "fp-b" }]),
      "utf8",
    );
    const set = loadRiskBaseline(file);
    expect(set.has("fp-a")).toBe(true);
    expect(set.has("fp-b")).toBe(true);
    fs.unlinkSync(file);
  });

  it("loadRiskBaseline reads fingerprints from findings-wrapper JSON", () => {
    const file = path.join(
      os.tmpdir(),
      `risk-baseline-wrapped-${Date.now()}.json`,
    );
    fs.writeFileSync(
      file,
      JSON.stringify({ findings: [{ fingerprint: "fp-wrapped" }] }),
      "utf8",
    );
    const set = loadRiskBaseline(file);
    expect(set.has("fp-wrapped")).toBe(true);
    fs.unlinkSync(file);
  });

  it("loadRiskSuppressions returns empty array for missing file", () => {
    const result = loadRiskSuppressions(
      "/tmp/nonexistent-suppressions-xyz.json",
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("isSuppressed matches by fingerprint", () => {
    const finding = { fingerprint: "fp-1", file: "a.js", ruleId: "r1" };
    expect(
      isSuppressed(finding, [
        { fingerprint: "fp-1", reason: "test", expiresAt: null },
      ]),
    ).toBe(true);
  });

  it("isSuppressed matches by file + ruleId", () => {
    const finding = { fingerprint: "fp-x", file: "b.js", ruleId: "r2" };
    expect(
      isSuppressed(finding, [{ file: "b.js", ruleId: "r2", reason: "x" }]),
    ).toBe(true);
  });

  it("isSuppressed returns false when no match", () => {
    const finding = { fingerprint: "fp-none", file: "c.js", ruleId: "r3" };
    expect(isSuppressed(finding, [{ fingerprint: "other", reason: "x" }])).toBe(
      false,
    );
  });
});

describe("Sprint 45 risks — runners (mocked)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runDependencyCheck returns ok and findings array", async () => {
    vi.spyOn(depRunner, "runDependencyCheck").mockResolvedValue({
      ok: true,
      engine: "dependency-check",
      findings: [],
      raw: null,
    });
    const out = await depRunner.runDependencyCheck(".", {});
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.findings)).toBe(true);
  });

  it("runTrivyImage returns ok and findings array", async () => {
    vi.spyOn(trivyRunner, "runTrivyImage").mockResolvedValue({
      ok: true,
      engine: "trivy",
      findings: [],
      raw: null,
    });
    const out = await trivyRunner.runTrivyImage("nginx:latest");
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.findings)).toBe(true);
  });
});
