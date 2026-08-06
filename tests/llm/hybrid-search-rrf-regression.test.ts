/**
 * Regression tests for hybrid search RRF fusion and filter propagation.
 *
 * Issue #1: ID-space mismatch — qdrant-client.searchChunks() was returning
 *   Qdrant's internal point UUID as `id` instead of the semantic chunk_id
 *   stored in the payload.  Because lexical-index returns the raw chunk_id,
 *   fuseHybridResults() never saw the same id from both arms, so every chunk
 *   found by both arms was returned twice instead of being merged/boosted.
 *
 * Issue #3: Filters were forwarded to the lexical arm but NOT to the vector
 *   arm.  searchChunks() now accepts an optional `filters` argument and
 *   builds a Qdrant filter body from it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: vi.fn(),
}));
vi.mock("../../src/llm/qdrant-client.js", () => ({
  searchChunks: vi.fn(),
}));
vi.mock("../../src/llm/lexical-index.js", () => ({
  searchLexicalChunks: vi.fn(),
}));

import { fuseHybridResults, hybridSearchChunks } from "../../src/llm/hybrid-search.js";
import { embedTextBatch } from "../../src/knowledge/ingest/embedder.js";
import { searchChunks } from "../../src/llm/qdrant-client.js";
import { searchLexicalChunks } from "../../src/llm/lexical-index.js";

// ---------------------------------------------------------------------------
// fuseHybridResults — unit tests using realistic id shapes
// ---------------------------------------------------------------------------

describe("fuseHybridResults — RRF id-space regression", () => {
  it("merges a chunk found by both arms (ids match) instead of duplicating it", () => {
    // Realistic shape: vector arm now returns chunk_id strings (e.g.
    // "sprint-42-report:chunk:0"), matching what the lexical arm returns.
    const vectorHits = [
      { id: "sprint-42-report:chunk:0", path: "sprints/42.md", content: "foo", score: 0.9 },
      { id: "sprint-42-report:chunk:1", path: "sprints/42.md", content: "bar", score: 0.7 },
    ];
    const lexicalHits = [
      { id: "sprint-42-report:chunk:0", path: "sprints/42.md", content: "foo", score: 0.8 },
      { id: "sprint-43-report:chunk:0", path: "sprints/43.md", content: "baz", score: 0.6 },
    ];

    const fused = fuseHybridResults(vectorHits, lexicalHits);

    // 3 distinct chunk ids → 3 results, NOT 4 (which would happen if ids were mismatched)
    expect(fused).toHaveLength(3);
    const ids = fused.map((r) => r.id);
    expect(ids).toContain("sprint-42-report:chunk:0");
    expect(ids).toContain("sprint-42-report:chunk:1");
    expect(ids).toContain("sprint-43-report:chunk:0");
  });

  it("boosts the shared chunk above chunks found by only one arm", () => {
    // chunk:0 appears in both arms → highest RRF score
    // chunk:1 appears only in vector arm
    // chunk:2 appears only in lexical arm
    const vectorHits = [
      { id: "doc:chunk:0", content: "shared", score: 0.9 },
      { id: "doc:chunk:1", content: "vector-only", score: 0.8 },
    ];
    const lexicalHits = [
      { id: "doc:chunk:0", content: "shared", score: 0.85 },
      { id: "doc:chunk:2", content: "lexical-only", score: 0.7 },
    ];

    const fused = fuseHybridResults(vectorHits, lexicalHits, { rrfK: 60 });

    expect(fused[0].id).toBe("doc:chunk:0");
  });

  it("returns empty array when both arms return nothing", () => {
    expect(fuseHybridResults([], [])).toEqual([]);
  });

  it("handles vector-only results (lexical arm empty)", () => {
    const vectorHits = [
      { id: "a:chunk:0", content: "x", score: 0.9 },
    ];
    const fused = fuseHybridResults(vectorHits, []);
    expect(fused).toHaveLength(1);
    expect(fused[0].id).toBe("a:chunk:0");
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].lexicalRank).toBeNull();
  });

  it("handles lexical-only results (vector arm empty)", () => {
    const lexicalHits = [
      { id: "b:chunk:0", content: "y", score: 0.8 },
    ];
    const fused = fuseHybridResults([], lexicalHits);
    expect(fused).toHaveLength(1);
    expect(fused[0].id).toBe("b:chunk:0");
    expect(fused[0].vectorRank).toBeNull();
    expect(fused[0].lexicalRank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// hybridSearchChunks — filter propagation to the vector arm (issue #3)
// ---------------------------------------------------------------------------

describe("hybridSearchChunks — filter propagation regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedTextBatch).mockResolvedValue([[0.1, 0.2, 0.3]]);
  });

  it("passes filters to searchChunks (vector arm), not just to searchLexicalChunks", async () => {
    vi.mocked(searchChunks).mockResolvedValue([]);
    vi.mocked(searchLexicalChunks).mockResolvedValue([]);

    const filters = { source_type: "sprint_report", sprint: 42 };
    await hybridSearchChunks("some query", 5, filters);

    // Vector arm receives filters as 4th argument
    expect(vi.mocked(searchChunks)).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      5,
      0.4,
      filters,
    );
    // Lexical arm also receives filters
    expect(vi.mocked(searchLexicalChunks)).toHaveBeenCalledWith(
      "some query",
      5,
      filters,
    );
  });

  it("passes empty filters object when no filters supplied", async () => {
    vi.mocked(searchChunks).mockResolvedValue([]);
    vi.mocked(searchLexicalChunks).mockResolvedValue([]);

    await hybridSearchChunks("query");

    expect(vi.mocked(searchChunks)).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      expect.any(Number),
      {},
    );
    expect(vi.mocked(searchLexicalChunks)).toHaveBeenCalledWith(
      "query",
      expect.any(Number),
      {},
    );
  });

  it("only returns chunks matching the filter — no cross-filter results", async () => {
    // Simulate: vector arm returns only sprint_report chunks (filter respected)
    vi.mocked(searchChunks).mockResolvedValue([
      { id: "sprint-42-report:chunk:0", path: "s/42.md", content: "sprint content",
        source_type: "sprint_report", sprint: 42, score: 0.9,
        section: "", feature_area: "", source: "" },
    ]);
    vi.mocked(searchLexicalChunks).mockResolvedValue([
      { id: "sprint-42-report:chunk:0", path: "s/42.md", content: "sprint content",
        source_type: "sprint_report", sprint: 42, score: 0.85,
        section: "", feature_area: "", source: "" },
    ]);

    const result = await hybridSearchChunks("sprint query", 5, { source_type: "sprint_report" });

    // Only 1 distinct chunk (the shared one, merged by RRF)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sprint-42-report:chunk:0");
    expect(result[0].source_type).toBe("sprint_report");
  });
});
