import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from './dashboard-loader.js';
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Sprint 48 smoke tests — file surface", () => {
  it("drift.ts exists", () => {
    expect(
      existsSync(join(root, "src/security/security-overview/drift.ts")),
    ).toBe(true);
  });

  it("drift.ts exports compareSecurityOverviewWithBaseline", () => {
    const content = read("src/security/security-overview/drift.ts");
    expect(content).toContain("compareSecurityOverviewWithBaseline");
    expect(content).toContain("loadSecurityBaselineSnapshot");
    expect(content).toContain("buildFindingFingerprintSet");
  });

  it("schema.ts has SeverityCounts and SecurityOverviewDriftResult", () => {
    const content = read("src/security/security-overview/schema.ts");
    expect(content).toContain("SeverityCounts");
    expect(content).toContain("SecurityOverviewDriftResult");
  });

  it("index.ts exports drift module", () => {
    const content = read("src/security/security-overview/index.ts");
    expect(content).toContain("./drift");
  });

  it("IPC handler registers compare-baseline channel", () => {
    const content = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(content).toContain("security-overview:compare-baseline");
    expect(content).toContain("compareSecurityOverviewWithBaseline");
  });

  it("IPC handler preserves Sprint 46/47 channels", () => {
    const content = read("electron-ui/ipc/security-overview-handlers.cjs");
    expect(content).toContain("security-overview:summarize");
    expect(content).toContain("security-overview:save-baseline");
    expect(content).toContain("security-overview:load-triage");
    expect(content).toContain("security-overview:set-triage");
  });

  it("preload exposes compareBaseline on workspaceSecurity", () => {
    const content = read("electron-ui/preload.cjs");
    expect(content).toContain("compareBaseline");
    expect(content).toContain("security-overview:compare-baseline");
  });

  it("preload preserves Sprint 47 triage methods", () => {
    const content = read("electron-ui/preload.cjs");
    expect(content).toContain("loadTriage");
    expect(content).toContain("setTriage");
  });

  it("types.d.ts has SeverityCounts and SecurityOverviewDriftResult", () => {
    const content = read("src/ui/types.d.ts");
    expect(content).toContain("interface SeverityCounts");
    expect(content).toContain("interface SecurityOverviewDriftResult");
    expect(content).toContain("introduced");
    expect(content).toContain("persistent");
    expect(content).toContain("resolved");
    expect(content).toContain("compareBaseline");
    const windowCount = (content.match(/interface Window/g) ?? []).length;
    expect(windowCount).toBe(1);
  });

  it("dashboard has Security Drift panel", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("security-drift-panel");
    expect(html).toContain("security-drift-baseline-path");
    expect(html).toContain("security-drift-compare-btn");
    expect(html).toContain("security-drift-introduced");
    expect(html).toContain("security-drift-persistent");
    expect(html).toContain("security-drift-resolved");
    expect(html).toContain("globalThis.workspaceSecurity.compareBaseline");
  });

  it("dashboard Security Drift panel appears after Security Overview panel", () => {
    const html = loadDashboardSurface();
    const overviewIdx = html.indexOf("security-overview-panel");
    const driftIdx = html.indexOf("security-drift-panel");
    expect(overviewIdx).toBeGreaterThan(-1);
    expect(driftIdx).toBeGreaterThan(overviewIdx);
  });

  it("dashboard preserves Sprint 25–47 compatibility strings", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Quotas");
    expect(html).toContain("workspaceRouting.analytics");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("Load Triage");
    expect(html).toContain("Apply Triage State");
  });

  it("main.cjs still registers security overview handlers", () => {
    const content = read("electron-ui/main.cjs");
    expect(content).toContain("registerSecurityOverviewHandlers");
  });
});
