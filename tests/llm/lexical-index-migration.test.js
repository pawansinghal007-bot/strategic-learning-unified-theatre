/**
 * Regression test for lexical-index.js schema migration.
 *
 * Before the fix, `getLexicalDb()` used `CREATE TABLE IF NOT EXISTS` which
 * never alters an already-existing table.  Any installation whose
 * lexical-index.db was created before parent_id/parent_text were added would
 * hit "SqliteError: table lexical_chunks has no column named parent_id" on
 * the very first ingestion run after `git pull`, with no recovery path short
 * of manually deleting the database.
 *
 * The fix runs `PRAGMA table_info` after the CREATE block and issues
 * `ALTER TABLE ADD COLUMN` for each missing column, bringing old databases
 * forward without data loss.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Each test gets its own isolated temp directory so the module-level `db`
// singleton in lexical-index.js doesn't bleed between tests.
let tmpDir;
let originalLexicalIndexDir;
let originalLexicalIndexDb;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexical-migration-test-"));
  originalLexicalIndexDir = process.env.LEXICAL_INDEX_DIR;
  originalLexicalIndexDb = process.env.LEXICAL_INDEX_DB;
  // Point lexical-index.js at our per-test temp directory.
  process.env.LEXICAL_INDEX_DIR = tmpDir;
  process.env.LEXICAL_INDEX_DB = "lexical-index.db";
  // Reset the module cache so getLexicalDb() re-reads the env vars and
  // re-opens a fresh db handle for each test.
  vi.resetModules();
});

afterEach(() => {
  if (originalLexicalIndexDir === undefined) {
    delete process.env.LEXICAL_INDEX_DIR;
  } else {
    process.env.LEXICAL_INDEX_DIR = originalLexicalIndexDir;
  }
  if (originalLexicalIndexDb === undefined) {
    delete process.env.LEXICAL_INDEX_DB;
  } else {
    process.env.LEXICAL_INDEX_DB = originalLexicalIndexDb;
  }
  vi.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

/**
 * Create a lexical-index.db at `dbPath` using the OLD schema — the one that
 * existed before parent_id and parent_text were added.
 */
function createOldSchemaDb(dbPath) {
  const oldDb = new Database(dbPath);
  oldDb.exec(`
    CREATE TABLE lexical_chunks (
      chunk_id TEXT PRIMARY KEY,
      doc_id TEXT,
      path TEXT,
      section TEXT,
      feature_area TEXT,
      source_type TEXT,
      sprint INTEGER,
      module TEXT,
      content TEXT
    );

    CREATE VIRTUAL TABLE lexical_chunks_fts USING fts5(
      content,
      chunk_id UNINDEXED,
      doc_id UNINDEXED,
      path UNINDEXED,
      section UNINDEXED,
      feature_area UNINDEXED,
      source_type UNINDEXED,
      sprint UNINDEXED,
      module UNINDEXED,
      tokenize = "unicode61"
    );
  `);
  // Insert one pre-existing row so we can confirm data survives migration.
  oldDb.prepare(
    `INSERT INTO lexical_chunks
       (chunk_id, doc_id, path, section, feature_area, source_type, sprint, module, content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "chunk-old-1", "doc-1", "src/old.js", "section-a",
    "src", "javascript", 1, "src", "old content",
  );
  oldDb.close();
}

describe("lexical-index schema migration", () => {
  it("adds missing parent_id and parent_text columns to a pre-existing old-schema database", async () => {
    const dbPath = path.join(tmpDir, "lexical-index.db");
    createOldSchemaDb(dbPath);

    // Confirm old schema really lacks the columns before testing the fix.
    {
      const check = new Database(dbPath);
      const cols = check.prepare("PRAGMA table_info(lexical_chunks)").all().map((r) => r.name);
      expect(cols).not.toContain("parent_id");
      expect(cols).not.toContain("parent_text");
      check.close();
    }

    // vi.resetModules() in beforeEach ensures this import loads a fresh copy
    // of the module with its `db` singleton set to null, so getLexicalDb()
    // will open the pre-existing old-schema database and run the migration.
    const { deleteLexicalChunksByDocId } = await import("../../src/llm/lexical-index.js");

    // Calling any exported function triggers getLexicalDb() → migration.
    expect(() => deleteLexicalChunksByDocId("nonexistent")).not.toThrow();

    // Confirm the columns now exist.
    const verify = new Database(dbPath);
    const cols = verify.prepare("PRAGMA table_info(lexical_chunks)").all().map((r) => r.name);
    expect(cols).toContain("parent_id");
    expect(cols).toContain("parent_text");
    verify.close();
  });

  it("upsertLexicalChunks succeeds with parent_id/parent_text on a migrated old-schema database", async () => {
    const dbPath = path.join(tmpDir, "lexical-index.db");
    createOldSchemaDb(dbPath);

    const { upsertLexicalChunks } = await import("../../src/llm/lexical-index.js");

    // Before the fix this threw "table lexical_chunks has no column named parent_id".
    expect(() =>
      upsertLexicalChunks([
        {
          chunk_id: "chunk-new-1",
          doc_id: "doc-2",
          path: "src/new.js",
          section: "section-b",
          parent_id: "repo:src/new.js:parent:myFunc",
          parent_text: "function myFunc() { return 1; }",
          feature_area: "src",
          source_type: "javascript",
          sprint: 99,
          module: "src",
          content: "return 1;",
        },
      ]),
    ).not.toThrow();

    // Verify the row landed with parent fields intact.
    const verify = new Database(dbPath);
    const row = verify
      .prepare("SELECT * FROM lexical_chunks WHERE chunk_id = ?")
      .get("chunk-new-1");
    expect(row).toBeDefined();
    expect(row.parent_id).toBe("repo:src/new.js:parent:myFunc");
    expect(row.parent_text).toBe("function myFunc() { return 1; }");
    verify.close();
  });

  it("preserves existing rows in the table after migration", async () => {
    const dbPath = path.join(tmpDir, "lexical-index.db");
    createOldSchemaDb(dbPath);

    const { deleteLexicalChunksByDocId } = await import("../../src/llm/lexical-index.js");
    deleteLexicalChunksByDocId("nonexistent"); // trigger migration

    const verify = new Database(dbPath);
    const row = verify
      .prepare("SELECT * FROM lexical_chunks WHERE chunk_id = ?")
      .get("chunk-old-1");
    expect(row).toBeDefined();
    expect(row.content).toBe("old content");
    // Migrated columns default to NULL for pre-existing rows.
    expect(row.parent_id).toBeNull();
    expect(row.parent_text).toBeNull();
    verify.close();
  });

  it("is a no-op when the database already has the full current schema", async () => {
    // A fresh database (no pre-existing file) already gets all columns from
    // CREATE TABLE; the migration loop finds nothing missing and exits cleanly.
    const { deleteLexicalChunksByDocId } = await import("../../src/llm/lexical-index.js");

    expect(() => deleteLexicalChunksByDocId("anything")).not.toThrow();

    const dbPath = path.join(tmpDir, "lexical-index.db");
    const verify = new Database(dbPath);
    const cols = verify.prepare("PRAGMA table_info(lexical_chunks)").all().map((r) => r.name);
    expect(cols).toContain("parent_id");
    expect(cols).toContain("parent_text");
    verify.close();
  });
});
