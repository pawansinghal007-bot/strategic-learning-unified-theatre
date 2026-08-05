/**
 * Regression tests for context-assembler.js budget-warning logging (issue #4).
 *
 * Before the fix, assembleContextFromChunks() silently returned
 * { content: "", warning: "..." } when no chunks fit the budget or the budget
 * was misconfigured — nothing was logged, so operators had no visibility.
 *
 * Confirms that:
 *  1. logger.warn("retrieval.context-budget", ...) fires when budget <= 0.
 *  2. logger.warn("retrieval.context-budget", ...) fires when chunks exist but
 *     none fit within the available token budget.
 *  3. The warn payload contains { reason, budget, maxContextTokens, headroomTokens }.
 *  4. logger.warn is NOT called when at least one chunk is selected.
 *  5. The return shape is unchanged (content/selected/warning/budget/…).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock the logger ──────────────────────────────────────────────────────────
vi.mock("../../../src/shared/logging/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── mock tokenizer so word count == token count (deterministic) ─────────────
vi.mock("../../../src/shared/retrieval/tokenizer.js", async () => {
  const actual = await vi.importActual(
    "../../../src/shared/retrieval/tokenizer.js",
  );
  return {
    ...actual,
    countTokens: vi.fn(async (text) =>
      String(text).split(/\s+/).filter(Boolean).length,
    ),
  };
});

import { assembleContextFromChunks } from "../../../src/shared/retrieval/context-assembler.js";
import { logger } from "../../../src/shared/logging/logger.js";

describe("assembleContextFromChunks — budget-warning logging regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Case 1: budget <= 0 ─────────────────────────────────────────────────

  it("logs a warn when the configured budget is <= 0", async () => {
    const result = await assembleContextFromChunks(
      [{ text: "short text", score: 0.9 }],
      {
        maxContextTokens: 4,
        headroomTokens: 2,
        systemTokens: 1,
        userQueryTokens: 1,
        responseTokens: 4, // sum > maxContextTokens → budget ≤ 0
      },
    );

    expect(result.content).toBe("");
    expect(result.warning).toBe(
      "Configured prompt budget is too small for retrieval context.",
    );

    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "retrieval.context-budget",
      expect.objectContaining({
        reason: "Configured prompt budget is too small for retrieval context.",
        budget: expect.any(Number),
        maxContextTokens: 4,
        headroomTokens: 2,
      }),
    );
  });

  // ── Case 2: chunks exist but none fit the budget ─────────────────────────

  it("logs a warn when chunks are present but none fit within the token budget", async () => {
    // "one two three four five six seven eight nine ten" = 10 tokens
    // Budget will be 1 token, so the chunk cannot fit
    const result = await assembleContextFromChunks(
      [{ text: "one two three four five six seven eight nine ten", score: 0.9 }],
      {
        maxContextTokens: 8,
        headroomTokens: 1,
        systemTokens: 1,
        userQueryTokens: 1,
        responseTokens: 4, // leaves budget = 8-1-1-1-4 = 1 token
      },
    );

    expect(result.content).toBe("");
    expect(result.warning).toBe(
      "No retrieved chunks fit within the available context budget.",
    );

    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "retrieval.context-budget",
      expect.objectContaining({
        reason: "No retrieved chunks fit within the available context budget.",
        budget: expect.any(Number),
      }),
    );
  });

  // ── Case 3: warn payload contains all expected fields ────────────────────

  it("includes budget, maxContextTokens, and headroomTokens in the warn payload", async () => {
    await assembleContextFromChunks(
      [{ text: "word ".repeat(50), score: 0.9 }],
      {
        maxContextTokens: 10,
        headroomTokens: 3,
        systemTokens: 0,
        userQueryTokens: 0,
        responseTokens: 8, // budget = 10-3-8 = -1 → clamped to 0
      },
    );

    const [, payload] = vi.mocked(logger.warn).mock.calls[0];
    expect(payload).toHaveProperty("reason");
    expect(payload).toHaveProperty("budget");
    expect(payload).toHaveProperty("maxContextTokens", 10);
    expect(payload).toHaveProperty("headroomTokens", 3);
  });

  // ── Case 4: warn is NOT called when chunks are selected ──────────────────

  it("does NOT call logger.warn when at least one chunk fits the budget", async () => {
    const result = await assembleContextFromChunks(
      [{ text: "one two three", score: 0.9 }],
      {
        maxContextTokens: 20,
        headroomTokens: 1,
        systemTokens: 0,
        userQueryTokens: 0,
        responseTokens: 4, // budget = 15 tokens — chunk (3 tokens) fits
      },
    );

    expect(result.content).not.toBe("");
    expect(result.selected.length).toBeGreaterThan(0);
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  // ── Case 5: return shape is unchanged after the fix ──────────────────────

  it("return shape is unchanged: content/selected/tokenCount/budget/warning present", async () => {
    const resultEmpty = await assembleContextFromChunks(
      [{ text: "word ".repeat(100), score: 0.9 }],
      {
        maxContextTokens: 5,
        headroomTokens: 1,
        systemTokens: 0,
        userQueryTokens: 0,
        responseTokens: 4, // budget = 0
      },
    );

    expect(resultEmpty).toHaveProperty("content", "");
    expect(resultEmpty).toHaveProperty("selected");
    expect(resultEmpty).toHaveProperty("tokenCount", 0);
    expect(resultEmpty).toHaveProperty("budget");
    expect(resultEmpty).toHaveProperty("maxContextTokens");
    expect(resultEmpty).toHaveProperty("headroomTokens");
    expect(resultEmpty).toHaveProperty("warning");
  });

  it("return shape is unchanged when chunks are selected (no warning field)", async () => {
    const result = await assembleContextFromChunks(
      [{ text: "hello world", score: 0.8 }],
      {
        maxContextTokens: 50,
        headroomTokens: 1,
        systemTokens: 0,
        userQueryTokens: 0,
        responseTokens: 4,
      },
    );

    expect(result).toHaveProperty("content");
    expect(result.content).not.toBe("");
    expect(result).toHaveProperty("selected");
    expect(result).toHaveProperty("tokenCount");
    expect(result).toHaveProperty("budget");
    expect(result).not.toHaveProperty("warning");
  });
});
