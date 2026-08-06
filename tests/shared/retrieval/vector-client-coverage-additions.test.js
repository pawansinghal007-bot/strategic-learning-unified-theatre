/**
 * Coverage additions for vector-client.ts
 *
 * Targets the uncovered sections:
 * - embed() — delegates to embedText; tests pass-through and error propagation
 * - vectorSearch() — tests result mapping from searchChunks hits
 *
 * Strategy: single top-level vi.mock for embedder.js and qdrant-client.js;
 * per-test behavior is controlled by reconfiguring mockEmbedText /
 * mockSearchChunks before each dynamic import (combined with
 * vi.resetModules() so the module is re-evaluated with fresh mock state).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Top-level mocks — must be plain factories (no top-level variables in body).
const mockEmbedText = vi.fn();
const mockSearchChunks = vi.fn();

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedText: mockEmbedText,
}));

vi.mock("../../../src/llm/qdrant-client.js", () => ({
  searchChunks: mockSearchChunks,
}));

// ─── embed() ─────────────────────────────────────────────────────────────────

describe("vector-client coverage — embed delegates to embedText", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbedText.mockReset();
    mockSearchChunks.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns embedding array from embedText on success", async () => {
    const expected = [0.1, 0.2, 0.3, 0.4, 0.5];
    mockEmbedText.mockResolvedValue(expected);

    const { embed } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    const result = await embed("test query");

    expect(result).toEqual(expected);
    expect(mockEmbedText).toHaveBeenCalledWith("test query");
  });

  it("propagates error thrown by embedText", async () => {
    mockEmbedText.mockRejectedValue(new Error("embed service down"));

    const { embed } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );

    await expect(embed("fail query")).rejects.toThrow("embed service down");
  });

  it("handles high-dimensional embeddings", async () => {
    const expected = Array.from({ length: 2560 }, (_, i) => i * 0.001);
    mockEmbedText.mockResolvedValue(expected);

    const { embed } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    const result = await embed("high-dim query");

    expect(result).toHaveLength(2560);
    expect(result).toEqual(expected);
  });
});

// ─── vectorSearch() ───────────────────────────────────────────────────────────

describe("vector-client coverage — vectorSearch result mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbedText.mockReset();
    mockSearchChunks.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("maps hits with path to VectorSearchResult", async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValue([
      { score: 0.95, path: "src/foo.js", source: "", content: "result 1", id: "p1" },
      { score: 0.85, path: "src/bar.js", source: "", content: "result 2", id: "p2" },
    ]);

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    const results = await vectorSearch("test search", 5);

    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.95);
    expect(results[0].source).toBe("src/foo.js");
    expect(results[0].text).toBe("result 1");
    expect(results[1].score).toBe(0.85);
    expect(results[1].source).toBe("src/bar.js");
  });

  it("uses source field when path is missing", async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValue([
      { score: 0.9, path: "", source: "docs/readme.md", content: "doc content", id: "p1" },
    ]);

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    const results = await vectorSearch("search", 5);

    expect(results[0].source).toBe("docs/readme.md");
  });

  it("falls back to id when both path and source are empty", async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValue([
      { score: 0.7, path: "", source: "", content: "orphan chunk", id: 42 },
    ]);

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    const results = await vectorSearch("search", 5);

    expect(results[0].source).toBe("42");
  });

  it("returns empty array when searchChunks returns no hits", async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValue([]);

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    const results = await vectorSearch("no results", 5);

    expect(results).toEqual([]);
  });

  it("passes correct topK to searchChunks", async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2]);
    mockSearchChunks.mockResolvedValue([]);

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    await vectorSearch("my query", 10);

    expect(mockSearchChunks).toHaveBeenCalledWith([0.1, 0.2], 10);
  });

  it("uses default topK of 5 when not specified", async () => {
    mockEmbedText.mockResolvedValue([0.1]);
    mockSearchChunks.mockResolvedValue([]);

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );
    await vectorSearch("default topk");

    expect(mockSearchChunks).toHaveBeenCalledWith([0.1], 5);
  });

  it("propagates error from searchChunks", async () => {
    mockEmbedText.mockResolvedValue([0.1]);
    mockSearchChunks.mockRejectedValue(new Error("qdrant unavailable"));

    const { vectorSearch } = await import(
      "../../../src/shared/retrieval/vector-client.js"
    );

    await expect(vectorSearch("fail")).rejects.toThrow("qdrant unavailable");
  });
});
