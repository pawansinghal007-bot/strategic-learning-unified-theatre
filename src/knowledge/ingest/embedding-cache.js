import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_CACHE_DIR = path.join(
  process.env.EMBEDDING_CACHE_DIR || process.env.HOME || os.homedir(),
  ".vscode-rotator",
);
const CACHE_NAME = process.env.EMBEDDING_CACHE_DB || "embedding-cache.db";

function defaultCacheDir(baseDir) {
  if (baseDir) return path.resolve(baseDir);
  return DEFAULT_CACHE_DIR;
}

export class EmbeddingCache {
  constructor({ baseDir, maxEntries = 10000 } = {}) {
    this.baseDir = defaultCacheDir(baseDir);
    this.dbPath = path.join(this.baseDir, CACHE_NAME);
    this.maxEntries = maxEntries;
    this.db = null;
    this.hits = 0;
    this.misses = 0;
  }

  async init() {
    if (this.db) {
      return this;
    }

    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS embedding_cache (
        chunk_hash TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    );
    return this;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.db
        ? Number(
            this.db
              .prepare("SELECT COUNT(*) AS count FROM embedding_cache")
              .get().count,
          )
        : 0,
    };
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getVector(chunkHash) {
    const row = this.db
      .prepare("SELECT vector FROM embedding_cache WHERE chunk_hash = ?")
      .get(chunkHash);
    if (row) {
      this.hits += 1;
      return JSON.parse(row.vector);
    }
    this.misses += 1;
    return null;
  }

  setVector(chunkHash, vector) {
    const serialized = JSON.stringify(vector);
    const now = Date.now();

    const insert = this.db.prepare(
      `INSERT INTO embedding_cache (chunk_hash, vector, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chunk_hash) DO UPDATE SET vector = excluded.vector, updated_at = excluded.updated_at`,
    );
    insert.run(chunkHash, serialized, now);
    this._pruneIfNeeded();
  }

  _pruneIfNeeded() {
    if (!this.maxEntries) return;
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM embedding_cache")
      .get();
    const count = Number(row.count);
    if (count <= this.maxEntries) return;

    const deleteCount = count - this.maxEntries;
    this.db
      .prepare(
        `DELETE FROM embedding_cache WHERE chunk_hash IN (
           SELECT chunk_hash FROM embedding_cache
           ORDER BY updated_at ASC
           LIMIT ?
         )`,
      )
      .run(deleteCount);
  }
}

export const embeddingCache = new EmbeddingCache();
