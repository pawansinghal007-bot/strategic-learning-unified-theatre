/**
 * Regression tests for enforcePromptBudget() function
 *
 * Tests all major code paths:
 *   1. Under-budget prompt passes through unchanged (no warning logged)
 *   2. Workspace-context-drop path (context block dropped first, if under budget after, no further trimming)
 *   3. TOOL-RESULT-trim path with EARLY/LATE markers to verify tail preservation
 *   4. userPrompt protection (hardened behavior from Prompt 2)
 *   5. Warning logged with original and trimmed lengths
 *   6. Budget from constraints.maxTokens (derives from maxTokens, not default)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { enforcePromptBudget } from "../../src/llm/gateway.js";
import { logger } from "../../src/shared/logging/logger.js";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/shared/logging/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET_CHARS = 6000; // 1500 tokens * 4 chars/token

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a string of exact length
 */
function makeString(length: number): string {
  return "x".repeat(length);
}

/**
 * Create a TOOL RESULT block with EARLY and LATE markers
 */
function makeToolResultBlock(
  earlyContent: string,
  lateContent: string,
): string {
  // TOOL RESULT pattern must be at the END for regex to match
  // The pattern is /(\n\n)?TOOL RESULT:[\s\S]*$/i
  return `Some context before\n\nTOOL RESULT:${earlyContent} ${lateContent}`;
}

/**
 * Count occurrences of a substring in a string
 */
function countOccurrences(str: string, substr: string): number {
  let count = 0;
  let index = 0;
  while ((index = str.indexOf(substr, index)) !== -1) {
    count++;
    index += substr.length;
  }
  return count;
}

/**
 * Check if a string contains the tail portion (LATE marker) after truncation
 */
