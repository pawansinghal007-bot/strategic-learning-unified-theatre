/**
 * tests/agents/tools/retrieve.test.ts
 *
 * Unit tests for src/agents/tools/retrieve.ts
 *
 * Covers:
 *   - Missing required arg `query` → { success: false, error: ... } without calling retrieval
 *   - Successful vector search with formatted results
 *   - Successful code search with formatted results
 *   - Successful file search with raw content
 *   - Empty results for each strategy
 *   - Error handling from retrieval layer (result.error field)
 *   - Thrown error from retrieval layer is caught and surfaced as ToolResult.error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockRetrieve } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
}));

vi.mock("../../../src/shared/retrieval/router", () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import { retrieveTool } from "../../../src/agents/tools/retrieve";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("retrieveTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── metadata ───────────────────────────────────────────────────────────────

  it("has the correct tool name", () => {
    expect(retrieveTool.name).toBe("retrieve");
  });

  it("has a description that mentions automatic strategy selection and usage syntax", () => {
    expect(retrieveTool.description).toContain("retrieve");
    expect(retrieveTool.description).toContain("code|vector|file");
  });

  // ── missing required arg ───────────────────────────────────────────────────

  it("returns success:false when query arg is missing", async () => {
    const result = await retrieveTool.execute({});

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("retrieve");
    expect(result.output).toBe("");
    expect(result.error).toMatch(/Missing required arg: query/);
  });

  it("does NOT call retrieve when query is missing", async () => {
    await retrieveTool.execute({});

    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("returns success:false when query is empty string", async () => {
    const result = await retrieveTool.execute({ query: "" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing required arg: query/);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  // ── successful vector search ───────────────────────────────────────────────

  it("returns success:true with formatted vector results on successful search", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "vector",
      results: [
        { score: 0.95, source: "src/foo.ts", text: "function foo()" },
        { score: 0.82, source: "src/bar.ts", text: "const bar = 1" },
      ],
    });

    const result = await retrieveTool.execute({ query: "how does foo work" });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("retrieve");
    expect(result.output).toContain("1.");
    expect(result.output).toContain("0.950");
    expect(result.output).toContain("src/foo.ts");
    expect(result.output).toContain("function foo()");
    expect(result.output).toContain("2.");
    expect(result.output).toContain("0.820");
    expect(result.output).toContain("src/bar.ts");
  });

  it("returns success:true with a no-results message when vector results are empty", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "vector",
      results: [],
    });

    const result = await retrieveTool.execute({ query: "obscure query" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("No matching results in the vector store.");
  });

  // ── successful code search ─────────────────────────────────────────────────

  it("returns success:true with formatted code results on successful search", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "code",
      results: [
        {
          file: "src/agents/sub-agent.ts",
          line: 42,
          text: "export async function runSubAgent(",
        },
      ],
    });

    const result = await retrieveTool.execute({
      query: "runSubAgent",
      mode: "code",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("retrieve");
    expect(result.output).toContain("src/agents/sub-agent.ts:42:");
    expect(result.output).toContain("export async function runSubAgent(");
  });

  it("returns success:true with a no-results message when code results are empty", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "code",
      results: [],
    });

    const result = await retrieveTool.execute({
      query: "nothing",
      mode: "code",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches for "nothing".');
  });

  // ── successful symbol search ───────────────────────────────────────────────

  it("returns success:true with formatted symbol results when symbols are found", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "symbol",
      results: [
        {
          name: "runSubAgent",
          kind: "function",
          filePath: "src/agents/sub-agent.ts",
          startLine: 42,
          endLine: 68,
        },
      ],
    });

    const result = await retrieveTool.execute({
      query: "runSubAgent",
      mode: "symbol",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("retrieve");
    expect(result.output).toBe(
      "runSubAgent (function) at src/agents/sub-agent.ts:42-68",
    );
  });

  it("returns success:true with a no-symbol message when symbol results are empty", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "symbol",
      results: [],
    });

    const result = await retrieveTool.execute({
      query: "ghostFunction",
      mode: "symbol",
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('No symbol found for "ghostFunction".');
  });

  // ── successful file search ─────────────────────────────────────────────────

  it("returns success:true with raw file content on successful file search", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "file",
      results: "file contents here",
    });

    const result = await retrieveTool.execute({
      query: "/path/to/file.ts",
      mode: "file",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("retrieve");
    expect(result.output).toBe("file contents here");
  });

  // ── error handling ─────────────────────────────────────────────────────────

  it("returns success:false when retrieve returns error field", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "vector",
      error: "Qdrant connection refused",
    });

    const result = await retrieveTool.execute({ query: "query", topK: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "retrieve failed: Qdrant connection refused",
    );
  });

  it("returns success:false when retrieve throws", async () => {
    mockRetrieve.mockRejectedValueOnce(new Error("Router crash"));

    const result = await retrieveTool.execute({ query: "query", topK: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("retrieve failed: Router crash");
  });

  it("returns success:false when retrieve throws a non-Error value", async () => {
    mockRetrieve.mockRejectedValueOnce("Router crash");

    const result = await retrieveTool.execute({ query: "query", topK: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("retrieve failed: Router crash");
  });

  it("returns success:false when retrieve returns unknown strategy", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "bogus" as any,
      results: [],
    });

    const result = await retrieveTool.execute({ query: "query" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown strategy/);
  });
});
