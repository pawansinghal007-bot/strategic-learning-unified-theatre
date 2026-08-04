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

const { mockFetch, mockLogger, mockSearchChunks } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockSearchChunks: vi.fn(),
}));

vi.mock("../../../src/shared/logging/logger.js", () => ({
  logger: mockLogger,
}));

vi.mock("../../../src/llm/qdrant-client.js", () => ({
  searchChunks: (...args: unknown[]) => mockSearchChunks(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import {
  embed,
  vectorSearch,
} from "../../../src/shared/retrieval/vector-client.js";

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Install our fetch mock on globalThis
  (globalThis as any).fetch = mockFetch;
});

afterEach(() => {
  // Restore original fetch (if any)
  delete (globalThis as any).fetch;
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function makeErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(body),
  };
}

// ─── embed ────────────────────────────────────────────────────────────────────

describe("embed", () => {
  it("returns embedding array on success", async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [{ embedding }] }));

    const result = await embed("hello world");

    expect(result).toEqual(embedding);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/embeddings"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws with status code when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(503, "Service Unavailable"),
    );

    await expect(embed("test")).rejects.toThrow(
      /embeddings service returned 503/,
    );
  });

  it("throws when response shape is missing data[0].embedding", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [{}] }));

    await expect(embed("test")).rejects.toThrow(/unexpected response shape/);
  });

  it("throws when data array is empty", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [] }));

    await expect(embed("test")).rejects.toThrow(/unexpected response shape/);
  });

  it("throws timeout error on AbortError (line 78)", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortErr);

    await expect(embed("slow query")).rejects.toThrow(/timed out after/);
  });

  it("rethrows non-abort errors from fetch", async () => {
    const networkErr = new Error("ECONNREFUSED");
    mockFetch.mockRejectedValueOnce(networkErr);

    await expect(embed("test")).rejects.toThrow("ECONNREFUSED");
  });
});

// ─── vectorSearch ─────────────────────────────────────────────────────────────

describe("vectorSearch", () => {
  it("embeds query then delegates search to searchChunks", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    );
    mockSearchChunks.mockResolvedValueOnce([
      {
        id: "abc",
        path: "src/agents/runner.ts",
        content: "agent loop",
        score: 0.92,
      },
    ]);

    const results = await vectorSearch("agent loop", 1);

    expect(mockSearchChunks).toHaveBeenCalledWith([0.1, 0.2, 0.3], 1);
    expect(results).toEqual([
      { score: 0.92, source: "src/agents/runner.ts", text: "agent loop" },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses path as source when searchChunks returns path", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    );
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
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    );
    mockSearchChunks.mockResolvedValueOnce([
      { id: 42, path: "", content: "some text", score: 0.8 },
    ]);

    const results = await vectorSearch("query");

    expect(results[0].source).toBe("42");
    expect(results[0].text).toBe("some text");
  });

  it("returns empty array when searchChunks returns no hits", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.5] }] }),
    );
    mockSearchChunks.mockResolvedValueOnce([]);

    const results = await vectorSearch("no matches");

    expect(results).toEqual([]);
  });

  it("propagates embed errors from the embedding service", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(vectorSearch("query")).rejects.toThrow("fetch failed");
  });

  it("passes topK to searchChunks", async () => {
    const vector = [0.1, 0.2, 0.3];
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: vector }] }),
    );
    mockSearchChunks.mockResolvedValueOnce([]);

    await vectorSearch("query", 10);

    expect(mockSearchChunks).toHaveBeenCalledWith(vector, 10);
  });

  it("logs result count via logger.info on success", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
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
