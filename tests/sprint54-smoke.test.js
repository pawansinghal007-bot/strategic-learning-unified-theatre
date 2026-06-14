import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Sprint 54 smoke tests — file surface and IPC/preload/types wiring", () => {
  describe("backend modules — T1", () => {
    it("drift-history.ts exists", () => {
      expect(
        existsSync(
          join(root, "src/security/security-overview/drift-history.ts"),
        ),
      ).toBe(true);
    });
    it("drift-history.ts exports loadDriftHistory, saveDriftHistory, appendDriftHistory", () => {
      const c = read("src/security/security-overview/drift-history.ts");
      expect(c).toContain("export function loadDriftHistory");
      expect(c).toContain("export function saveDriftHistory");
      expect(c).toContain("export function appendDriftHistory");
    });
    it("drift-history.ts exports DriftHistoryEntry and DriftClassification", () => {
      const c = read("src/security/security-overview/drift-history.ts");
      expect(c).toContain("DriftHistoryEntry");
      expect(c).toContain("DriftClassification");
    });
    it("auto-scan.ts exists", () => {
      expect(
        existsSync(join(root, "src/security/security-overview/auto-scan.ts")),
      ).toBe(true);
    });
    it("auto-scan.ts exports runSecurityAutoScan", () => {
      const c = read("src/security/security-overview/auto-scan.ts");
      expect(c).toContain("export async function runSecurityAutoScan");
    });
    it("auto-scan.ts calls classifyDriftSeverity as a function returning string directly", () => {
      const c = read("src/security/security-overview/auto-scan.ts");
      expect(c).not.toContain(
        "classifyDriftSeverity(driftResult).classification",
      );
      expect(c).not.toContain(
        "classifyDriftSeverity(driftResult)?.classification",
      );
      expect(c).toContain("classifyDriftSeverity(");
    });
    it("auto-scan.ts imports triage functions from triage.js (not assumed in index.js)", () => {
      const c = read("src/security/security-overview/auto-scan.ts");
      expect(c).toContain("./triage.js");
    });
    it("index.ts exports drift-history and auto-scan", () => {
      const c = read("src/security/security-overview/index.ts");
      expect(c).toContain("./drift-history");
      expect(c).toContain("./auto-scan");
    });
  });

  describe("IPC surface — T2", () => {
    it("handlers register auto-scan channel (Sprint 54)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:auto-scan");
      expect(c).toContain("runSecurityAutoScan");
      expect(c).toContain("auto-scan.js");
    });
    it("handlers register list-drift-history channel (Sprint 54)", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:list-drift-history");
      expect(c).toContain("loadDriftHistory");
      expect(c).toContain("drift-history.js");
    });
    it("auto-scan handler has repoPath guard", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("auto-scan: repoPath is required");
    });
    it("handlers preserve all 10 Sprint 44-53 channels", () => {
      const c = read("electron-ui/ipc/security-overview-handlers.cjs");
      expect(c).toContain("security-overview:summarize");
      expect(c).toContain("security-overview:save-baseline");
      expect(c).toContain("security-overview:load-suppressions");
      expect(c).toContain("security-overview:save-suppressions");
      expect(c).toContain("security-overview:load-triage");
      expect(c).toContain("security-overview:set-triage");
      expect(c).toContain("security-overview:set-triage-bulk");
      expect(c).toContain("security-overview:compare-baseline");
      expect(c).toContain("security-overview:explain-introduced");
      expect(c).toContain("security-overview:get-drift-classification");
    });
  });

  describe("preload surface — T2", () => {
    it("preload exposes autoScan (Sprint 54)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("autoScan:");
      expect(c).toContain("security-overview:auto-scan");
    });
    it("preload exposes listDriftHistory (Sprint 54)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("listDriftHistory:");
      expect(c).toContain("security-overview:list-drift-history");
    });
    it("preload preserves Sprint 53 getDriftClassification (10th method)", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("getDriftClassification");
    });
    it("preload preserves Sprint 52 setTriageBulk", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("setTriageBulk");
    });
    it("preload preserves Sprint 49 explainIntroduced", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("explainIntroduced");
    });
    it("preload preserves Sprint 48 compareBaseline", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("compareBaseline");
    });
    it("preload preserves Sprint 47 loadTriage and setTriage", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("loadTriage");
      expect(c).toContain("setTriage");
    });
    it("preload preserves workspaceRisks and secrets surfaces", () => {
      const c = read("electron-ui/preload.cjs");
      expect(c).toContain("workspaceRisks");
      expect(c).toContain("secrets");
    });
  });

  describe("types surface — T2", () => {
    it("types.d.ts declares DriftHistoryEntry", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("interface DriftHistoryEntry");
    });
    it("types.d.ts DriftHistoryEntry has classification field", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("classification:");
      expect(c).toContain("unknown");
    });
    it("types.d.ts has autoScan typed", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("autoScan");
      expect(c).toContain("repoPath");
    });
    it("types.d.ts has listDriftHistory typed", () => {
      const c = read("src/ui/types.d.ts");
      expect(c).toContain("listDriftHistory");
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

  describe("compatibility regression — Sprint 44-53 surfaces", () => {
    it("index.ts exports all prior modules", () => {
      const c = read("src/security/security-overview/index.ts");
      expect(c).toMatch(/\.\/ai-explain/);
      expect(c).toMatch(/\.\/drift/);
      expect(c).toMatch(/\.\/triage/);
      expect(c).toMatch(/\.\/baseline/);
    });
    it("main.cjs still registers security overview handlers", () => {
      const c = read("electron-ui/main.cjs");
      expect(c).toContain("registerSecurityOverviewHandlers");
    });
    it("sprint53 test files still present", () => {
      expect(
        existsSync(join(root, "tests/sprint53-cross-surface.test.js")),
      ).toBe(true);
      expect(existsSync(join(root, "tests/sprint53-smoke.test.js"))).toBe(true);
    });
    it("sprint52 bulk-triage test still present", () => {
      expect(existsSync(join(root, "tests/sprint52-bulk-triage.test.js"))).toBe(
        true,
      );
    });
  });
});
