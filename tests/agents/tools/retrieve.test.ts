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

const { mockExecuteRetrieve } = vi.hoisted(() => ({
  mockExecuteRetrieve: vi.fn(),
}));

vi.mock("../../../src/shared/retrieval/execute-retrieve.js", () => ({
  executeRetrieve: (...args: unknown[]) => mockExecuteRetrieve(...args),
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

  it("does NOT call executeRetrieve when query is missing", async () => {
    await retrieveTool.execute({});

    expect(mockExecuteRetrieve).not.toHaveBeenCalled();
  });

  it("returns success:false when query is empty string", async () => {
    const result = await retrieveTool.execute({ query: "" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing required arg: query/);
    expect(mockExecuteRetrieve).not.toHaveBeenCalled();
  });

  // ── successful vector search ───────────────────────────────────────────────

  it("returns success:true with formatted vector results on successful search", async () => {
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: "1. src/foo.ts (0.950)\nfunction foo()\n2. src/bar.ts (0.820)\nconst bar = 1",
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
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: "No matching results in the vector store.",
    });

    const result = await retrieveTool.execute({ query: "obscure query" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("No matching results in the vector store.");
  });

  // ── successful code search ─────────────────────────────────────────────────

  it("returns success:true with formatted code results on successful search", async () => {
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: "src/agents/sub-agent.ts:42: export async function runSubAgent(",
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
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: 'No matches for "nothing".',
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
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: "runSubAgent (function) at src/agents/sub-agent.ts:42-68",
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
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: 'No symbol found for "ghostFunction".',
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
    mockExecuteRetrieve.mockResolvedValueOnce({
      text: "file contents here",
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

  it("returns success:false when executeRetrieve returns error field", async () => {
    mockExecuteRetrieve.mockResolvedValueOnce({
      error: "retrieve failed: Qdrant connection refused",
    });

    const result = await retrieveTool.execute({ query: "query", topK: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "retrieve failed: Qdrant connection refused",
    );
  });

  it("returns success:false when executeRetrieve throws an Error instance", async () => {
    mockExecuteRetrieve.mockRejectedValueOnce(new Error("Router crash"));

    const result = await retrieveTool.execute({ query: "query", topK: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("retrieve failed: Router crash");
  });

  it("returns success:false when executeRetrieve throws a non-Error string", async () => {
    mockExecuteRetrieve.mockRejectedValueOnce("Router crash");

    const result = await retrieveTool.execute({ query: "query", topK: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("retrieve failed: Router crash");
  });
});
