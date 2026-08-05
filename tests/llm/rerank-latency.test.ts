import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: vi.fn(),
}));

import { rerankCandidates } from "../../src/llm/reranker.js";
import { embedTextBatch } from "../../src/knowledge/ingest/embedder.js";

describe("rerankCandidates latency (simulated)", () => {
  it("measures added latency for representative pool", async () => {
    process.env.RERANK_ENABLED = "true";
    const poolSize = 20;
    // Simulate embedding service taking ~150ms to return embeddings
    vi.mocked(embedTextBatch).mockImplementation(async (items) => {
      await new Promise((r) => setTimeout(r, 150));
      // Return simple vectors of small dimension
      return items.map(() => Array(32).fill(0.1));
    });

    const candidates = Array.from({ length: poolSize }).map((_, i) => ({
      id: `id-${i}`,
      content: `content ${i}`,
      score: Math.random(),
    }));

    const start = Date.now();
    const res = await rerankCandidates("representative query", candidates, {
      topK: 5,
      poolSize,
    });
    const ms = Date.now() - start;

    // Log measurement for human inspection in test output
    // eslint-disable-next-line no-console
    console.log(`rerank simulated latency: ${ms}ms for pool=${poolSize}`);

    expect(res).toHaveLength(5);
    expect(ms).toBeGreaterThanOrEqual(140);
  });
});
