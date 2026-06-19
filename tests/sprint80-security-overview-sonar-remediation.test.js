import { describe, it, expect } from "vitest";
import {
  flattenFindings,
  normalizeTriageStatus,
} from "../src/security/security-overview/normalizer.ts";
import {
  buildFindingFingerprintSet,
  compareSecurityOverviewWithBaseline,
  classifyDriftSeverity,
} from "../src/security/security-overview/drift.ts";

describe("Sprint 80 security overview sonar remediation", () => {
  it("normalizes findings without object-stringification regressions", () => {
    const rows = flattenFindings(
      {
        findings: [
          {
            id: "dep-1",
            ruleId: "CVE-123",
            severity: "HIGH",
            scanner: "grype",
            title: "openssl issue",
            description: "package vulnerability",
            file: "package-lock.json",
            package: "openssl",
            version: "1.0.0",
            fingerprint: "abc-123",
            createdAt: 1700000000000,
          },
        ],
      },
      "dependency",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "dependency",
      id: "dep-1",
      ruleId: "CVE-123",
      severity: "high",
      scanner: "grype",
      title: "openssl issue",
      description: "package vulnerability",
      file: "package-lock.json",
      package: "openssl",
      version: "1.0.0",
      fingerprint: "abc-123",
      createdAt: 1700000000000,
    });
  });

  it("uses default scanner and fallback fingerprint when optional values are absent", () => {
    const rows = flattenFindings(
      [
        {
          ruleId: "SECRET-1",
          severity: "note",
          file: "secrets.env",
        },
      ],
      "secret",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].scanner).toBe("gitleaks");
    expect(rows[0].severity).toBe("info");
    expect(rows[0].fingerprint).toContain("SECRET-1");
    expect(rows[0].fingerprint).toContain("info");
    expect(rows[0].fingerprint).toContain("secrets.env");
  });

  it("ignores non-string object-like values instead of coercing them into [object Object] strings", () => {
    const rows = flattenFindings(
      [
        {
          id: { bad: true },
          ruleId: "RULE-1",
          severity: "medium",
          scanner: { bad: true },
          title: { bad: true },
          description: { bad: true },
          file: { bad: true },
          package: { bad: true },
          version: { bad: true },
          fingerprint: { bad: true },
        },
      ],
      "dependency",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].scanner).toBe("dependency-check");
    expect(rows[0].title).toBeUndefined();
    expect(rows[0].description).toBeUndefined();
    expect(rows[0].file).toBeNull();
    expect(rows[0].package).toBeNull();
    expect(rows[0].version).toBeNull();
    expect(String(rows[0].id)).not.toContain("[object Object]");
    expect(String(rows[0].fingerprint)).not.toContain("[object Object]");
  });

  it("normalizes triage status safely", () => {
    expect(normalizeTriageStatus("accepted")).toBe("accepted");
    expect(normalizeTriageStatus(" ACCEPTED ")).toBe("accepted");
    expect(normalizeTriageStatus("")).toBe("open");
    expect(normalizeTriageStatus("bogus")).toBe("open");
    expect(normalizeTriageStatus(null)).toBe("open");
    expect(normalizeTriageStatus(undefined)).toBe("open");
    expect(normalizeTriageStatus(42)).toBe("open");
  });

  it("builds fingerprint sets from valid strings only, trimming whitespace", () => {
    const set = buildFindingFingerprintSet([
      { fingerprint: " fp-1 " },
      { fingerprint: "" },
      {},
      { fingerprint: "fp-2" },
    ]);

    expect(Array.from(set).sort()).toEqual(["fp-1", "fp-2"]);
  });

  it("compares snapshots and assigns default triage/resolved metadata", () => {
    const result = compareSecurityOverviewWithBaseline(
      {
        findings: [
          { fingerprint: "persist-1", severity: "high" },
          { fingerprint: "intro-1", severity: "medium" },
        ],
      },
      {
        findings: [
          { fingerprint: "persist-1", severity: "high" },
          { fingerprint: "resolved-1", severity: "low" },
        ],
      },
    );

    expect(result.baselineLoaded).toBe(true);
    expect(result.counts).toEqual({
      current: 2,
      baseline: 2,
      introduced: 1,
      persistent: 1,
      resolved: 1,
    });
    expect(result.introduced[0].triageStatus).toBe("open");
    expect(typeof result.resolved[0].resolvedAt).toBe("string");
    expect(result.bySeverity.introduced.medium).toBe(1);
    expect(result.bySeverity.persistent.high).toBe(1);
    expect(result.bySeverity.resolved.low).toBe(1);
  });

  it("classifies drift severity correctly for all four outcomes", () => {
    expect(
      classifyDriftSeverity({ introduced: [], resolved: [], persistent: [] }),
    ).toBe("clean");

    expect(
      classifyDriftSeverity({
        introduced: [{ fingerprint: "a" }],
        resolved: [],
        persistent: [],
      }),
    ).toBe("regressed");

    expect(
      classifyDriftSeverity({
        introduced: [],
        resolved: [{ fingerprint: "b" }],
        persistent: [],
      }),
    ).toBe("improved");

    expect(
      classifyDriftSeverity({
        introduced: [{ fingerprint: "a" }],
        resolved: [{ fingerprint: "b" }],
        persistent: [],
      }),
    ).toBe("mixed");
  });

  it("handles null and non-object snapshots gracefully without throwing", () => {
    const result = compareSecurityOverviewWithBaseline(null, null);
    expect(result.ok).toBe(true);
    expect(result.baselineLoaded).toBe(false);
    expect(result.counts.current).toBe(0);
    expect(result.counts.baseline).toBe(0);
  });

  it("skips findings without fingerprints in both introduced and resolved buckets", () => {
    const result = compareSecurityOverviewWithBaseline(
      { findings: [{ severity: "high" }] },
      { findings: [{ severity: "low" }] },
    );
    expect(result.counts.introduced).toBe(0);
    expect(result.counts.resolved).toBe(0);
    expect(result.counts.persistent).toBe(0);
  });
});
