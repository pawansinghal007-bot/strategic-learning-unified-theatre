/**
 * tests/agents/tools/vector-client.test.ts
 *
 * Unit tests for src/shared/retrieval/vector-client.ts
 *
 * Updated to mock the canonical embedder module (src/knowledge/ingest/embedder.js)
 * instead of globalThis.fetch.  The pre-consolidation HTTP wire tests have been
 * removed — that behaviour is now tested at the embedder layer, not here.
 *
 * Mirrors the pattern established in tests/shared/retrieval/vector-client.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockEmbedText, mockSearchChunks } = vi.hoisted(() => ({
  mockEmbedText: vi.fn(),
  mockSearchChunks: vi.fn(),
}));

vi.mock("../../../src/shared/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../src/llm/qdrant-client.js", () => ({
  searchChunks: (...args: unknown[]) => mockSearchChunks(...args),
}));

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedText: (...args: unknown[]) => mockEmbedText(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import { vectorSearch, embed } from "../../../src/shared/retrieval/vector-client";

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── tests: embed ─────────────────────────────────────────────────────────────

describe("embed", () => {
  it("delegates to embedText and returns its result", async () => {
    const vector = [0.1, 0.2, 0.9];
    mockEmbedText.mockResolvedValueOnce(vector);

    const result = await embed("hello");

    expect(mockEmbedText).toHaveBeenCalledWith("hello");
    expect(result).toEqual(vector);
  });

  it("propagates errors from the canonical embedder", async () => {
    mockEmbedText.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(embed("test")).rejects.toThrow("ECONNREFUSED");
  });
});

// ─── tests: vectorSearch ──────────────────────────────────────────────────────

describe("vectorSearch", () => {
  it("returns mapped results on successful embed + Qdrant search", async () => {
    const vector = [0.1, 0.2, 0.3];
    mockEmbedText.mockResolvedValueOnce(vector);
    mockSearchChunks.mockResolvedValueOnce([
      { id: "doc-1", score: 0.95, source: "src/foo.ts", content: "function foo()" },
      { id: "doc-2", score: 0.82, source: "src/bar.ts", content: "const bar = 1" },
    ]);

    const results = await vectorSearch("how does foo work", 5);

    expect(mockEmbedText).toHaveBeenCalledWith("how does foo work");
    expect(mockSearchChunks).toHaveBeenCalledWith(vector, 5);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ score: 0.95, source: "src/foo.ts", text: "function foo()" });
    expect(results[1]).toEqual({ score: 0.82, source: "src/bar.ts", text: "const bar = 1" });
  });

  it("uses numeric id as source when path and source are absent", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValueOnce([{ id: 42, score: 0.75, content: "" }]);

    const results = await vectorSearch("query");

    expect(results[0].source).toBe("42");
    expect(results[0].text).toBe("");
  });

  it("returns empty array when Qdrant result is []", async () => {
    mockEmbedText.mockResolvedValueOnce([0.5]);
    mockSearchChunks.mockResolvedValueOnce([]);

    const results = await vectorSearch("empty query");

    expect(results).toEqual([]);
  });

  it("propagates embedder errors", async () => {
    mockEmbedText.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(vectorSearch("query")).rejects.toThrow("fetch failed");
  });

  it("propagates Qdrant errors", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1]);
    mockSearchChunks.mockRejectedValueOnce(
      new Error("searchChunks: Qdrant returned 500: Internal Server Error"),
    );

    await expect(vectorSearch("query")).rejects.toThrow(
      /searchChunks: Qdrant returned 500:/,
    );
  });

  it("passes topK to the Qdrant client", async () => {
    mockEmbedText.mockResolvedValueOnce([0.5]);
    mockSearchChunks.mockResolvedValueOnce([]);

    await vectorSearch("query", 10);

    expect(mockSearchChunks).toHaveBeenCalledWith([0.5], 10);
  });

  it("uses default topK of 5 when not specified", async () => {
    mockEmbedText.mockResolvedValueOnce([0.5]);
    mockSearchChunks.mockResolvedValueOnce([]);

    await vectorSearch("query");

    expect(mockSearchChunks).toHaveBeenCalledWith([0.5], 5);
  });
});
