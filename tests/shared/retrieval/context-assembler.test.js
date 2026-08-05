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
});
