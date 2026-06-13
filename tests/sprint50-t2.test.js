import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Sprint 50 — T2 IPC and preload surface tests", () => {
  describe("security-overview-handlers.cjs", () => {
    it("registers get-drift-classification channel", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:get-drift-classification");
    });
    it("preserves compare-baseline channel (Sprint 48)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:compare-baseline");
    });
    it("preserves explain-introduced channel (Sprint 49)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:explain-introduced");
    });
    it("preserves set-triage channel", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:set-triage");
    });
    it("compare-baseline handler has payload guard", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain(
        "compare-baseline: currentSnapshot missing or invalid",
      );
    });
    it("set-triage handler references normalizeTriageStatus", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("normalizeTriageStatus");
    });
  });

  describe("preload.cjs", () => {
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
    it("preserves secrets surface", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("secrets");
    });
  });

  describe("types.d.ts", () => {
    it("has getDriftClassification typed", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("getDriftClassification");
    });
    it("preserves explainIntroduced type (Sprint 49)", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("explainIntroduced");
    });
    it("preserves FindingExplanationItem (Sprint 49)", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("FindingExplanationItem");
    });
    it("preserves ExplainIntroducedFindingsResult (Sprint 49)", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("ExplainIntroducedFindingsResult");
    });
    it("interface Window appears exactly once", () => {
      const c = read("src/ui/types.d.ts");
      const count = (c.match(/interface Window/g) ?? []).length;
      expect(count).toBe(1);
    });
  });
});
