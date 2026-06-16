import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Sprint 45 smoke tests — file surface", () => {
  it("risks backend files exist", () => {
    const files = [
      "src/security/risks/schema.ts",
      "src/security/risks/baseline.ts",
      "src/security/risks/suppressions.ts",
      "src/security/risks/parsers.ts",
      "src/security/risks/dependency-check-runner.ts",
      "src/security/risks/trivy-runner.ts",
      "src/security/risks/index.ts",
    ];
    for (const f of files) {
      expect(fs.existsSync(path.join(root, f)), `expected ${f} to exist`).toBe(
        true,
      );
    }
  });

  it("Sprint 44 secrets backend files still exist — no regression", () => {
    const files = [
      "src/security/secrets/schema.ts",
      "src/security/secrets/gitleaks-runner.ts",
      "src/security/secrets/index.ts",
    ];
    for (const f of files) {
      expect(fs.existsSync(path.join(root, f)), `expected ${f} to exist`).toBe(
        true,
      );
    }
  });

  it("risks IPC handler registers both channels", () => {
    const text = read("electron-ui/ipc/risks-handlers.cjs");
    expect(text).toContain('ipcMain.handle("risks:scan:dependency"');
    expect(text).toContain('ipcMain.handle("risks:scan:image"');
    expect(text).toContain("runDependencyCheck");
    expect(text).toContain("runTrivyImage");
  });

  it("main.cjs registers risks handlers", () => {
    const text = read("electron-ui/main.cjs");
    expect(text).toContain("registerRisksHandlers");
    expect(text).toContain("risks-handlers.cjs");
  });

  it("preload exposes workspaceRisks namespace", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain('exposeInMainWorld("workspaceRisks"');
    expect(text).toContain('ipcRenderer.invoke("risks:scan:dependency"');
    expect(text).toContain('ipcRenderer.invoke("risks:scan:image"');
  });

  it("preload preserves Sprint 44 secrets and Sprint 43 knowledge namespaces", () => {
    const text = read("electron-ui/preload.cjs");
    expect(text).toContain('exposeInMainWorld("secrets"');
    expect(text).toContain('exposeInMainWorld("workspaceKnowledge"');
  });

  it("types.d.ts declares RiskFinding interface", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("RiskFinding");
    expect(text).toContain('"dependency-check" | "trivy" | "unknown"');
    expect(text).toContain(
      '"critical" | "high" | "medium" | "low" | "info" | "unknown"',
    );
  });

  it("types.d.ts declares workspaceRisks on Window", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("workspaceRisks:");
    expect(text).toContain("scanDependency:");
    expect(text).toContain("scanImage:");
  });

  it("types.d.ts preserves Sprint 44 secrets interface", () => {
    const text = read("src/ui/types.d.ts");
    expect(text).toContain("secrets:");
    expect(text).toContain('engine: "gitleaks"');
  });

  it("dashboard includes Dependency & Image Risks panel", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Dependency & Image Risks");
    expect(text).toContain("risks-panel");
    expect(text).toContain("risks-scan-deps");
    expect(text).toContain("risks-scan-image");
    expect(text).toContain("risks-table-body");
    expect(text).toContain("window.workspaceRisks.scanDependency");
    expect(text).toContain("window.workspaceRisks.scanImage");
  });

  it("dashboard preserves Sprint 44 Secrets Scanning panel", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Secrets Scanning");
    expect(text).toContain("secrets-scan-btn");
    expect(text).toContain("window.secrets.scan");
  });

  it("dashboard preserves Sprint 44 Knowledge panel compatibility strings", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Knowledge Layer");
    expect(text).toContain("knowledge-filter");
    expect(text).toContain("knowledge-results-body");
  });

  it("dashboard preserves Sprint 43 and earlier compatibility strings", () => {
    const text = loadDashboardSurface();
    expect(text).toContain("Workspace Analytics & Explainability");
    expect(text).toContain("Workspace Quotas");
    expect(text).toContain("Audit Trail");
    expect(text).toContain("metric-success-rate");
    expect(text).toContain("workspaceRouting.analytics");
  });

  it("audit-handlers.cjs still exposes Sprint 38 audit exports — no regression", () => {
    const text = read("electron-ui/ipc/audit-handlers.cjs");
    expect(text).toContain("audit:exportJson");
    expect(text).toContain("audit:exportHtmlReport");
  });

  it("main.cjs still registers audit, knowledge, and secrets handlers — no regression", () => {
    const text = read("electron-ui/main.cjs");
    expect(text).toContain("registerAuditHandlers");
    expect(text).toContain("registerKnowledgeHandlers");
    expect(text).toContain("registerSecretsHandlers");
  });
});
