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

import { hybridSearchChunks } from "../../src/llm/hybrid-search.js";
import { embedTextBatch } from "../../src/knowledge/ingest/embedder.js";
import { searchChunks } from "../../src/llm/qdrant-client.js";
import { searchLexicalChunks } from "../../src/llm/lexical-index.js";

describe("hybridSearchChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embedTextBatch).mockResolvedValue([[0.1, 0.2, 0.3]]);
  });

  it("fuses vector and lexical hits and returns sorted hybrid results", async () => {
    vi.mocked(searchChunks).mockResolvedValue([
      { id: "a", path: "pathA", content: "vector A", score: 0.9 },
      { id: "b", path: "pathB", content: "vector B", score: 0.8 },
    ]);
    vi.mocked(searchLexicalChunks).mockResolvedValue([
      { id: "b", path: "pathB", content: "lexical B", score: 0.7 },
      { id: "c", path: "pathC", content: "lexical C", score: 0.6 },
    ]);

    const result = await hybridSearchChunks("test query", 5);

    expect(vi.mocked(embedTextBatch)).toHaveBeenCalledWith(["test query"]);
    expect(vi.mocked(searchChunks)).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      5,
      0.4,
      {},
    );
    expect(vi.mocked(searchLexicalChunks)).toHaveBeenCalledWith(
      "test query",
      5,
      {},
    );
    expect(result).toHaveLength(3);
    expect(result.map((hit) => hit.id)).toEqual(["b", "a", "c"]);
    expect(result[0].source).toBe("pathB");
    expect(result[1].source).toBe("pathA");
    expect(result[2].source).toBe("pathC");
  });

  it("returns lexical-only results when vector search returns no hits", async () => {
    vi.mocked(searchChunks).mockResolvedValue([]);
    vi.mocked(searchLexicalChunks).mockResolvedValue([
      { id: "x", path: "pathX", content: "lexical X", score: 0.5 },
    ]);

    const result = await hybridSearchChunks("test query", 3);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("x");
  });
});
