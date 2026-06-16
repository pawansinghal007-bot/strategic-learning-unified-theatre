import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 47 smoke tests — file surface", () => {
  it("triage.ts exists in security-overview", () => {
    expect(
      fs.existsSync(
        path.join(root, "src/security/security-overview/triage.ts"),
      ),
    ).toBe(true);
  });

  it("security-overview index.ts exports triage", () => {
    const text = read("src/security/security-overview/index.ts");
    expect(text).toContain("./triage");
  });

  it("schema.ts has SecurityTriageStatus and triage snapshot fields", () => {
    const text = read("src/security/security-overview/schema.ts");
    expect(text).toContain("SecurityTriageStatus");
    expect(text).toContain('"open"');
    expect(text).toContain('"accepted"');
    expect(text).toContain('"false_positive"');
    expect(text).toContain('"resolved"');
    expect(text).toContain("falsePositive");
  });

  it("security-overview handler registers load-triage and set-triage", () => {
    const text = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(text).toContain('"security-overview:load-triage"');
    expect(text).toContain('"security-overview:set-triage"');
    expect(text).toContain("loadSecurityTriage");
    expect(text).toContain("saveSecurityTriage");
    expect(text).toContain("upsertSecurityTriageEntry");
    expect(text).toContain("getSecurityTriageStatus");
  });

  it("handler summarize wires in triage enrichment", () => {
    const text = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(text).toContain("triagePath");
    expect(text).toContain("triageEntries");
  });

  it("preload exposes loadTriage and setTriage on workspaceSecurity", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain("loadTriage");
    expect(text).toContain("setTriage");
    expect(text).toContain('"security-overview:load-triage"');
    expect(text).toContain('"security-overview:set-triage"');
  });

  it("preload preserves Sprint 46 workspaceSecurity methods", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain('"security-overview:summarize"');
    expect(text).toContain('"security-overview:save-baseline"');
    expect(text).toContain('"security-overview:load-suppressions"');
    expect(text).toContain('"security-overview:save-suppressions"');
  });

  it("types.d.ts declares SecurityTriageStatus and SecurityTriageEntry", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("SecurityTriageStatus");
    expect(text).toContain("SecurityTriageEntry");
    expect(text).toContain('"false_positive"');
  });

  it("types.d.ts workspaceSecurity has loadTriage and setTriage", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("loadTriage");
    expect(text).toContain("setTriage");
  });

  it("types.d.ts SecuritySummarySnapshot has triage count fields", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("open: number");
    expect(text).toContain("accepted: number");
    expect(text).toContain("falsePositive: number");
    expect(text).toContain("resolved: number");
  });

  it("dashboard has triage controls", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("security-triage-path");
    expect(text).toContain("security-triage-fingerprint");
    expect(text).toContain("security-triage-status");
    expect(text).toContain("security-triage-reason");
    expect(text).toContain("security-set-triage");
    expect(text).toContain("security-load-triage");
  });

  it("dashboard has triage metric cards", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("security-open");
    expect(text).toContain("security-accepted");
    expect(text).toContain("security-resolved");
  });

  it("dashboard calls workspaceSecurity.setTriage and .loadTriage", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("workspaceSecurity.setTriage");
    expect(text).toContain("workspaceSecurity.loadTriage");
  });

  it("dashboard preserves Sprint 46 security overview strings", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("security-overview-panel");
    expect(text).toContain("security-total");
    expect(text).toContain("security-load-overview");
    expect(text).toContain("security-save-baseline");
    expect(text).toContain("workspaceSecurity.summarize");
  });

  it("dashboard preserves Sprint 44/45 scanner panels", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Secrets Scanning");
    expect(text).toContain("Dependency & Image Risks");
    expect(text).toContain("risks-panel");
  });

  it("dashboard preserves Sprint 43 and earlier compatibility strings", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Workspace Analytics & Explainability");
    expect(text).toContain("Audit Trail");
    expect(text).toContain("Workspace Quotas");
    expect(text).toContain("metric-success-rate");
    expect(text).toContain("workspaceRouting.analytics");
  });

  it("main.cjs still registers all handlers — no regression", () => {
    const text = read("electron-ui/main.cjs");
    expect(text).toContain("registerAuditHandlers");
    expect(text).toContain("registerKnowledgeHandlers");
    expect(text).toContain("registerSecretsHandlers");
    expect(text).toContain("registerRisksHandlers");
    expect(text).toContain("registerSecurityOverviewHandlers");
  });

  it("audit-handlers.cjs Sprint 38 exports intact — no regression", () => {
    const text = read("electron-ui/ipc/audit-handlers.cjs");
    expect(text).toContain("audit:exportJson");
    expect(text).toContain("audit:exportHtmlReport");
  });
});
