/**
 * routing-history-coverage.test.ts
 *
 * Targets uncovered line in src/llm/routing-history.ts:
 *   358 — toTimelineEntry: severity="error" branch
 *         Condition: !item.success && item.errorMessage is truthy
 *         → severity is set to "error" (not "warning")
 *
 * Also ensures the severity="info" (success=true) and severity="warning"
 * (!success, no errorMessage) branches are explicitly exercised for completeness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock storage so we don't touch the filesystem
// ---------------------------------------------------------------------------
const mockHistory: any[] = [];

vi.mock("../../src/llm/storage.js", () => ({
  readJsonFile: vi.fn(() => [...mockHistory]),
  writeJsonFile: vi.fn((_, value: any[]) => {
    mockHistory.length = 0;
    mockHistory.push(...value);
  }),
}));

vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  recordRoutingDecision,
  getWorkspaceRoutingTimeline,
  getRoutingHistory,
  resetRoutingHistory,
} from "../../src/llm/routing-history.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(overrides: Record<string, any> = {}) {
  return {
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    workspaceId: "ws-test",
    intent: "coding",
    ...overrides,
  };
}

function recordDecision(overrides: Record<string, any> = {}) {
  recordRoutingDecision({
    request: makeRequest(),
    provider: "groq",
    model: "llama3-8b",
    success: true,
    reason: "default selection",
    latencyMs: 120,
    ...overrides,
  });
}

beforeEach(() => {
  mockHistory.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// toTimelineEntry — severity branches (line 358)
// ---------------------------------------------------------------------------
describe("getWorkspaceRoutingTimeline — toTimelineEntry severity branches (line 358)", () => {
  it("sets severity='info' when success=true", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-info" }),
      success: true,
    });

    const timeline = getWorkspaceRoutingTimeline("ws-info");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].severity).toBe("info");
  });

  it("sets severity='warning' when success=false and no errorMessage", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-warning" }),
      success: false,
      // errorMessage deliberately omitted
    });

    const timeline = getWorkspaceRoutingTimeline("ws-warning");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].severity).toBe("warning");
  });

  it("sets severity='error' when success=false AND errorMessage is set (line 358)", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-error" }),
      success: false,
      errorMessage: "Connection refused",
    });

    const timeline = getWorkspaceRoutingTimeline("ws-error");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].severity).toBe("error");
  });

  it("includes errorMessage in detail when present", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-detail" }),
      success: false,
      errorMessage: "ECONNREFUSED 127.0.0.1:8080",
    });

    const timeline = getWorkspaceRoutingTimeline("ws-detail");
    expect(timeline[0].detail).toContain("ECONNREFUSED 127.0.0.1:8080");
  });

  it("sets title to 'Failed on <provider>' when success=false", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-title" }),
      provider: "openai",
      success: false,
      errorMessage: "Rate limit exceeded",
    });

    const timeline = getWorkspaceRoutingTimeline("ws-title");
    expect(timeline[0].title).toBe("Failed on openai");
    expect(timeline[0].severity).toBe("error");
  });

  it("sets title to 'Routed to <provider>' when success=true", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-routed" }),
      provider: "gemini",
      success: true,
    });

    const timeline = getWorkspaceRoutingTimeline("ws-routed");
    expect(timeline[0].title).toBe("Routed to gemini");
    expect(timeline[0].severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// toTimelineEntry — detail field construction
// ---------------------------------------------------------------------------
describe("getWorkspaceRoutingTimeline — detail field construction", () => {
  it("includes reason in detail", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-reason", intent: "research" }),
      reason: "Perplexity selected for web research",
    });

    const timeline = getWorkspaceRoutingTimeline("ws-reason");
    expect(timeline[0].detail).toContain("reason=Perplexity selected for web research");
  });

  it("includes intent in detail when set", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-intent", intent: "summarization" }),
    });

    const timeline = getWorkspaceRoutingTimeline("ws-intent");
    expect(timeline[0].detail).toContain("intent=summarization");
  });

  it("excludes intent from detail when not set", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-no-intent", intent: undefined }),
    });

    const timeline = getWorkspaceRoutingTimeline("ws-no-intent");
    expect(timeline[0].detail).not.toContain("intent=");
  });

  it("includes fallbackFrom in detail when set", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-fallback" }),
      fallbackFrom: "groq",
    });

    const timeline = getWorkspaceRoutingTimeline("ws-fallback");
    expect(timeline[0].detail).toContain("fallbackFrom=groq");
  });

  it("includes latency in detail when set", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-latency" }),
      latencyMs: 250,
    });

    const timeline = getWorkspaceRoutingTimeline("ws-latency");
    expect(timeline[0].detail).toContain("latency=250ms");
  });
});

// ---------------------------------------------------------------------------
// toTimelineEntry — workspaceId handling
// ---------------------------------------------------------------------------
describe("getWorkspaceRoutingTimeline — workspaceId in entry", () => {
  it("sets workspaceId from item.workspaceId", () => {
    recordDecision({
      request: makeRequest({ workspaceId: "ws-id-check" }),
    });

    const timeline = getWorkspaceRoutingTimeline("ws-id-check");
    expect(timeline[0].workspaceId).toBe("ws-id-check");
  });

  it("sets workspaceId to null when item has no workspaceId", () => {
    // Record a decision without workspaceId, then read it back through
    // a workspace timeline query (it won't appear since it has no workspaceId)
    // Instead, test via getRoutingHistory + manual mock
    recordDecision({
      request: makeRequest({ workspaceId: undefined }),
    });

    // The history was recorded with workspaceId=undefined
    const history = getRoutingHistory(10);
    expect(history.length).toBeGreaterThan(0);
    // workspaceId may be undefined or null depending on JSON serialization
    const rec = history[0];
    expect(rec.workspaceId == null).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple decisions — mixed severities
// ---------------------------------------------------------------------------
describe("getWorkspaceRoutingTimeline — mixed severities in same workspace", () => {
  it("correctly assigns different severities to different entries", () => {
    const wsId = "ws-mixed";

    recordDecision({
      request: makeRequest({ workspaceId: wsId }),
      success: true,
    });
    recordDecision({
      request: makeRequest({ workspaceId: wsId }),
      success: false,
    });
    recordDecision({
      request: makeRequest({ workspaceId: wsId }),
      success: false,
      errorMessage: "Timeout",
    });

    const timeline = getWorkspaceRoutingTimeline(wsId);
    expect(timeline).toHaveLength(3);

    // Timeline is newest-first (unshift order from recordRoutingDecision)
    const severities = new Set(timeline.map((e) => e.severity));
    expect(severities).toContain("info");
    expect(severities).toContain("warning");
    expect(severities).toContain("error");
  });

  it("filters timeline to only the requested workspace", () => {
    recordDecision({ request: makeRequest({ workspaceId: "ws-A" }) });
    recordDecision({ request: makeRequest({ workspaceId: "ws-B" }) });
    recordDecision({
      request: makeRequest({ workspaceId: "ws-A" }),
      success: false,
      errorMessage: "A failed",
    });

    const timelineA = getWorkspaceRoutingTimeline("ws-A");
    const timelineB = getWorkspaceRoutingTimeline("ws-B");

    expect(timelineA).toHaveLength(2);
    expect(timelineB).toHaveLength(1);
    expect(timelineA.every((e) => e.workspaceId === "ws-A")).toBe(true);
    expect(timelineB[0].workspaceId).toBe("ws-B");
  });
});

// ---------------------------------------------------------------------------
// resetRoutingHistory
// ---------------------------------------------------------------------------
describe("resetRoutingHistory", () => {
  it("empties the history", () => {
    recordDecision({ request: makeRequest({ workspaceId: "ws-reset" }) });
    expect(getRoutingHistory(10).length).toBeGreaterThan(0);

    resetRoutingHistory();
    expect(getRoutingHistory(10)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// toTimelineEntry — timestamp field (uses timestamp ?? createdAt)
// ---------------------------------------------------------------------------
describe("getWorkspaceRoutingTimeline — timestamp field", () => {
  it("uses timestamp field when present", () => {
    recordDecision({ request: makeRequest({ workspaceId: "ws-ts" }) });

    const timeline = getWorkspaceRoutingTimeline("ws-ts");
    expect(typeof timeline[0].timestamp).toBe("number");
    expect(timeline[0].timestamp).toBeGreaterThan(0);
  });

  it("falls back to createdAt when timestamp is absent (fixture injection)", () => {
    // Inject a record directly into mockHistory that only has createdAt
    const createdAtMs = Date.now() - 5000;
    mockHistory.unshift({
      id: "route-fallback-ts",
      requestId: "req-fallback",
      workspaceId: "ws-fallback-ts",
      provider: "local",
      model: "local-model",
      intent: "coding",
      success: true,
      reason: "test",
      fallbackFrom: undefined,
      latencyMs: 100,
      createdAt: createdAtMs,
      timestamp: undefined, // no timestamp → should use createdAt
      errorMessage: undefined,
    });

    const timeline = getWorkspaceRoutingTimeline("ws-fallback-ts");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].timestamp).toBe(createdAtMs);
  });
});
