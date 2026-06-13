import { describe, it, expect } from "vitest";

describe("Sprint 50 — T1 backend unit tests", () => {
  describe("schema — TRIAGE_STATUSES", () => {
    it("includes all four valid statuses", async () => {
      const { TRIAGE_STATUSES } =
        await import("../../src/security/security-overview/schema.js");
      expect(TRIAGE_STATUSES).toContain("open");
      expect(TRIAGE_STATUSES).toContain("suppressed");
      expect(TRIAGE_STATUSES).toContain("accepted");
      expect(TRIAGE_STATUSES).toContain("fixed");
    });
  });

  describe("normalizeTriageStatus", () => {
    it("returns open for null", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus(null)).toBe("open");
    });
    it("returns open for undefined", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus(undefined)).toBe("open");
    });
    it("returns open for empty string", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("")).toBe("open");
    });
    it("returns open for unrecognized value", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("garbage")).toBe("open");
    });
    it("returns suppressed for suppressed", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("suppressed")).toBe("suppressed");
    });
    it("returns accepted for accepted", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("accepted")).toBe("accepted");
    });
    it("returns fixed for fixed", async () => {
      const { normalizeTriageStatus } =
        await import("../../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("fixed")).toBe("fixed");
    });
  });

  describe("isTriageStatusFinal", () => {
    it("returns true for fixed", async () => {
      const { isTriageStatusFinal } =
        await import("../../src/security/security-overview/triage.js");
      expect(isTriageStatusFinal("fixed")).toBe(true);
    });
    it("returns true for suppressed", async () => {
      const { isTriageStatusFinal } =
        await import("../../src/security/security-overview/triage.js");
      expect(isTriageStatusFinal("suppressed")).toBe(true);
    });
    it("returns false for open", async () => {
      const { isTriageStatusFinal } =
        await import("../../src/security/security-overview/triage.js");
      expect(isTriageStatusFinal("open")).toBe(false);
    });
    it("returns false for accepted", async () => {
      const { isTriageStatusFinal } =
        await import("../../src/security/security-overview/triage.js");
      expect(isTriageStatusFinal("accepted")).toBe(false);
    });
  });

  describe("classifyDriftSeverity", () => {
    it("returns clean when both lists are empty", async () => {
      const { classifyDriftSeverity } =
        await import("../../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({ introduced: [], resolved: [], persistent: [] }),
      ).toBe("clean");
    });
    it("returns regressed when only introduced is non-empty", async () => {
      const { classifyDriftSeverity } =
        await import("../../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({
          introduced: [{}],
          resolved: [],
          persistent: [],
        }),
      ).toBe("regressed");
    });
    it("returns improved when only resolved is non-empty", async () => {
      const { classifyDriftSeverity } =
        await import("../../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({
          introduced: [],
          resolved: [{}],
          persistent: [],
        }),
      ).toBe("improved");
    });
    it("returns mixed when both introduced and resolved are non-empty", async () => {
      const { classifyDriftSeverity } =
        await import("../../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({
          introduced: [{}],
          resolved: [{}],
          persistent: [],
        }),
      ).toBe("mixed");
    });
  });
});
