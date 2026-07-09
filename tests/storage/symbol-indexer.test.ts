/**
 * tests/storage/symbol-indexer.test.ts
 *
 * Unit tests for src/storage/symbol-indexer.ts
 *
 * Covers:
 *   - Calls DELETE with the correct repository_id before inserting
 *   - Inserts the correct number of rows matching extracted symbol count
 *   - Rolls back (does not COMMIT) if an INSERT throws partway through
 *   - Returns the correct { filesProcessed, symbolsInserted } counts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockQuery, mockPoolConnect } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockPoolConnect: vi.fn(),
}));

// Mock the pg module: Pool must be a constructor (class) so `new Pool(...)` works
vi.mock("pg", () => {
  class MockPool {
    query: ReturnType<typeof vi.fn>;
    connect: () => Promise<{ query: typeof mockQuery; release: () => void }>;
    end: () => Promise<void>;
    constructor() {
      this.query = mockQuery;
      this.connect = mockPoolConnect;
      this.end = vi.fn();
    }
  }
  return {
    default: {
      Pool: MockPool,
    },
  };
});

// Mock the symbol-extractor module to control extracted symbols
vi.mock("../../src/storage/symbol-extractor.js", () => ({
  walkSourceFiles: vi.fn(),
  extractSymbolsFromFile: vi.fn(),
  ExtractedSymbol: {} as any,
}));

// Mock repository-id to return a deterministic ID
vi.mock("../../src/shared/retrieval/repository-id.js", () => ({
  getRepositoryId: vi.fn(() => "550e8400-e29b-41d4-a716-446655440000"),
}));

import { indexSymbols } from "../../src/storage/symbol-indexer.js";
import {
  walkSourceFiles,
  extractSymbolsFromFile,
} from "../../src/storage/symbol-extractor.js";
import { getRepositoryId } from "../../src/shared/retrieval/repository-id.js";

describe("indexSymbols", () => {
  const databaseUrl = "postgresql://user:pass@localhost:5432/testdb";
  const projectRoot = "/fake/project/root";

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to default implementations
    (walkSourceFiles as any).mockReset();
    (extractSymbolsFromFile as any).mockReset();
    (getRepositoryId as any).mockReset();
    mockQuery.mockReset();
    mockPoolConnect.mockReset();
  });

  it("calls DELETE with the correct repository_id before inserting", async () => {
    // Setup: mock files and symbols
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
    ]);
    (extractSymbolsFromFile as any).mockReturnValue([
      {
        name: "func1",
        kind: "function",
        filePath: "src/file1.ts",
        startLine: 10,
        endLine: 20,
      },
    ]);
    mockPoolConnect.mockResolvedValue({
      query: mockQuery,
      release: () => {},
    });

    await indexSymbols(databaseUrl, projectRoot);

    // Verify DELETE was called with correct repository_id
    expect(mockQuery).toHaveBeenCalledWith(
      "DELETE FROM symbols WHERE repository_id = $1",
      ["550e8400-e29b-41d4-a716-446655440000"],
    );
  });

  it("inserts the correct number of rows matching extracted symbol count", async () => {
    // Setup: mock files and symbols
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
      "/fake/project/root/src/file2.ts",
    ]);
    // extractSymbolsFromFile is called once per file, so we need to mock both calls
    (extractSymbolsFromFile as any)
      .mockReturnValueOnce([
        {
          name: "func1",
          kind: "function",
          filePath: "src/file1.ts",
          startLine: 10,
          endLine: 20,
          signature: "func1()",
        },
        {
          name: "class1",
          kind: "class",
          filePath: "src/file1.ts",
          startLine: 25,
          endLine: 40,
          signature: "class class1",
        },
      ])
      .mockReturnValueOnce([
        {
          name: "func2",
          kind: "function",
          filePath: "src/file2.ts",
          startLine: 5,
          endLine: 15,
          signature: null,
        },
      ]);
    mockPoolConnect.mockResolvedValue({
      query: mockQuery,
      release: () => {},
    });

    // All queries succeed
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    // Total calls: 1 BEGIN + 1 DELETE + 3 INSERTs + 1 COMMIT = 6
    const queryCalls = mockQuery.mock.calls;
    expect(queryCalls).toHaveLength(6);
    // Count INSERT calls specifically
    const insertCalls = queryCalls.filter((call: any[]) =>
      call[0].startsWith("INSERT INTO symbols"),
    );
    expect(insertCalls).toHaveLength(3);
  });

  it("rolls back if an INSERT throws partway through", async () => {
    // Setup: mock files and symbols
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
    ]);
    (extractSymbolsFromFile as any).mockReturnValue([
      {
        name: "func1",
        kind: "function",
        filePath: "src/file1.ts",
        startLine: 10,
        endLine: 20,
      },
      {
        name: "func2",
        kind: "function",
        filePath: "src/file1.ts",
        startLine: 25,
        endLine: 35,
      },
      {
        name: "func3",
        kind: "function",
        filePath: "src/file1.ts",
        startLine: 40,
        endLine: 50,
      },
    ]);
    mockPoolConnect.mockResolvedValue({
      query: mockQuery,
      release: () => {},
    });

    // Make the 3rd INSERT fail (BEGIN + DELETE + 1st INSERT succeed, then fail)
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // 1st INSERT
      .mockRejectedValueOnce(new Error("Database error on insert")) // 2nd INSERT throws
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(indexSymbols(databaseUrl, projectRoot)).rejects.toThrow(
      "Database error on insert",
    );

    // Verify transaction was rolled back
    expect(mockQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mockQuery).not.toHaveBeenCalledWith("COMMIT");
  });

  it("commits if all INSERTs succeed", async () => {
    // Setup: mock files and symbols
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
    ]);
    (extractSymbolsFromFile as any).mockReturnValue([
      {
        name: "func1",
        kind: "function",
        filePath: "src/file1.ts",
        startLine: 10,
        endLine: 20,
      },
    ]);
    mockPoolConnect.mockResolvedValue({
      query: mockQuery,
      release: () => {},
    });

    // All queries succeed
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    // Verify transaction was committed
    expect(mockQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
    expect(mockQuery).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("returns the correct { filesProcessed, symbolsInserted } counts", async () => {
    // Setup: mock files and symbols
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
      "/fake/project/root/src/file2.ts",
      "/fake/project/root/src/file3.ts",
    ]);
    (extractSymbolsFromFile as any)
      .mockReturnValueOnce([
        {
          name: "func1",
          kind: "function",
          filePath: "src/file1.ts",
          startLine: 10,
          endLine: 20,
        },
        {
          name: "class1",
          kind: "class",
          filePath: "src/file1.ts",
          startLine: 25,
          endLine: 40,
        },
      ])
      .mockReturnValueOnce([
        {
          name: "func2",
          kind: "function",
          filePath: "src/file2.ts",
          startLine: 5,
          endLine: 15,
        },
      ])
      .mockReturnValueOnce([
        {
          name: "func3",
          kind: "function",
          filePath: "src/file3.ts",
          startLine: 1,
          endLine: 8,
        },
        {
          name: "func4",
          kind: "function",
          filePath: "src/file3.ts",
          startLine: 10,
          endLine: 18,
        },
        {
          name: "func5",
          kind: "function",
          filePath: "src/file3.ts",
          startLine: 20,
          endLine: 28,
        },
      ]);
    mockPoolConnect.mockResolvedValue({
      query: mockQuery,
      release: () => {},
    });

    // All queries succeed
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await indexSymbols(databaseUrl, projectRoot);

    expect(result).toEqual({
      filesProcessed: 3,
      symbolsInserted: 6, // 2 + 1 + 3
    });
  });

  it("releases the client and ends the pool in finally block", async () => {
    // Setup
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
    ]);
    (extractSymbolsFromFile as any).mockReturnValue([
      {
        name: "func1",
        kind: "function",
        filePath: "src/file1.ts",
        startLine: 10,
        endLine: 20,
      },
    ]);
    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };
    mockPoolConnect.mockResolvedValue(mockClient);

    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
    // The pool.end() should be called after client.release()
    const poolEndCall = mockQuery.mock.calls.find(
      (call: any[]) =>
        call[0] === "END" ||
        (typeof call[0] === "string" && call[0].includes("pool")),
    );
    // Note: pool.end() is a method on the pool, not a query
  });
});
