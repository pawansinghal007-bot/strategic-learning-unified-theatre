/**
 * Tests for qdrant-client.js queryTopK().
 *
 * queryTopK() now delegates entirely to hybridSearchChunks() (which composes
 * the vector and lexical search arms internally), so the correct mock target
 * is hybrid-search.js, not embedder.js + fetch directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/llm/hybrid-search.js", () => ({
  hybridSearchChunks: vi.fn(),
}));

import { queryTopK } from "../../src/llm/qdrant-client.js";
import { hybridSearchChunks } from "../../src/llm/hybrid-search.js";

describe("queryTopK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to hybridSearchChunks with the correct query and k", async () => {
    vi.mocked(hybridSearchChunks).mockResolvedValue([
      {
        id: "doc:chunk:0",
        path: "docs/a.md",
        source: "docs/a.md",
        content: "relevant chunk A",
        section: "",
        feature_area: "",
        sprint: 0,
        source_type: "markdown",
        score: 0.9,
      },
      {
        id: "doc:chunk:1",
        path: "docs/b.md",
        source: "docs/b.md",
        content: "relevant chunk B",
        section: "",
        feature_area: "",
        sprint: 0,
        source_type: "markdown",
        score: 0.7,
      },
    ]);

    const res = await queryTopK("what does X do", 5);

    expect(vi.mocked(hybridSearchChunks)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(hybridSearchChunks)).toHaveBeenCalledWith(
      "what does X do",
      5,
      {},
      expect.objectContaining({ scoreThreshold: expect.any(Number) }),
    );

    // queryTopK returns the hybrid results as-is
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ score: 0.9, content: "relevant chunk A" });
    expect(res[1]).toMatchObject({ score: 0.7, content: "relevant chunk B" });
  });

  it("returns [] when hybridSearchChunks throws", async () => {
    vi.mocked(hybridSearchChunks).mockRejectedValue(
      new Error("embedding service down"),
    );

    const res = await queryTopK("what", 5);

    expect(res).toEqual([]);
  });

  it("returns [] when hybridSearchChunks returns empty", async () => {
    vi.mocked(hybridSearchChunks).mockResolvedValue([]);

    const res = await queryTopK("query with no results", 5);

    expect(res).toEqual([]);
  });

  it("passes the VECTOR_SCORE_THRESHOLD env var as scoreThreshold when set", async () => {
    const original = process.env.VECTOR_SCORE_THRESHOLD;
    process.env.VECTOR_SCORE_THRESHOLD = "0.7";

    vi.mocked(hybridSearchChunks).mockResolvedValue([]);

    await queryTopK("test", 3);

    expect(vi.mocked(hybridSearchChunks)).toHaveBeenCalledWith(
      "test",
      3,
      {},
      expect.objectContaining({ scoreThreshold: 0.7 }),
    );

    if (original === undefined) {
      delete process.env.VECTOR_SCORE_THRESHOLD;
    } else {
      process.env.VECTOR_SCORE_THRESHOLD = original;
    }
  });
});
