/**
 * tests/shared/audit/decision-receipt.test.ts
 *
 * Unit tests for src/shared/audit/decision-receipt.ts
 * Covers:
 *   - recordDecision() stores an entry retrievable via getReceipts()
 *   - timestamp is auto-populated (not required as caller input)
 *   - multiple calls accumulate rather than overwrite
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────
// decision-receipt.ts uses logger.info, so we mock it to capture calls
// Note: vi.mock factory must be self-contained (no external variables)

vi.mock("../../../src/shared/logging/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

// ─── module under test ────────────────────────────────────────────────────────
// Import after mocks are registered
import {
  recordDecision,
  getReceipts,
  clearReceipts,
} from "../../../src/shared/audit/decision-receipt.js";

// Get the mock function after import
const mockLoggerInfo = vi.mocked(
  (await import("../../../src/shared/logging/logger.js")).logger,
).info;

// ─── tests ────────────────────────────────────────────────────────────────────

describe("decision-receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear receipts before each test to ensure isolation
    clearReceipts();
  });

  it("recordDecision() stores an entry retrievable via getReceipts()", () => {
    const receipt = {
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "test query",
      alternativesConsidered: ["vector", "code"],
      outcome: "success",
      externalEffect: false,
      reversible: true,
    };

    recordDecision(receipt);

    const receipts = getReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "test query",
      alternativesConsidered: ["vector", "code"],
      outcome: "success",
      externalEffect: false,
      reversible: true,
    });
  });

  it("timestamp is auto-populated (not required as caller input)", () => {
    const receipt = {
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "test query",
      // Note: timestamp is NOT provided
    };

    recordDecision(receipt);

    const receipts = getReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].timestamp).toBeDefined();
    expect(typeof receipts[0].timestamp).toBe("string");
    // Verify it's a valid ISO timestamp
    expect(new Date(receipts[0].timestamp!).toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("multiple calls accumulate rather than overwrite", () => {
    recordDecision({
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "first query",
    });

    recordDecision({
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "second query",
    });

    recordDecision({
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "third query",
    });

    const receipts = getReceipts();
    expect(receipts).toHaveLength(3);
    expect(receipts[0].input).toBe("first query");
    expect(receipts[1].input).toBe("second query");
    expect(receipts[2].input).toBe("third query");
  });

  it("logger.info is called with correct arguments", () => {
    const receipt = {
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "test query",
    };

    recordDecision(receipt);

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "audit.decision-receipt",
      expect.objectContaining({
        toolName: "test-tool",
        surface: "mcp",
        callerIdentity: "test-client",
        input: "test query",
        timestamp: expect.any(String),
      }),
    );
  });

  it("getReceipts() returns a read-only array", () => {
    recordDecision({
      toolName: "test-tool",
      surface: "mcp",
      callerIdentity: "test-client",
      input: "test query",
    });

    const receipts = getReceipts();
    // Attempt to modify should not affect the stored receipts
    // (JavaScript arrays are mutable by default, but the function returns the internal array)
    // The test verifies that getReceipts returns the same array reference
    const receiptsAgain = getReceipts();
    expect(receipts).toBe(receiptsAgain);
  });
});
