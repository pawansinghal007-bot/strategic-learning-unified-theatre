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

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// ─── module under test ────────────────────────────────────────────────────────

import { embedTextBatch } from "../../../src/knowledge/ingest/embedder.js";

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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
    // Batch size is 32, so 65 items = 3 requests (32 + 32 + 1)
    const texts = Array.from({ length: 65 }, (_, i) => `text-${i}`);

    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(0, 32))),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(32, 64))),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse(makeBatchResponse(texts.slice(64))),
    );

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(65);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify first batch contains correct slice
    const firstCall = mockFetch.mock.calls[0][1] as { body: string };
    expect(JSON.parse(firstCall.body).input).toEqual(texts.slice(0, 32));

    // Verify last batch contains the remainder
    const lastCall = mockFetch.mock.calls[2][1] as { body: string };
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

    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        data: texts.slice(0, 32).map((_, i) => ({
          embedding: Array.from({ length: 2560 }, () => i * 0.01),
        })),
      }),
    );
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        data: texts.slice(32).map((_, i) => ({
          embedding: Array.from({ length: 2560 }, () => (i + 32) * 0.01),
        })),
      }),
    );

    const result = await embedTextBatch(texts);

    expect(result).toHaveLength(64);
    // First vector should have values from index 0
    expect(result[0][0]).toBe(0);
    // 33rd vector (index 32) should have values from index 32
    expect(result[32][0]).toBe(0.32);
  });
});
