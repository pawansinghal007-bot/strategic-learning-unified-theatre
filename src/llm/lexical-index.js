import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_LEXICAL_INDEX_DIR = process.env.LEXICAL_INDEX_DIR
  ? path.resolve(process.env.LEXICAL_INDEX_DIR)
  : path.join(
      process.env.EMBEDDING_CACHE_DIR || os.homedir(),
      ".vscode-rotator",
    );
const LEXICAL_INDEX_DB = process.env.LEXICAL_INDEX_DB || "lexical-index.db";
const LEXICAL_INDEX_PATH = path.join(
  DEFAULT_LEXICAL_INDEX_DIR,
  LEXICAL_INDEX_DB,
);

const SUPPORTED_FILTER_COLUMNS = new Set([
  "chunk_id",
  "doc_id",
  "path",
  "section",
  "feature_area",
  "source_type",
  "sprint",
  "module",
]);

let db = null;

function getLexicalDb() {
  if (db) return db;
  fs.mkdirSync(DEFAULT_LEXICAL_INDEX_DIR, { recursive: true, mode: 0o700 });
  db = new Database(LEXICAL_INDEX_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS lexical_chunks (
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

    CREATE VIRTUAL TABLE IF NOT EXISTS lexical_chunks_fts USING fts5(
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
      UPDATE lexical_chunks_fts
      SET content = new.content,
          chunk_id = new.chunk_id,
          doc_id = new.doc_id,
          path = new.path,
          section = new.section,
          feature_area = new.feature_area,
          source_type = new.source_type,
          sprint = new.sprint,
          module = new.module
      WHERE rowid = old.rowid;
    END;
  `);
  return db;
}

function escapeFtsToken(token) {
  return String(token)
    .replace(/[-"'`*:\^~<>\[\]\(\)\{\}]/g, " ")
    .trim();
}

function buildFtsQuery(query) {
  const tokens = String(query)
    .match(/\w+/g)
    ?.map(escapeFtsToken)
    .filter(Boolean);

  if (!tokens || tokens.length === 0) {
    return "";
  }

  return tokens.map((token) => `${token}*`).join(" OR ");
}

function buildFilterClause(filters, args) {
  if (!filters || typeof filters !== "object") return "";
  const conditions = [];

  for (const [key, value] of Object.entries(filters)) {
    if (!SUPPORTED_FILTER_COLUMNS.has(key)) continue;

    if (Array.isArray(value) && value.length > 0) {
      const placeholders = value.map(() => "?").join(", ");
      conditions.push(`c.${key} IN (${placeholders})`);
      args.push(...value);
      continue;
    }

    if (value === null || value === undefined) continue;

    conditions.push(`c.${key} = ?`);
    args.push(value);
  }

  if (conditions.length === 0) return "";
  return ` AND ${conditions.join(" AND ")}`;
}

export function deleteLexicalChunksByDocId(docId) {
  const database = getLexicalDb();
  const stmt = database.prepare("DELETE FROM lexical_chunks WHERE doc_id = ?");
  stmt.run(docId);
}

export function upsertLexicalChunks(chunks) {
  const database = getLexicalDb();
  const stmt = database.prepare(
    `INSERT OR REPLACE INTO lexical_chunks (
      chunk_id,
      doc_id,
      path,
      section,
      feature_area,
      source_type,
      sprint,
      module,
      content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const transaction = database.transaction((rows) => {
    for (const row of rows) {
      stmt.run(
        row.chunk_id,
        row.doc_id,
        row.path,
        row.section,
        row.feature_area,
        row.source_type,
        row.sprint,
        row.module,
        row.content,
      );
    }
  });
  transaction(chunks);
}

export function searchLexicalChunks(query, limit = 6, filters = {}) {
  const database = getLexicalDb();
  const matchQuery = buildFtsQuery(query);
  if (!matchQuery) return [];

  const args = [matchQuery];
  const filterClause = buildFilterClause(filters, args);

  const sql = `
    SELECT
      c.chunk_id AS id,
      c.path,
      c.section,
      c.feature_area,
      c.source_type,
      c.sprint,
      c.module,
      c.content,
      bm25(f) AS bm25
    FROM lexical_chunks_fts f
    JOIN lexical_chunks c ON f.rowid = c.rowid
    WHERE lexical_chunks_fts MATCH ?${filterClause}
    ORDER BY bm25 ASC
    LIMIT ?
  `;

  const rows = database.prepare(sql).all(...args, limit);
  return rows.map((row, index) => ({
    id: row.id,
    path: row.path ?? "",
    source: row.path ?? row.source_type ?? "",
    content: row.content ?? "",
    section: row.section ?? "",
    feature_area: row.feature_area ?? "",
    sprint: Number(row.sprint ?? 0),
    source_type: row.source_type ?? "",
    module: row.module ?? "",
    score: 1 / (1 + Math.abs(Number(row.bm25 ?? 0))),
    lexicalRank: index + 1,
  }));
}
