import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 49 smoke tests — file surface", () => {
  it("ai-explain.ts exists in security-overview", () => {
    expect(
      fs.existsSync(
        path.join(root, "src/security/security-overview/ai-explain.ts"),
      ),
    ).toBe(true);
  });

  it("index.ts exports ai-explain", () => {
    const text = read("src/security/security-overview/index.ts");
    expect(text).toContain("./ai-explain");
  });

  it("index.ts still exports drift and triage — no regression", () => {
    const text = read("src/security/security-overview/index.ts");
    expect(text).toContain("./drift");
    expect(text).toContain("./triage");
  });

  it("ai-explain.ts exports all expected symbols", () => {
    const text = read("src/security/security-overview/ai-explain.ts");
    expect(text).toContain("buildIntroducedFindingsPrompt");
    expect(text).toContain("parseExplainIntroducedFindingsAnswer");
    expect(text).toContain("explainIntroducedFindings");
    expect(text).toContain("FindingExplanationItem");
    expect(text).toContain("ExplainIntroducedFindingsResult");
  });

  it("ai-explain.ts has graceful degradation when window.llm unavailable", () => {
    const text = read("src/security/security-overview/ai-explain.ts");
    expect(text).toContain("window.llm.ask is not available");
  });

  it("security-overview handler registers explain-introduced channel", () => {
    const text = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(text).toContain('"security-overview:explain-introduced"');
    expect(text).toContain("explainIntroducedFindings");
  });

  it("handler wraps explain call in try/catch", () => {
    const text = read("electron-ui/ipc/security-overview-handlers.cjs");
    const explainBlock = text.slice(text.indexOf("explain-introduced"));
    expect(explainBlock).toContain("try");
    expect(explainBlock).toContain("catch");
  });

  it("handler still registers all Sprint 46-48 channels — no regression", () => {
    const text = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(text).toContain('"security-overview:summarize"');
    expect(text).toContain('"security-overview:save-baseline"');
    expect(text).toContain('"security-overview:load-triage"');
    expect(text).toContain('"security-overview:set-triage"');
    expect(text).toContain('"security-overview:compare-baseline"');
  });

  it("preload exposes explainIntroduced on workspaceSecurity", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain("explainIntroduced");
    expect(text).toContain('"security-overview:explain-introduced"');
  });

  it("preload preserves Sprint 46-48 workspaceSecurity methods", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain('"security-overview:summarize"');
    expect(text).toContain('"security-overview:compare-baseline"');
    expect(text).toContain('"security-overview:load-triage"');
  });

  it("types.d.ts declares FindingExplanationItem globally", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("interface FindingExplanationItem");
    expect(text).toContain("explanation: string");
    expect(text).toContain("recommendation: string");
  });

  it("types.d.ts declares ExplainIntroducedFindingsResult globally", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("interface ExplainIntroducedFindingsResult");
    expect(text).toContain("analyzedCount: number");
    expect(text).toContain("knowledgeUsed: boolean");
    expect(text).toContain("items: FindingExplanationItem[]");
  });

  it("types.d.ts workspaceSecurity has explainIntroduced", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("explainIntroduced:");
    expect(text).toContain("ExplainIntroducedFindingsResult");
  });

  it("dashboard has AI Finding Explanation panel", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("AI Finding Explanation");
    expect(text).toContain("security-ai-panel");
    expect(text).toContain("security-ai-explain-btn");
    expect(text).toContain("security-ai-output");
    expect(text).toContain("security-ai-body");
  });

  it("dashboard wires explainIntroduced and uses latestSecurityDriftResult", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("window.workspaceSecurity.explainIntroduced");
    expect(text).toContain("latestSecurityDriftResult");
  });

  it("dashboard preserves Sprint 48 Security Drift panel", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Security Drift");
    expect(text).toContain("window.workspaceSecurity.compareBaseline");
  });

  it("dashboard preserves Sprint 47 Security Overview triage controls", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("security-set-triage");
    expect(text).toContain("security-load-triage");
  });

  it("dashboard preserves Sprint 44-46 scanner panels", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Secrets Scanning");
    expect(text).toContain("Dependency & Image Risks");
    expect(text).toContain("Security Overview");
  });

  it("dashboard preserves Sprint 43 and earlier compatibility strings", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Workspace Analytics & Explainability");
    expect(text).toContain("Audit Trail");
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
