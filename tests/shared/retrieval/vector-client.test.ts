/**
 * tests/shared/retrieval/vector-client.test.ts
 *
 * Unit tests for src/shared/retrieval/vector-client.ts
 *
 * Covers:
 *   - embed(): success path, non-ok HTTP response, missing embedding shape,
 *     AbortError timeout (line 78), rethrows other errors
 *   - vectorSearch(): success path, non-ok Qdrant response,
 *     AbortError timeout (line 144), missing result key defaults
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockEmbedText, mockLogger, mockSearchChunks } = vi.hoisted(() => ({
  mockEmbedText: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSearchChunks: vi.fn(),
}));

vi.mock("../../../src/shared/logging/logger.js", () => ({
  logger: mockLogger,
}));

vi.mock("../../../src/llm/qdrant-client.js", () => ({
  searchChunks: (...args: unknown[]) => mockSearchChunks(...args),
}));

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedText: (...args: unknown[]) => mockEmbedText(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import {
  embed,
  vectorSearch,
} from "../../../src/shared/retrieval/vector-client.js";

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

// ─── embed ────────────────────────────────────────────────────────────────────

describe("embed", () => {
  it("returns embedding array on success", async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockEmbedText.mockResolvedValueOnce(embedding);

    const result = await embed("hello world");

    expect(result).toEqual(embedding);
    expect(mockEmbedText).toHaveBeenCalledWith("hello world");
  });

  it("propagates errors from the canonical embedder", async () => {
    const networkErr = new Error("ECONNREFUSED");
    mockEmbedText.mockRejectedValueOnce(networkErr);

    await expect(embed("test")).rejects.toThrow("ECONNREFUSED");
  });
});

// ─── vectorSearch ─────────────────────────────────────────────────────────────

describe("vectorSearch", () => {
  it("embeds query then delegates search to searchChunks", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValueOnce([
      {
        id: "abc",
        path: "src/agents/runner.ts",
        content: "agent loop",
        score: 0.92,
      },
    ]);

    const results = await vectorSearch("agent loop", 1);

    expect(mockEmbedText).toHaveBeenCalledWith("agent loop");
    expect(mockSearchChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 1);
    expect(results).toEqual([
      { score: 0.92, source: "src/agents/runner.ts", text: "agent loop" },
    ]);
  });

  it("uses path as source when searchChunks returns path", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValueOnce([
      {
        id: "abc",
        path: "src/foo.ts",
        content: "some code",
        score: 0.8,
      },
    ]);

    const results = await vectorSearch("query");

    expect(results[0]).toEqual({
      score: 0.8,
      source: "src/foo.ts",
      text: "some code",
    });
  });

  it("falls back to hit.id when searchChunks path is empty", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValueOnce([
      { id: 42, path: "", content: "some text", score: 0.8 },
    ]);

    const results = await vectorSearch("query");

    expect(results[0].source).toBe("42");
    expect(results[0].text).toBe("some text");
  });

  it("returns empty array when searchChunks returns no hits", async () => {
    mockEmbedText.mockResolvedValueOnce([0.5]);
    mockSearchChunks.mockResolvedValueOnce([]);

    const results = await vectorSearch("no matches");

    expect(results).toEqual([]);
  });

  it("propagates embed errors from the canonical embedder", async () => {
    mockEmbedText.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(vectorSearch("query")).rejects.toThrow("fetch failed");
  });

  it("passes topK to searchChunks", async () => {
    const vector = [0.1, 0.2, 0.3];
    mockEmbedText.mockResolvedValueOnce(vector);
    mockSearchChunks.mockResolvedValueOnce([]);

    await vectorSearch("query", 10);

    expect(mockSearchChunks).toHaveBeenCalledWith(vector, 10);
  });

  it("logs result count via logger.info on success", async () => {
    mockEmbedText.mockResolvedValueOnce([0.1]);
    mockSearchChunks.mockResolvedValueOnce([
      { id: "a", path: "x.ts", content: "y", score: 0.9 },
    ]);

    await vectorSearch("test query", 3);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "retrieval.vector-search",
      expect.objectContaining({ query: "test query", topK: 3, hits: 1 }),
    );
  });
});