function containsTailPortion(str: string): boolean {
  return (
    str.includes("TOOL RESULT LATE:") && !str.includes("TOOL RESULT EARLY:")
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("enforcePromptBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Under-budget prompt passes through unchanged (no warning logged)
  // -------------------------------------------------------------------------
  it("returns unchanged prompt when under budget", () => {
    const prompt = "Hello, world!";
    const result = enforcePromptBudget(prompt);

    expect(result.trimmedPrompt).toBe(prompt);
    expect(result.originalLength).toBe(prompt.length);
    expect(result.trimmedLength).toBe(prompt.length);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: Workspace-context-drop path
  // -------------------------------------------------------------------------
  it("drops workspace context first when over budget", () => {
    // Workspace context is 2000 chars, user prompt is 1000 chars = 3000 total
    // Budget is 1500 chars, so workspace context should be dropped
    const workspaceContext = "WORKSPACE CONTEXT: " + makeString(2000);
    const userPromptText = makeString(1000);
    const prompt = `${workspaceContext}\n\nUser request: ${userPromptText}`;
    const budgetChars = 1500; // 375 tokens

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 375 },
      workspaceContext,
      userPromptText,
    );

    // Workspace context should be dropped
    expect(result.trimmedPrompt).not.toContain("WORKSPACE CONTEXT");
    // User prompt should be preserved
    expect(result.trimmedPrompt).toContain(userPromptText);
    // Should not have logged "cannot-truncate-no-boundary"
    const cannotTruncateCalls = logger.warn.mock.calls.filter(
      (call) => call[0] === "gateway.prompt.cannot-truncate-no-boundary",
    );
    expect(cannotTruncateCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: TOOL-RESULT-trim path with EARLY/LATE markers to verify tail preservation
  // -------------------------------------------------------------------------
  it("truncates TOOL RESULT from end, keeping tail (most recent) portion", () => {
    // TOOL RESULT pattern must be at the END of the prompt for the regex to match
    // Use unique markers to verify tail preservation
    // Note: makeString creates 'x' characters, so we need actual markers in the content
    // The tail portion is kept, so put LATE: at the END of the TOOL RESULT block
    const earlyContent = "EARLY:" + "x".repeat(3000); // This should be dropped
    const lateContent = "x".repeat(1000) + "LATE:"; // LATE: at the END for tail preservation
    // TOOL RESULT pattern at the end for regex to match
    const toolResultBlock = `TOOL RESULT:${earlyContent} ${lateContent}`;
    // Prompt has context before TOOL RESULT
    const prompt = `User request: some context\n\n${toolResultBlock}`;
    const budgetChars = 500; // Very small budget to force truncation

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 125 },
      undefined,
      "User request:",
    );

    // Should contain LATE marker (tail preservation - LATE: is at the END)
    expect(result.trimmedPrompt).toContain("LATE:");
    // Should NOT contain EARLY marker (EARLY: is at the BEGINNING, should be dropped)
    expect(result.trimmedPrompt).not.toContain("EARLY:");
    // Should have compressed marker
    expect(result.trimmedPrompt).toContain("[compressed]");
  });

  // -------------------------------------------------------------------------
  // Test 4: userPrompt protection (hardened behavior from Prompt 2)
  // -------------------------------------------------------------------------
  it("never truncates userPrompt when explicit boundary provided", () => {
    const userPromptText =
      "This is the user prompt that must never be truncated";
    const toolResult = "TOOL RESULT: " + makeString(5000);
    const prompt = `${toolResult}\n\nUser request: ${userPromptText}`;
    const budgetChars = 500; // Very small budget

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 125 },
      undefined,
      userPromptText,
    );

    // User prompt should be completely preserved
    expect(result.trimmedPrompt).toContain(userPromptText);
    // Should NOT have logged "cannot-truncate-no-boundary" because "User request:" marker exists
    const cannotTruncateCalls = logger.warn.mock.calls.filter(
      (call) => call[0] === "gateway.prompt.cannot-truncate-no-boundary",
    );
    expect(cannotTruncateCalls).toHaveLength(0);
    // Should have logged "gateway.prompt.truncated" because prompt was over budget
    const truncatedCalls = logger.warn.mock.calls.filter(
      (call) => call[0] === "gateway.prompt.truncated",
    );
    expect(truncatedCalls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Test 5: Warning logged with original and trimmed lengths
  // -------------------------------------------------------------------------
  it("logs warning with original and trimmed lengths when trimming occurs", () => {
    // Add TOOL RESULT pattern at the end so it can be truncated
    const earlyContent = makeString(8000); // This should be dropped
    const lateContent = makeString(2000); // This should be kept
    const prompt = `User request: some context\n\nTOOL RESULT:${earlyContent} ${lateContent}`;
    const budgetChars = 1500; // 375 tokens

    const result = enforcePromptBudget(prompt, { maxTokens: 375 });

    // Should have trimmed
    expect(result.trimmedLength).toBeLessThan(result.originalLength);
    // Should have logged "gateway.prompt.trimmed" or "gateway.prompt.truncated"
    const trimmedCalls = logger.warn.mock.calls.filter(
      (call) =>
        call[0] === "gateway.prompt.trimmed" ||
        call[0] === "gateway.prompt.truncated",
    );
    expect(trimmedCalls).toHaveLength(1);
    // Check that originalLength and trimmedLength are in the context
    expect(trimmedCalls[0][1]).toMatchObject({
      originalLength: result.originalLength,
      trimmedLength: result.trimmedLength,
    });
  });

  // -------------------------------------------------------------------------
  // Test 6: Budget from constraints.maxTokens (derives from maxTokens, not default)
  // -------------------------------------------------------------------------
  it("uses budget from constraints.maxTokens when provided", () => {
    // Add TOOL RESULT pattern at the end so it can be truncated
    const earlyContent = makeString(8000); // This should be dropped
    const lateContent = makeString(2000); // This should be kept
    const prompt = `User request: some context\n\nTOOL RESULT:${earlyContent} ${lateContent}`;
    const customMaxTokens = 500; // 2000 chars budget
    const budgetChars = customMaxTokens * CHARS_PER_TOKEN;

    const result = enforcePromptBudget(prompt, { maxTokens: customMaxTokens });

    // Should be trimmed to approximately custom budget
    expect(result.trimmedLength).toBeLessThanOrEqual(budgetChars + 32); // +32 for compression padding
    expect(result.trimmedLength).toBeLessThan(DEFAULT_BUDGET_CHARS); // Should be less than default
  });

  // -------------------------------------------------------------------------
  // Test 7: True fail-safe — no marker at all returns original untouched prompt
  // -------------------------------------------------------------------------
  it("returns original untouched prompt when no 'User request:' marker exists (true fail-safe)", () => {
    // Plain over-budget blob with NO "User request:" marker anywhere
    // This exercises the markerFound:false path (true fail-safe)
    const uniqueMarker = "UNIQUE_FAILSAFE_MARKER_12345";
    const prompt = `${uniqueMarker}_${makeString(8000)}`; // 8025 chars, over budget
    const budgetChars = 1500; // 375 tokens

    const result = enforcePromptBudget(
      prompt,
      { maxTokens: 375 },
      undefined, // no workspace context
      undefined, // no explicit userPrompt boundary
    );

    // Must return the ORIGINAL untouched prompt (true fail-safe)
    expect(result.trimmedPrompt).toBe(prompt);
    expect(result.trimmedLength).toBe(result.originalLength);
    expect(result.trimmedLength).toBeGreaterThan(budgetChars); // Over budget, but untrimmed

    // Must log the cannot-truncate-no-boundary warning
    const cannotTruncateCalls = logger.warn.mock.calls.filter(
      (call) => call[0] === "gateway.prompt.cannot-truncate-no-boundary",
    );
    expect(cannotTruncateCalls).toHaveLength(1);
    expect(cannotTruncateCalls[0][1]).toMatchObject({
      reason: "budget_exceeded_but_no_user_prompt_boundary",
    });

    // Verify the unique marker is still present (prompt was not modified)
    expect(result.trimmedPrompt).toContain(uniqueMarker);
  });
});
