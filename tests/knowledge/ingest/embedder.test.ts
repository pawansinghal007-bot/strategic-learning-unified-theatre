/**
 * tests/knowledge/ingest/embedder.test.ts
 *
 * Unit tests for src/knowledge/ingest/embedder.ts
 *
 * Covers:
 *   - embedTextBatch(): success single batch, success multi-batch,
 *     non-ok HTTP response, count mismatch, missing embedding shape,
 *     network error passthrough
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockFetch, mockEstimateTokenCount } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockEstimateTokenCount: vi.fn((text: string) => Math.ceil(text.length / 2)),
}));

// ─── module under test ────────────────────────────────────────────────────────

vi.mock("../../../src/llm/document-ingester.js", () => ({
  estimateTokenCount: mockEstimateTokenCount,
}));

import { embedTextBatch } from "../../../src/knowledge/ingest/embedder.js";

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset(); // Clear mockResolvedValueOnce queue to prevent leakage between tests
  (globalThis as any).fetch = mockFetch;
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEmbedding(dim: number): number[] {
  return Array.from({ length: dim }, () => 0.1);
}

function makeBatchResponse(texts: string[]) {
  return {
    data: texts.map(() => ({ embedding: makeEmbedding(2560) })),
  };
}

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

// ─── embedTextBatch ───────────────────────────────────────────────────────────

describe("embedTextBatch", () => {
  it("returns correct number of vectors for a single batch", async () => {
    const texts = Array.from({ length: 32 }, (_, i) => `text-${i}`);
    mockFetch.mockResolvedValueOnce(makeOkResponse(makeBatchResponse(texts)));

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(32);
    expect(result[0]).toHaveLength(2560);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callArgs.body);
    expect(body.input).toEqual(texts);
    expect(body.model).toBe("qwen3-emb-4b");
  });

  it("splits input into multiple batches when exceeding batch size", async () => {
    // With token-budget batching: MAX_ITEMS_PER_BATCH=64, so 65 items = 2 requests (64 + 1)
    // Default mockEstimateTokenCount returns ~4 tokens per "text-N" string, well under budget
    const texts = Array.from({ length: 65 }, (_, i) => `text-${i}`);

    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(0, 64))),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(64))),
    );

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(65);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify first batch contains correct slice
    const firstCall = mockFetch.mock.calls[0][1] as { body: string };
    expect(JSON.parse(firstCall.body).input).toEqual(texts.slice(0, 64));

    // Verify last batch contains the remainder
    const lastCall = mockFetch.mock.calls[1][1] as { body: string };
    expect(JSON.parse(lastCall.body).input).toEqual(texts.slice(64));
  });

  it("throws with status code when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(503, "Service Unavailable"),
    );

    await expect(embedTextBatch(["test"])).rejects.toThrow(
      /embeddings service returned 503/,
    );
  });

  it("throws when response returns fewer embeddings than input", async () => {
    // With BATCH_SIZE=32, send 32 items but mock returns only 1 embedding
    const texts = Array.from({ length: 32 }, (_, i) => `text-${i}`);
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: makeEmbedding(2560) }] }),
    );

    await expect(embedTextBatch(texts)).rejects.toThrow(
      /expected 32 embeddings but got 1/,
    );
  });

  it("throws when embedding is not an array", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: [{ embedding: "not-an-array" }] }),
    );

    await expect(embedTextBatch(["test"])).rejects.toThrow(
      /missing data\[\]\.embedding/,
    );
  });

  it("throws when embedding field is missing", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: [{}] }));

    await expect(embedTextBatch(["test"])).rejects.toThrow(
      /missing data\[\]\.embedding/,
    );
  });

  it("rethrows network errors from fetch", async () => {
    const networkErr = new Error("ECONNREFUSED");
    mockFetch.mockRejectedValueOnce(networkErr);

    await expect(embedTextBatch(["test"])).rejects.toThrow("ECONNREFUSED");
  });

  it("handles empty input array gracefully", async () => {
    const result = await embedTextBatch([]);

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses correct URL and headers", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(["test"])),
    );

    await embedTextBatch(["test"]);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/v1/embeddings"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("preserves order across multiple batches", async () => {
    const texts = Array.from({ length: 64 }, (_, i) => `text-${i}`);
    mockEstimateTokenCount.mockImplementation(() => 10); // Tiny texts, 10 tokens each

    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        data: texts.slice(0, 64).map((_, i) => ({
          embedding: Array.from({ length: 2560 }, () => i * 0.01),
        })),
      }),
    );

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(64);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // First vector should have values from index 0
    expect(result[0][0]).toBe(0);
  });

  it("groups multiple small texts under the token budget into ONE HTTP call", async () => {
    // 10 small texts, each ~5 tokens → total ~50 tokens, well under 6000 budget
    const texts = Array.from({ length: 10 }, (_, i) => `short-${i}`);
    mockEstimateTokenCount.mockImplementation(() => 5);

    mockFetch.mockResolvedValueOnce(makeOkResponse(makeBatchResponse(texts)));

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(10);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.input).toHaveLength(10);
  });

  it("splits into two calls when adding the next text crosses the 6000-token budget", async () => {
    // 5 texts of 1200 tokens each → 5*1200=6000 fits, 6*1200=7200 exceeds
    // So batch 1 = 5 items, batch 2 = 1 item
    const texts = Array.from({ length: 6 }, (_, i) => `text-${i}`);
    mockEstimateTokenCount.mockImplementation(() => 1200);

    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(0, 5))),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(5))),
    );

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(6);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call has 5 items
    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(firstBody.input).toEqual(texts.slice(0, 5));

    // Second call has 1 item
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(secondBody.input).toEqual(texts.slice(5));
  });

  it("sends a single oversized text alone in its own batch without hanging or throwing", async () => {
    // A single text whose estimated tokens (7000) exceed the 6000 budget
    // must still be sent — embedder doesn't split text, that's chunkText's job
    const texts = ["very-long-text"];
    mockEstimateTokenCount.mockImplementation(() => 7000);

    mockFetch.mockResolvedValueOnce(makeOkResponse(makeBatchResponse(texts)));

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.input).toEqual(texts);
  });

  it("splits at MAX_ITEMS_PER_BATCH (64) even when token budget allows more", async () => {
    // 80 tiny texts, each 10 tokens → total 800 tokens, well under 6000 budget
    // But MAX_ITEMS_PER_BATCH = 64, so should split into 64 + 16
    const texts = Array.from({ length: 80 }, (_, i) => `tiny-${i}`);
    mockEstimateTokenCount.mockImplementation(() => 10);

    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(0, 64))),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(64))),
    );

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(80);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First batch has exactly 64 items
    const firstBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(firstBody.input).toHaveLength(64);

    // Second batch has the remaining 16
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(secondBody.input).toHaveLength(16);
  });

  it("handles response without data field (json.data ?? [] fallback)", async () => {
    // When the API returns a response without a `data` field, it should use [] fallback
    const texts = ["test-text"];
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ embeddings: [] }), // No `data` field
    );

    await expect(embedTextBatch(texts)).rejects.toThrow(
      /expected 1 embeddings but got 0/,
    );
  });
});
