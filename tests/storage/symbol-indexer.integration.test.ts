/**
 * tests/storage/symbol-indexer.integration.test.ts
 *
 * Real-database integration tests for src/storage/symbol-indexer.ts.
 * Exercises a live Postgres connection via DATABASE_URL.
 *
 * Covers:
 *   - Delete-then-insert replaces prior rows for the same repository_id
 *   - Batching correctness at >500 rows (501), verified via raw row count
 *   - Rollback on forced mid-batch failure (0 rows left behind)
 *   - Zero-symbols call is a safe no-op
 */

import "dotenv/config";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import pg from "pg";

const { Pool } = pg;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Reserved test UUID — cannot collide with real SHA-1-derived repository IDs. */
const TEST_REPOSITORY_ID = "00000000-0000-0000-0000-000000000abc";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockWalkSourceFiles, mockExtractSymbolsFromFile } = vi.hoisted(() => ({
  mockWalkSourceFiles: vi.fn(),
  mockExtractSymbolsFromFile: vi.fn(),
}));

// Mock symbol-extractor so we control what symbols are "extracted"
vi.mock("../../src/storage/symbol-extractor.js", () => ({
  walkSourceFiles: () => mockWalkSourceFiles(),
  extractSymbolsFromFile: () => mockExtractSymbolsFromFile(),
}));

// Mock repository-id so we use TEST_REPOSITORY_ID instead of the real project ID
vi.mock("../../src/shared/retrieval/repository-id.js", () => ({
  getRepositoryId: () => "00000000-0000-0000-0000-000000000abc",
}));

import { indexSymbols } from "../../src/storage/symbol-indexer.js";

// ─── Skip if DATABASE_URL is not set ──────────────────────────────────────────

const hasDb = !!process.env.DATABASE_URL;
const itReal = hasDb ? it : it.skip;

describe(
  hasDb
    ? "indexSymbols integration (live Postgres)"
    : "indexSymbols integration (skipped — no DATABASE_URL)",
  () => {
    let pool: pg.Pool;

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    });

    beforeEach(async () => {
      // Clean up any leftover rows from previous crashed runs
      await pool.query("DELETE FROM symbols WHERE repository_id = $1", [
        TEST_REPOSITORY_ID,
      ]);
      mockWalkSourceFiles.mockReset();
      mockExtractSymbolsFromFile.mockReset();
    });

    afterEach(async () => {
      // Clean up after each test
      await pool.query("DELETE FROM symbols WHERE repository_id = $1", [
        TEST_REPOSITORY_ID,
      ]);
    });

    afterAll(async () => {
      // Final cleanup and pool close
      await pool.query("DELETE FROM symbols WHERE repository_id = $1", [
        TEST_REPOSITORY_ID,
      ]);
      await pool.end();
    });

    // ─── Helpers ────────────────────────────────────────────────────────────

    /** Build N fake symbol objects with distinct names. */
    function makeSymbols(n: number, prefix = "sym") {
      return Array.from({ length: n }, (_, i) => ({
        name: `${prefix}${i}`,
        kind: "function",
        filePath: "src/test-file.ts",
        startLine: i * 2 + 1,
        endLine: i * 2 + 2,
        signature: null,
      }));
    }

    /** Query Postgres directly for the row count of TEST_REPOSITORY_ID. */
    async function countRows(): Promise<number> {
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS total FROM symbols WHERE repository_id = $1",
        [TEST_REPOSITORY_ID],
      );
      return rows[0].total;
    }

    // ─── Tests ──────────────────────────────────────────────────────────────

    itReal(
      "delete-then-insert replaces prior rows for the same repository_id",
      async () => {
        // First call: index 3 symbols
        mockWalkSourceFiles.mockReturnValue(["src/file1.ts"]);
        mockExtractSymbolsFromFile.mockReturnValue(makeSymbols(3, "first_"));

        await indexSymbols(process.env.DATABASE_URL!, "/fake/root");

        expect(await countRows()).toBe(3);

        // Second call: index 2 different symbols for the same repository_id
        mockWalkSourceFiles.mockReturnValue(["src/file2.ts"]);
        mockExtractSymbolsFromFile.mockReturnValue(makeSymbols(2, "second_"));

        await indexSymbols(process.env.DATABASE_URL!, "/fake/root");

        // Should have only the 2 new symbols, not 5 (delete-then-insert, not upsert)
        expect(await countRows()).toBe(2);

        // Verify the actual names are from the second set
        const { rows } = await pool.query(
          "SELECT name FROM symbols WHERE repository_id = $1 ORDER BY name",
          [TEST_REPOSITORY_ID],
        );
        expect(rows.map((r: { name: string }) => r.name)).toEqual([
          "second_0",
          "second_1",
        ]);
      },
    );

    itReal(
      "batching correctness at 501 rows — verified via raw row count",
      async () => {
        const totalSymbols = 501;
        mockWalkSourceFiles.mockReturnValue(["src/big-file.ts"]);
        mockExtractSymbolsFromFile.mockReturnValue(
          makeSymbols(totalSymbols, "batchSym"),
        );

        const result = await indexSymbols(
          process.env.DATABASE_URL!,
          "/fake/root",
        );

        // Check the return value
        expect(result.symbolsInserted).toBe(totalSymbols);

        // Independently verify via raw SELECT COUNT(*) against the live DB
        expect(await countRows()).toBe(totalSymbols);
      },
    );

    itReal("rollback on forced mid-batch failure leaves 0 rows", async () => {
      // 502 symbols: first 500 are valid (batch 1), symbol at index 501
      // has null startLine which violates the NOT NULL integer constraint.
      const symbols = makeSymbols(502, "rbSym");
      symbols[501] = { ...symbols[501], startLine: null as any };

      mockWalkSourceFiles.mockReturnValue(["src/file.ts"]);
      mockExtractSymbolsFromFile.mockReturnValue(symbols);

      // The call should throw (constraint violation in batch 2)
      await expect(
        indexSymbols(process.env.DATABASE_URL!, "/fake/root"),
      ).rejects.toThrow();

      // Transaction rolled back cleanly — 0 rows left behind
      expect(await countRows()).toBe(0);
    });

    itReal("zero-symbols call is a safe no-op", async () => {
      mockWalkSourceFiles.mockReturnValue([]);

      const result = await indexSymbols(
        process.env.DATABASE_URL!,
        "/fake/root",
      );

      expect(result.filesProcessed).toBe(0);
      expect(result.symbolsInserted).toBe(0);
      expect(await countRows()).toBe(0);
    });
  },
);
