/**
 * qdrant-client-coverage.test.ts
 * Covers src/llm/qdrant-client.ts (lines 5-49) — currently 0% coverage.
 * All functions use fetch; we stub global.fetch for each test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  ensureKnowledgeCollection,
  upsertChunks,
  searchChunks,
  getExistingFileHashes,
  deleteChunksByDocId,
  KNOWLEDGE_COLLECTION,
} from "../../src/llm/qdrant-client.js";

// ── helpers ───────────────────────────────────────────────────────────────────
function mockFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const spy = vi.fn(impl as typeof fetch);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function okResponse(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function notFoundResponse(
  body: unknown = { status: { error: "Collection doesn't exist" } },
): Response {
  return {
    ok: false,
    status: 404,
    json: async () => body,
  } as unknown as Response;
}

// ── ensureKnowledgeCollection ─────────────────────────────────────────────────
describe("ensureKnowledgeCollection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does nothing when the collection already exists (ok=true)", async () => {
    const spy = mockFetch(async () => okResponse());
    await ensureKnowledgeCollection();
    // Only one GET request; no PUT
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBeUndefined(); // GET has no body/method override
  });

  it("creates collection via PUT when GET returns 404", async () => {
    const spy = mockFetch(async (url, init) => {
      if (!init || !init.method || init.method === "GET") {
        return notFoundResponse();
      }
      // PUT — collection creation
      return okResponse({ result: true });
    });

    await ensureKnowledgeCollection();

    expect(spy).toHaveBeenCalledTimes(2);
    const putCall = spy.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    expect(putCall![0]).toContain(KNOWLEDGE_COLLECTION);

    const putBody = JSON.parse(putCall![1]!.body as string);
    expect(putBody.vectors).toMatchObject({ size: 2560, distance: "Cosine" });
  });

  it("does NOT create collection when GET fails with non-404 and no 'doesn't exist' error", async () => {
    // Returns not-ok but the error text does NOT include "doesn't exist"
    const spy = mockFetch(
      async () =>
        ({
          ok: false,
          status: 500,
          json: async () => ({ status: { error: "internal server error" } }),
        }) as unknown as Response,
    );

    await ensureKnowledgeCollection();
    // Only 1 call (the GET); PUT should not be issued because condition short-circuits
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("creates collection when error text includes 'doesn't exist' and status is non-404", async () => {
    // Some Qdrant versions may return 400 with "doesn't exist" in the body
    const spy = mockFetch(async (url, init) => {
      if (!init?.method || init.method === "GET") {
        return {
          ok: false,
          status: 400,
          json: async () => ({ status: { error: "Collection doesn't exist" } }),
        } as unknown as Response;
      }
      return okResponse({ result: true });
    });

    await ensureKnowledgeCollection();
    const putCall = spy.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
  });

  it("throws Error when collection creation PUT returns non-ok (lines 52-58)", async () => {
    const spy = mockFetch(async (url, init) => {
      if (!init?.method || init.method === "GET") {
        return notFoundResponse();
      }
      // PUT — collection creation fails
      return {
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      } as unknown as Response;
    });

    await expect(ensureKnowledgeCollection()).rejects.toThrow(
      "Collection creation failed",
    );

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("uses .catch() fallback when res.json() throws during error response (line 29)", async () => {
    // GET returns non-ok, then res.json() throws — .catch() returns {}
    // With body={}, the condition at line 33 short-circuits to false for
    // the first clause (undefined === false is false), so we proceed to PUT
    let callCount = 0;
    const spy = mockFetch(async (url, init) => {
      callCount++;
      if (!init?.method || init.method === "GET") {
        // First call: GET — json() throws, triggering .catch(() => ({}))
        return {
          ok: false,
          status: 502,
          json: async () => {
            throw new Error("JSON parse error");
          },
        } as unknown as Response;
      }
      // Second call: PUT — collection creation succeeds
      return okResponse({ result: true });
    });

    await ensureKnowledgeCollection();
    // 2 calls: GET (json throws, catch fallback), then PUT (succeeds)
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ── upsertChunks ──────────────────────────────────────────────────────────────
describe("upsertChunks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends PUT request with mapped points to the correct collection URL", async () => {
    const spy = mockFetch(async () => okResponse({ result: { upserted: 2 } }));

    const chunks = [
      {
        chunk_id: "chunk-1",
        dense_vector: [0.1, 0.2, 0.3],
        content: "First chunk content",
        section: "intro",
        feature_area: "auth",
        sprint: 10,
        source_type: "md",
      },
      {
        chunk_id: "chunk-2",
        dense_vector: [0.4, 0.5, 0.6],
        content: "Second chunk content",
        section: "body",
        feature_area: "storage",
        sprint: 11,
        source_type: "ts",
      },
    ];

    await upsertChunks(chunks);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain(KNOWLEDGE_COLLECTION);
    expect(url).toContain("/points");
    expect(init?.method).toBe("PUT");

    const body = JSON.parse(init!.body as string);
    expect(body.points).toHaveLength(2);
    // Point IDs are now deterministic UUIDs derived from SHA-256 hash of chunk_id
    expect(body.points[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.points[0].vector).toEqual([0.1, 0.2, 0.3]);
    // dense_vector should be stripped from payload
    expect(body.points[0].payload.dense_vector).toBeUndefined();
    expect(body.points[0].payload.content).toBe("First chunk content");
  });

  it("handles empty chunks array without error", async () => {
    const spy = mockFetch(async () => okResponse({ result: { upserted: 0 } }));
    await upsertChunks([]);
    expect(spy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body.points).toEqual([]);
  });

  it("throws Error when upsert PUT returns non-ok (lines 78-80)", async () => {
    const spy = mockFetch(
      async () =>
        ({
          ok: false,
          status: 503,
          text: async () => "Service unavailable",
        }) as unknown as Response,
    );

    const chunks = [
      {
        chunk_id: "chunk-1",
        dense_vector: [0.1, 0.2, 0.3],
        content: "Content",
      },
    ];

    await expect(upsertChunks(chunks)).rejects.toThrow("Upsert failed");

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── searchChunks ──────────────────────────────────────────────────────────────
describe("searchChunks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns mapped results from Qdrant search response", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: [
          {
            score: 0.92,
            payload: {
              content: "Relevant content",
              section: "intro",
              feature_area: "auth",
              sprint: 5,
              source_type: "md",
            },
          },
          {
            score: 0.75,
            payload: {
              text: "Fallback text field", // uses text when content is absent
              section: "body",
              feature_area: "storage",
              sprint: 3,
              source_type: "ts",
            },
          },
        ],
      }),
    );

    const vector = new Array(1024).fill(0.1);
    const results = await searchChunks(vector, 5, 0.5);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/points/search");
    expect(init?.method).toBe("POST");

    const body = JSON.parse(init!.body as string);
    expect(body.limit).toBe(5);
    expect(body.score_threshold).toBe(0.5);
    expect(body.with_payload).toBe(true);

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe("Relevant content");
    expect(results[0].score).toBe(0.92);
    expect(results[0].section).toBe("intro");
    expect(results[0].feature_area).toBe("auth");
    expect(results[0].sprint).toBe(5);
    expect(results[1].content).toBe("Fallback text field");
  });

  it("returns empty array when response is not ok", async () => {
    mockFetch(async () => ({ ok: false, status: 503 }) as unknown as Response);
    const results = await searchChunks(new Array(1024).fill(0));
    expect(results).toEqual([]);
  });

  it("uses default limit=6 and scoreThreshold=0.4 when not specified", async () => {
    const spy = mockFetch(async () => okResponse({ result: [] }));
    await searchChunks(new Array(1024).fill(0));

    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body.limit).toBe(6);
    expect(body.score_threshold).toBe(0.4);
  });

  it("handles missing payload fields gracefully (defaults to empty string / 0)", async () => {
    mockFetch(async () =>
      okResponse({
        result: [
          { score: 0.5, payload: {} }, // all fields missing
        ],
      }),
    );

    const results = await searchChunks(new Array(1024).fill(0));
    expect(results[0].content).toBe("");
    expect(results[0].section).toBe("");
    expect(results[0].feature_area).toBe("");
    expect(results[0].sprint).toBe(0);
    expect(results[0].source_type).toBe("");
    expect(results[0].score).toBe(0.5);
  });

  it("handles null/empty result array from Qdrant", async () => {
    mockFetch(async () => okResponse({ result: null }));
    const results = await searchChunks(new Array(1024).fill(0));
    expect(results).toEqual([]);
  });

  it("defaults score to 0 when hit.score is undefined (line 106 branch)", async () => {
    mockFetch(async () =>
      okResponse({
        result: [{ score: undefined, payload: { content: "No score field" } }],
      }),
    );
    const results = await searchChunks(new Array(1024).fill(0));
    expect(results[0].score).toBe(0);
  });
});

// ── getExistingFileHashes ─────────────────────────────────────────────────────
describe("getExistingFileHashes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns empty map when collection has no points", async () => {
    const spy = mockFetch(async () =>
      okResponse({ result: { points: [], next_page_offset: null } }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes).toBeInstanceOf(Map);
    expect(hashes.size).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns file_hash map from a single page of results", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: {
          points: [
            {
              payload: {
                doc_id: "doc-1",
                file_hash: "abc123",
                content: "chunk 1",
              },
            },
            {
              payload: {
                doc_id: "doc-1",
                file_hash: "abc123",
                content: "chunk 2",
              },
            },
            {
              payload: {
                doc_id: "doc-2",
                file_hash: "def456",
                content: "chunk 3",
              },
            },
          ],
          next_page_offset: null,
        },
      }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(2);
    expect(hashes.get("doc-1")).toBe("abc123");
    expect(hashes.get("doc-2")).toBe("def456");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("paginates through multiple pages using next_page_offset", async () => {
    let callCount = 0;
    const spy = mockFetch(async (url: string, init?: RequestInit) => {
      callCount++;
      if (callCount === 1) {
        // First page: has next_page_offset
        return okResponse({
          result: {
            points: [
              {
                payload: {
                  doc_id: "doc-1",
                  file_hash: "hash-1",
                },
              },
            ],
            next_page_offset: "page2",
          },
        });
      }
      // Second page: no more pages
      return okResponse({
        result: {
          points: [
            {
              payload: {
                doc_id: "doc-2",
                file_hash: "hash-2",
              },
            },
          ],
          next_page_offset: null,
        },
      });
    });

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(2);
    expect(hashes.get("doc-1")).toBe("hash-1");
    expect(hashes.get("doc-2")).toBe("hash-2");
    expect(spy).toHaveBeenCalledTimes(2);

    // Verify second call includes offset in the request body (not URL parameter)
    const secondBody = JSON.parse(
      (spy.mock.calls[1][1] as { body: string }).body as string,
    );
    expect(secondBody.offset).toBe("page2");
  });

  it("skips points that have no file_hash in payload", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: {
          points: [
            {
              payload: {
                doc_id: "doc-1",
                file_hash: "hash-1",
              },
            },
            {
              payload: {
                doc_id: "doc-2",
                // no file_hash field
              },
            },
            {
              payload: {
                doc_id: "doc-3",
                file_hash: "hash-3",
              },
            },
          ],
          next_page_offset: null,
        },
      }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(2);
    expect(hashes.get("doc-1")).toBe("hash-1");
    expect(hashes.get("doc-3")).toBe("hash-3");
    expect(hashes.has("doc-2")).toBe(false);
  });

  it("stops pagination when next_page_offset is null", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: {
          points: [
            {
              payload: {
                doc_id: "doc-1",
                file_hash: "hash-1",
              },
            },
          ],
          next_page_offset: null,
        },
      }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("stops pagination when next_page_offset is undefined", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: {
          points: [
            {
              payload: {
                doc_id: "doc-1",
                file_hash: "hash-1",
              },
            },
          ],
          next_page_offset: undefined,
        },
      }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("stops pagination when next_page_offset key is absent from response", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: {
          points: [
            {
              payload: {
                doc_id: "doc-1",
                file_hash: "hash-1",
              },
            },
          ],
          // next_page_offset key is completely absent
        },
      }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("throws when Qdrant returns non-ok response", async () => {
    const spy = mockFetch(
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => "Internal error",
        }) as unknown as Response,
    );

    await expect(getExistingFileHashes()).rejects.toThrow(
      "Failed to fetch existing file hashes",
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("handles response without result.points (data.result?.points ?? [] fallback)", async () => {
    const spy = mockFetch(async () =>
      okResponse({
        result: {
          // No `points` field — should use [] fallback
          next_page_offset: null,
        },
      }),
    );

    const hashes = await getExistingFileHashes();

    expect(hashes.size).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── deleteChunksByDocId ───────────────────────────────────────────────────────
describe("deleteChunksByDocId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends POST delete request with correct filter for valid docId", async () => {
    const spy = mockFetch(async () => okResponse({ result: { deleted: 3 } }));

    await deleteChunksByDocId("doc-123");

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/points/delete");
    expect(url).toContain(KNOWLEDGE_COLLECTION);
    expect(init?.method).toBe("POST");

    const body = JSON.parse(init!.body as string);
    expect(body.filter.must).toEqual([
      {
        key: "doc_id",
        match: { value: "doc-123" },
      },
    ]);
  });

  it("throws when Qdrant returns non-ok response", async () => {
    const spy = mockFetch(
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => "Server error",
        }) as unknown as Response,
    );

    await expect(deleteChunksByDocId("doc-123")).rejects.toThrow(
      "Failed to delete chunks",
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("throws synchronously when docId is falsy without making an HTTP call", async () => {
    const spy = mockFetch(async () => okResponse());

    await expect(deleteChunksByDocId("")).rejects.toThrow("docId");
    expect(spy).not.toHaveBeenCalled();

    await expect(deleteChunksByDocId(null as any)).rejects.toThrow("docId");
    expect(spy).not.toHaveBeenCalled();

    await expect(deleteChunksByDocId(undefined as any)).rejects.toThrow(
      "docId",
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
