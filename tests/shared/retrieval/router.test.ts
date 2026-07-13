/**
 * tests/shared/retrieval/router.test.ts
 *
 * Unit tests for src/shared/retrieval/router.ts
 *
 * Covers:
 *   - chooseStrategy heuristic logic for all strategy types
 *   - Explicit mode override always wins
 *   - retrieve() dispatches to correct underlying method
 *   - retrieve() error propagation: error vs. empty-success are structurally distinguishable
 *   - decision-receipt logging with alternativesConsidered populated correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockVectorSearch,
  mockSearchCode,
  mockFindSymbolDefinition,
  mockRecordDecision,
} = vi.hoisted(() => ({
  mockVectorSearch: vi.fn(),
  mockSearchCode: vi.fn(),
  mockFindSymbolDefinition: vi.fn(),
  mockRecordDecision: vi.fn(),
}));

vi.mock("../../../src/shared/retrieval/vector-client", () => ({
  vectorSearch: (...args: unknown[]) => mockVectorSearch(...args),
}));

vi.mock("../../../src/shared/retrieval/code-search", () => ({
  searchCode: (...args: unknown[]) => mockSearchCode(...args),
}));

vi.mock("../../../src/shared/retrieval/symbol-search", () => ({
  findSymbolDefinition: (...args: unknown[]) =>
    mockFindSymbolDefinition(...args),
}));

vi.mock("../../../src/shared/audit/decision-receipt.js", () => ({
  recordDecision: (receipt: Record<string, unknown>) => {
    const entry = {
      ...receipt,
      timestamp: new Date().toISOString(),
    };
    mockRecordDecision(entry);
  },
}));

// ─── module under test ────────────────────────────────────────────────────────

import {
  chooseStrategy,
  retrieve,
} from "../../../src/shared/retrieval/router.js";
import { getRepositoryId } from "../../../src/shared/retrieval/repository-id.js";
import { routerFixtures } from "./router.fixtures.js";

// ─── tests ────────────────────────────────────────────────────────────────────

describe("chooseStrategy", () => {
  // ── fixture-based tests ────────────────────────────────────────────────────

  for (const fixture of routerFixtures) {
    it(`routes query="${fixture.query}" mode=${fixture.mode ?? "undefined"} → ${fixture.expected}`, () => {
      const result = chooseStrategy(fixture.query, fixture.mode);
      expect(result).toBe(fixture.expected);
    });
  }

  // ── specific strategy tests ────────────────────────────────────────────────

  describe("path-like heuristic", () => {
    it("routes queries with '/' AND file extension to 'file'", () => {
      expect(chooseStrategy("src/foo.ts")).toBe("file");
      expect(chooseStrategy("docs/readme.md")).toBe("file");
      expect(chooseStrategy("path/to/file.js")).toBe("file");
    });

    it("does NOT route to 'file' if no '/' present", () => {
      expect(chooseStrategy("file.ts")).toBe("vector");
      expect(chooseStrategy("readme.md")).toBe("vector");
      expect(chooseStrategy("config.json")).toBe("vector");
    });

    it("does NOT route to 'file' if no plausible extension", () => {
      expect(chooseStrategy("src/foo")).toBe("vector");
      expect(chooseStrategy("path/to/noext")).toBe("vector");
    });
  });

  describe("symbol-like heuristic", () => {
    it("routes camelCase to 'code'", () => {
      expect(chooseStrategy("runSubAgent")).toBe("code");
      expect(chooseStrategy("executeToolCall")).toBe("code");
    });

    it("routes PascalCase to 'code'", () => {
      expect(chooseStrategy("SubAgent")).toBe("code");
      expect(chooseStrategy("ToolCall")).toBe("code");
    });

    it("routes snake_case to 'code'", () => {
      expect(chooseStrategy("run_sub_agent")).toBe("code");
      expect(chooseStrategy("execute_tool_call")).toBe("code");
    });

    it("routes quoted strings to 'code'", () => {
      expect(chooseStrategy('"runSubAgent"')).toBe("code");
      expect(chooseStrategy("'executeToolCall'")).toBe("code");
    });

    it("routes regex metacharacters to 'code'", () => {
      expect(chooseStrategy("runSubAgent.*")).toBe("code");
      expect(chooseStrategy("test\\[\\d+\\]")).toBe("code");
    });
  });

  describe("vector default", () => {
    it("routes natural language questions to 'vector'", () => {
      expect(chooseStrategy("how does it work")).toBe("vector");
      expect(chooseStrategy("explain the mechanism")).toBe("vector");
    });

    it("routes ambiguous single words to 'vector'", () => {
      expect(chooseStrategy("function")).toBe("vector");
      expect(chooseStrategy("variable")).toBe("vector");
    });
  });

  describe("override wins", () => {
    it("mode='vector' overrides heuristic even for path-like queries", () => {
      expect(chooseStrategy("src/foo.ts", "vector")).toBe("vector");
    });

    it("mode='code' overrides heuristic even for vector-like queries", () => {
      expect(chooseStrategy("how does it work", "code")).toBe("code");
    });

    it("mode='file' overrides heuristic even for symbol-like queries", () => {
      expect(chooseStrategy("runSubAgent", "file")).toBe("file");
    });
  });
});

describe("retrieve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── dispatch tests ─────────────────────────────────────────────────────────

  it("dispatches to vectorSearch for 'vector' strategy", async () => {
    mockVectorSearch.mockResolvedValueOnce([
      { score: 0.9, source: "x.ts", text: "y" },
    ]);

    const result = await retrieve("how does it work");

    expect(result.strategy).toBe("vector");
    expect(result.results).toEqual([{ score: 0.9, source: "x.ts", text: "y" }]);
    expect(mockVectorSearch).toHaveBeenCalledWith("how does it work", 5);
  });

  it("dispatches to searchCode for 'code' strategy", async () => {
    mockSearchCode.mockResolvedValueOnce([
      { file: "x.ts", line: 1, text: "y" },
    ]);

    const result = await retrieve("runSubAgent");

    expect(result.strategy).toBe("code");
    expect(result.results).toEqual([{ file: "x.ts", line: 1, text: "y" }]);
    expect(mockSearchCode).toHaveBeenCalledWith("runSubAgent", undefined);
  });

  it("passes topK to vectorSearch when provided", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    const result = await retrieve("how does it work", { topK: 10 });

    expect(result.strategy).toBe("vector");
    expect(mockVectorSearch).toHaveBeenCalledWith("how does it work", 10);
  });

  it("passes glob to searchCode when provided", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    const result = await retrieve("runSubAgent", { glob: "src/agents" });

    expect(result.strategy).toBe("code");
    expect(mockSearchCode).toHaveBeenCalledWith("runSubAgent", "src/agents");
  });

  // ── error propagation tests ────────────────────────────────────────────────

  it("returns { strategy, error } when vectorSearch throws", async () => {
    mockVectorSearch.mockRejectedValueOnce(new Error("Connection failed"));

    const result = await retrieve("how does it work");

    expect(result.strategy).toBe("vector");
    expect(result.error).toBe("Connection failed");
    expect(result.results).toBeUndefined();
  });

  it("returns { strategy, error } when searchCode throws", async () => {
    mockSearchCode.mockRejectedValueOnce(new Error("Ripgrep not found"));

    const result = await retrieve("runSubAgent");

    expect(result.strategy).toBe("code");
    expect(result.error).toBe("Ripgrep not found");
    expect(result.results).toBeUndefined();
  });

  it("returns { strategy, error } when fs.readFile throws (file strategy)", async () => {
    // Force 'file' strategy with a non-existent path
    const result = await retrieve("nonexistent/file.ts");

    expect(result.strategy).toBe("file");
    expect(result.error).toBeDefined();
    expect(result.results).toBeUndefined();
  });

  it("dispatches to findSymbolDefinition for 'symbol' strategy", async () => {
    mockFindSymbolDefinition.mockResolvedValueOnce([
      {
        name: "SubAgent",
        kind: "class",
        filePath: "src/agents/sub-agent.ts",
        startLine: 1,
        endLine: 50,
      },
    ]);

    const result = await retrieve("SubAgent", { mode: "symbol" });

    expect(result.strategy).toBe("symbol");
    expect(result.results).toEqual([
      {
        name: "SubAgent",
        kind: "class",
        filePath: "src/agents/sub-agent.ts",
        startLine: 1,
        endLine: 50,
      },
    ]);
    expect(mockFindSymbolDefinition).toHaveBeenCalledWith(
      "SubAgent",
      getRepositoryId(),
    );
  });

  it("returns { strategy, error } when findSymbolDefinition throws", async () => {
    mockFindSymbolDefinition.mockRejectedValueOnce(
      new Error("DB connection refused"),
    );

    const result = await retrieve("anything", { mode: "symbol" });

    expect(result.strategy).toBe("symbol");
    expect(result.error).toBe("DB connection refused");
    expect(result.results).toBeUndefined();
  });

  it("returns empty array from symbol strategy when no symbols found", async () => {
    mockFindSymbolDefinition.mockResolvedValueOnce([]);

    const result = await retrieve("noSuchSymbol", { mode: "symbol" });

    expect(result.strategy).toBe("symbol");
    expect(result.results).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("error vs. empty-success are structurally distinguishable", async () => {
    // Error case
    mockVectorSearch.mockRejectedValueOnce(new Error("Timeout"));

    const errorResult = await retrieve("query");

    // Error result has error set and results undefined
    expect(errorResult.error).toBeDefined();
    expect(errorResult.results).toBeUndefined();

    // Empty-success case (mock returns empty array)
    mockVectorSearch.mockResolvedValueOnce([]);

    const emptyResult = await retrieve("query");

    // Empty-success result has results as empty array and no error
    expect(emptyResult.results).toEqual([]);
    expect(emptyResult.error).toBeUndefined();

    // They are structurally distinguishable
    expect(
      errorResult.error !== undefined && emptyResult.results?.length === 0,
    ).toBe(true);
  });

  // ── decision-receipt tests ─────────────────────────────────────────────────

  describe("decision-receipt logging", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("calls recordDecision with alternativesConsidered for 'vector' strategy", async () => {
      mockVectorSearch.mockResolvedValueOnce([]);

      const result = await retrieve("how does it work");

      expect(result.strategy).toBe("vector");
      expect(mockRecordDecision).toHaveBeenCalled();
      expect(mockRecordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "retrieve",
          surface: "mcp",
          input: "how does it work",
          alternativesConsidered: expect.arrayContaining(["code", "file"]),
        }),
      );
      // Verify alternativesConsidered has exactly 3 items (the other strategies,
      // now including "symbol" added in the retrieval-first symbol strategy work)
      const callArgs = mockRecordDecision.mock.calls.at(-1)?.[0];
      expect(callArgs.alternativesConsidered).toHaveLength(3);
      expect(callArgs.alternativesConsidered).not.toContain("vector");
    });

    it("calls recordDecision with alternativesConsidered for 'code' strategy", async () => {
      mockSearchCode.mockResolvedValueOnce([]);

      const result = await retrieve("runSubAgent");

      expect(result.strategy).toBe("code");
      expect(mockRecordDecision).toHaveBeenCalled();
      expect(mockRecordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "retrieve",
          surface: "mcp",
          input: "runSubAgent",
          alternativesConsidered: expect.arrayContaining(["vector", "file"]),
        }),
      );
      // Verify alternativesConsidered has exactly 3 items (the other strategies,
      // now including "symbol" added in the retrieval-first symbol strategy work)
      const callArgs = mockRecordDecision.mock.calls.at(-1)?.[0];
      expect(callArgs.alternativesConsidered).toHaveLength(3);
      expect(callArgs.alternativesConsidered).not.toContain("code");
    });

    it("calls recordDecision with alternativesConsidered for 'file' strategy", async () => {
      // Force 'file' strategy with a path-like query
      const result = await retrieve("src/foo.ts");

      expect(result.strategy).toBe("file");
      expect(mockRecordDecision).toHaveBeenCalled();
      expect(mockRecordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "retrieve",
          surface: "mcp",
          input: "src/foo.ts",
          alternativesConsidered: expect.arrayContaining(["vector", "code"]),
        }),
      );
      // Verify alternativesConsidered has exactly 3 items (the other strategies,
      // now including "symbol" added in the retrieval-first symbol strategy work)
      const callArgs = mockRecordDecision.mock.calls.at(-1)?.[0];
      expect(callArgs.alternativesConsidered).toHaveLength(3);
      expect(callArgs.alternativesConsidered).not.toContain("file");
    });

    it("recordDecision includes all required fields", async () => {
      mockVectorSearch.mockResolvedValueOnce([]);

      const result = await retrieve("how does it work");

      expect(mockRecordDecision).toHaveBeenCalled();
      const callArgs = mockRecordDecision.mock.calls.at(-1)?.[0];

      expect(callArgs).toMatchObject({
        toolName: "retrieve",
        surface: "mcp",
        callerIdentity: "unknown-caller",
        input: "how does it work",
        outcome: "success",
        externalEffect: false,
        reversible: true,
      });
      expect(callArgs.timestamp).toBeDefined();
      expect(typeof callArgs.timestamp).toBe("string");
    });
  });
});
