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
      execute: vi
        .fn()
        .mockResolvedValue({
          toolName: "read-file",
          success: true,
          output: "file contents",
        }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // Iteration 1: gateway.ask → tool-call response
    // executeToolCall internally calls gateway.ask again (the follow-up after injecting tool result)
    // Then `continue` re-runs the loop (iteration 2): gateway.ask → done-marker response
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="src/foo.ts"]')) // iteration 1 main call
      .mockReturnValueOnce(makeResponse("Tool follow-up text")) // executeToolCall's internal ask
      .mockReturnValueOnce(makeResponse("Reviewed the file. [DONE]")); // iteration 2

    const result = await runSubAgent(makeTask({ maxIterations: 5 }));

    expect(mockTool.execute).toHaveBeenCalledWith({ path: "src/foo.ts" });
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

  it("parses tool args with and without quotes", async () => {
    const mockTool = {
      name: "read-file",
      description: "reads a file",
      execute: vi
        .fn()
        .mockResolvedValue({
          toolName: "read-file",
          success: true,
          output: "ok",
        }),
    };
    mockGetTool.mockReturnValue(mockTool);

    mockGatewayAsk
      .mockReturnValueOnce(
        makeResponse('[TOOL:read-file path="quoted/path" flag=unquoted]'),
      )
      .mockReturnValueOnce(makeResponse("[DONE]"));

    await runSubAgent(makeTask({ maxIterations: 5 }));

    expect(mockTool.execute).toHaveBeenCalledWith({
      path: "quoted/path",
      flag: "unquoted",
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
        output: "src/foo.ts:10: const x = 1;",
      }),
    };
    mockGetTool.mockReturnValue(mockTool);

    // Iteration 1: tool call response → executeToolCall fires, then loop continues
    // The follow-up call (inside executeToolCall) returns some text
    // Iteration 2: done marker
    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:search-code pattern="const x"]'))
      .mockReturnValueOnce(makeResponse("found it")) // executeToolCall's follow-up
      .mockReturnValueOnce(makeResponse("Done. [DONE]")); // iteration 2

    await runSubAgent(makeTask({ maxIterations: 5 }));

    // The second gateway.ask call is inside executeToolCall — check its prompt
    const followUpPrompt: string = mockGatewayAsk.mock.calls[1][0].prompt;
    expect(followUpPrompt).toContain("[TOOL RESULT:search-code]");
    expect(followUpPrompt).toContain("src/foo.ts:10: const x = 1;");
    // Must NOT contain TOOL ERROR when success is true
    expect(followUpPrompt).not.toContain("[TOOL ERROR:");
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

    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="missing.ts"]'))
      .mockReturnValueOnce(makeResponse("ok"))
      .mockReturnValueOnce(makeResponse("[DONE]"));

    await runSubAgent(makeTask({ maxIterations: 5 }));

    const followUpPrompt: string = mockGatewayAsk.mock.calls[1][0].prompt;
    expect(followUpPrompt).toContain("[TOOL ERROR:read-file]");
    expect(followUpPrompt).toContain(
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

    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:read-file path="empty.ts"]'))
      .mockReturnValueOnce(makeResponse("ok"))
      .mockReturnValueOnce(makeResponse("[DONE]"));

    await runSubAgent(makeTask({ maxIterations: 5 }));

    const followUpPrompt: string = mockGatewayAsk.mock.calls[1][0].prompt;
    expect(followUpPrompt).toContain("[TOOL RESULT:read-file]");
    expect(followUpPrompt).not.toContain("[TOOL ERROR:");
  });

  it("feeds [TOOL ERROR:retrieve] into the follow-up prompt when retrieve fails", async () => {
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

    mockGatewayAsk
      .mockReturnValueOnce(makeResponse('[TOOL:retrieve query="test"]'))
      .mockReturnValueOnce(makeResponse("handled retrieve error")) // executeToolCall follow-up
      .mockReturnValueOnce(makeResponse("Finished. [DONE]"));

    await runSubAgent(makeTask({ maxIterations: 5 }));

    const followUpPrompt: string = mockGatewayAsk.mock.calls[1][0].prompt;
    expect(followUpPrompt).toContain("[TOOL ERROR:retrieve]");
    expect(followUpPrompt).toContain("Router failed: no strategy matched");
    // Must NOT contain TOOL RESULT when success is false
    expect(followUpPrompt).not.toContain("[TOOL RESULT:");
  });
});
