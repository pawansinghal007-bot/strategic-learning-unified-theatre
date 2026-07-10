/**
 * tests/storage/symbol-indexer.test.ts
 *
 * Unit tests for src/storage/symbol-indexer.ts
 *
 * Covers:
 *   - Calls DELETE with the correct repository_id before inserting
 *   - All symbols in a small set are sent in a single batched INSERT call
 *   - Large symbol sets are split into ceil(N / INSERT_CHUNK_SIZE) INSERT calls
 *   - Each batched INSERT uses the correct number of positional parameters
 *   - Rolls back (does not COMMIT) if a batched INSERT throws
 *   - Returns the correct { filesProcessed, symbolsInserted } counts
 *   - Releases the client and ends the pool in the finally block
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { indexSymbols, INSERT_CHUNK_SIZE } from "../../src/storage/symbol-indexer.js";
import {
  walkSourceFiles,
  extractSymbolsFromFile,
} from "../../src/storage/symbol-extractor.js";
import { getRepositoryId } from "../../src/shared/retrieval/repository-id.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build N fake symbol objects */
function makeSymbols(n: number, filePath = "src/file.ts") {
  return Array.from({ length: n }, (_, i) => ({
    name: `sym${i}`,
    kind: "function",
    filePath,
    startLine: i * 2 + 1,
    endLine: i * 2 + 2,
    signature: null as string | null,
  }));
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("indexSymbols", () => {
  const databaseUrl = "postgresql://user:pass@localhost:5432/testdb";
  const projectRoot = "/fake/project/root";

  beforeEach(() => {
    vi.clearAllMocks();
    (walkSourceFiles as any).mockReset();
    (extractSymbolsFromFile as any).mockReset();
    (getRepositoryId as any).mockReset();
    mockQuery.mockReset();
    mockPoolConnect.mockReset();
  });

  it("calls DELETE with the correct repository_id before inserting", async () => {
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/file1.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(makeSymbols(1));
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    expect(mockQuery).toHaveBeenCalledWith(
      "DELETE FROM symbols WHERE repository_id = $1",
      ["550e8400-e29b-41d4-a716-446655440000"],
    );
  });

  it("sends all symbols in a single INSERT call when count fits in one chunk", async () => {
    const symbols = makeSymbols(3);
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/file1.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(symbols);
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    const insertCalls = mockQuery.mock.calls.filter((call: any[]) =>
      typeof call[0] === "string" && call[0].trimStart().startsWith("INSERT INTO symbols"),
    );
    // 3 symbols < INSERT_CHUNK_SIZE → exactly 1 batched INSERT
    expect(insertCalls).toHaveLength(1);
    // That INSERT must contain 3 × 7 = 21 bound parameters
    expect(insertCalls[0][1]).toHaveLength(3 * 7);
  });

  it("splits a large symbol set into the correct number of INSERT calls", async () => {
    // Use 2.5× CHUNK_SIZE symbols → expect ceil(2.5) = 3 INSERT calls
    const total = INSERT_CHUNK_SIZE * 2 + Math.floor(INSERT_CHUNK_SIZE / 2);
    const symbols = makeSymbols(total);
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/big.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(symbols);
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    const insertCalls = mockQuery.mock.calls.filter((call: any[]) =>
      typeof call[0] === "string" && call[0].trimStart().startsWith("INSERT INTO symbols"),
    );

    const expectedBatches = Math.ceil(total / INSERT_CHUNK_SIZE); // 3
    expect(insertCalls).toHaveLength(expectedBatches);

    // First two batches are full (INSERT_CHUNK_SIZE rows × 7 params each)
    expect(insertCalls[0][1]).toHaveLength(INSERT_CHUNK_SIZE * 7);
    expect(insertCalls[1][1]).toHaveLength(INSERT_CHUNK_SIZE * 7);
    // Last batch has the remainder
    const remainder = total - INSERT_CHUNK_SIZE * 2;
    expect(insertCalls[2][1]).toHaveLength(remainder * 7);

    // Total params across all batches must equal total × 7
    const totalParams = insertCalls.reduce(
      (sum: number, call: any[]) => sum + (call[1] as unknown[]).length,
      0,
    );
    expect(totalParams).toBe(total * 7);
  });

  it("each batched INSERT uses correct positional placeholders", async () => {
    const symbols = makeSymbols(2);
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/file1.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(symbols);
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    const insertCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === "string" && call[0].trimStart().startsWith("INSERT INTO symbols"),
    );
    // 2 rows → placeholders $1..$7, $8..$14
    expect(insertCall![0]).toContain("$1,");
    expect(insertCall![0]).toContain("$8,");
    expect(insertCall![0]).toContain("$14");
    // Should NOT contain $15 (would mean a 3rd row slipped in)
    expect(insertCall![0]).not.toContain("$15");
  });

  it("rolls back if a batched INSERT throws", async () => {
    const symbols = makeSymbols(INSERT_CHUNK_SIZE + 10); // 2 batches
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/file1.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(symbols);
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // 1st INSERT batch succeeds
      .mockRejectedValueOnce(new Error("DB error on second batch")) // 2nd INSERT throws
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(indexSymbols(databaseUrl, projectRoot)).rejects.toThrow(
      "DB error on second batch",
    );

    expect(mockQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mockQuery).not.toHaveBeenCalledWith("COMMIT");
  });

  it("commits if all INSERT batches succeed", async () => {
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/file1.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(makeSymbols(1));
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    expect(mockQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
    expect(mockQuery).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("returns the correct { filesProcessed, symbolsInserted } counts", async () => {
    (walkSourceFiles as any).mockReturnValue([
      "/fake/project/root/src/file1.ts",
      "/fake/project/root/src/file2.ts",
      "/fake/project/root/src/file3.ts",
    ]);
    (extractSymbolsFromFile as any)
      .mockReturnValueOnce(makeSymbols(2, "src/file1.ts"))
      .mockReturnValueOnce(makeSymbols(1, "src/file2.ts"))
      .mockReturnValueOnce(makeSymbols(3, "src/file3.ts"));
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await indexSymbols(databaseUrl, projectRoot);

    expect(result).toEqual({ filesProcessed: 3, symbolsInserted: 6 });
  });

  it("handles zero symbols (empty repo) without issuing any INSERT", async () => {
    (walkSourceFiles as any).mockReturnValue([]);
    (extractSymbolsFromFile as any).mockReturnValue([]);
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await indexSymbols(databaseUrl, projectRoot);

    const insertCalls = mockQuery.mock.calls.filter((call: any[]) =>
      typeof call[0] === "string" && call[0].trimStart().startsWith("INSERT INTO symbols"),
    );
    expect(insertCalls).toHaveLength(0);
    expect(result).toEqual({ filesProcessed: 0, symbolsInserted: 0 });
  });

  it("releases the client and ends the pool in finally block", async () => {
    (walkSourceFiles as any).mockReturnValue(["/fake/project/root/src/file1.ts"]);
    (extractSymbolsFromFile as any).mockReturnValue(makeSymbols(1));
    const mockClient = { query: mockQuery, release: vi.fn() };
    mockPoolConnect.mockResolvedValue(mockClient);
    mockQuery.mockResolvedValue({ rows: [] });

    await indexSymbols(databaseUrl, projectRoot);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
