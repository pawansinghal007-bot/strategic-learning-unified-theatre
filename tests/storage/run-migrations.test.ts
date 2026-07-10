/**
 * tests/storage/run-migrations.test.ts
 *
 * Unit tests for src/storage/run-migrations.ts
 *
 * Covers:
 *   - Creates schema_migrations table (idempotent) before applying anything
 *   - Applies a new (unrecorded) migration and records it in schema_migrations
 *   - Skips a migration already recorded in schema_migrations (no re-apply)
 *   - Mixed case: some files applied, some new — only new ones get applied
 *   - Rolls back (does not COMMIT) if applying a migration throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockQuery, mockPoolConnect, mockReadFileSync, mockReaddirSync } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockPoolConnect: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockReaddirSync: vi.fn(),
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

// Mock node:fs named imports (namespace-import mocking doesn't get intercepted)
vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  default: {
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  },
}));

import { runMigrations } from "../../src/storage/run-migrations.js";

describe("runMigrations", () => {
  const databaseUrl = "postgresql://user:pass@localhost:5432/testdb";

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockPoolConnect.mockReset();
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
  });

  it("creates schema_migrations table before checking/applying anything", async () => {
    mockReaddirSync.mockReturnValue(["001_symbols_table.sql"]);
    mockReadFileSync.mockReturnValue("CREATE TABLE symbols (id SERIAL);");
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery.mockResolvedValue({ rows: [] });

    await runMigrations(databaseUrl);

    const calls = mockQuery.mock.calls;
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1][0]).toContain(
      "CREATE TABLE IF NOT EXISTS schema_migrations",
    );
  });

  it("applies a new migration and records it in schema_migrations", async () => {
    mockReaddirSync.mockReturnValue(["001_symbols_table.sql"]);
    mockReadFileSync.mockReturnValue("CREATE TABLE symbols (id SERIAL);");
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE IF NOT EXISTS
      .mockResolvedValueOnce({ rows: [] }) // SELECT filename FROM schema_migrations -> none applied
      .mockResolvedValueOnce({ rows: [] }) // apply 001_symbols_table.sql
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO schema_migrations
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await runMigrations(databaseUrl);

    expect(mockQuery).toHaveBeenCalledWith("CREATE TABLE symbols (id SERIAL);");
    expect(mockQuery).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      ["001_symbols_table.sql"],
    );
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
    expect(mockQuery).not.toHaveBeenCalledWith("ROLLBACK");
  });

  it("skips a migration already recorded in schema_migrations", async () => {
    mockReaddirSync.mockReturnValue(["001_symbols_table.sql"]);
    mockReadFileSync.mockReturnValue("CREATE TABLE symbols (id SERIAL);");
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE IF NOT EXISTS
      .mockResolvedValueOnce({
        rows: [{ filename: "001_symbols_table.sql" }],
      }) // SELECT -> already applied
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await runMigrations(databaseUrl);

    expect(mockQuery).not.toHaveBeenCalledWith(
      "CREATE TABLE symbols (id SERIAL);",
    );
    expect(mockQuery).not.toHaveBeenCalledWith(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      ["001_symbols_table.sql"],
    );
    expect(mockQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("applies only the new file when some migrations are already recorded", async () => {
    mockReaddirSync.mockReturnValue([
      "001_symbols_table.sql",
      "002_add_index.sql",
    ]);
    mockReadFileSync.mockImplementation((filePath: string) =>
      filePath.includes("002_add_index")
        ? "CREATE INDEX idx_symbols_name ON symbols (name);"
        : "CREATE TABLE symbols (id SERIAL);",
    );
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE IF NOT EXISTS
      .mockResolvedValueOnce({
        rows: [{ filename: "001_symbols_table.sql" }],
      }) // SELECT -> 001 already applied, 002 is new
      .mockResolvedValueOnce({ rows: [] }) // apply 002_add_index.sql
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO schema_migrations for 002
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await runMigrations(databaseUrl);

    expect(mockQuery).not.toHaveBeenCalledWith(
      "CREATE TABLE symbols (id SERIAL);",
    );
    expect(mockQuery).toHaveBeenCalledWith(
      "CREATE INDEX idx_symbols_name ON symbols (name);",
    );
    expect(mockQuery).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      ["002_add_index.sql"],
    );
  });

  it("rolls back if applying a migration throws", async () => {
    mockReaddirSync.mockReturnValue(["001_symbols_table.sql"]);
    mockReadFileSync.mockReturnValue("CREATE TABLE symbols (id SERIAL);");
    mockPoolConnect.mockResolvedValue({ query: mockQuery, release: () => {} });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE IF NOT EXISTS
      .mockResolvedValueOnce({ rows: [] }) // SELECT -> none applied
      .mockRejectedValueOnce(new Error("relation already exists")) // apply throws
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await expect(runMigrations(databaseUrl)).rejects.toThrow(
      "relation already exists",
    );

    expect(mockQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mockQuery).not.toHaveBeenCalledWith("COMMIT");
  });

  it("releases the client and ends the pool", async () => {
    mockReaddirSync.mockReturnValue(["001_symbols_table.sql"]);
    mockReadFileSync.mockReturnValue("CREATE TABLE symbols (id SERIAL);");
    const mockClient = { query: mockQuery, release: vi.fn() };
    mockPoolConnect.mockResolvedValue(mockClient);
    mockQuery.mockResolvedValue({ rows: [] });

    await runMigrations(databaseUrl);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
