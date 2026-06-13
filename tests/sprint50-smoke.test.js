import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Sprint 50 smoke tests — consolidated T1-T3 surface", () => {
  describe("backend surface — T1", () => {
    it("TRIAGE_STATUSES includes all four values", async () => {
      const { TRIAGE_STATUSES } =
        await import("../src/security/security-overview/schema.js");
      expect(TRIAGE_STATUSES).toContain("open");
      expect(TRIAGE_STATUSES).toContain("suppressed");
      expect(TRIAGE_STATUSES).toContain("accepted");
      expect(TRIAGE_STATUSES).toContain("fixed");
    });
    it("normalizeTriageStatus returns open for null", async () => {
      const { normalizeTriageStatus } =
        await import("../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus(null)).toBe("open");
    });
    it("normalizeTriageStatus returns open for garbage", async () => {
      const { normalizeTriageStatus } =
        await import("../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("garbage")).toBe("open");
    });
    it("normalizeTriageStatus returns fixed for fixed", async () => {
      const { normalizeTriageStatus } =
        await import("../src/security/security-overview/normalizer.js");
      expect(normalizeTriageStatus("fixed")).toBe("fixed");
    });
    it("isTriageStatusFinal returns true for fixed", async () => {
      const { isTriageStatusFinal } =
        await import("../src/security/security-overview/triage.js");
      expect(isTriageStatusFinal("fixed")).toBe(true);
    });
    it("isTriageStatusFinal returns false for open", async () => {
      const { isTriageStatusFinal } =
        await import("../src/security/security-overview/triage.js");
      expect(isTriageStatusFinal("open")).toBe(false);
    });
    it("classifyDriftSeverity returns clean for empty lists", async () => {
      const { classifyDriftSeverity } =
        await import("../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({ introduced: [], resolved: [], persistent: [] }),
      ).toBe("clean");
    });
    it("classifyDriftSeverity returns regressed when only introduced", async () => {
      const { classifyDriftSeverity } =
        await import("../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({
          introduced: [{}],
          resolved: [],
          persistent: [],
        }),
      ).toBe("regressed");
    });
    it("classifyDriftSeverity returns improved when only resolved", async () => {
      const { classifyDriftSeverity } =
        await import("../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({
          introduced: [],
          resolved: [{}],
          persistent: [],
        }),
      ).toBe("improved");
    });
    it("classifyDriftSeverity returns mixed when both non-empty", async () => {
      const { classifyDriftSeverity } =
        await import("../src/security/security-overview/drift.js");
      expect(
        classifyDriftSeverity({
          introduced: [{}],
          resolved: [{}],
          persistent: [],
        }),
      ).toBe("mixed");
    });
  });

  describe("IPC surface — T2", () => {
    it("handlers register get-drift-classification (Sprint 50)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:get-drift-classification");
    });
    it("handlers preserve explain-introduced (Sprint 49)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:explain-introduced");
    });
    it("handlers preserve compare-baseline (Sprint 48)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:compare-baseline");
    });
    it("handlers preserve set-triage (Sprint 47)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:set-triage");
    });
    it("compare-baseline handler has payload guard", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("missing or invalid");
    });
    it("set-triage handler references normalizeTriageStatus", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("normalizeTriageStatus");
    });
  });

  describe("preload surface — T2", () => {
    it("exposes getDriftClassification (Sprint 50)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("getDriftClassification");
    });
    it("preserves explainIntroduced (Sprint 49)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("explainIntroduced");
    });
    it("preserves compareBaseline (Sprint 48)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("compareBaseline");
    });
    it("preserves loadTriage and setTriage (Sprint 47)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("loadTriage");
      expect(c).toContain("setTriage");
    });
    it("preserves workspaceRisks surface", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("workspaceRisks");
    });
  });

  describe("types surface — T2", () => {
    it("types.d.ts has getDriftClassification", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("getDriftClassification");
    });
    it("types.d.ts preserves explainIntroduced (Sprint 49)", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("explainIntroduced");
    });
    it("types.d.ts preserves FindingExplanationItem (Sprint 49)", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("FindingExplanationItem");
    });
    it("interface Window appears exactly once", () => {
      const c = read("src/ui/types.d.ts");
      const count = (c.match(/interface Window/g) ?? []).length;
      expect(count).toBe(1);
    });
  });

  describe("dashboard surface — T3", () => {
    it("has driftClassificationBadge element", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("driftClassificationBadge");
    });
    it("has driftClassificationLabel element", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("driftClassificationLabel");
    });
    it("calls getDriftClassification in JS", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("getDriftClassification");
    });
    it("badge call is inside try/catch (non-fatal)", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("driftClassificationBadge");
      expect(h).toContain("catch (_e)");
    });
    it("preserves latestSecurityDriftResult cache (Sprint 49)", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("latestSecurityDriftResult");
    });
    it("preserves explainIntroduced (Sprint 49)", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("explainIntroduced");
    });
    it("preserves security-drift-panel (Sprint 48)", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("security-drift-panel");
    });
    it("preserves security-overview-panel (Sprint 46)", () => {
      const h = read("src/ui/provider-dashboard.html");
      expect(h).toContain("security-overview-panel");
    });
  });

  describe("compatibility regression — Sprint 42-49 surfaces", () => {
    it("index.ts exports ai-explain (Sprint 49)", () => {
      const c = read("src/security/security-overview/index.ts");
      expect(c).toMatch(/\.\/ai-explain/);
    });
    it("index.ts exports drift (Sprint 48)", () => {
      const c = read("src/security/security-overview/index.ts");
      expect(c).toMatch(/\.\/drift/);
    });
    it("index.ts exports triage (Sprint 47)", () => {
      const c = read("src/security/security-overview/index.ts");
      expect(c).toMatch(/\.\/triage/);
    });
    it("index.ts exports baseline (Sprint 46)", () => {
      const c = read("src/security/security-overview/index.ts");
      expect(c).toMatch(/\.\/baseline/);
    });
    it("main.cjs still registers security overview handlers", () => {
      const c = read("electron-ui/main.cjs");
      expect(c).toContain("registerSecurityOverviewHandlers");
    });
  });
});
