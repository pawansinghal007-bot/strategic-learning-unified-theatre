import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Sprint 51 smoke tests — timeline and snapshot files", () => {
  it("strategic-learning-unified-theatre-master-instructions.md mentions Sprint 50 Complete", () => {
    const text = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(text).toContain("Sprint 50 Complete");
  });

  it("strategic-learning-unified-theatre-master-instructions.md mentions Sprint 51 Complete", () => {
    const text = read(
      "strategic-learning-unified-theatre-master-instructions.md",
    );
    expect(text).toContain("Sprint 51 Complete");
  });

  it("master_timeline_sprints_1_54.md exists and reflects Sprint 50 as complete", () => {
    const filePath = join(root, "master_timeline_sprints_1_54.md");
    expect(existsSync(filePath)).toBe(true);
    const text = readFileSync(filePath, "utf8");
    expect(text).toContain("Sprint 50");
    expect(text).toContain("Sprint 51");
  });

  it("CURRENT_ACTIVE_SNAPSHOT.md points to sprint51-stable or later", () => {
    const text = read("CURRENT_ACTIVE_SNAPSHOT.md").trim();
    const sprintNum = parseInt(text.match(/sprint(\d+)/)?.[1] ?? "0", 10);
    expect(sprintNum).toBeGreaterThanOrEqual(51);
  });

  it("sprint51-stable snapshot file exists", () => {
    expect(
      existsSync(
        join(
          root,
          "strategic-learning-unified-theatre-ai-snapshot-sprint51-stable",
        ),
      ),
    ).toBe(true);
  });
});

describe("Sprint 51 smoke tests — security surface regression", () => {
  it("all 9 security IPC channels present in handler", () => {
    const content = read("electron-ui/ipc/security-overview-handlers.cjs");
    const channels = [
      "security-overview:summarize",
      "security-overview:save-baseline",
      "security-overview:load-suppressions",
      "security-overview:save-suppressions",
      "security-overview:load-triage",
      "security-overview:set-triage",
      "security-overview:compare-baseline",
      "security-overview:explain-introduced",
      "security-overview:get-drift-classification",
    ];
    for (const ch of channels) {
      expect(content).toContain(ch);
    }
  });

  it("all 9 workspaceSecurity methods present in preload", () => {
    const content = read("electron-ui/preload.cjs");
    const methods = [
      "summarize",
      "saveBaseline",
      "loadSuppressions",
      "saveSuppressions",
      "loadTriage",
      "setTriage",
      "compareBaseline",
      "explainIntroduced",
      "getDriftClassification",
    ];
    for (const m of methods) {
      expect(content).toContain(m);
    }
  });

  it("types.d.ts has no duplicate Window interface", () => {
    const content = read("src/ui/types.d.ts");
    const count = (content.match(/interface Window/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("Sprint 44-50 scanner panels still present in dashboard", () => {
    const html = loadDashboardSurface();
    const required = [
      "security-overview-panel",
      "security-drift-panel",
      "Workspace Analytics",
      "Audit Trail",
      "Workspace Quotas",
      "metric-success-rate",
      "workspaceRouting.analytics",
    ];
    for (const s of required) {
      expect(html).toContain(s);
    }
  });

  it("knowledge index still exports ingestSprintHistory", () => {
    const content = read("src/knowledge/index.ts");
    expect(content).toContain("ingestSprintHistory");
  });

  it("security-overview index exports all 7 modules", () => {
    const content = read("src/security/security-overview/index.ts");
    const modules = [
      "./schema",
      "./baseline",
      "./suppressions",
      "./normalizer",
      "./triage",
      "./drift",
      "./ai-explain",
    ];
    for (const m of modules) {
      expect(content).toContain(m);
    }
  });
});
