import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  recordRoutingDecision,
  listRoutingHistoryForWorkspace,
  getWorkspaceRoutingSummary,
  clearRoutingHistoryForWorkspace,
  resetRoutingHistory,
} from "../src/llm/routing-history.js";

describe("Sprint 31 smoke tests — workspace routing history", () => {
  beforeEach(() => {
    resetRoutingHistory();
  });

  it("listRoutingHistoryForWorkspace returns only entries for the given workspace", () => {
    recordRoutingDecision({
      request: { requestId: "r1", workspaceId: "ws-a", prompt: "hello" },
      provider: "openai",
      model: "gpt-test",
      success: true,
      reason: "selected",
    });

    recordRoutingDecision({
      request: { requestId: "r2", workspaceId: "ws-b", prompt: "world" },
      provider: "gemini",
      model: "gemini-test",
      success: true,
      reason: "selected",
    });

    const result = listRoutingHistoryForWorkspace("ws-a");
    expect(result).toHaveLength(1);
    expect(result[0].workspaceId).toBe("ws-a");
    expect(result[0].provider).toBe("openai");
  });

  it("listRoutingHistoryForWorkspace returns empty array when no entries exist", () => {
    const result = listRoutingHistoryForWorkspace("ws-missing");
    expect(result).toEqual([]);
  });

  it("getWorkspaceRoutingSummary returns correct counts", () => {
    recordRoutingDecision({
      request: { requestId: "r3", workspaceId: "ws-sum", prompt: "a" },
      provider: "openai",
      model: "m1",
      success: true,
      reason: "ok",
    });

    recordRoutingDecision({
      request: { requestId: "r4", workspaceId: "ws-sum", prompt: "b" },
      provider: "openai",
      model: "m1",
      success: false,
      reason: "failed",
      errorMessage: "timeout",
    });

    recordRoutingDecision({
      request: { requestId: "r5", workspaceId: "ws-sum", prompt: "c" },
      provider: "groq",
      model: "m2",
      success: true,
      reason: "ok",
    });

    const summary = getWorkspaceRoutingSummary("ws-sum");
    expect(summary.workspaceId).toBe("ws-sum");
    expect(summary.total).toBe(3);
    expect(summary.successCount).toBe(2);
    expect(summary.failureCount).toBe(1);
    expect(summary.providerCounts.openai).toBe(2);
    expect(summary.providerCounts.groq).toBe(1);
    expect(summary.latest).not.toBeNull();
  });

  it("getWorkspaceRoutingSummary returns zero counts for unknown workspace", () => {
    const summary = getWorkspaceRoutingSummary("ws-empty");
    expect(summary.total).toBe(0);
    expect(summary.successCount).toBe(0);
    expect(summary.failureCount).toBe(0);
    expect(summary.latest).toBeNull();
  });

  it("clearRoutingHistoryForWorkspace removes only entries for that workspace", () => {
    recordRoutingDecision({
      request: { requestId: "r6", workspaceId: "ws-clear", prompt: "x" },
      provider: "local",
      model: "local-model",
      success: true,
      reason: "local",
    });

    recordRoutingDecision({
      request: { requestId: "r7", workspaceId: "ws-keep", prompt: "y" },
      provider: "local",
      model: "local-model",
      success: true,
      reason: "local",
    });

    const cleared = clearRoutingHistoryForWorkspace("ws-clear");
    expect(cleared).toBe(true);
    expect(listRoutingHistoryForWorkspace("ws-clear")).toEqual([]);
    expect(listRoutingHistoryForWorkspace("ws-keep")).toHaveLength(1);
  });

  it("clearRoutingHistoryForWorkspace returns false when no entries exist", () => {
    const cleared = clearRoutingHistoryForWorkspace("ws-nonexistent");
    expect(cleared).toBe(false);
  });
});

describe("Sprint 31 smoke tests — file existence", () => {
  it("workspace-routing-handlers.cjs exists", () => {
    expect(
      existsSync(
        join(process.cwd(), "electron-ui/ipc/workspace-routing-handlers.cjs"),
      ),
    ).toBe(true);
  });

  it("preload exposes workspaceRouting namespace", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(source).toContain('exposeInMainWorld("workspaceRouting"');
    expect(source).toContain("workspaceRouting:list");
    expect(source).toContain("workspaceRouting:summary");
    expect(source).toContain("workspaceRouting:clear");
  });

  it("main.cjs registers workspace routing handlers", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(source).toContain("registerWorkspaceRoutingHandlers");
  });

  it("dashboard contains unified workspace view", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(source).toContain("Unified Workspace View");
    expect(source).toContain("workspacePolicy.resolve");
    expect(source).toContain("workspaceContext.get");
    expect(source).toContain("workspaceRouting.summary");
    expect(source).toContain("workspaceRouting.list");
  });

  it("types.d.ts declares workspaceRouting on Window", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(source).toContain("workspaceRouting:");
  });
});
