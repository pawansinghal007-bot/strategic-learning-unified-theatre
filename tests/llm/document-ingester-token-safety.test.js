/**
 * tests/llm/document-ingester-token-safety.test.js
 *
 * Tests for estimateTokenCount() and chunkText() token-aware behavior.
 *
 * Covers:
 *   - estimateTokenCount(): empty, known length, whitespace-only
 *   - chunkText() with maxTokens: default cap, explicit override,
 *     maxChars vs token-derived cap interaction, overlap, regression guards,
 *     and the exact real production failure scenario
 */

import { describe, it, expect } from "vitest";

import {
  chunkText,
  estimateTokenCount,
} from "../../src/llm/document-ingester.js";

// ─── estimateTokenCount ──────────────────────────────────────────────────────

describe("estimateTokenCount", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("returns Math.ceil(length / 2) for a string of known length", () => {
    // 10 chars → ceil(10/2) = 5
    expect(estimateTokenCount("0123456789")).toBe(5);
    // 11 chars → ceil(11/2) = 6
    expect(estimateTokenCount("01234567890")).toBe(6);
    // 1 char → ceil(1/2) = 1
    expect(estimateTokenCount("x")).toBe(1);
    // 100 chars → ceil(100/2) = 50
    expect(estimateTokenCount("a".repeat(100))).toBe(50);
  });

  it("applies the same formula to whitespace-only strings", () => {
    // 8 spaces → ceil(8/2) = 4
    expect(estimateTokenCount("        ")).toBe(4);
    // 5 newlines → ceil(5/2) = 3
    expect(estimateTokenCount("\n\n\n\n\n")).toBe(3);
  });
});

// ─── chunkText with maxTokens ────────────────────────────────────────────────

describe("chunkText — token-aware maxTokens behavior", () => {
  it("default options: every chunk respects the 500-token ceiling", () => {
    // Dense code-like input: no natural whitespace breaks, 20000 chars
    // Under old behavior (maxChars=3000 alone), chunks would be 3000 chars
    // = 1500 estimated tokens each — way over 500
    const denseInput = "const x=1;".repeat(2000); // 20000 chars

    const chunks = chunkText(denseInput);

    for (const chunk of chunks) {
      expect(estimateTokenCount(chunk)).toBeLessThanOrEqual(500);
    }
  });

  it("default options: every chunk is <= 1000 chars (min(3000, 500*2))", () => {
    const denseInput = "const x=1;".repeat(2000);

    const chunks = chunkText(denseInput);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }
  });

  it("explicit maxTokens override: maxTokens=100 → effective cap is 200 chars", () => {
    const input = "abcdefghij".repeat(500); // 5000 chars

    const chunks = chunkText(input, { maxTokens: 100 });

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
      expect(estimateTokenCount(chunk)).toBeLessThanOrEqual(100);
    }
  });

  it("maxChars smaller than token-derived cap remains binding", () => {
    // maxChars=50, maxTokens=500 → token-derived cap = 1000
    // effectiveMaxChars = min(50, 1000) = 50
    const input = "abcdefghij".repeat(100); // 1000 chars

    const chunks = chunkText(input, { maxChars: 50, maxTokens: 500 });

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  it("empty text returns empty array (regression guard)", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
  });

  it("text shorter than effective cap returns exactly one chunk (regression guard)", () => {
    const shortText = "Hello, world!";

    const chunks = chunkText(shortText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(shortText);
  });

  it("overlap is still applied correctly under the new effective cap", () => {
    // effectiveMaxChars = min(3000, 500*2) = 1000
    // default overlap = 300
    // step = 1000 - 300 = 700
    // Chunk 0: chars 0-999, Chunk 1: chars 700-1699
    // Overlap region: chars 700-999 (300 chars)
    const input = "a".repeat(2000);

    const chunks = chunkText(input);

    expect(chunks.length).toBeGreaterThan(1);

    // The last `overlap` chars of chunk[0] should match the first `overlap` chars of chunk[1]
    const overlap = 300;
    const chunk0End = chunks[0].slice(-overlap);
    const chunk1Start = chunks[1].slice(0, overlap);
    expect(chunk0End).toBe(chunk1Start);
  });

  it("the exact real production failure scenario is now safe", () => {
    // The real failure: 16 chunks of ~3000 chars each (dense JSON/code)
    // produced a request of 23602 tokens, exceeding the 8192 context limit.
    //
    // Simulate: 16 chunks worth of dense content (16 * 3000 = 48000 chars)
    // Under OLD behavior (maxChars=3000, no token cap):
    //   Each chunk = 3000 chars → ~1500 tokens each
    //   16 chunks * 1500 = 24000 tokens → exceeds 8192
    //
    // Under NEW behavior (maxTokens=500 default):
    //   Each chunk = min(3000, 500*2) = 1000 chars → ~500 tokens each
    //   16 chunks * 500 = 8000 tokens → under 8192 ✓
    //   Actually we get more chunks now (48000/700 ≈ 69 chunks), but each
    //   is safely under 500 tokens.

    const denseJsonLike = '{"key":"value","data":"xxxx"}'.repeat(600); // ~30000 chars

    const chunks = chunkText(denseJsonLike);

    // Every individual chunk must be under 500 tokens
    for (const chunk of chunks) {
      expect(estimateTokenCount(chunk)).toBeLessThanOrEqual(500);
    }

    // Even if we batch all chunks together, the total should be manageable
    // (the embedder's token budget handles the batching, but at least no
    // single chunk can blow past the context window on its own)
    for (const chunk of chunks) {
      expect(estimateTokenCount(chunk)).toBeLessThanOrEqual(8192);
    }
  });
});
