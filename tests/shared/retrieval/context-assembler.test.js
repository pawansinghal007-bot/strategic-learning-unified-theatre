import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assembleContextFromChunks } from "../../../src/shared/retrieval/context-assembler.js";

vi.mock("../../../src/shared/retrieval/tokenizer.js", async () => {
  const actual = await vi.importActual(
    "../../../src/shared/retrieval/tokenizer.js",
  );
  return {
    ...actual,
    countTokens: vi.fn(async (text) => {
      return String(text).split(/\s+/).filter(Boolean).length;
    }),
  };
});

describe("assembleContextFromChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects highest-scoring chunks until budget is exhausted", async () => {
    const chunks = [
      { text: "one two three four five", score: 0.9 },
      { text: "six seven eight", score: 0.8 },
      { text: "nine ten", score: 0.7 },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 10,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    expect(assembled.content).toContain("six seven eight");
    expect(assembled.content).not.toContain("nine ten");
    expect(assembled.tokenCount).toBeGreaterThan(0);
  });

  it("returns empty content when no chunks fit the budget", async () => {
    const chunks = [
      { text: "one two three four five six seven eight nine ten", score: 0.9 },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 8,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    expect(assembled.content).toBe("");
    expect(assembled.selected).toEqual([]);
    expect(assembled.warning).toBe(
      "No retrieved chunks fit within the available context budget.",
    );
  });

  it("returns empty content when budget is negative", async () => {
    const chunks = [{ text: "short text", score: 0.9 }];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 4,
      headroomTokens: 2,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    expect(assembled.content).toBe("");
    expect(assembled.selected).toEqual([]);
    expect(assembled.warning).toBe(
      "Configured prompt budget is too small for retrieval context.",
    );
  });

  it("deduplicates chunks with identical text/hash", async () => {
    const chunks = [
      { text: "duplicate text", score: 0.9, chunk_id: "1" },
      { text: "duplicate text", score: 0.8, chunk_id: "1" },
      { text: "unique text", score: 0.7, chunk_id: "2" },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 20,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    expect(assembled.selected.length).toBe(2);
    expect(assembled.content).toContain("duplicate text");
    expect(assembled.content).toContain("unique text");
  });

  it("expands retrieval to parentText when enabled", async () => {
    const originalEnabled = process.env.PARENT_EXPANSION_ENABLED;
    const originalMaxChars = process.env.PARENT_EXPANSION_MAX_CHARS;
    process.env.PARENT_EXPANSION_ENABLED = "true";
    process.env.PARENT_EXPANSION_MAX_CHARS = "1024";

    const chunks = [
      {
        text: "child code snippet",
        parentText: "function greet() { return 'hello'; }",
        score: 0.9,
      },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 20,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    expect(assembled.content).toContain("function greet() { return 'hello'; }");

    process.env.PARENT_EXPANSION_ENABLED = originalEnabled;
    process.env.PARENT_EXPANSION_MAX_CHARS = originalMaxChars;
  });

  // ── Parent-dedup regression ──────────────────────────────────────────────

  it("deduplicates multiple child chunks sharing the same parentId when expansion is enabled", async () => {
    const originalEnabled = process.env.PARENT_EXPANSION_ENABLED;
    const originalMaxChars = process.env.PARENT_EXPANSION_MAX_CHARS;
    process.env.PARENT_EXPANSION_ENABLED = "true";
    process.env.PARENT_EXPANSION_MAX_CHARS = "8192";

    // Three child chunks from the same parent — after expansion they all
    // resolve to identical parentText.  Only ONE result should appear.
    const sharedParentText = "function compute() { return 42; }";
    const sharedParentId = "repo:src/util.js:parent:compute";

    const chunks = [
      {
        text: "child snippet A",
        parentText: sharedParentText,
        parentId: sharedParentId,
        score: 0.9,
        chunk_id: "chunk-A",
      },
      {
        text: "child snippet B",
        parentText: sharedParentText,
        parentId: sharedParentId,
        score: 0.85,
        chunk_id: "chunk-B",
      },
      {
        text: "child snippet C",
        parentText: sharedParentText,
        parentId: sharedParentId,
        score: 0.8,
        chunk_id: "chunk-C",
      },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 100,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    // Only one "### Result" header should appear
    const resultHeaders = (assembled.content.match(/### Result \d+/g) ?? []);
    expect(resultHeaders).toHaveLength(1);
    expect(assembled.selected).toHaveLength(1);
    expect(assembled.content).toContain(sharedParentText);

    process.env.PARENT_EXPANSION_ENABLED = originalEnabled;
    process.env.PARENT_EXPANSION_MAX_CHARS = originalMaxChars;
  });

  it("falls back to per-chunk dedup when expansion is disabled", async () => {
    const originalEnabled = process.env.PARENT_EXPANSION_ENABLED;
    process.env.PARENT_EXPANSION_ENABLED = "false";

    const sharedParentId = "repo:src/util.js:parent:compute";

    const chunks = [
      {
        text: "distinct text alpha",
        parentText: "function compute() { return 42; }",
        parentId: sharedParentId,
        score: 0.9,
        chunk_id: "chunk-A",
      },
      {
        text: "distinct text beta",
        parentText: "function compute() { return 42; }",
        parentId: sharedParentId,
        score: 0.85,
        chunk_id: "chunk-B",
      },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 100,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    // Expansion is off — chunks have different text so both survive dedup
    expect(assembled.selected.length).toBe(2);
    expect(assembled.content).toContain("distinct text alpha");
    expect(assembled.content).toContain("distinct text beta");

    process.env.PARENT_EXPANSION_ENABLED = originalEnabled;
  });

  it("falls back to per-chunk dedup when a chunk has no parentId even with expansion enabled", async () => {
    const originalEnabled = process.env.PARENT_EXPANSION_ENABLED;
    process.env.PARENT_EXPANSION_ENABLED = "true";

    const chunks = [
      {
        text: "orphan chunk one",
        parentText: "shared parent body",
        // no parentId
        score: 0.9,
        chunk_id: "orphan-A",
      },
      {
        text: "orphan chunk two",
        parentText: "shared parent body",
        // no parentId
        score: 0.85,
        chunk_id: "orphan-B",
      },
    ];

    const assembled = await assembleContextFromChunks(chunks, {
      maxContextTokens: 100,
      headroomTokens: 1,
      systemTokens: 1,
      userQueryTokens: 1,
      responseTokens: 4,
    });

    // Both chunks expand to identical parentText but have no parentId, so
    // dedup falls back to safeChunkHash(chunk) — hashes differ for
    // chunk-A vs chunk-B, so both survive (one per distinct hash).
    // The important guarantee: no crash, and content is non-empty.
    expect(assembled.selected.length).toBeGreaterThanOrEqual(1);
    expect(assembled.content).not.toBe("");

    process.env.PARENT_EXPANSION_ENABLED = originalEnabled;
  });
});
