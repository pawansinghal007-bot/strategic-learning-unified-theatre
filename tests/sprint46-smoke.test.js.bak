import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

describe("Sprint 46 smoke tests — file surface", () => {
  it("security-overview schema.ts exists", () => {
    expect(
      existsSync(
        join(process.cwd(), "src/security/security-overview/schema.ts"),
      ),
    ).toBe(true);
  });

  it("security-overview-handlers.cjs registers all 4 IPC channels", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/security-overview-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("security-overview:summarize");
    expect(content).toContain("security-overview:save-baseline");
    expect(content).toContain("security-overview:load-suppressions");
    expect(content).toContain("security-overview:save-suppressions");
    expect(content).toContain("registerSecurityOverviewHandlers");
  });

  it("main.cjs registers security overview handlers", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(content).toContain("registerSecurityOverviewHandlers");
  });

  it("preload exposes workspaceSecurity namespace", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain(
      'contextBridge.exposeInMainWorld("workspaceSecurity"',
    );
    expect(content).toContain("security-overview:summarize");
    expect(content).toContain("security-overview:save-baseline");
    expect(content).toContain("security-overview:load-suppressions");
    expect(content).toContain("security-overview:save-suppressions");
  });

  it("types.d.ts adds workspaceSecurity inside the Window interface", () => {
    const content = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(content).toContain("workspaceSecurity:");
    expect(content).toContain("summarize:");
    expect(content).toContain("saveBaseline:");
    expect(content).toContain("loadSuppressions:");
    expect(content).toContain("saveSuppressions:");
    const windowCount = (content.match(/interface Window/g) ?? []).length;
    expect(windowCount).toBe(1);
  });

  it("dashboard has Security Overview panel above Secrets panel", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("security-overview-panel");
    expect(html).toContain("security-load-overview");
    expect(html).toContain("security-save-baseline");
    expect(html).toContain("window.workspaceSecurity.summarize");
    expect(html).toContain("window.workspaceSecurity.saveBaseline");
    const overviewIdx = html.indexOf("security-overview-panel");
    const secretsIdx = html.indexOf("secrets-scan");
    expect(overviewIdx).toBeLessThan(secretsIdx);
  });

  it("dashboard preserves Sprint 25–45 compatibility strings", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Approvals");
    expect(html).toContain("Workspace Quotas");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("workspaceRouting.analytics");
  });

  it("Sprint 44/45 scanner surfaces preserved in preload", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceRisks");
    expect(content).toContain("risks:scan:dependency");
  });
});
