/**
 * tests/mcp/tool-handlers.test.ts
 *
 * Covers handleAskLocal, handleCodeReview, and handleListTools:
 *   - success path
 *   - error path (gateway/orchestrator throws)
 *   - handleCodeReview result.error branch
 *   - handleListTools static content
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any import that transitively loads these
// ---------------------------------------------------------------------------

const mockGatewayAsk = vi.fn();

vi.mock("../../src/llm/gateway.ts", () => ({
  gateway: { ask: (...args: unknown[]) => mockGatewayAsk(...args) },
}));

const mockRunOrchestrator = vi.fn();

vi.mock("../../src/agents/orchestrator.ts", () => ({
  runOrchestrator: (...args: unknown[]) => mockRunOrchestrator(...args),
}));

vi.mock("../../src/shared/logging/logger.ts", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Module under test -- imported AFTER mocks are hoisted
// ---------------------------------------------------------------------------

import {
  handleAskLocal,
  handleCodeReview,
  handleListTools,
} from "../../src/mcp/tool-handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAskLocalArgs(overrides = {}) {
  return { prompt: "What is 2+2?", ...overrides };
}

function makeCodeReviewArgs(overrides = {}) {
  return { filePath: "/workspace/src/foo.ts", ...overrides };
}

// ---------------------------------------------------------------------------
// handleAskLocal
// ---------------------------------------------------------------------------

describe("handleAskLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text content from gateway on success", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "The answer is 4." });

    const result = await handleAskLocal(makeAskLocalArgs());

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: "text", text: "The answer is 4." });
  });

  it("passes prompt, systemPrompt, and workspaceId to gateway", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "ok" });

    await handleAskLocal(
      makeAskLocalArgs({ systemPrompt: "Be concise", workspaceId: "ws-123" }),
    );

    const callArg = mockGatewayAsk.mock.calls[0][0];
    expect(callArg.prompt).toBe("What is 2+2?");
    expect(callArg.systemPrompt).toBe("Be concise");
    expect(callArg.workspaceId).toBe("ws-123");
    expect(callArg.constraints.privacyMode).toBe("local-only");
  });

  it("defaults workspaceId to 'mcp-local' when omitted", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "ok" });

    await handleAskLocal(makeAskLocalArgs());

    expect(mockGatewayAsk.mock.calls[0][0].workspaceId).toBe("mcp-local");
  });

  it("returns isError:true when gateway throws", async () => {
    mockGatewayAsk.mockRejectedValue(new Error("LLM unavailable"));

    const result = await handleAskLocal(makeAskLocalArgs());

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: LLM unavailable");
  });

  it("generates a unique requestId per call", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "ok" });

    await handleAskLocal(makeAskLocalArgs());
    await handleAskLocal(makeAskLocalArgs());

    const id1 = mockGatewayAsk.mock.calls[0][0].requestId;
    const id2 = mockGatewayAsk.mock.calls[1][0].requestId;
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
    // UUID v4 pattern
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// handleCodeReview
// ---------------------------------------------------------------------------

describe("handleCodeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns finalOutput text on success", async () => {
    mockRunOrchestrator.mockResolvedValue({
      finalOutput: "PASS: no issues found",
      error: null,
    });

    const result = await handleCodeReview(makeCodeReviewArgs());

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("PASS: no issues found");
  });

  it("passes filePath and workspaceId to runOrchestrator", async () => {
    mockRunOrchestrator.mockResolvedValue({ finalOutput: "ok", error: null });

    await handleCodeReview(
      makeCodeReviewArgs({ workspaceId: "ws-review" }),
    );

    expect(mockRunOrchestrator).toHaveBeenCalledWith(
      "code-review",
      { filePath: "/workspace/src/foo.ts" },
      "ws-review",
    );
  });

  it("defaults workspaceId to 'mcp-review' when omitted", async () => {
    mockRunOrchestrator.mockResolvedValue({ finalOutput: "ok", error: null });

    await handleCodeReview(makeCodeReviewArgs());

    expect(mockRunOrchestrator.mock.calls[0][2]).toBe("mcp-review");
  });

  it("returns isError:true when result.error is set", async () => {
    mockRunOrchestrator.mockResolvedValue({
      finalOutput: "",
      error: "file not found",
    });

    const result = await handleCodeReview(makeCodeReviewArgs());

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Review failed: file not found");
  });

  it("returns isError:true when runOrchestrator throws", async () => {
    mockRunOrchestrator.mockRejectedValue(new Error("orchestrator crash"));

    const result = await handleCodeReview(makeCodeReviewArgs());

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Review failed: orchestrator crash");
  });
});

// ---------------------------------------------------------------------------
// handleListTools
// ---------------------------------------------------------------------------

describe("handleListTools", () => {
  it("returns a text content item listing the three tools", async () => {
    const result = await handleListTools();

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const text = result.content[0].text;
    expect(text).toContain("ask-local");
    expect(text).toContain("code-review");
    expect(text).toContain("list-tools");
  });

  it("mentions planned tools in the output", async () => {
    const result = await handleListTools();
    expect(result.content[0].text).toContain("fix-sonar");
    expect(result.content[0].text).toContain("run-sprint");
  });

  it("never sets isError", async () => {
    const result = await handleListTools();
    expect(result.isError).toBeUndefined();
  });
});
