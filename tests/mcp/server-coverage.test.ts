/**
 * tests/mcp/server-coverage.test.ts
 *
 * Covers the uncovered lines in src/mcp/server.ts:
 *   - lines 28-29: logger.info + return handleAskLocal inside ask-local callback
 *   - lines 41-42: logger.info + return handleCodeReview inside code-review callback
 *   - lines 53-54: logger.info + return handleListTools inside list-tools callback
 *   - lines 67-68: main() body — StdioServerTransport construction + server.connect
 *
 * Strategy: extract the registered tool callbacks from the server's internal
 * _registeredTools map and invoke them directly so the callback bodies
 * execute and are counted by v8 coverage.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — same pattern as server.test.ts
// ---------------------------------------------------------------------------

const { mockConnect } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(function (this: any) {
    this._mock = true;
  }),
}));

vi.mock("../../src/shared/logging/logger.ts", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/llm/gateway.ts", () => ({
  gateway: { ask: vi.fn() },
}));

vi.mock("../../src/agents/orchestrator.ts", () => ({
  runOrchestrator: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@modelcontextprotocol/sdk/server/mcp.js")
  >();
  const OriginalMcpServer = original.McpServer;
  class PatchedMcpServer extends OriginalMcpServer {
    override connect(_transport: unknown): Promise<void> {
      return mockConnect(_transport);
    }
  }
  return { ...original, McpServer: PatchedMcpServer };
});

// Stub tool handlers to avoid real LLM calls
vi.mock("../../src/mcp/tool-handlers.ts", () => ({
  handleAskLocal: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "ask-local stub response" }],
  }),
  handleCodeReview: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "code-review stub response" }],
  }),
  handleListTools: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "list-tools stub response" }],
  }),
}));

// ---------------------------------------------------------------------------
// Module under test — imported after mocks
// ---------------------------------------------------------------------------

import { server } from "../../src/mcp/server.ts";
import { logger } from "../../src/shared/logging/logger.ts";
import {
  handleAskLocal,
  handleCodeReview,
  handleListTools,
} from "../../src/mcp/tool-handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a registered tool's handler from the server's internal map.
 *  The MCP SDK stores the callback under the key `handler` (not `callback`).
 */
function getToolCallback(name: string): (...args: any[]) => Promise<any> {
  const registeredTools = (server as any)._registeredTools as Record<
    string,
    { handler?: (...args: any[]) => Promise<any> }
  >;
  const tool = registeredTools[name];
  if (!tool?.handler) {
    throw new Error(`No handler found for tool: ${name}`);
  }
  return tool.handler;
}

// ---------------------------------------------------------------------------
// Tests: invoke each tool callback to cover lines 28-29, 41-42, 53-54
// ---------------------------------------------------------------------------

describe("MCP server tool callbacks — coverage of callback bodies", () => {
  it("ask-local callback: logs mcp.tool-call and delegates to handleAskLocal", async () => {
    const callback = getToolCallback("ask-local");

    const args = { prompt: "What is 2+2?" };
    const result = await callback(args);

    expect(logger.info).toHaveBeenCalledWith("mcp.tool-call", {
      tool: "ask-local",
    });
    expect(handleAskLocal).toHaveBeenCalledWith(args);
    expect(result.content[0].text).toBe("ask-local stub response");
  });

  it("code-review callback: logs mcp.tool-call and delegates to handleCodeReview", async () => {
    const callback = getToolCallback("code-review");

    const args = { filePath: "src/foo.ts" };
    const result = await callback(args);

    expect(logger.info).toHaveBeenCalledWith("mcp.tool-call", {
      tool: "code-review",
    });
    expect(handleCodeReview).toHaveBeenCalledWith(args);
    expect(result.content[0].text).toBe("code-review stub response");
  });

  it("list-tools callback: logs mcp.tool-call and delegates to handleListTools", async () => {
    const callback = getToolCallback("list-tools");

    const result = await callback();

    expect(logger.info).toHaveBeenCalledWith("mcp.tool-call", {
      tool: "list-tools",
    });
    expect(handleListTools).toHaveBeenCalled();
    expect(result.content[0].text).toBe("list-tools stub response");
  });
});

describe("MCP server startup — coverage of main() lines 67-68", () => {
  it("called server.connect with a StdioServerTransport on module load", () => {
    // main() is called at module evaluation time; mockConnect captures the call.
    expect(mockConnect).toHaveBeenCalledTimes(1);
    const transport = mockConnect.mock.calls[0][0];
    expect(transport).toBeDefined();
    // Confirm logger.info was called for mcp.server.started (line 60)
    expect(logger.info).toHaveBeenCalledWith("mcp.server.started", {
      name: "unified-theatre-local-llm",
    });
  });
});
