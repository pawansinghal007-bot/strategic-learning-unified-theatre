import { existsSync, readFileSync } from "fs";
import { loadDashboardSurface } from './dashboard-loader.js';
import { join } from "path";
import {
  recordRoutingDecision,
  getProviderComparisonAcrossWorkspaces,
  getWorkspaceBucketChartSvg,
  getProviderComparisonChartSvg,
  exportWorkspaceAnalyticsHtmlReport,
  resetRoutingHistory,
} from "../src/llm/routing-history.js";

describe("Sprint 34 smoke tests — provider comparison", () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it("returns provider comparison across workspaces", () => {
    recordRoutingDecision({
      request: { requestId: "p1", workspaceId: "ws-a", prompt: "x" },
      provider: "openai",
      model: "m1",
      success: true,
      reason: "ok",
      latencyMs: 100,
    });

    recordRoutingDecision({
      request: { requestId: "p2", workspaceId: "ws-b", prompt: "x" },
      provider: "openai",
      model: "m1",
      success: false,
      reason: "retry",
      latencyMs: 150,
      errorMessage: "429",
    });

    recordRoutingDecision({
      request: { requestId: "p3", workspaceId: "ws-a", prompt: "x" },
      provider: "groq",
      model: "m2",
      success: true,
      reason: "fast",
      latencyMs: 60,
    });

    const rows = getProviderComparisonAcrossWorkspaces();
    expect(rows.length).toBeGreaterThan(0);
    const wsaOpenai = rows.find(
      (r) => r.workspaceId === "ws-a" && r.provider === "openai",
    );
    expect(wsaOpenai).toBeDefined();
    expect(wsaOpenai.count).toBe(1);
    expect(wsaOpenai.successRate).toBe(100);
  });

  it("returns empty array when no routing history exists", () => {
    expect(getProviderComparisonAcrossWorkspaces()).toEqual([]);
  });

  it("groups unscoped requests under unscoped key", () => {
    recordRoutingDecision({
      request: { requestId: "u1", workspaceId: null, prompt: "x" },
      provider: "local",
      model: "llama",
      success: true,
      reason: "private",
      latencyMs: 50,
    });

    const rows = getProviderComparisonAcrossWorkspaces();
    const unscoped = rows.find(
      (r) => r.workspaceId === "unscoped" && r.provider === "local",
    );
    expect(unscoped).toBeDefined();
  });
});

describe("Sprint 34 smoke tests — SVG charts", () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it("getWorkspaceBucketChartSvg returns valid SVG", () => {
    recordRoutingDecision({
      request: { requestId: "s1", workspaceId: "ws-svg", prompt: "x" },
      provider: "groq",
      model: "m1",
      success: true,
      reason: "fast",
      latencyMs: 70,
    });

    const svg = getWorkspaceBucketChartSvg("ws-svg", "day");
    expect(svg).toContain("<svg");
    expect(svg).toContain("ws-svg");
    expect(svg).toContain("</svg>");
  });

  it("getWorkspaceBucketChartSvg returns SVG for empty workspace", () => {
    const svg = getWorkspaceBucketChartSvg("ws-empty", "day");
    expect(svg).toContain("<svg");
  });

  it("getProviderComparisonChartSvg returns valid SVG", () => {
    recordRoutingDecision({
      request: { requestId: "s2", workspaceId: "ws-one", prompt: "x" },
      provider: "perplexity",
      model: "sonar",
      success: true,
      reason: "research",
      latencyMs: 180,
    });

    const svg = getProviderComparisonChartSvg();
    expect(svg).toContain("<svg");
    expect(svg).toContain("Provider comparison across workspaces");
    expect(svg).toContain("</svg>");
  });

  it("getProviderComparisonChartSvg returns SVG even with no data", () => {
    const svg = getProviderComparisonChartSvg();
    expect(svg).toContain("<svg");
  });
});

describe("Sprint 34 smoke tests — HTML report", () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it("exportWorkspaceAnalyticsHtmlReport returns valid HTML", () => {
    recordRoutingDecision({
      request: { requestId: "r1", workspaceId: "ws-report", prompt: "x" },
      provider: "local",
      model: "m1",
      success: true,
      reason: "private",
      latencyMs: 55,
    });

    const html = exportWorkspaceAnalyticsHtmlReport("ws-report");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Workspace Analytics Report");
    expect(html).toContain("ws-report");
    expect(html).toContain("<svg");
  });

  it("exportWorkspaceAnalyticsHtmlReport escapes workspace ID in HTML", () => {
    const html = exportWorkspaceAnalyticsHtmlReport("<script>evil</script>");
    expect(html).not.toContain("<script>evil</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("Sprint 34 smoke tests — file surface", () => {
  it("workspace-routing-handlers.cjs registers all 4 new channels", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-routing-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("workspaceRouting:providerComparison");
    expect(source).toContain("workspaceRouting:bucketChartSvg");
    expect(source).toContain("workspaceRouting:providerComparisonChartSvg");
    expect(source).toContain("workspaceRouting:exportHtmlReport");
  });

  it("workspace-routing-handlers.cjs preserves all Sprint 33 channels", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-routing-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("workspaceRouting:list");
    expect(source).toContain("workspaceRouting:summary");
    expect(source).toContain("workspaceRouting:trends");
    expect(source).toContain("workspaceRouting:timeline");
    expect(source).toContain("workspaceRouting:analytics");
    expect(source).toContain("workspaceRouting:buckets");
    expect(source).toContain("workspaceRouting:globalAnalytics");
    expect(source).toContain("workspaceRouting:exportJson");
    expect(source).toContain("workspaceRouting:exportCsv");
    expect(source).toContain("workspaceRouting:clear");
  });

  it("preload exposes all 4 new Sprint 34 methods", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(source).toContain("workspaceRouting:providerComparison");
    expect(source).toContain("workspaceRouting:bucketChartSvg");
    expect(source).toContain("workspaceRouting:providerComparisonChartSvg");
    expect(source).toContain("workspaceRouting:exportHtmlReport");
  });

  it("dashboard contains chart and comparison panels", () => {
    const source = loadDashboardSurface();
    expect(source).toContain("Bucket Chart");
    expect(source).toContain("Provider Comparison");
    expect(source).toContain("Downloadable Report Artifact");
    expect(source).toContain("load-bucket-chart");
    expect(source).toContain("load-provider-comparison");
    expect(source).toContain("export-html-report");
  });

  it("dashboard preserves required compatibility strings", () => {
    const source = loadDashboardSurface();
    expect(source).toContain("Workspace Analytics");
    expect(source).toContain("Provider Trends");
    expect(source).toContain("Decision Timeline");
    expect(source).toContain("metric-success-rate");
    expect(source).toContain("metric-error-rate");
    expect(source).toContain("metric-latency");
    expect(source).toContain("workspaceRouting.analytics");
  });

  it("types.d.ts declares all new Sprint 34 operations", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(source).toContain("providerComparison:");
    expect(source).toContain("bucketChartSvg:");
    expect(source).toContain("providerComparisonChartSvg:");
    expect(source).toContain("exportHtmlReport:");
  });
});
