import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 44 smoke tests — file surface", () => {
  it("secrets backend files exist", () => {
    expect(
      fs.existsSync(path.join(root, "src/security/secrets/schema.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, "src/security/secrets/gitleaks-runner.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, "src/security/secrets/baseline.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, "src/security/secrets/suppressions.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, "src/security/secrets/index.ts")),
    ).toBe(true);
  });

  it("secrets IPC handler registers secrets:scan", () => {
    const text = read("electron-ui/ipc/secrets-handlers.cjs");
    expect(text).toContain('ipcMain.handle("secrets:scan"');
    expect(text).toContain("runSecretsScan");
  });

  it("main.cjs registers secrets handlers", () => {
    const text = read("electron-ui/main.cjs");
    expect(text).toContain("registerSecretsHandlers");
    expect(text).toContain("secrets-handlers.cjs");
  });

  it("preload exposes secrets namespace", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain('exposeInMainWorld("secrets"');
    expect(text).toContain('ipcRenderer.invoke("secrets:scan"');
  });

  it("preload preserves Sprint 43 workspaceKnowledge methods", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain("knowledge:ingest");
    expect(text).toContain("knowledge:search");
    expect(text).toContain("buildPromptContext");
  });

  it("types.d.ts declares Window.secrets with scan method", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("secrets:");
    expect(text).toContain('engine: "gitleaks"');
    expect(text).toContain("secretPreview: string | null");
    expect(text).toContain("baselineMatched: boolean");
    expect(text).toContain("suppressionReason: string | null");
  });

  it("types.d.ts workspaceKnowledge.search includes filter and minScore", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("filter?: string");
    expect(text).toContain("minScore?: number");
  });

  it("knowledge-handlers.cjs supports filter passthrough", () => {
    const text = read("electron-ui/ipc/knowledge-handlers.cjs");
    expect(text).toContain("filter: options?.filter ?? undefined");
    expect(text).toContain("options?.minScore");
    expect(text).toContain("normalizeHit");
    expect(text).toContain("toScoreNumber");
  });

  it("dashboard includes Secrets Scanning panel", () => {
    const text = read("src/ui/provider-dashboard.html");
    expect(text).toContain("Secrets Scanning");
    expect(text).toContain("secrets-scan-btn");
    expect(text).toContain("secrets-findings-body");
    expect(text).toContain("secrets-summary-output");
    expect(text).toContain("window.secrets.scan");
  });

  it("dashboard Knowledge panel shows score column and filter input", () => {
    const text = read("src/ui/provider-dashboard.html");
    expect(text).toContain("knowledge-filter");
    expect(text).toContain("knowledge-results-body");
    expect(text).toContain("<th>Score</th>");
    expect(text).toContain("row.score.toFixed(3)");
  });

  it("dashboard preserves Sprint 43 compatibility strings", () => {
    const text = read("src/ui/provider-dashboard.html");
    expect(text).toContain("Knowledge Layer");
    expect(text).toContain("knowledge-ingest-btn");
    expect(text).toContain("Workspace Quotas");
    expect(text).toContain("Audit Trail");
    expect(text).toContain("Workspace Approvals");
    expect(text).toContain("Workspace Analytics & Explainability");
    expect(text).toContain("metric-success-rate");
    expect(text).toContain("workspaceRouting.analytics");
  });

  it("audit-handlers.cjs still exposes Sprint 38 audit exports — no regression", () => {
    const text = read("electron-ui/ipc/audit-handlers.cjs");
    expect(text).toContain("audit:exportJson");
    expect(text).toContain("audit:exportHtmlReport");
  });

  it("main.cjs still registers audit and knowledge handlers — no regression", () => {
    const text = read("electron-ui/main.cjs");
    expect(text).toContain("registerAuditHandlers");
    expect(text).toContain("registerKnowledgeHandlers");
  });
});
