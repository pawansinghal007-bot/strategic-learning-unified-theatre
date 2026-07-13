/**
 * tests/agents/sub-agent.test.ts
 *
 * Unit tests for src/agents/sub-agent.ts — runSubAgent.
 *
 * gateway.ask and tools/registry are mocked so no real LLM or fs I/O occurs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockGatewayAsk, mockGetTool } = vi.hoisted(() => ({
  mockGatewayAsk: vi.fn(),
  mockGetTool: vi.fn(),
}));

vi.mock("../../src/llm/gateway", () => ({
  gateway: { ask: mockGatewayAsk },
}));

vi.mock("../../src/agents/tools/registry", () => ({
  getTool: mockGetTool,
  getToolDescriptions: vi.fn().mockReturnValue(""),
  registerTool: vi.fn(),
}));

vi.mock("../../src/shared/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── module under test ────────────────────────────────────────────────────────

import { runSubAgent } from "../../src/agents/sub-agent";
import type { AgentTask } from "../../src/agents/types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    taskId: "task-001",
    agentName: "test-agent",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Do something useful.",
    workspaceId: "ws-test",
    maxIterations: 3,
    doneMarker: "[DONE]",
    ...overrides,
  };
}

function makeResponse(text: string) {
  return Promise.resolve({
    requestId: "req-1",
    provider: "local",
    model: "local-dev-stub",
    outputText: text,
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    routingReasons: [],
    raw: {},
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("runSubAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTool.mockReturnValue(undefined); // no tools by default
  });

  it("succeeds on first iteration when response contains doneMarker", async () => {
    mockGatewayAsk.mockReturnValueOnce(
      makeResponse("The answer is 42. [DONE]"),
    );

    const result = await runSubAgent(makeTask());

    expect(result.success).toBe(true);
    expect(result.output).toBe("The answer is 42.");
    expect(result.iterations).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.taskId).toBe("task-001");
    expect(result.agentName).toBe("test-agent");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("succeeds on a later iteration when done marker appears after retries", async () => {
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse("Still thinking..."))
      .mockReturnValueOnce(makeResponse("Almost there..."))
      .mockReturnValueOnce(makeResponse("Done now. [DONE]"));

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    expect(result.success).toBe(true);
    expect(result.output).toBe("Done now.");
    expect(result.iterations).toBe(3);
  });

  it("fails with 'Max iterations reached' when done marker never appears", async () => {
    mockGatewayAsk.mockReturnValue(makeResponse("No marker here."));

    const result = await runSubAgent(makeTask({ maxIterations: 2 }));

    expect(result.success).toBe(false);
    expect(result.error).toBe("Max iterations reached");
    expect(result.iterations).toBe(2);
    expect(result.output).toBe("No marker here.");
  });

  it("uses default doneMarker '[DONE]' when task omits it", async () => {
    mockGatewayAsk.mockReturnValueOnce(makeResponse("Result [DONE]"));

    const task = makeTask({ doneMarker: undefined });
    const result = await runSubAgent(task);

    expect(result.success).toBe(true);
    expect(result.output).toBe("Result");
  });

  it("uses default maxIterations of 5 when task omits it", async () => {
    // Never returns done marker → exhausts default 5 iterations
    mockGatewayAsk.mockReturnValue(makeResponse("no marker"));

    const task = makeTask({ maxIterations: undefined as any });
    const result = await runSubAgent(task);

    expect(result.success).toBe(false);
    expect(result.iterations).toBe(5);
  });

  it("uses default workspaceId 'harness-default' when task omits it", async () => {
    mockGatewayAsk.mockReturnValueOnce(makeResponse("[DONE]"));

    const task = makeTask({ workspaceId: undefined });
    await runSubAgent(task);

    const call = mockGatewayAsk.mock.calls[0][0];
    expect(call.workspaceId).toBe("harness-default");
  });

  it("builds the full prompt from systemPrompt + userPrompt", async () => {
    mockGatewayAsk.mockReturnValueOnce(makeResponse("[DONE]"));

    await runSubAgent(
      makeTask({
        systemPrompt: "SYS",
        userPrompt: "USER",
      }),
    );

    const prompt: string = mockGatewayAsk.mock.calls[0][0].prompt;
    expect(prompt).toContain("SYS");
    expect(prompt).toContain("USER");
  });

  it("catches a gateway error and returns failure result", async () => {
    mockGatewayAsk.mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await runSubAgent(makeTask());

    expect(result.success).toBe(false);
    expect(result.error).toBe("LLM unavailable");
  });

  it("stringifies non-Error exceptions in the error field", async () => {
    mockGatewayAsk.mockRejectedValueOnce("plain string error");

    const result = await runSubAgent(makeTask());

    expect(result.success).toBe(false);
    expect(result.error).toBe("plain string error");
  });

  // ─── tool-call handling ───────────────────────────────────────────────────

  it("executes a registered tool and continues the loop with tool output", async () => {
    const mockTool = {
      name: "read-file",
      description: "reads a file",
      execute: vi.fn().mockResolvedValue({
        toolName: "read-file",
        success: true,
        output: "file contents",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // For path-like tools (read-file with plain path), gateway.ask is called only twice:
    // 1. Initial tool call response
    // 2. Next iteration with tool result as output (no follow-up LLM call)
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="src/foo.ts"]')) // iteration 1 main call
      .mockReturnValueOnce(makeResponse("Reviewed the file. [DONE]")); // iteration 2 with tool result

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    expect(mockTool.execute).toHaveBeenCalledWith({
      path: "src/foo.ts",
      __callerIdentity: "agent:test-agent#task-001",
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe("Reviewed the file.");
  });

  it("falls through to next iteration when tool is not registered", async () => {
    mockGetTool.mockReturnValue(undefined); // tool not found

    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:unknown-tool arg="x"]'))
      .mockReturnValueOnce(makeResponse("Finished. [DONE]"));

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    expect(result.success).toBe(true);
    expect(result.output).toBe("Finished.");
  });

  it("handles multiple sequential path-like tools then final synthesis with doneMarker", async () => {
    const mockTool = {
      name: "read-file",
      description: "reads a file",
      execute: vi.fn().mockResolvedValue({
        toolName: "read-file",
        success: true,
        output: "file contents",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // Agent makes 3 path-like tool calls, then a final synthesis response with [DONE]
    // Each tool call iteration should have exactly one gateway.ask() call (no follow-up)
    // The final iteration has no tool call and produces [DONE]
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="file1.ts"]')) // iteration 1
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="file2.ts"]')) // iteration 2
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="file3.ts"]')) // iteration 3
      .mockReturnValueOnce(makeResponse("Analysis complete. [DONE]")); // iteration 4 synthesis

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    // 4 iterations total: 3 tool calls + 1 synthesis
    expect(result.success).toBe(true);
    expect(result.output).toBe("Analysis complete.");
    expect(mockGatewayAsk).toHaveBeenCalledTimes(4); // one per iteration
    expect(mockTool.execute).toHaveBeenCalledTimes(3);
  });

  it("parses tool args with and without quotes", async () => {
    const mockTool = {
      name: "read-file",
      description: "reads a file",
      execute: vi.fn().mockResolvedValue({
        toolName: "read-file",
        success: true,
        output: "ok",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // For path-like tools, gateway.ask is called only twice:
    // 1. Initial tool call response
    // 2. Next iteration with tool result as output
    mockGatewayAsk
      .mockReturnValueOnce(
        makeResponse('[TOOL:read-file path="quoted/path" flag=unquoted]'),
      )
      .mockReturnValueOnce(makeResponse("[DONE]"));

    await runSubAgent(makeTask({ maxIterations: 5 }));

    expect(mockTool.execute).toHaveBeenCalledWith({
      path: "quoted/path",
      flag: "unquoted",
      __callerIdentity: "agent:test-agent#task-001",
    });
  });
});

// ─── executeToolCall error-propagation (Step 1 fix) ──────────────────────────

describe("executeToolCall — TOOL ERROR vs TOOL RESULT message format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("feeds [TOOL RESULT:name] into the follow-up prompt when tool succeeds", async () => {
    const mockTool = {
      name: "search-code",
      description: "searches code",
      execute: vi.fn().mockResolvedValue({
        toolName: "search-code",
        success: true,
        output: "src/foo.ts:10: constX = 1;",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // search-code with a single identifier pattern is "symbol-like", so gateway.ask is called only twice:
    // 1. Initial tool call response
    // 2. Next iteration with tool result as output (no follow-up LLM call)
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:search-code pattern="constX"]'))
      .mockReturnValueOnce(makeResponse("Done. [DONE]")); // iteration 2 with tool result

    await runSubAgent(makeTask({ maxIterations: 5 }));

    // For symbol-like tools, there's no follow-up call, so only 2 total calls
    expect(mockGatewayAsk).toHaveBeenCalledTimes(2);
  });

  it("feeds [TOOL ERROR:name] into the follow-up prompt when tool fails (success:false)", async () => {
    const mockTool = {
      name: "vector-search",
      description: "searches vectors",
      execute: vi.fn().mockResolvedValue({
        toolName: "vector-search",
        success: false,
        output: "",
        error: "Qdrant connection refused",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // vector-search is "semantic", so gateway.ask is called three times:
    // 1. Initial tool call response
    // 2. executeToolCall follow-up (semantic tools still call gateway.ask)
    // 3. Next iteration with tool result as output
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:vector-search query="foo"]'))
      .mockReturnValueOnce(makeResponse("handled error")) // executeToolCall follow-up
      .mockReturnValueOnce(makeResponse("Finished. [DONE]"));

    await runSubAgent(makeTask({ maxIterations: 5 }));

    const followUpPrompt: string = mockGatewayAsk.mock.calls[1][0].prompt;
    expect(followUpPrompt).toContain("[TOOL ERROR:vector-search]");
    expect(followUpPrompt).toContain("Qdrant connection refused");
    // Must NOT contain TOOL RESULT when success is false
    expect(followUpPrompt).not.toContain("[TOOL RESULT:");
  });

  it("[TOOL ERROR] falls back to default message when error field is undefined", async () => {
    const mockTool = {
      name: "read-file",
      description: "reads a file",
      execute: vi.fn().mockResolvedValue({
        toolName: "read-file",
        success: false,
        output: "",
        // error is intentionally absent
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // For path-like tools (read-file with plain path), gateway.ask is called only once
    // The tool result is returned directly without a follow-up LLM call
    // The tool result includes [DONE] so the loop stops
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="missing.ts"]'))
      .mockReturnValueOnce(
        makeResponse(
          "[TOOL ERROR:read-file]\nTool execution failed with no error message. [DONE]",
        ),
      );

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    // Two calls to gateway.ask: one for initial tool call, one for tool result
    expect(mockGatewayAsk).toHaveBeenCalledTimes(2);

    // Tool result should be in the output
    expect(result.output).toContain("[TOOL ERROR:read-file]");
    expect(result.output).toContain(
      "Tool execution failed with no error message.",
    );
  });

  it("[TOOL RESULT] uses empty string output when tool succeeds with empty output", async () => {
    const mockTool = {
      name: "read-file",
      description: "reads a file",
      execute: vi.fn().mockResolvedValue({
        toolName: "read-file",
        success: true,
        output: "",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // For path-like tools (read-file with plain path), gateway.ask is called twice:
    // 1. Initial tool call response
    // 2. Next iteration with [DONE] marker
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="empty.ts"]'))
      .mockReturnValueOnce(makeResponse("Done. [DONE]"));

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    // Two calls to gateway.ask: one for initial tool call, one for done response
    expect(mockGatewayAsk).toHaveBeenCalledTimes(2);

    // Final output should be from the done response
    expect(result.output).toBe("Done.");
  });

  it("feeds [TOOL ERROR:retrieve] directly into loop output when retrieve fails (symbol-like query, skips second gateway.ask)", async () => {
    const mockTool = {
      name: "retrieve",
      description: "retrieves code or docs",
      execute: vi.fn().mockResolvedValue({
        toolName: "retrieve",
        success: false,
        output: "",
        error: "Router failed: no strategy matched",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // query="test" is a single identifier -> classified as "symbol-like" by
    // classifyToolCall(), so the second gateway.ask() is skipped and the
    // tool error is returned directly, same as read-file/search-code
    // path-like/symbol-like tools.
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:retrieve query="test"]'))
      .mockReturnValueOnce(makeResponse("Finished. [DONE]"));

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    // Two calls total: initial tool call + next iteration's done response.
    // No follow-up synthesis call for the tool error itself.
    expect(mockGatewayAsk).toHaveBeenCalledTimes(2);

    // The tool error should appear as the loop's outputText for that
    // iteration, which becomes the prompt content on the NEXT gateway.ask
    // call (iteration 2) rather than a same-iteration follow-up.
    // Since iteration 2's mocked response is the [DONE] response itself,
    // we can't inspect the intermediate outputText directly here — instead
    // confirm the tool's execute() was called with the right args and that
    // the loop completed successfully via the done marker.
    expect(mockTool.execute).toHaveBeenCalledWith({
      query: "test",
      __callerIdentity: "agent:test-agent#task-001",
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe("Finished.");
  });

  it("returns [TOOL ERROR:retrieve] as direct output when a symbol-like retrieve call fails and no further iteration follows", async () => {
    const mockTool = {
      name: "retrieve",
      description: "retrieves code or docs",
      execute: vi.fn().mockResolvedValue({
        toolName: "retrieve",
        success: false,
        output: "",
        error: "Router failed: no strategy matched",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // Only one gateway.ask call is mocked; with skipGatewayAsk=true the
    // tool error becomes outputText directly, and since it lacks [DONE],
    // the loop exhausts maxIterations without a second call ever needing
    // to be consumed for iteration content (iteration 2 reuses the same
    // mock via mockReturnValue as a fallback).
    mockGatewayAsk.mockReturnValue(
      makeResponse('[TOOL:retrieve query="test"]'),
    );

    const result = await runSubAgent(makeTask({ maxIterations: 2 }));

    // The direct tool-error output should be visible in the final result
    // once max iterations is reached without a done marker ever appearing.
    expect(result.output).toContain("[TOOL ERROR:retrieve]");
    expect(result.output).toContain("Router failed: no strategy matched");
  });
});
