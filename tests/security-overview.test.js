import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Sprint 46 — security overview backend", () => {
  it("loadSecurityBaseline reads findings-wrapper JSON", async () => {
    const { loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const tmp = path.join(os.tmpdir(), `baseline-${Date.now()}.json`);
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        generatedAt: Date.now(),
        findings: [{ fingerprint: "fp-a" }, { fingerprint: "fp-b" }],
      }),
      "utf8",
    );
    const set = loadSecurityBaseline(tmp);
    expect(set.has("fp-a")).toBe(true);
    expect(set.has("fp-b")).toBe(true);
    fs.unlinkSync(tmp);
  });

  it("loadSecurityBaseline reads plain array JSON", async () => {
    const { loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const tmp = path.join(os.tmpdir(), `baseline-arr-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify([{ fingerprint: "fp-c" }]), "utf8");
    const set = loadSecurityBaseline(tmp);
    expect(set.has("fp-c")).toBe(true);
    fs.unlinkSync(tmp);
  });

  it("loadSecurityBaseline returns empty set for missing file", async () => {
    const { loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const set = loadSecurityBaseline("/nonexistent/path.json");
    expect(set.size).toBe(0);
  });

  it("saveSecurityBaseline writes readable file and round-trips", async () => {
    const { saveSecurityBaseline, loadSecurityBaseline } =
      await import("../src/security/security-overview/baseline.js");
    const tmp = path.join(os.tmpdir(), `baseline-save-${Date.now()}.json`);
    const result = saveSecurityBaseline(tmp, ["fp-x", "fp-y"]);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    const loaded = loadSecurityBaseline(tmp);
    expect(loaded.has("fp-x")).toBe(true);
    expect(loaded.has("fp-y")).toBe(true);
    fs.unlinkSync(tmp);
  });

  it("isSecuritySuppressed matches by fingerprint", async () => {
    const { isSecuritySuppressed } =
      await import("../src/security/security-overview/suppressions.js");
    const suppressions = [{ fingerprint: "abc", kind: "risk" }];
    expect(
      isSecuritySuppressed({ fingerprint: "abc", kind: "risk" }, suppressions),
    ).toBe(true);
    expect(
      isSecuritySuppressed({ fingerprint: "xyz", kind: "risk" }, suppressions),
    ).toBe(false);
  });

  it("isSecuritySuppressed matches by file+ruleId", async () => {
    const { isSecuritySuppressed } =
      await import("../src/security/security-overview/suppressions.js");
    const suppressions = [{ file: "src/app.ts", ruleId: "R1", kind: "secret" }];
    expect(
      isSecuritySuppressed(
        { file: "src/app.ts", ruleId: "R1", kind: "secret" },
        suppressions,
      ),
    ).toBe(true);
    expect(
      isSecuritySuppressed(
        { file: "src/other.ts", ruleId: "R1", kind: "secret" },
        suppressions,
      ),
    ).toBe(false);
  });

  it("saveSecuritySuppressions and loadSecuritySuppressions round-trip", async () => {
    const { saveSecuritySuppressions, loadSecuritySuppressions } =
      await import("../src/security/security-overview/suppressions.js");
    const tmp = path.join(os.tmpdir(), `supp-${Date.now()}.json`);
    const result = saveSecuritySuppressions(tmp, [
      { fingerprint: "fp-z", kind: "any", reason: "false positive" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    const loaded = loadSecuritySuppressions(tmp);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].fingerprint).toBe("fp-z");
    fs.unlinkSync(tmp);
  });

  it("loadSecuritySuppressions returns [] for missing file", async () => {
    const { loadSecuritySuppressions } =
      await import("../src/security/security-overview/suppressions.js");
    const result = loadSecuritySuppressions("/nonexistent/suppressions.json");
    expect(result).toEqual([]);
  });

  it("buildSecurityOverviewSnapshot aggregates counts correctly", async () => {
    const { buildSecurityOverviewSnapshot } =
      await import("../src/security/security-overview/schema.js");
    const findings = [
      {
        kind: "secret",
        severity: "critical",
        suppressed: false,
        baselineMatched: false,
        createdAt: 1000,
      },
      {
        kind: "risk",
        severity: "high",
        suppressed: true,
        baselineMatched: false,
        createdAt: 2000,
      },
      {
        kind: "risk",
        severity: "medium",
        suppressed: false,
        baselineMatched: true,
        createdAt: 3000,
      },
    ];
    const snap = buildSecurityOverviewSnapshot(findings);
    expect(snap.total).toBe(3);
    expect(snap.critical).toBe(1);
    expect(snap.high).toBe(1);
    expect(snap.medium).toBe(1);
    expect(snap.secrets).toBe(1);
    expect(snap.risks).toBe(2);
    expect(snap.suppressed).toBe(1);
    expect(snap.baselineMatched).toBe(1);
    expect(snap.latestAt).toBe(3000);
  });

  it("flattenFindings normalises secrets array", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const raw = [
      {
        id: "s1",
        ruleId: "AWS",
        severity: "CRITICAL",
        file: "app.ts",
        fingerprint: "fp1",
      },
    ];
    const findings = flattenFindings(raw, "secret");
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("secret");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].fingerprint).toBe("fp1");
  });

  it("flattenFindings returns [] for empty input", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    expect(flattenFindings([], "risk")).toEqual([]);
    expect(flattenFindings(null, "risk")).toEqual([]);
  });
});
