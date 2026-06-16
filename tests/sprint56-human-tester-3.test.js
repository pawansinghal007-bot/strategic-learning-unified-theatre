import { describe, it, expect } from "vitest";
import { loadDashboardSurface } from "./dashboard-loader.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel) {
  if (rel === "src/ui/provider-dashboard.html") {
    return loadDashboardSurface();
  }
  return readFileSync(join(root, rel), "utf8");
}

function exists(rel) {
  return existsSync(join(root, rel));
}

describe("Sprint 56 human tester 3 — regression guard", () => {
  it("local AI status panel has data-testid attributes", () => {
    const html = loadDashboardSurface();
    expect(html).toContain('data-testid="local-ai-status-panel"');
    expect(html).toContain('data-testid="local-ai-status-value"');
    expect(html).toContain('data-testid="local-ai-status-detail"');
    expect(html).toContain("setLocalAiStatus");
  });

  it("key input fields have data-testid attributes", () => {
    const html = loadDashboardSurface();
    expect(html).toContain('data-testid="workspace-id-input"');
    expect(html).toContain('data-testid="filter-provider-input"');
    expect(html).toContain('data-testid="filter-start-input"');
    expect(html).toContain('data-testid="filter-end-input"');
  });

  it("primary action buttons have data-testid attributes", () => {
    const html = loadDashboardSurface();
    expect(html).toContain('data-testid="load-unified-view-btn"');
    expect(html).toContain('data-testid="refresh-routing-history-btn"');
    expect(html).toContain('data-testid="clear-routing-history-btn"');
    expect(html).toContain('data-testid="export-json-btn"');
    expect(html).toContain('data-testid="save-html-btn"');
    expect(html).toContain('data-testid="load-global-analytics-btn"');
  });

  it("metric tiles have data-testid attributes", () => {
    const html = loadDashboardSurface();
    expect(html).toContain('data-testid="metric-total"');
    expect(html).toContain('data-testid="metric-success-rate"');
    expect(html).toContain('data-testid="metric-error-rate"');
    expect(html).toContain('data-testid="metric-latency"');
  });

  it("security panels have data-testid attributes", () => {
    const html = loadDashboardSurface();
    expect(html).toContain('data-testid="security-overview-panel"');
    expect(html).toContain('data-testid="security-drift-panel"');
  });

  it("all Sprint 25-55 compatibility strings are preserved", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Provider Trends");
    expect(html).toContain("Decision Timeline");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("metric-error-rate");
    expect(html).toContain("metric-latency");
    expect(html).toContain("workspaceRouting.analytics");
    expect(html).toContain("Workspace Quotas");
    expect(html).toContain("load-workspace-quota-rollup");
  });

  it("Playwright human spec files still exist", () => {
    const files = [
      "tests/human/helpers/electronApp.js",
      "tests/human/launch.spec.js",
      "tests/human/analytics-audit.spec.js",
      "tests/human/quota-security.spec.js",
    ];
    for (const f of files) {
      expect(exists(f), `${f} should exist`).toBe(true);
    }
  });

  it("Playwright UI spec files still exist", () => {
    const files = [
      "tests/ui/helpers/electronUi.js",
      "tests/ui/theme-readability.spec.js",
      "tests/ui/browser-pane-overlap.spec.js",
      "tests/ui/browser-pane-hide.spec.js",
      "tests/ui/local-ai-status.spec.js",
    ];
    for (const f of files) {
      expect(exists(f), `${f} should exist`).toBe(true);
    }
  });

  it("updated Playwright launch spec uses data-testid selectors", () => {
    const content = read("tests/human/launch.spec.js");
    expect(content).toContain('data-testid="local-ai-status-panel"');
    expect(content).toContain('data-testid="workspace-id-input"');
    expect(content).toContain('data-testid="load-unified-view-btn"');
    expect(content).toContain('data-testid="security-overview-panel"');
  });

  it("updated UI readability spec uses data-testid selectors", () => {
    const content = read("tests/ui/theme-readability.spec.js");
    expect(content).toContain('data-testid="local-ai-status-panel"');
    expect(content).toContain('data-testid="workspace-id-input"');
    expect(content).toContain('data-testid="metric-total"');
  });
});
