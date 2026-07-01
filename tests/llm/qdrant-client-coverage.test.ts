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
  KNOWLEDGE_COLLECTION,
} from "../../src/llm/qdrant-client.js";

// ── helpers ───────────────────────────────────────────────────────────────────
function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
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

function notFoundResponse(body: unknown = { status: { error: "Collection doesn't exist" } }): Response {
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
    expect(putBody.vectors).toMatchObject({ size: 1024, distance: "Cosine" });
  });

  it("does NOT create collection when GET fails with non-404 and no 'doesn't exist' error", async () => {
    // Returns not-ok but the error text does NOT include "doesn't exist"
    const spy = mockFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ status: { error: "internal server error" } }),
    } as unknown as Response));

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
    expect(body.points[0].id).toBe("chunk-1");
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
});

// ── searchChunks ──────────────────────────────────────────────────────────────
describe("searchChunks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns mapped results from Qdrant search response", async () => {
    const spy = mockFetch(async () => okResponse({
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
            text: "Fallback text field",   // uses text when content is absent
            section: "body",
            feature_area: "storage",
            sprint: 3,
            source_type: "ts",
          },
        },
      ],
    }));

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
    mockFetch(async () => ({ ok: false, status: 503 } as unknown as Response));
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
    mockFetch(async () => okResponse({
      result: [
        { score: 0.5, payload: {} },  // all fields missing
      ],
    }));

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
});
