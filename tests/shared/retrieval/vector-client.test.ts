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

const { mockFetch, mockLogger } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../src/shared/logging/logger.js", () => ({
  logger: mockLogger,
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
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding }] }),
    );

    const result = await embed("hello world");

    expect(result).toEqual(embedding);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/embeddings"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws with status code when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503, "Service Unavailable"));

    await expect(embed("test")).rejects.toThrow(
      /embeddings service returned 503/,
    );
  });

  it("throws when response shape is missing data[0].embedding", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [{}] }));

    await expect(embed("test")).rejects.toThrow(
      /unexpected response shape/,
    );
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
  it("embeds query then queries Qdrant, returns mapped results", async () => {
    // First fetch: embeddings service
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    );
    // Second fetch: Qdrant search
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        result: [
          {
            id: "abc",
            score: 0.92,
            payload: { source: "src/agents/runner.ts", text: "agent loop" },
          },
        ],
      }),
    );

    const results = await vectorSearch("agent loop", 1);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      score: 0.92,
      source: "src/agents/runner.ts",
      text: "agent loop",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when Qdrant result is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.5] }] }),
    );
    mockFetch.mockResolvedValueOnce(makeOkResponse({ result: [] }));

    const results = await vectorSearch("no matches");

    expect(results).toEqual([]);
  });

  it("uses hit.id as source fallback when payload.source is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        result: [
          { id: 42, score: 0.8, payload: { text: "some text" } },
        ],
      }),
    );

    const results = await vectorSearch("query");

    expect(results[0].source).toBe("42");
    expect(results[0].text).toBe("some text");
  });

  it("uses empty string for text when payload.text is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        result: [{ id: "x", score: 0.5, payload: { source: "f.ts" } }],
      }),
    );

    const results = await vectorSearch("query");

    expect(results[0].text).toBe("");
  });

  it("handles missing result key in Qdrant response (returns empty array)", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockResolvedValueOnce(makeOkResponse({}));

    const results = await vectorSearch("query");

    expect(results).toEqual([]);
  });

  it("throws when Qdrant returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, "Internal Server Error"));

    await expect(vectorSearch("query")).rejects.toThrow(
      /Qdrant returned 500/,
    );
  });

  it("throws embed timeout message when embed's fetch aborts", async () => {
    // AbortError from the embed fetch is caught inside embed() and re-thrown
    // as "embed: timed out after Nms". vectorSearch propagates this as-is
    // because the re-thrown error is no longer an AbortError.
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortErr);

    await expect(vectorSearch("slow query")).rejects.toThrow(
      /embed: timed out after/,
    );
  });

  it("throws timeout on AbortError from Qdrant fetch", async () => {
    // embed succeeds
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    // Qdrant fetch aborts
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortErr);

    await expect(vectorSearch("query")).rejects.toThrow(
      /vectorSearch: timed out after/,
    );
  });

  it("rethrows non-abort errors from Qdrant fetch", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(vectorSearch("query")).rejects.toThrow("ECONNREFUSED");
  });

  it("logs result count via logger.info on success", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        result: [
          { id: "a", score: 0.9, payload: { source: "x.ts", text: "y" } },
        ],
      }),
    );

    await vectorSearch("test query", 3);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "retrieval.vector-search",
      expect.objectContaining({ query: "test query", topK: 3, hits: 1 }),
    );
  });

  it("uses default topK of 5 when not specified", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: [0.1] }] }),
    );
    mockFetch.mockResolvedValueOnce(makeOkResponse({ result: [] }));

    await vectorSearch("query");

    // The body sent to Qdrant should have limit: 5
    const qdrantCall = mockFetch.mock.calls[1];
    const body = JSON.parse(qdrantCall[1].body);
    expect(body.limit).toBe(5);
  });
});
