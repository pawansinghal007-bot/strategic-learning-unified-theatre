/**
 * tests/shared/retrieval/execute-retrieve.test.ts
 *
 * Unit tests for src/shared/retrieval/execute-retrieve.ts
 *
 * Covers:
 *   - executeRetrieve: vector strategy (already covered by integration, but explicit here)
 *   - executeRetrieve: code strategy (already covered)
 *   - executeRetrieve: symbol strategy with results (BRDA:31,1,2 — UNCOVERED)
 *   - executeRetrieve: symbol strategy with empty results (BRDA:51,4,0 — UNCOVERED)
 *   - executeRetrieve: symbol strategy with non-empty results (BRDA:51,4,1 — UNCOVERED)
 *   - executeRetrieve: default/unknown strategy throw (BRDA:31,1,4 — UNCOVERED)
 *   - executeRetrieve: catch block with Error rejection (BRDA:64,5,0 — covered)
 *   - executeRetrieve: catch block with non-Error rejection (BRDA:64,5,1 — UNCOVERED)
 *   - executeRetrieve: result.error propagation (BRDA:27,0,0 — covered)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockRetrieve,
  mockFormatVectorResults,
  mockFormatCodeHits,
  mockFormatSymbolResults,
} = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockFormatVectorResults: vi.fn(),
  mockFormatCodeHits: vi.fn(),
  mockFormatSymbolResults: vi.fn(),
}));

vi.mock("../../../src/shared/retrieval/router.js", () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

vi.mock("../../../src/shared/retrieval/format.js", () => ({
  formatVectorResults: (...args: unknown[]) => mockFormatVectorResults(...args),
  formatCodeHits: (...args: unknown[]) => mockFormatCodeHits(...args),
  formatSymbolResults: (...args: unknown[]) => mockFormatSymbolResults(...args),
}));

// ─── module under test ────────────────────────────────────────────────────────

import { executeRetrieve } from "../../../src/shared/retrieval/execute-retrieve.js";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("executeRetrieve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("symbol strategy", () => {
    it("formats symbol results when strategy is symbol with non-empty results", async () => {
      const symbolResults = [
        {
          name: "runSubAgent",
          kind: "function",
          filePath: "src/agents/runner.ts",
          startLine: 10,
          endLine: 25,
        },
      ];
      const formatted = "1. runSubAgent (function) src/agents/runner.ts:10-25";

      mockRetrieve.mockResolvedValueOnce({
        strategy: "symbol",
        results: symbolResults,
      });
      mockFormatSymbolResults.mockReturnValueOnce(formatted);

      const result = await executeRetrieve("runSubAgent", { mode: "symbol" });

      expect(mockRetrieve).toHaveBeenCalledWith("runSubAgent", {
        mode: "symbol",
        topK: undefined,
        glob: undefined,
        callerIdentity: undefined,
      });
      expect(mockFormatSymbolResults).toHaveBeenCalledWith(symbolResults);
      expect(result).toEqual({ text: formatted });
    });

    it("returns empty message when symbol results are empty", async () => {
      mockRetrieve.mockResolvedValueOnce({
        strategy: "symbol",
        results: [],
      });
      mockFormatSymbolResults.mockReturnValueOnce("");

      const result = await executeRetrieve("unknownSymbol", { mode: "symbol" });

      expect(result).toEqual({
        text: `No symbol found for "unknownSymbol".`,
      });
    });
  });

  describe("default/unknown strategy", () => {
    it("returns error when strategy is unknown (throw caught by outer catch)", async () => {
      // Cast to bypass TypeScript type checking for the test scenario
      mockRetrieve.mockResolvedValueOnce({
        strategy: "unknown-strategy" as any,
        results: [],
      });

      const result = await executeRetrieve("test query");

      // The throw inside the switch's default case is caught by the outer try/catch,
      // so it returns an error object rather than propagating the exception
      expect(result).toEqual({
        error: "retrieve failed: Unknown strategy: unknown-strategy",
      });
    });
  });

  describe("error handling", () => {
    it("handles retrieve rejection with Error object", async () => {
      const error = new Error("network timeout");
      mockRetrieve.mockRejectedValueOnce(error);

      const result = await executeRetrieve("test query");

      expect(result).toEqual({
        error: "retrieve failed: network timeout",
      });
    });

    it("handles retrieve rejection with non-Error value", async () => {
      mockRetrieve.mockRejectedValueOnce("string error");

      const result = await executeRetrieve("test query");

      expect(result).toEqual({
        error: "retrieve failed: string error",
      });
    });

    it("handles retrieve rejection with number", async () => {
      mockRetrieve.mockRejectedValueOnce(42);

      const result = await executeRetrieve("test query");

      expect(result).toEqual({
        error: "retrieve failed: 42",
      });
    });
  });

  describe("result.error propagation", () => {
    it("returns error when retrieve returns error property", async () => {
      mockRetrieve.mockResolvedValueOnce({
        error: "search index not available",
      });

      const result = await executeRetrieve("test query");

      expect(result).toEqual({
        error: "retrieve failed: search index not available",
      });
    });
  });

  describe("vector strategy", () => {
    it("formats vector results correctly", async () => {
      const vectorResults = [
        { score: 0.95, source: "src/foo.ts", text: "foo content" },
      ];
      const formatted = "1. [score: 0.950] src/foo.ts\n   foo content";

      mockRetrieve.mockResolvedValueOnce({
        strategy: "vector",
        results: vectorResults,
      });
      mockFormatVectorResults.mockReturnValueOnce(formatted);

      const result = await executeRetrieve("test query");

      expect(result).toEqual({ text: formatted });
    });

    it("returns empty message when vector results are empty", async () => {
      mockRetrieve.mockResolvedValueOnce({
        strategy: "vector",
        results: [],
      });
      mockFormatVectorResults.mockReturnValueOnce("");

      const result = await executeRetrieve("test query");

      expect(result).toEqual({
        text: "No matching results in the vector store.",
      });
    });
  });

  describe("code strategy", () => {
    it("formats code results correctly", async () => {
      const codeHits = [
        { file: "src/foo.ts", line: 10, text: "export function foo()" },
      ];
      const formatted = "src/foo.ts:10: export function foo()";

      mockRetrieve.mockResolvedValueOnce({
        strategy: "code",
        results: codeHits,
      });
      mockFormatCodeHits.mockReturnValueOnce(formatted);

      const result = await executeRetrieve("foo", { mode: "code" });

      expect(result).toEqual({ text: formatted });
    });

    it("returns empty message when code results are empty", async () => {
      mockRetrieve.mockResolvedValueOnce({
        strategy: "code",
        results: [],
      });
      mockFormatCodeHits.mockReturnValueOnce("");

      const result = await executeRetrieve("nonexistent", { mode: "code" });

      expect(result).toEqual({
        text: 'No matches for "nonexistent".',
      });
    });
  });

  describe("file strategy", () => {
    it("returns file results as string", async () => {
      mockRetrieve.mockResolvedValueOnce({
        strategy: "file",
        results: "/path/to/file.ts",
      });

      const result = await executeRetrieve("src/file.ts", { mode: "file" });

      expect(result).toEqual({ text: "/path/to/file.ts" });
    });
  });
});
