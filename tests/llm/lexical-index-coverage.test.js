/**
 * Coverage additions for lexical-index.js
 *
 * Targets the uncovered sections:
 * - escapeFtsToken() — token sanitization
 * - buildFtsQuery() — FTS query construction
 * - buildFilterClause() — SQL filter generation
 * - deleteLexicalChunksByDocId() — deletion
 * - upsertLexicalChunks() — bulk upsert
 * - searchLexicalChunks() — full search with filters
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Each test gets its own isolated temp directory so the module-level `db`
// singleton in lexical-index.js doesn't bleed between tests.
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexical-coverage-test-"));
  process.env.LEXICAL_INDEX_DIR = tmpDir;
  process.env.LEXICAL_INDEX_DB = "lexical-index.db";
  vi.resetModules();
});

afterEach(() => {
  delete process.env.LEXICAL_INDEX_DIR;
  delete process.env.LEXICAL_INDEX_DB;
  vi.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

/**
 * Helper: create a lexical-index.db with the current schema and insert test data.
 */
function createTestDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS lexical_chunks (
      chunk_id TEXT PRIMARY KEY,
      doc_id TEXT,
      path TEXT,
      section TEXT,
      parent_id TEXT,
      parent_text TEXT,
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

    CREATE TRIGGER IF NOT EXISTS lexical_chunks_ai AFTER INSERT ON lexical_chunks BEGIN
      INSERT INTO lexical_chunks_fts(rowid, content, chunk_id, doc_id, path, section, feature_area, source_type, sprint, module)
        VALUES (new.rowid, new.content, new.chunk_id, new.doc_id, new.path, new.section, new.feature_area, new.source_type, new.sprint, new.module);
    END;

    CREATE TRIGGER IF NOT EXISTS lexical_chunks_ad AFTER DELETE ON lexical_chunks BEGIN
      DELETE FROM lexical_chunks_fts WHERE rowid = old.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS lexical_chunks_au AFTER UPDATE ON lexical_chunks BEGIN
      UPDATE lexical_chunks_fts SET content = new.content, chunk_id = new.chunk_id, doc_id = new.doc_id, path = new.path, section = new.section, feature_area = new.feature_area, source_type = new.source_type, sprint = new.sprint, module = new.module WHERE rowid = old.rowid;
    END;
  `);
  return db;
}

describe("lexical-index coverage — upsertLexicalChunks", () => {
  it("inserts chunks and makes them searchable", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    const chunks = [
      {
        chunk_id: "chunk-1",
        doc_id: "doc-1",
        path: "src/example.js",
        section: "overview",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 42,
        module: "src/example.js",
        content: "This is an example function for testing",
      },
      {
        chunk_id: "chunk-2",
        doc_id: "doc-1",
        path: "src/example.js",
        section: "api",
        parent_id: "chunk-1",
        parent_text: "Overview",
        feature_area: "src",
        source_type: "javascript",
        sprint: 42,
        module: "src/example.js",
        content: "API documentation for the example",
      },
    ];

    upsertLexicalChunks(chunks);

    const results = searchLexicalChunks("example", 10);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain("chunk-1");
    expect(results.map((r) => r.id)).toContain("chunk-2");
  });

  it("replaces existing chunks on duplicate chunk_id", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-dup",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "original content",
      },
    ]);

    // Upsert with same chunk_id but different content
    upsertLexicalChunks([
      {
        chunk_id: "chunk-dup",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "updated content",
      },
    ]);

    const results = searchLexicalChunks("updated", 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("updated content");
  });

  it("handles empty chunks array", async () => {
    const { upsertLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );
    expect(() => upsertLexicalChunks([])).not.toThrow();
  });
});

describe("lexical-index coverage — deleteLexicalChunksByDocId", () => {
  it("deletes all chunks for a given doc_id", async () => {
    const { upsertLexicalChunks, deleteLexicalChunksByDocId, searchLexicalChunks } =
      await import("../../src/llm/lexical-index.js");

    upsertLexicalChunks([
      {
        chunk_id: "chunk-del-1",
        doc_id: "doc-to-delete",
        path: "src/temp.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/temp.js",
        content: "will be deleted",
      },
      {
        chunk_id: "chunk-del-2",
        doc_id: "doc-to-delete",
        path: "src/temp2.js",
        section: "s2",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/temp2.js",
        content: "also deleted",
      },
      {
        chunk_id: "chunk-keep",
        doc_id: "doc-to-keep",
        path: "src/keep.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/keep.js",
        content: "this stays",
      },
    ]);

    deleteLexicalChunksByDocId("doc-to-delete");

    const results = searchLexicalChunks("deleted", 10);
    expect(results).toHaveLength(0);

    const keepResults = searchLexicalChunks("stays", 10);
    expect(keepResults).toHaveLength(1);
    expect(keepResults[0].id).toBe("chunk-keep");
  });

  it("handles deleting non-existent doc_id", async () => {
    const { deleteLexicalChunksByDocId } = await import(
      "../../src/llm/lexical-index.js"
    );
    expect(() => deleteLexicalChunksByDocId("non-existent")).not.toThrow();
  });
});

describe("lexical-index coverage — searchLexicalChunks with filters", () => {
  it("filters by doc_id", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-a",
        doc_id: "doc-a",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "content for doc a",
      },
      {
        chunk_id: "chunk-b",
        doc_id: "doc-b",
        path: "src/b.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/b.js",
        content: "content for doc b",
      },
    ]);

    const results = searchLexicalChunks("content", 10, { doc_id: "doc-a" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("chunk-a");
  });

  it("filters by feature_area", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-src",
        doc_id: "doc-1",
        path: "src/app.js",
        section: "overview",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/app.js",
        content: "source code content",
      },
      {
        chunk_id: "chunk-doc",
        doc_id: "doc-2",
        path: "docs/readme.md",
        section: "intro",
        parent_id: null,
        parent_text: null,
        feature_area: "docs",
        source_type: "markdown",
        sprint: 1,
        module: "docs/readme.md",
        content: "documentation content",
      },
    ]);

    const results = searchLexicalChunks("content", 10, { feature_area: "docs" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("chunk-doc");
  });

  it("returns empty when filter matches nothing", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-1",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "some content",
      },
    ]);

    const results = searchLexicalChunks("content", 10, { doc_id: "nonexistent" });
    expect(results).toEqual([]);
  });

  it("supports array filters in search queries", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-1",
        doc_id: "doc-a",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "apple content",
      },
      {
        chunk_id: "chunk-2",
        doc_id: "doc-b",
        path: "src/b.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/b.js",
        content: "apple content",
      },
    ]);

    const results = searchLexicalChunks("apple", 10, { doc_id: ["doc-a", "doc-b"] });
    expect(results.length).toBe(2);
  });

  it("ignores unsupported filter columns and still returns results", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-unfiltered",
        doc_id: "doc-1",
        path: "src/keep.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/keep.js",
        content: "keep this content",
      },
    ]);

    const results = searchLexicalChunks("keep", 10, { unsupported: "value" });
    expect(results).toHaveLength(1);
  });

  it("returns empty array when the search query is empty", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-1",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "some content",
      },
    ]);

    const results = searchLexicalChunks("", 10);
    expect(results).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-limit-1",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "limit test content one",
      },
      {
        chunk_id: "chunk-limit-2",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "limit test content two",
      },
      {
        chunk_id: "chunk-limit-3",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "limit test content three",
      },
      {
        chunk_id: "chunk-limit-4",
        doc_id: "doc-1",
        path: "src/a.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/a.js",
        content: "limit test content four",
      },
    ]);

    const limited = searchLexicalChunks("limit", 3);
    expect(limited.length).toBeLessThanOrEqual(3);
  });

  it("returns proper result shape with all fields", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-shape",
        doc_id: "doc-shape",
        path: "src/shape.js",
        section: "api",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 5,
        module: "src/shape.js",
        content: "shape test content",
      },
    ]);

    const results = searchLexicalChunks("shape", 10);
    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("score");
  });
});

describe("lexical-index coverage — FTS token escaping", () => {
  it("handles special characters in search query", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-special",
        doc_id: "doc-special",
        path: "src/special.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/special.js",
        content: "content with brackets [test] and quotes",
      },
    ]);

    // Should not throw on special chars
    const results = searchLexicalChunks("[test]", 10);
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles query with quotes and brackets", async () => {
    const { upsertLexicalChunks, searchLexicalChunks } = await import(
      "../../src/llm/lexical-index.js"
    );

    upsertLexicalChunks([
      {
        chunk_id: "chunk-quotes",
        doc_id: "doc-quotes",
        path: "src/quotes.js",
        section: "s1",
        parent_id: null,
        parent_text: null,
        feature_area: "src",
        source_type: "javascript",
        sprint: 1,
        module: "src/quotes.js",
        content: "quoted content here",
      },
    ]);

    const results = searchLexicalChunks('"quoted"', 10);
    expect(Array.isArray(results)).toBe(true);
  });
});
