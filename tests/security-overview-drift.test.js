import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Sprint 48 — drift module unit tests", () => {
  it("buildFindingFingerprintSet collects unique fingerprints", async () => {
    const { buildFindingFingerprintSet } =
      await import("../src/security/security-overview/drift.js");
    const set = buildFindingFingerprintSet([
      { fingerprint: "fp-1" },
      { fingerprint: "fp-2" },
      { fingerprint: "fp-1" },
      { fingerprint: "" },
      {},
    ]);
    expect(set.has("fp-1")).toBe(true);
    expect(set.has("fp-2")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("classifies introduced, persistent, and resolved correctly", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [
        { fingerprint: "a", severity: "high" },
        { fingerprint: "b", severity: "medium" },
      ],
    };
    const baseline = {
      findings: [
        { fingerprint: "b", severity: "medium" },
        { fingerprint: "c", severity: "low" },
      ],
    };
    const result = compareSecurityOverviewWithBaseline(current, baseline);
    expect(result.ok).toBe(true);
    expect(result.baselineLoaded).toBe(true);
    expect(result.counts.current).toBe(2);
    expect(result.counts.baseline).toBe(2);
    expect(result.counts.introduced).toBe(1);
    expect(result.counts.persistent).toBe(1);
    expect(result.counts.resolved).toBe(1);
    expect(result.introduced[0].fingerprint).toBe("a");
    expect(result.persistent[0].fingerprint).toBe("b");
    expect(result.resolved[0].fingerprint).toBe("c");
  });

  it("returns all current as introduced when baseline is null", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [
        { fingerprint: "a", severity: "critical" },
        { fingerprint: "b", severity: "high" },
      ],
    };
    const result = compareSecurityOverviewWithBaseline(current, null);
    expect(result.baselineLoaded).toBe(false);
    expect(result.counts.current).toBe(2);
    expect(result.counts.baseline).toBe(0);
    expect(result.counts.introduced).toBe(2);
    expect(result.counts.persistent).toBe(0);
    expect(result.counts.resolved).toBe(0);
  });

  it("returns empty drift when both snapshots are empty", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const result = compareSecurityOverviewWithBaseline(
      { findings: [] },
      { findings: [] },
    );
    expect(result.counts.current).toBe(0);
    expect(result.counts.baseline).toBe(0);
    expect(result.counts.introduced).toBe(0);
    expect(result.counts.persistent).toBe(0);
    expect(result.counts.resolved).toBe(0);
  });

  it("tracks severity buckets for introduced findings", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [
        { fingerprint: "a", severity: "critical" },
        { fingerprint: "b", severity: "high" },
        { fingerprint: "c", severity: "high" },
      ],
    };
    const result = compareSecurityOverviewWithBaseline(current, {
      findings: [],
    });
    expect(result.bySeverity.introduced.critical).toBe(1);
    expect(result.bySeverity.introduced.high).toBe(2);
    expect(result.bySeverity.introduced.medium).toBe(0);
  });

  it("tracks severity buckets for resolved findings", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const baseline = {
      findings: [
        { fingerprint: "old1", severity: "medium" },
        { fingerprint: "old2", severity: "low" },
      ],
    };
    const result = compareSecurityOverviewWithBaseline(
      { findings: [] },
      baseline,
    );
    expect(result.bySeverity.resolved.medium).toBe(1);
    expect(result.bySeverity.resolved.low).toBe(1);
  });

  it("skips findings without fingerprints", async () => {
    const { compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [
        { severity: "high" },
        { fingerprint: "", severity: "medium" },
        { fingerprint: "fp-valid", severity: "low" },
      ],
    };
    const result = compareSecurityOverviewWithBaseline(current, {
      findings: [],
    });
    expect(result.counts.introduced).toBe(1);
    expect(result.introduced[0].fingerprint).toBe("fp-valid");
  });

  it("loadSecurityBaselineSnapshot returns null for empty path", async () => {
    const { loadSecurityBaselineSnapshot } =
      await import("../src/security/security-overview/drift.js");
    expect(loadSecurityBaselineSnapshot(null)).toBeNull();
    expect(loadSecurityBaselineSnapshot("")).toBeNull();
    expect(loadSecurityBaselineSnapshot(undefined)).toBeNull();
  });

  it("loadSecurityBaselineSnapshot returns null for missing file", async () => {
    const { loadSecurityBaselineSnapshot } =
      await import("../src/security/security-overview/drift.js");
    const result = loadSecurityBaselineSnapshot("/nonexistent/baseline.json");
    expect(result).toBeNull();
  });

  it("loadSecurityBaselineSnapshot reads and parses valid JSON file", async () => {
    const { loadSecurityBaselineSnapshot } =
      await import("../src/security/security-overview/drift.js");
    const tmp = path.join(os.tmpdir(), `drift-baseline-${Date.now()}.json`);
    const payload = {
      generatedAt: Date.now(),
      findings: [{ fingerprint: "fp-test", severity: "high" }],
    };
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    const result = loadSecurityBaselineSnapshot(tmp);
    expect(result).not.toBeNull();
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.findings[0].fingerprint).toBe("fp-test");
    fs.unlinkSync(tmp);
  });
});
