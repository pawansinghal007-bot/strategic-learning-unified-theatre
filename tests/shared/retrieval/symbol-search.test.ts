/**
 * tests/shared/retrieval/symbol-search.test.ts
 *
 * Unit tests for src/shared/retrieval/symbol-search.ts
 *
 * Covers:
 *   - findSymbolDefinition returns mapped SymbolSearchResult rows (lines 25-30)
 *   - Returns empty array when no rows found
 *   - Maps row fields correctly (name, kind, file_path→filePath, etc.)
 *   - signature is undefined when db column is null
 *   - Propagates database errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

// Mock the pg module: Pool must be a constructor (class) so `new Pool(...)` works
vi.mock("pg", () => {
  class MockPool {
    query: ReturnType<typeof vi.fn>;
    constructor() {
      this.query = mockQuery;
    }
  }
  return {
    default: {
      Pool: MockPool,
    },
  };
});

import { findSymbolDefinition } from "../../../src/shared/retrieval/symbol-search.js";

describe("findSymbolDefinition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no rows found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const results = await findSymbolDefinition(
      "nonExistentSymbol",
      "test-repo-id",
    );

    expect(results).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("queries with the correct SQL and parameters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await findSymbolDefinition("runSubAgent", "test-repo-id");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        "select name, kind, file_path, start_line, end_line, signature",
      ),
      ["runSubAgent", "test-repo-id"],
    );
  });

  it("maps db row fields to SymbolSearchResult shape", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          name: "runSubAgent",
          kind: "function",
          file_path: "src/agents/runner.ts",
          start_line: 10,
          end_line: 25,
          signature: "(opts: RunOpts) => Promise<void>",
        },
      ],
    });

    const results = await findSymbolDefinition("runSubAgent", "test-repo-id");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: "runSubAgent",
      kind: "function",
      filePath: "src/agents/runner.ts",
      startLine: 10,
      endLine: 25,
      signature: "(opts: RunOpts) => Promise<void>",
    });
  });

  it("sets signature to undefined when db column is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          name: "SubAgent",
          kind: "class",
          file_path: "src/agents/sub-agent.ts",
          start_line: 1,
          end_line: 60,
          signature: null,
        },
      ],
    });

    const results = await findSymbolDefinition("SubAgent", "test-repo-id");

    expect(results).toHaveLength(1);
    expect(results[0].signature).toBeUndefined();
  });

  it("returns multiple results when multiple rows match", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          name: "embed",
          kind: "function",
          file_path: "src/shared/retrieval/vector-client.ts",
          start_line: 50,
          end_line: 80,
          signature: "(text: string) => Promise<number[]>",
        },
        {
          name: "embed",
          kind: "function",
          file_path: "src/llm/embeddings.ts",
          start_line: 20,
          end_line: 45,
          signature: null,
        },
      ],
    });

    const results = await findSymbolDefinition("embed", "test-repo-id");

    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe("src/shared/retrieval/vector-client.ts");
    expect(results[1].filePath).toBe("src/llm/embeddings.ts");
    expect(results[1].signature).toBeUndefined();
  });

  it("propagates database query errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    await expect(
      findSymbolDefinition("anything", "test-repo-id"),
    ).rejects.toThrow("connection refused");
  });

  it("returns empty array for wrong repository_id", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const results = await findSymbolDefinition(
      "runSubAgent",
      "00000000-0000-0000-0000-000000000000",
    );

    expect(results).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("repository_id = $2"),
      ["runSubAgent", "00000000-0000-0000-0000-000000000000"],
    );
  });
});
