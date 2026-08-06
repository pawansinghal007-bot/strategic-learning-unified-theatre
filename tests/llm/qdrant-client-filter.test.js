/**
 * Regression tests for qdrant-client.js searchChunks() filter support (issue #3).
 *
 * Confirms that:
 *  1. searchChunks() passes a Qdrant `filter` body field when filters are provided.
 *  2. Only columns in SUPPORTED_VECTOR_FILTER_COLUMNS are forwarded.
 *  3. Array filter values are serialised as Qdrant `match: { any: [...] }`.
 *  4. Scalar filter values are serialised as Qdrant `match: { value: ... }`.
 *  5. No `filter` field is added when filters is empty or omitted.
 *  6. The returned `id` field is the chunk_id from the payload (issue #1 fix).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture every fetch call so we can inspect the request body
const fetchCalls = [];
const mockFetch = vi.fn(async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : {};
  fetchCalls.push({ url, body });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      result: [
        {
          id: "some-qdrant-uuid-1234",          // internal Qdrant UUID
          score: 0.85,
          payload: {
            chunk_id: "sprint-42-report:chunk:0", // semantic chunk_id
            path: "sprints/42.md",
            content: "sprint content",
            section: "overview",
            feature_area: "sprint",
            sprint: 42,
            source_type: "sprint_report",
            source: "sprints/42.md",
          },
        },
      ],
    }),
  };
});

describe("searchChunks — filter and id-space regression", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // ── Issue #1 fix: returned id is chunk_id from payload ───────────────────

  it("returns chunk_id from payload as id, not the Qdrant internal UUID", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    const results = await searchChunks([0.1, 0.2], 5, 0.4);

    expect(results).toHaveLength(1);
    // Must be the semantic chunk_id, NOT the internal Qdrant UUID
    expect(results[0].id).toBe("sprint-42-report:chunk:0");
    expect(results[0].id).not.toBe("some-qdrant-uuid-1234");
  });

  // ── Issue #3 fix: filter is forwarded to Qdrant ──────────────────────────

  it("includes a Qdrant filter body when scalar filters are provided", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4, { source_type: "sprint_report" });

    expect(fetchCalls).toHaveLength(1);
    const sentBody = fetchCalls[0].body;
    expect(sentBody.filter).toBeDefined();
    expect(sentBody.filter.must).toEqual(
      expect.arrayContaining([
        { key: "source_type", match: { value: "sprint_report" } },
      ]),
    );
  });

  it("serialises array filter values as match.any", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4, { sprint: [41, 42, 43] });

    const sentBody = fetchCalls[0].body;
    expect(sentBody.filter.must).toEqual(
      expect.arrayContaining([
        { key: "sprint", match: { any: [41, 42, 43] } },
      ]),
    );
  });

  it("combines multiple filter columns into a single must array", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4, {
      source_type: "sprint_report",
      feature_area: "auth",
    });

    const must = fetchCalls[0].body.filter.must;
    expect(must).toHaveLength(2);
    const keys = must.map((c) => c.key);
    expect(keys).toContain("source_type");
    expect(keys).toContain("feature_area");
  });

  it("omits unsupported filter columns", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    // "unsupported_col" is not in SUPPORTED_VECTOR_FILTER_COLUMNS
    await searchChunks([0.1, 0.2], 5, 0.4, {
      unsupported_col: "should-be-dropped",
      source_type: "markdown",
    });

    const must = fetchCalls[0].body.filter.must;
    const keys = must.map((c) => c.key);
    expect(keys).not.toContain("unsupported_col");
    expect(keys).toContain("source_type");
  });

  it("does not include a filter field when filters object is empty", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4, {});

    const sentBody = fetchCalls[0].body;
    expect(sentBody.filter).toBeUndefined();
  });

  it("does not include a filter field when filters argument is omitted", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4);

    const sentBody = fetchCalls[0].body;
    expect(sentBody.filter).toBeUndefined();
  });

  it("ignores null/undefined filter values", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4, {
      source_type: null,
      sprint: undefined,
    });

    const sentBody = fetchCalls[0].body;
    // All values were null/undefined → no must conditions → no filter
    expect(sentBody.filter).toBeUndefined();
  });

  it("ignores empty array filter values", async () => {
    const { searchChunks } = await import("../../src/llm/qdrant-client.js");

    await searchChunks([0.1, 0.2], 5, 0.4, { sprint: [] });

    const sentBody = fetchCalls[0].body;
    expect(sentBody.filter).toBeUndefined();
  });
});
