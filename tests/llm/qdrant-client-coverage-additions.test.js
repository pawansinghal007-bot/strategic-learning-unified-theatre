/**
 * Coverage additions for qdrant-client.js
 *
 * Targets the uncovered sections:
 * - queryTopK() with rerank disabled (hybridSearchChunks returns results, no rerank)
 * - queryTopK() with rerank enabled (rerank succeeds)
 * - queryTopK() with reranker fallback (rerank throws, falls back to fused)
 * - queryTopK() with hybrid-search error (catch block)
 *
 * NOTE: qdrant-client uses DYNAMIC imports (await import("./hybrid-search.js")),
 * but vi.mock is hoisted by vitest so it still works.
 * The mock path must match the resolved path from the source file.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock at top level - vitest hoists these
vi.mock("../../src/llm/hybrid-search.js", () => ({
  hybridSearchChunks: vi.fn(),
}));

vi.mock("../../src/llm/reranker.js", () => ({
  rerankCandidates: vi.fn(),
}));

vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("qdrant-client coverage — queryTopK rerank disabled", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("RERANK_ENABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("returns results without reranking when rerank is false", async () => {
    const mockFusedResults = [
      { id: "point-1", score: 0.95, payload: { content: "result 1" } },
      { id: "point-2", score: 0.85, payload: { content: "result 2" } },
      { id: "point-3", score: 0.75, payload: { content: "result 3" } },
    ];

    (await import("../../src/llm/hybrid-search.js")).hybridSearchChunks.mockResolvedValue(mockFusedResults);

    const { queryTopK } = await import("../../src/llm/qdrant-client.js");
    const results = await queryTopK("test query", 2);

    expect(results).toEqual(mockFusedResults.slice(0, 2));
  });
});

describe("qdrant-client coverage — queryTopK rerank enabled", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("RERANK_ENABLED", "true");
    vi.stubEnv("RERANK_CANDIDATE_POOL", "30");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("returns reranked results when rerank is enabled and succeeds", async () => {
    const mockFusedResults = [
      { id: "point-1", score: 0.95, payload: { content: "result 1" } },
      { id: "point-2", score: 0.85, payload: { content: "result 2" } },
    ];
    const mockRerankedResults = [
      { id: "point-2", score: 0.98, payload: { content: "reranked result" } },
      { id: "point-1", score: 0.90, payload: { content: "result 1" } },
    ];

    (await import("../../src/llm/hybrid-search.js")).hybridSearchChunks.mockResolvedValue(mockFusedResults);
    (await import("../../src/llm/reranker.js")).rerankCandidates.mockResolvedValue(mockRerankedResults);

    const { queryTopK } = await import("../../src/llm/qdrant-client.js");
    const results = await queryTopK("test query", 2);

    expect(results).toEqual(mockRerankedResults);
  });
});

describe("qdrant-client coverage — queryTopK reranker fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("RERANK_ENABLED", "true");
    vi.stubEnv("RERANK_CANDIDATE_POOL", "30");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("falls back to fused results when reranker throws", async () => {
    const mockFusedResults = [
      { id: "point-1", score: 0.95, payload: { content: "result 1" } },
      { id: "point-2", score: 0.85, payload: { content: "result 2" } },
      { id: "point-3", score: 0.75, payload: { content: "result 3" } },
    ];

    (await import("../../src/llm/hybrid-search.js")).hybridSearchChunks.mockResolvedValue(mockFusedResults);
    (await import("../../src/llm/reranker.js")).rerankCandidates.mockRejectedValue(new Error("reranker service unavailable"));

    const { queryTopK } = await import("../../src/llm/qdrant-client.js");
    const results = await queryTopK("test query", 2);

    // Should fall back to fused results sliced to k
    expect(results).toEqual(mockFusedResults.slice(0, 2));
  });
});

describe("qdrant-client coverage — queryTopK hybrid-search error", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("RERANK_ENABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("returns empty array when hybrid search throws", async () => {
    (await import("../../src/llm/hybrid-search.js")).hybridSearchChunks.mockRejectedValue(new Error("hybrid search not supported"));

    const { queryTopK } = await import("../../src/llm/qdrant-client.js");
    const results = await queryTopK("test query", 5);

    expect(results).toEqual([]);
  });
});
