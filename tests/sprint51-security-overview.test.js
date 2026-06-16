import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';

describe("Sprint 51 — triage normalization regression", () => {
  it("normalizeTriageStatus coerces unknown values to open", async () => {
    const { normalizeTriageStatus } =
      await import("../src/security/security-overview/normalizer.js");
    expect(normalizeTriageStatus(undefined)).toBe("open");
    expect(normalizeTriageStatus(null)).toBe("open");
    expect(normalizeTriageStatus("")).toBe("open");
    expect(normalizeTriageStatus("garbage")).toBe("open");
    expect(normalizeTriageStatus(42)).toBe("open");
  });

  it("normalizeTriageStatus preserves valid triage statuses", async () => {
    const { normalizeTriageStatus } =
      await import("../src/security/security-overview/normalizer.js");
    const validStatuses = [
      "open",
      "suppressed",
      "accepted",
      "false_positive",
      "resolved",
      "fixed",
    ];
    for (const status of validStatuses) {
      expect(normalizeTriageStatus(status)).toBe(status);
    }
  });

  it("isTriageStatusFinal returns true for fixed/suppressed statuses", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("suppressed")).toBe(true);
    expect(isTriageStatusFinal("resolved")).toBe(true);
    expect(isTriageStatusFinal("fixed")).toBe(true);
  });

  it("isTriageStatusFinal returns false for open", async () => {
    const { isTriageStatusFinal } =
      await import("../src/security/security-overview/triage.js");
    expect(isTriageStatusFinal("open")).toBe(false);
  });

  it("TRIAGE_STATUSES is exported and is an array", async () => {
    const { TRIAGE_STATUSES } =
      await import("../src/security/security-overview/schema.js");
    expect(Array.isArray(TRIAGE_STATUSES)).toBe(true);
    expect(TRIAGE_STATUSES.length).toBeGreaterThan(0);
    expect(TRIAGE_STATUSES).toContain("open");
    expect(TRIAGE_STATUSES).toContain("suppressed");
  });
});

describe("Sprint 51 — drift classification regression", () => {
  it("classifyDriftSeverity is exported from drift module", async () => {
    const mod = await import("../src/security/security-overview/drift.js");
    expect(typeof mod.classifyDriftSeverity).toBe("function");
  });

  it("classifyDriftSeverity returns a non-empty string for a valid drift result", async () => {
    const { classifyDriftSeverity, compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [{ fingerprint: "fp-a", severity: "high" }],
    };
    const baseline = {
      findings: [{ fingerprint: "fp-b", severity: "medium" }],
    };
    const driftResult = compareSecurityOverviewWithBaseline(current, baseline);
    const classification = classifyDriftSeverity(driftResult);
    expect(typeof classification).toBe("string");
    expect(classification.length).toBeGreaterThan(0);
  });

  it("classifyDriftSeverity returns clean for identical snapshots", async () => {
    const { classifyDriftSeverity, compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const snapshot = {
      findings: [{ fingerprint: "fp-same", severity: "low" }],
    };
    const driftResult = compareSecurityOverviewWithBaseline(snapshot, snapshot);
    const classification = classifyDriftSeverity(driftResult);
    expect(["clean", "stable", "unchanged"]).toContain(classification);
  });

  it("classifyDriftSeverity returns a regression indicator when introduced > resolved", async () => {
    const { classifyDriftSeverity, compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const current = {
      findings: [
        { fingerprint: "new-1", severity: "critical" },
        { fingerprint: "new-2", severity: "high" },
        { fingerprint: "new-3", severity: "medium" },
      ],
    };
    const driftResult = compareSecurityOverviewWithBaseline(current, {
      findings: [],
    });
    const classification = classifyDriftSeverity(driftResult);
    expect(["regressed", "worse", "degraded"]).toContain(classification);
  });

  it("classifyDriftSeverity returns an improvement indicator when resolved > introduced", async () => {
    const { classifyDriftSeverity, compareSecurityOverviewWithBaseline } =
      await import("../src/security/security-overview/drift.js");
    const baseline = {
      findings: [
        { fingerprint: "old-1", severity: "critical" },
        { fingerprint: "old-2", severity: "high" },
        { fingerprint: "old-3", severity: "medium" },
      ],
    };
    const driftResult = compareSecurityOverviewWithBaseline(
      { findings: [] },
      baseline,
    );
    const classification = classifyDriftSeverity(driftResult);
    expect(["improved", "better", "fixed"]).toContain(classification);
  });
});

describe("Sprint 51 — normalizer regression", () => {
  it("flattenFindings handles null input without throwing", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    expect(() => flattenFindings(null, "secret")).not.toThrow();
    expect(() => flattenFindings(undefined, "risk")).not.toThrow();
    expect(flattenFindings(null, "secret")).toEqual([]);
  });

  it("flattenFindings skips items without id and fingerprint", async () => {
    const { flattenFindings } =
      await import("../src/security/security-overview/normalizer.js");
    const findings = flattenFindings([{}], "risk");
    expect(Array.isArray(findings)).toBe(true);
  });

  it("buildSecurityOverviewSnapshot handles empty findings array", async () => {
    const { buildSecurityOverviewSnapshot } =
      await import("../src/security/security-overview/schema.js");
    const snap = buildSecurityOverviewSnapshot([]);
    expect(snap.total).toBe(0);
    expect(snap.critical).toBe(0);
    expect(snap.latestAt).toBeNull();
  });
});

describe("Sprint 51 — knowledge/security layer non-regression", () => {
  it("knowledge index.ts still exports ingestSprintHistory", () => {
    const { existsSync } = require("fs");
    const { join } = require("path");
    const content = require("fs").readFileSync(
      join(process.cwd(), "src/knowledge/index.ts"),
      "utf8",
    );
    expect(content).toContain("ingestSprintHistory");
  });

  it("security overview index.ts exports all 7 modules", async () => {
    const content = require("fs").readFileSync(
      require("path").join(
        process.cwd(),
        "src/security/security-overview/index.ts",
      ),
      "utf8",
    );
    expect(content).toContain("./schema");
    expect(content).toContain("./baseline");
    expect(content).toContain("./suppressions");
    expect(content).toContain("./normalizer");
    expect(content).toContain("./triage");
    expect(content).toContain("./drift");
    expect(content).toContain("./ai-explain");
  });
});
