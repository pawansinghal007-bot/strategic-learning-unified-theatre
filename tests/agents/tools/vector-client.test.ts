/**
 * tests/agents/tools/vector-client.test.ts
 *
 * Unit tests for src/shared/retrieval/vector-client.ts
 *
 * Covers:
 *   - vectorSearch: successful embed + search response mapping
 *   - vectorSearch: embeddings-server error propagation (non-ok status)
 *   - vectorSearch: Qdrant error propagation (non-ok status)
 *   - vectorSearch: empty results array
 *   - embed: unexpected response shape (missing data[0].embedding)
 *   - embed: network-level fetch failure
 *
 * fetch is fully mocked — no real network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("../../../src/shared/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── module under test ────────────────────────────────────────────────────────

import { vectorSearch, embed } from "../../../src/shared/retrieval/vector-client";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a mock Response with json() and text() helpers. */
function mockResponse(status: number, body: unknown): Response {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => json,
  } as unknown as Response;
}

/** Stub embed response with a fixed-length vector. */
function embedResponse(vector: number[] = [0.1, 0.2, 0.3]): Response {
  return mockResponse(200, { data: [{ embedding: vector }] });
}

/** Stub Qdrant search response with provided hits. */
function qdrantResponse(
  hits: Array<{ id: string | number; score: number; payload?: { source?: string; text?: string } }>,
): Response {
  return mockResponse(200, { result: hits });
}

// ─── tests: vectorSearch ──────────────────────────────────────────────────────

describe("vectorSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped results on successful embed + Qdrant search", async () => {
    const vector = [0.1, 0.2, 0.3];
    mockFetch
      .mockResolvedValueOnce(embedResponse(vector))
      .mockResolvedValueOnce(
        qdrantResponse([
          { id: "doc-1", score: 0.95, payload: { source: "src/foo.ts", text: "function foo()" } },
          { id: "doc-2", score: 0.82, payload: { source: "src/bar.ts", text: "const bar = 1" } },
        ]),
      );

    const results = await vectorSearch("how does foo work", 5);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ score: 0.95, source: "src/foo.ts", text: "function foo()" });
    expect(results[1]).toEqual({ score: 0.82, source: "src/bar.ts", text: "const bar = 1" });
  });

  it("uses numeric id as source when payload.source is absent", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse())
      .mockResolvedValueOnce(
        qdrantResponse([{ id: 42, score: 0.75 }]),
      );

    const results = await vectorSearch("query");

    expect(results[0].source).toBe("42");
    expect(results[0].text).toBe("");
  });

  it("returns empty array when Qdrant result is []", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse())
      .mockResolvedValueOnce(qdrantResponse([]));

    const results = await vectorSearch("empty query");

    expect(results).toEqual([]);
  });

  it("returns empty array when Qdrant result is missing (undefined)", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse())
      .mockResolvedValueOnce(mockResponse(200, {}));

    const results = await vectorSearch("missing result key");

    expect(results).toEqual([]);
  });

  it("propagates embeddings server non-ok response as an error", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(503, "Service Unavailable"),
    );

    await expect(vectorSearch("query")).rejects.toThrow(
      /embed: embeddings service returned 503/,
    );
  });

  it("propagates Qdrant non-ok response as an error", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse())
      .mockResolvedValueOnce(mockResponse(500, "Internal Server Error"));

    await expect(vectorSearch("query")).rejects.toThrow(
      /vectorSearch: Qdrant returned 500/,
    );
  });

  it("propagates a network-level fetch failure from the embed call", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(vectorSearch("query")).rejects.toThrow("fetch failed");
  });

  it("propagates a network-level fetch failure from the Qdrant call", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse())
      .mockRejectedValueOnce(new TypeError("connection refused"));

    await expect(vectorSearch("query")).rejects.toThrow("connection refused");
  });

  it("passes topK to the Qdrant request body", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse([0.5]))
      .mockResolvedValueOnce(qdrantResponse([]));

    await vectorSearch("query", 10);

    const qdrantCallBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(qdrantCallBody.limit).toBe(10);
  });

  it("uses default topK of 5 when not specified", async () => {
    mockFetch
      .mockResolvedValueOnce(embedResponse([0.5]))
      .mockResolvedValueOnce(qdrantResponse([]));

    await vectorSearch("query");

    const qdrantCallBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(qdrantCallBody.limit).toBe(5);
  });
});

// ─── tests: embed ─────────────────────────────────────────────────────────────

describe("embed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the embedding vector from the response", async () => {
    const vector = [0.1, 0.2, 0.9];
    mockFetch.mockResolvedValueOnce(embedResponse(vector));

    const result = await embed("hello");

    expect(result).toEqual(vector);
  });

  it("throws when data[0].embedding is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { data: [{ embedding: null }] }),
    );

    await expect(embed("bad shape")).rejects.toThrow(
      /embed: unexpected response shape/,
    );
  });

  it("throws when data array is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { data: [] }),
    );

    await expect(embed("empty data")).rejects.toThrow(
      /embed: unexpected response shape/,
    );
  });

  it("throws when response is not ok", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(401, "Unauthorized"));

    await expect(embed("text")).rejects.toThrow(
      /embed: embeddings service returned 401/,
    );
  });

  it("sends the correct request to the embeddings service", async () => {
    mockFetch.mockResolvedValueOnce(embedResponse([0.1]));

    await embed("test text");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/embeddings$/);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ input: "test text" });
  });
});
