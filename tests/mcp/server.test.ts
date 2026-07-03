/**
 * tests/mcp/server.test.ts
 *
 * Verifies the McpServer registration shape after migration:
 *   - all three tools are registered with the correct names
 *   - each tool carries the expected description
 *   - each tool has an inputSchema (SDK generates from the Zod shape)
 *   - each tool is enabled by default
 *   - the server connects via StdioServerTransport on startup
 *
 * The StdioServerTransport is mocked so the top-level `await main()` in
 * server.ts completes without touching stdin/stdout.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// vi.mock factories are hoisted to the top of the file by Vitest's transformer,
// so any variables they close over must also be hoisted — otherwise they land
// in the temporal dead zone and are `undefined` when the factory executes.
const { mockConnect } = vi.hoisted(() => ({
  mockConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(function (this: any) {
    this._mock = true;
  }),
}));

// Silence logger output during tests
vi.mock("../../src/shared/logging/logger.ts", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub heavy dependencies pulled in transitively by tool-handlers
vi.mock("../../src/llm/gateway.ts", () => ({
  gateway: { ask: vi.fn() },
}));

vi.mock("../../src/agents/orchestrator.ts", () => ({
  runOrchestrator: vi.fn(),
}));

// Patch McpServer.connect so the top-level await main() doesn't hang
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

// ---------------------------------------------------------------------------
// Module under test — imported after all mocks
// ---------------------------------------------------------------------------

import { server } from "../../src/mcp/server.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MCP server registration (McpServer)", () => {
  // Cast to access internal map — intentional for white-box registration test
  const registered = (server as any)._registeredTools as Record<
    string,
    { description: string; inputSchema: unknown; enabled: boolean }
  >;

  it("registers exactly the five expected tools", () => {
    const names = Object.keys(registered).sort();
    expect(names).toEqual(["ask-local", "code-review", "list-tools", "search-code", "vector-search"]);
  });

  it("ask-local is enabled and has a description mentioning local LLM", () => {
    const tool = registered["ask-local"];
    expect(tool.enabled).toBe(true);
    expect(tool.description).toMatch(/local LLM/i);
    expect(tool.description).toMatch(/paid API/i);
  });

  it("ask-local has an inputSchema generated from its Zod shape", () => {
    expect(registered["ask-local"].inputSchema).toBeDefined();
  });

  it("code-review is enabled and has a description mentioning code review", () => {
    const tool = registered["code-review"];
    expect(tool.enabled).toBe(true);
    expect(tool.description).toMatch(/code review/i);
    expect(tool.description).toMatch(/PASS\/FAIL/i);
  });

  it("code-review has an inputSchema generated from its Zod shape", () => {
    expect(registered["code-review"].inputSchema).toBeDefined();
  });

  it("list-tools is enabled and has a description mentioning pipeline", () => {
    const tool = registered["list-tools"];
    expect(tool.enabled).toBe(true);
    expect(tool.description).toMatch(/pipeline/i);
  });

  it("list-tools inputSchema is defined (empty shape still generates a schema)", () => {
    // An empty ZodRawShapeCompat {} still produces an inputSchema object
    expect(registered["list-tools"].inputSchema).toBeDefined();
  });

  it("connected StdioServerTransport on startup", () => {
    // server.ts does `await main()` at module level; main() calls server.connect()
    expect(mockConnect).toHaveBeenCalledTimes(1);
    const transport = mockConnect.mock.calls[0][0];
    // The mock transport instance was passed through
    expect(transport).toBeDefined();
  });
});

describe("No Server (deprecated class) import", () => {
  it("server.ts does not import Server from sdk/server/index.js", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const content = readFileSync(
      resolve(process.cwd(), "src/mcp/server.ts"),
      "utf8",
    );
    // Must not import the deprecated Server class
    expect(content).not.toMatch(/from ["']@modelcontextprotocol\/sdk\/server\/index\.js["']/);
    // Must use McpServer
    expect(content).toMatch(/McpServer/);
    // NOSONAR comment must be gone
    expect(content).not.toMatch(/NOSONAR/);
  });
});
