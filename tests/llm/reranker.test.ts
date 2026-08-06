import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: vi.fn(),
}));

import { rerankCandidates } from "../../src/llm/reranker.js";
import { embedTextBatch } from "../../src/knowledge/ingest/embedder.js";

describe("rerankCandidates fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RERANK_ENABLED = "true";
  });

  it("falls back to original order when embedder errors", async () => {
    vi.mocked(embedTextBatch).mockRejectedValue(new Error("service down"));

    const candidates = [
      { id: "a", content: "first", score: 0.9 },
      { id: "b", content: "second", score: 0.8 },
      { id: "c", content: "third", score: 0.7 },
    ];

    const res = await rerankCandidates("query", candidates, { topK: 2 });

    expect(res).toHaveLength(2);
    expect(res[0].id).toBe("a");
    expect(res[1].id).toBe("b");
  });
});
