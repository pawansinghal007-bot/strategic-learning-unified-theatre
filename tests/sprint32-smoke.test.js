import { existsSync, readFileSync } from "fs";
import { loadDashboardSurface } from './dashboard-loader.js';
import { join } from "path";
import {
  recordRoutingDecision,
  getWorkspaceRoutingSummary,
  getWorkspaceProviderTrends,
  getWorkspaceRoutingTimeline,
  getWorkspaceAnalytics,
  resetRoutingHistory,
} from "../src/llm/routing-history.js";

describe("Sprint 32 smoke tests — analytics math", () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it("computes successRate, errorRate, and avgLatencyMs", () => {
    recordRoutingDecision({
      request: { requestId: "a1", workspaceId: "ws-math", prompt: "x" },
      provider: "openai",
      model: "gpt",
      success: true,
      reason: "policy",
      latencyMs: 100,
    });

    recordRoutingDecision({
      request: { requestId: "a2", workspaceId: "ws-math", prompt: "x" },
      provider: "openai",
      model: "gpt",
      success: false,
      reason: "fallback",
      latencyMs: 300,
      errorMessage: "timeout",
    });

    const summary = getWorkspaceRoutingSummary("ws-math");
    expect(summary.total).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.failureCount).toBe(1);
    expect(summary.successRate).toBe(50);
    expect(summary.errorRate).toBe(50);
    expect(summary.avgLatencyMs).toBe(200);
  });

  it("returns zero metrics for empty workspace", () => {
    const summary = getWorkspaceRoutingSummary("ws-empty");
    expect(summary.total).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.errorRate).toBe(0);
    expect(summary.avgLatencyMs).toBe(0);
    expect(summary.latest).toBeNull();
  });

  it("getWorkspaceProviderTrends returns sorted trend points", () => {
    for (let i = 0; i < 3; i++) {
      recordRoutingDecision({
        request: { requestId: `b${i}`, workspaceId: "ws-trends", prompt: "x" },
        provider: "groq",
        model: "m1",
        success: true,
        reason: "fastest",
        latencyMs: 80,
      });
    }

    recordRoutingDecision({
      request: { requestId: "b3", workspaceId: "ws-trends", prompt: "x" },
      provider: "local",
      model: "m2",
      success: false,
      reason: "fallback",
      latencyMs: 220,
      errorMessage: "down",
    });

    const trends = getWorkspaceProviderTrends("ws-trends");
    expect(trends[0].provider).toBe("groq");
    expect(trends[0].count).toBe(3);
    expect(trends[0].successCount).toBe(3);
    expect(trends[0].failureCount).toBe(0);
    expect(trends[0].avgLatencyMs).toBe(80);
    expect(trends[1].provider).toBe("local");
    expect(trends[1].failureCount).toBe(1);
  });

  it("getWorkspaceRoutingTimeline returns human-readable entries", () => {
    recordRoutingDecision({
      request: {
        requestId: "c1",
        workspaceId: "ws-timeline",
        prompt: "x",
        intent: "research",
      },
      provider: "perplexity",
      model: "sonar",
      success: false,
      reason: "fallback",
      fallbackFrom: "groq",
      latencyMs: 420,
      errorMessage: "provider down",
    });

    const timeline = getWorkspaceRoutingTimeline("ws-timeline");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].title).toContain("Failed on perplexity");
    expect(timeline[0].detail).toContain("reason=fallback");
    expect(timeline[0].detail).toContain("fallbackFrom=groq");
    expect(timeline[0].detail).toContain("error=provider down");
    expect(timeline[0].severity).toBe("error");
  });

  it("getWorkspaceRoutingTimeline marks success entries as info", () => {
    recordRoutingDecision({
      request: { requestId: "d1", workspaceId: "ws-info", prompt: "x" },
      provider: "gemini",
      model: "flash",
      success: true,
      reason: "preset",
      latencyMs: 150,
    });

    const timeline = getWorkspaceRoutingTimeline("ws-info");
    expect(timeline[0].title).toContain("Routed to gemini");
    expect(timeline[0].severity).toBe("info");
  });

  it("getWorkspaceAnalytics returns all three payloads", () => {
    recordRoutingDecision({
      request: { requestId: "e1", workspaceId: "ws-all", prompt: "x" },
      provider: "local",
      model: "llama",
      success: true,
      reason: "private",
      latencyMs: 250,
    });

    const analytics = getWorkspaceAnalytics("ws-all");
    expect(analytics.summary.workspaceId).toBe("ws-all");
    expect(analytics.summary.total).toBe(1);
    expect(Array.isArray(analytics.trends)).toBe(true);
    expect(analytics.trends[0].provider).toBe("local");
    expect(Array.isArray(analytics.timeline)).toBe(true);
    expect(analytics.timeline[0].severity).toBe("info");
  });
});

describe("Sprint 32 smoke tests — file surface", () => {
  it("preload exposes trends/timeline/analytics methods", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(source).toContain("workspaceRouting:trends");
    expect(source).toContain("workspaceRouting:timeline");
    expect(source).toContain("workspaceRouting:analytics");
  });

  it("workspace-routing-handlers.cjs imports from src/ not dist/", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-routing-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("../../src/llm/routing-history.js");
    expect(source).not.toContain("../../dist/llm/routing-history");
  });

  it("workspace-routing-handlers.cjs registers all 6 channels", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-routing-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("workspaceRouting:list");
    expect(source).toContain("workspaceRouting:summary");
    expect(source).toContain("workspaceRouting:trends");
    expect(source).toContain("workspaceRouting:timeline");
    expect(source).toContain("workspaceRouting:analytics");
    expect(source).toContain("workspaceRouting:clear");
  });

  it("dashboard includes analytics and explainability sections", () => {
    const source = loadDashboardSurface();
    expect(source).toContain("Workspace Analytics");
    expect(source).toContain("Provider Trends");
    expect(source).toContain("Decision Timeline");
    expect(source).toContain("metric-success-rate");
    expect(source).toContain("metric-error-rate");
    expect(source).toContain("metric-latency");
    expect(source).toContain("workspaceRouting.analytics");
  });

  it("types.d.ts declares trends/timeline/analytics on workspaceRouting", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(source).toContain("trends:");
    expect(source).toContain("timeline:");
    expect(source).toContain("analytics:");
    expect(source).toContain("successRate:");
    expect(source).toContain("avgLatencyMs:");
    expect(source).toContain("errorRate:");
  });
});
