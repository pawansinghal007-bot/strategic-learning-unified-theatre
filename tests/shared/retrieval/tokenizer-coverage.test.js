/**
 * Coverage additions for tokenizer.js
 *
 * Targets the uncovered sections:
 * - getTokenizer() — success, failure, cached paths
 * - countTokens() — with array encoded results, object encoded results, fallback
 * - safeChunkHash() — with all property variants
 *
 * Strategy: single top-level vi.mock for @xenova/transformers; per-test
 * behavior is controlled by reconfiguring the mock implementation before
 * each dynamic import (combined with vi.resetModules() so the module is
 * re-evaluated with the latest mock).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Top-level mock — hoisted before any imports.
// The factory must be a plain function (no top-level variables).
const mockFromPretrained = vi.fn();
vi.mock("@xenova/transformers", () => ({
  GPT2Tokenizer: {
    from_pretrained: mockFromPretrained,
  },
}));

// Also mock the stableHash dependency so tokenizer.js can load cleanly.
vi.mock("../../../src/llm/agent-loop-guard.js", async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

// ─── getTokenizer ─────────────────────────────────────────────────────────────

describe("tokenizer coverage — getTokenizer", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFromPretrained.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns tokenizer on success", async () => {
    const fakeTokenizer = { encode: vi.fn(() => [1, 2, 3]) };
    mockFromPretrained.mockResolvedValue(fakeTokenizer);

    const { getTokenizer } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const tokenizer = await getTokenizer();

    expect(tokenizer).toBeDefined();
    expect(tokenizer).toBe(fakeTokenizer);
  });

  it("throws when tokenizer fails to load", async () => {
    mockFromPretrained.mockRejectedValue(new Error("tokenizer model not found"));

    const { getTokenizer } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );

    await expect(getTokenizer()).rejects.toThrow("tokenizer model not found");
  });

  it("caches tokenizer on second call", async () => {
    let callCount = 0;
    mockFromPretrained.mockImplementation(async () => {
      callCount++;
      return { encode: vi.fn(() => [1, 2, 3]) };
    });

    const { getTokenizer } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );

    await getTokenizer();
    await getTokenizer();

    // from_pretrained should only be called once due to caching
    expect(callCount).toBe(1);
  });
});

// ─── countTokens ─────────────────────────────────────────────────────────────

describe("tokenizer coverage — countTokens", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFromPretrained.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("counts tokens when encode returns an array", async () => {
    mockFromPretrained.mockResolvedValue({
      encode: vi.fn(() => [1, 2, 3]),
    });

    const { countTokens } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const count = await countTokens("hello world");

    expect(count).toBe(3);
  });

  it("counts tokens when encode returns an array of 5 items", async () => {
    mockFromPretrained.mockResolvedValue({
      encode: vi.fn(() => [1, 2, 3, 4, 5]),
    });

    const { countTokens } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const count = await countTokens("test input");

    expect(count).toBe(5);
  });

  it("counts tokens when encode returns an object with length", async () => {
    mockFromPretrained.mockResolvedValue({
      encode: vi.fn(() => ({ length: 4 })),
    });

    const { countTokens } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const count = await countTokens("object encoded");

    expect(count).toBe(4);
  });

  it("falls back to char-based estimation when tokenizer throws", async () => {
    mockFromPretrained.mockRejectedValue(new Error("tokenizer not available"));

    const { countTokens } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const count = await countTokens("hello world this is a test");

    // Fallback: roughly 1 token per 4 characters
    // "hello world this is a test" = 28 chars → Math.ceil(28/4) = 7
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(15);
  });

  it("handles empty string with zero tokens", async () => {
    mockFromPretrained.mockResolvedValue({
      encode: vi.fn(() => []),
    });

    const { countTokens } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const count = await countTokens("");

    expect(count).toBe(0);
  });

  it("handles very long text", async () => {
    const tokens = Array.from({ length: 1000 }, (_, i) => i);
    mockFromPretrained.mockResolvedValue({
      encode: vi.fn(() => tokens),
    });

    const { countTokens } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const count = await countTokens("x".repeat(10000));

    expect(count).toBe(1000);
  });
});

// ─── safeChunkHash ────────────────────────────────────────────────────────────
// safeChunkHash is synchronous and doesn't use the tokenizer — no mock needed.

describe("tokenizer coverage — safeChunkHash", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFromPretrained.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns chunk_hash if present", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({ chunk_hash: "abc123" });
    expect(hash).toBe("abc123");
  });

  it("returns hash if present", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({ hash: "def456" });
    expect(hash).toBe("def456");
  });

  it("generates hash from content property", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({ content: "test content" });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("generates hash from text property", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({ text: "some text" });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });

  it("generates consistent hash for same input", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash1 = safeChunkHash({ content: "same content" });
    const hash2 = safeChunkHash({ content: "same content" });

    expect(hash1).toBe(hash2);
  });

  it("generates different hash for different input", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash1 = safeChunkHash({ content: "content a" });
    const hash2 = safeChunkHash({ content: "content b" });

    expect(hash1).not.toBe(hash2);
  });

  it("handles object with multiple properties", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({
      content: "full content",
      path: "src/full.js",
      section: "api",
      doc_id: "doc-123",
    });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });

  it("handles object with no recognized properties (falls back to empty string hash)", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({ unknown_prop: "value" });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });

  it("handles empty object", async () => {
    const { safeChunkHash } = await import(
      "../../../src/shared/retrieval/tokenizer.js"
    );
    const hash = safeChunkHash({});

    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
  });
});
