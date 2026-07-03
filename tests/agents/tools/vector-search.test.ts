/**
 * tests/agents/tools/vector-search.test.ts
 *
 * Unit tests for src/agents/tools/vector-search.ts
 *
 * Covers:
 *   - Missing required arg `query` → { success: false, error: ... } without calling retrieval
 *   - Successful call maps results into numbered output
 *   - Empty results case returns a no-results message
 *   - string→number coercion of topK arg
 *   - topK defaults to 5 when absent
 *   - Thrown error from retrieval layer is caught and surfaced as ToolResult.error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockVectorSearch } = vi.hoisted(() => ({
  mockVectorSearch: vi.fn(),
}));

vi.mock("../../../src/shared/retrieval/vector-client", () => ({
  vectorSearch: (...args: unknown[]) => mockVectorSearch(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import { vectorSearchTool } from "../../../src/agents/tools/vector-search";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("vectorSearchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── metadata ───────────────────────────────────────────────────────────────

  it("has the correct tool name", () => {
    expect(vectorSearchTool.name).toBe("vector-search");
  });

  it("has a description that mentions Qdrant and usage syntax", () => {
    expect(vectorSearchTool.description).toContain("Qdrant");
    expect(vectorSearchTool.description).toContain("vector-search");
  });

  // ── missing required arg ───────────────────────────────────────────────────

  it("returns success:false when query arg is missing", async () => {
    const result = await vectorSearchTool.execute({});

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("vector-search");
    expect(result.output).toBe("");
    expect(result.error).toMatch(/Missing required arg: query/);
  });

  it("does NOT call vectorSearch when query is missing", async () => {
    await vectorSearchTool.execute({});

    expect(mockVectorSearch).not.toHaveBeenCalled();
  });

  it("returns success:false when query is empty string", async () => {
    const result = await vectorSearchTool.execute({ query: "" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Missing required arg: query/);
    expect(mockVectorSearch).not.toHaveBeenCalled();
  });

  // ── successful call ────────────────────────────────────────────────────────

  it("returns success:true with formatted results on successful search", async () => {
    mockVectorSearch.mockResolvedValueOnce([
      { score: 0.95, source: "src/foo.ts", text: "function foo()" },
      { score: 0.82, source: "src/bar.ts", text: "const bar = 1" },
    ]);

    const result = await vectorSearchTool.execute({ query: "how does foo work" });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("vector-search");
    expect(result.output).toContain("1.");
    expect(result.output).toContain("0.950");
    expect(result.output).toContain("src/foo.ts");
    expect(result.output).toContain("function foo()");
    expect(result.output).toContain("2.");
    expect(result.output).toContain("0.820");
    expect(result.output).toContain("src/bar.ts");
  });

  // ── empty results ──────────────────────────────────────────────────────────

  it("returns success:true with a no-results message when results array is empty", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    const result = await vectorSearchTool.execute({ query: "obscure query" });

    expect(result.success).toBe(true);
    expect(result.output).toContain("No matching results");
    expect(result.error).toBeUndefined();
  });

  // ── topK coercion ──────────────────────────────────────────────────────────

  it("coerces string topK to number before passing to vectorSearch", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    await vectorSearchTool.execute({ query: "test", topK: "10" });

    expect(mockVectorSearch).toHaveBeenCalledWith("test", 10);
    expect(typeof mockVectorSearch.mock.calls[0][1]).toBe("number");
  });

  it("defaults topK to 5 when arg is absent", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    await vectorSearchTool.execute({ query: "test" });

    expect(mockVectorSearch).toHaveBeenCalledWith("test", 5);
  });

  it("handles topK='1' (string '1' → number 1)", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    await vectorSearchTool.execute({ query: "test", topK: "1" });

    expect(mockVectorSearch).toHaveBeenCalledWith("test", 1);
  });

  // ── error from retrieval layer ─────────────────────────────────────────────

  it("catches thrown Error from vectorSearch and returns success:false", async () => {
    mockVectorSearch.mockRejectedValueOnce(new Error("Qdrant unreachable"));

    const result = await vectorSearchTool.execute({ query: "query" });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe("vector-search");
    expect(result.output).toBe("");
    expect(result.error).toMatch(/vector-search failed:/);
    expect(result.error).toContain("Qdrant unreachable");
  });

  it("catches non-Error thrown value and stringifies it", async () => {
    mockVectorSearch.mockRejectedValueOnce("plain string error");

    const result = await vectorSearchTool.execute({ query: "query" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("plain string error");
  });

  it("catches numeric thrown value and surfaces it as string", async () => {
    mockVectorSearch.mockRejectedValueOnce(503);

    const result = await vectorSearchTool.execute({ query: "query" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("503");
  });
});
