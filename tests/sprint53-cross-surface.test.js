import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

describe("Sprint 53 — triage backend cross-surface regression", () => {
  it("triage.ts exports all 5 original helpers plus Sprint 52 additions", () => {
    const content = read("src/security/security-overview/triage.ts");
    expect(content).toContain("export function upsertSecurityTriageEntry");
    expect(content).toContain("export function getSecurityTriageStatus");
    expect(content).toContain("export function isTriageStatusFinal");
    expect(content).toContain("export function loadSecurityTriage");
    expect(content).toContain("export function saveSecurityTriage");
    expect(content).toContain("export function applyBulkTriage");
    expect(content).toContain("export const TRIAGE_STATUSES");
    expect(content).toContain("normalizeTriageStatus");
  });

  it("applyBulkTriage skips null/undefined/empty fingerprints in practice", async () => {
    const { applyBulkTriage } =
      await import("../src/security/security-overview/triage.js");
    const result = applyBulkTriage(
      [],
      ["fp-valid", null, undefined, ""],
      "open",
      undefined,
      undefined,
      1,
    );
    expect(
      result.every(
        (entry) => entry.fingerprint && entry.fingerprint.trim().length > 0,
      ),
    ).toBe(true);
    expect(result.some((entry) => entry.fingerprint === "fp-valid")).toBe(true);
  });

  it("security-overview index.ts exports all 7 modules", () => {
    const content = read("src/security/security-overview/index.ts");
    expect(content).toContain("./schema");
    expect(content).toContain("./baseline");
    expect(content).toContain("./suppressions");
    expect(content).toContain("./normalizer");
    expect(content).toContain("./triage");
    expect(content).toContain("./drift");
    expect(content).toContain("./ai-explain");
  });
});

describe("Sprint 53 — IPC surface cross-surface regression", () => {
  it("security-overview-handlers.cjs registers all 10 IPC channels", () => {
    const content = read("electron-ui/ipc/security-overview-handlers.cjs");
    const channels = [
      "security-overview:summarize",
      "security-overview:save-baseline",
      "security-overview:load-suppressions",
      "security-overview:save-suppressions",
      "security-overview:load-triage",
      "security-overview:set-triage",
      "security-overview:set-triage-bulk",
      "security-overview:compare-baseline",
      "security-overview:explain-introduced",
      "security-overview:get-drift-classification",
    ];
    for (const channel of channels) {
      expect(content).toContain(channel);
    }
  });

  it("security-overview-handlers.cjs uses lazy require pattern throughout", () => {
    const content = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(content).toContain("require(");
    expect(content).not.toContain(
      "const { applyBulkTriage } = require('../../src/security/security-overview/triage",
    );
  });

  it("secrets-handlers.cjs registers secrets:scan", () => {
    const content = read("electron-ui/ipc/secrets-handlers.cjs");
    expect(content).toContain("secrets:scan");
  });

  it("risks-handlers.cjs registers both risk scan channels", () => {
    const content = read("electron-ui/ipc/risks-handlers.cjs");
    expect(content).toContain("risks:scan:dependency");
    expect(content).toContain("risks:scan:image");
  });

  it("knowledge-handlers.cjs registers knowledge IPC channels", () => {
    const content = read("electron-ui/ipc/knowledge-handlers.cjs");
    expect(content).toContain("knowledge:ingest");
    expect(content).toContain("knowledge:search");
  });
});

describe("Sprint 53 — preload cross-surface regression", () => {
  it("preload exposes all 10 workspaceSecurity methods", () => {
    const content = read("electron-ui/preload.cjs");
    const methods = [
      "summarize",
      "saveBaseline",
      "loadSuppressions",
      "saveSuppressions",
      "loadTriage",
      "setTriage",
      "setTriageBulk",
      "compareBaseline",
      "explainIntroduced",
      "getDriftClassification",
    ];
    for (const method of methods) {
      expect(content).toContain(`${method}:`);
    }
  });

  it("preload exposes secrets, workspaceRisks, workspaceKnowledge, workspaceQuota", () => {
    const content = read("electron-ui/preload.cjs");
    expect(content).toContain('exposeInMainWorld("secrets"');
    expect(content).toContain('exposeInMainWorld("workspaceRisks"');
    expect(content).toContain('exposeInMainWorld("workspaceKnowledge"');
    expect(content).toContain('exposeInMainWorld("workspaceQuota"');
  });

  it("preload workspaceRisks exposes both scan channels", () => {
    const content = read("electron-ui/preload.cjs");
    expect(content).toContain("risks:scan:dependency");
    expect(content).toContain("risks:scan:image");
  });

  it("preload workspaceKnowledge exposes ingest and search", () => {
    const content = read("electron-ui/preload.cjs");
    expect(content).toContain("knowledge:ingest");
    expect(content).toContain("knowledge:search");
  });
});

describe("Sprint 53 — types.d.ts cross-surface regression", () => {
  it("types.d.ts has exactly one Window interface", () => {
    const content = read("src/ui/types.d.ts");
    const count = (content.match(/interface Window/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("Window interface declares all security namespaces", () => {
    const content = read("src/ui/types.d.ts");
    expect(content).toContain("workspaceSecurity:");
    expect(content).toContain("workspaceRisks:");
  });

  it("workspaceSecurity typing includes setTriageBulk", () => {
    const content = read("src/ui/types.d.ts");
    expect(content).toContain("setTriageBulk:");
  });

  it("workspaceSecurity typing includes all original Sprint 46-51 methods", () => {
    const content = read("src/ui/types.d.ts");
    const methods = [
      "summarize:",
      "saveBaseline:",
      "loadSuppressions:",
      "saveSuppressions:",
      "loadTriage:",
      "setTriage:",
      "compareBaseline:",
      "explainIntroduced:",
      "getDriftClassification",
    ];
    for (const method of methods) {
      expect(content).toContain(method);
    }
  });
});

describe("Sprint 53 — dashboard cross-surface regression", () => {
  it("dashboard has security overview and drift panels", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("security-overview-panel");
    expect(html).toContain("security-drift-panel");
    expect(html).toContain("globalThis.workspaceSecurity.summarize");
    expect(html).toContain("globalThis.workspaceSecurity.compareBaseline");
  });

  it("dashboard has all Sprint 25-50 analytics panels", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Quotas");
    expect(html).toContain("workspaceRouting.analytics");
    expect(html).toContain("metric-success-rate");
  });

  it("dashboard compatibility comment block contains Sprint 44-52 strings", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("security-overview-panel");
    expect(html).toContain("security-drift-panel");
    expect(html).toContain("globalThis.workspaceSecurity.compareBaseline");
    expect(html).toContain("globalThis.workspaceSecurity.getDriftClassification");
  });
});

describe("Sprint 53 — knowledge layer cross-surface regression", () => {
  it("knowledge index.ts exports ingestSprintHistory and embedTextBatch", () => {
    const content = read("src/knowledge/index.ts");
    expect(content).toContain("ingestSprintHistory");
    expect(content).toContain("embedTextBatch");
  });

  it("knowledge IPC handler file exists", () => {
    expect(exists("electron-ui/ipc/knowledge-handlers.cjs")).toBe(true);
  });

  it("main.cjs registers all security and knowledge handlers", () => {
    const content = read("electron-ui/main.cjs");
    expect(content).toContain("registerSecurityOverviewHandlers");
    expect(content).toContain("registerRisksHandlers");
    expect(content).toContain("registerKnowledgeHandlers");
  });
});
