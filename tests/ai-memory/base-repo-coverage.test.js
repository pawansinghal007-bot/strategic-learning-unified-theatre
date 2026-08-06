/**
 * Coverage additions for base-repo.js
 *
 * Targets the uncovered sections:
 * - upsert() — bulk upsert with transaction
 * - getByKey() — single key lookup
 * - getLatest() — latest entry by key
 * - list() — list all entries
 * - Error throwing on abstract methods (prepareStatements, runUpsert, getKey, _normalize)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "base-repo-coverage-"));
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

/**
 * Create a raw SQLite Database instance.
 */
function createRawDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_items (
      key TEXT PRIMARY KEY,
      value TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

/**
 * Create a mock memoryDb object that wraps a raw Database.
 * BaseRepo calls memoryDb.getDb() to get the raw instance.
 */
function createMemoryDb(db) {
  return {
    getDb: () => db,
  };
}

/**
 * Create a concrete TestRepo class that implements all abstract methods.
 */
async function createTestRepoClass(memoryDb) {
  const { BaseRepo } = await import("../../src/ai-memory/repositories/base-repo.js");

  class TestRepo extends BaseRepo {
    constructor(db) {
      super(db);
    }

    prepareStatements(db) {
      return {
        upsertStmt: db.prepare(
          `INSERT OR REPLACE INTO test_items (key, value, tags, updated_at)
           VALUES (@key, @value, @tags, datetime('now'))`,
        ),
        getByKeyStmt: db.prepare(
          `SELECT * FROM test_items WHERE key = ?`,
        ),
        getLatestStmt: db.prepare(
          `SELECT * FROM test_items ORDER BY updated_at DESC LIMIT 1`,
        ),
        listStmt: db.prepare(
          `SELECT * FROM test_items ORDER BY updated_at DESC`,
        ),
      };
    }

    runUpsert(entry) {
      this.upsertStmt.run({
        key: entry.key,
        value: entry.value,
        tags: JSON.stringify(entry.tags || []),
      });
    }

    getKey(entry) {
      return entry.key;
    }

    _normalize(row) {
      return {
        key: row.key,
        value: row.value,
        tags: row.tags ? JSON.parse(row.tags) : [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }
  }

  return TestRepo;
}

describe("base-repo coverage — abstract method errors", () => {
  it("throws when prepareStatements is not implemented", async () => {
    const { BaseRepo } = await import("../../src/ai-memory/repositories/base-repo.js");
    const db = createRawDb(path.join(tmpDir, "test-abstract.db"));
    const memoryDb = createMemoryDb(db);

    class IncompleteRepo extends BaseRepo {
      constructor(db) {
        super(db);
      }
      // Missing prepareStatements
    }

    expect(() => new IncompleteRepo(memoryDb)).toThrow(
      /prepareStatements.*must be implemented/,
    );
  });

  it("throws when runUpsert is not implemented", async () => {
    const { BaseRepo } = await import("../../src/ai-memory/repositories/base-repo.js");
    const db = createRawDb(path.join(tmpDir, "test-abstract.db"));
    const memoryDb = createMemoryDb(db);

    class IncompleteRepo extends BaseRepo {
      constructor(db) {
        super(db);
      }

      prepareStatements(db) {
        return {
          upsertStmt: db.prepare("SELECT 1"),
          getByKeyStmt: db.prepare("SELECT 1"),
          getLatestStmt: db.prepare("SELECT 1"),
          listStmt: db.prepare("SELECT 1"),
        };
      }
      // Missing runUpsert
    }

    const repo = new IncompleteRepo(memoryDb);
    expect(() => repo.runUpsert({ key: "test" })).toThrow(
      /runUpsert.*must be implemented/,
    );
  });

  it("throws when getKey is not implemented", async () => {
    const { BaseRepo } = await import("../../src/ai-memory/repositories/base-repo.js");
    const db = createRawDb(path.join(tmpDir, "test-abstract.db"));
    const memoryDb = createMemoryDb(db);

    class IncompleteRepo extends BaseRepo {
      constructor(db) {
        super(db);
      }

      prepareStatements(db) {
        return {
          upsertStmt: db.prepare("SELECT 1"),
          getByKeyStmt: db.prepare("SELECT 1"),
          getLatestStmt: db.prepare("SELECT 1"),
          listStmt: db.prepare("SELECT 1"),
        };
      }

      runUpsert(_entry) {}
      // Missing getKey
    }

    const repo = new IncompleteRepo(memoryDb);
    expect(() => repo.getKey({ key: "test" })).toThrow(
      /getKey.*must be implemented/,
    );
  });

  it("throws when _normalize is not implemented", async () => {
    const { BaseRepo } = await import("../../src/ai-memory/repositories/base-repo.js");
    const db = createRawDb(path.join(tmpDir, "test-abstract.db"));
    const memoryDb = createMemoryDb(db);

    class IncompleteRepo extends BaseRepo {
      constructor(db) {
        super(db);
      }

      prepareStatements(db) {
        return {
          upsertStmt: db.prepare("SELECT 1"),
          getByKeyStmt: db.prepare("SELECT 1"),
          getLatestStmt: db.prepare("SELECT 1"),
          listStmt: db.prepare("SELECT 1"),
        };
      }

      runUpsert(_entry) {}
      getKey(_entry) { return "test"; }
      // Missing _normalize
    }

    const repo = new IncompleteRepo(memoryDb);
    expect(() => repo._normalize({ key: "test" })).toThrow(
      /_normalize.*must be implemented/,
    );
  });
});

describe("base-repo coverage — getByKey", () => {
  it("returns the item when key exists", async () => {
    const db = createRawDb(path.join(tmpDir, "test-getbykey.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    db.prepare(`INSERT INTO test_items (key, value) VALUES ('test-key', 'test-value')`).run();

    const result = repo.getByKey("test-key");

    expect(result).toBeDefined();
    expect(result.key).toBe("test-key");
    expect(result.value).toBe("test-value");
  });

  it("returns null when key does not exist", async () => {
    const db = createRawDb(path.join(tmpDir, "test-getbykey.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    const result = repo.getByKey("nonexistent");

    expect(result).toBeNull();
  });

  it("returns normalized row with parsed tags", async () => {
    const db = createRawDb(path.join(tmpDir, "test-getbykey.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    db.prepare(`INSERT INTO test_items (key, value, tags) VALUES ('tag-key', 'tag-value', '["a","b"]')`).run();

    const result = repo.getByKey("tag-key");

    expect(result.tags).toEqual(["a", "b"]);
  });
});

describe("base-repo coverage — getLatest", () => {
  it("returns the latest item by updated_at", async () => {
    const db = createRawDb(path.join(tmpDir, "test-getlatest.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    db.prepare(`INSERT INTO test_items (key, value) VALUES ('dup-key', 'first-value')`).run();
    // Use explicit updated_at to control ordering (WAL mode may share timestamps)
    db.prepare(`INSERT INTO test_items (key, value, updated_at) VALUES ('dup-key-2', 'second-value', '2099-01-01 00:00:00')`).run();

    const result = repo.getLatest();

    expect(result).toBeDefined();
    expect(result.value).toBe("second-value");
  });

  it("returns the only item when only one exists", async () => {
    const db = createRawDb(path.join(tmpDir, "test-getlatest.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    db.prepare(`INSERT INTO test_items (key, value) VALUES ('single-key', 'single-value')`).run();

    const result = repo.getLatest();

    expect(result).toBeDefined();
    expect(result.value).toBe("single-value");
  });

  it("returns null when table is empty", async () => {
    const db = createRawDb(path.join(tmpDir, "test-getlatest.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    const result = repo.getLatest();

    expect(result).toBeNull();
  });
});

describe("base-repo coverage — list", () => {
  it("returns all items when no filter", async () => {
    const db = createRawDb(path.join(tmpDir, "test-list.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    db.prepare(`INSERT INTO test_items (key, value) VALUES ('key-1', 'value-1')`).run();
    db.prepare(`INSERT INTO test_items (key, value) VALUES ('key-2', 'value-2')`).run();
    db.prepare(`INSERT INTO test_items (key, value) VALUES ('key-3', 'value-3')`).run();

    const result = repo.list();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.key)).toContain("key-1");
    expect(result.map((r) => r.key)).toContain("key-2");
    expect(result.map((r) => r.key)).toContain("key-3");
  });

  it("returns empty array when table is empty", async () => {
    const db = createRawDb(path.join(tmpDir, "test-list.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    const result = repo.list();

    expect(result).toEqual([]);
  });

  it("returns items with normalized tags", async () => {
    const db = createRawDb(path.join(tmpDir, "test-list.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    db.prepare(`INSERT INTO test_items (key, value, tags) VALUES ('key-1', 'value-1', '["x"]')`).run();
    db.prepare(`INSERT INTO test_items (key, value, tags) VALUES ('key-2', 'value-2', '["y","z"]')`).run();

    const result = repo.list();

    expect(result).toHaveLength(2);
    // Verify both items present with correct tags (order may vary)
    const tagsSets = result.map((r) => JSON.stringify(r.tags.sort()));
    expect(tagsSets).toContain('["x"]');
    expect(tagsSets).toContain('["y","z"]');
  });
});

describe("base-repo coverage — upsert", () => {
  it("inserts a new item and returns it", async () => {
    const db = createRawDb(path.join(tmpDir, "test-upsert.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    const entry = { key: "new-key", value: "new-value", tags: ["a"] };
    const result = repo.upsert(entry);

    expect(result).toBeDefined();
    expect(result.key).toBe("new-key");
    expect(result.value).toBe("new-value");
    expect(result.tags).toEqual(["a"]);
  });

  it("replaces an existing item (UPSERT behavior)", async () => {
    const db = createRawDb(path.join(tmpDir, "test-upsert.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    // Insert initial item
    db.prepare(`INSERT INTO test_items (key, value) VALUES ('existing-key', 'old-value')`).run();

    // Upsert with same key
    const entry = { key: "existing-key", value: "new-value", tags: ["b"] };
    const result = repo.upsert(entry);

    expect(result.value).toBe("new-value");
    expect(result.tags).toEqual(["b"]);

    // Verify only one row exists
    const count = db.prepare("SELECT COUNT(*) as count FROM test_items").get();
    expect(count.count).toBe(1);
  });

  it("upserts multiple items with different keys", async () => {
    const db = createRawDb(path.join(tmpDir, "test-upsert.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    const entries = [
      { key: "key-1", value: "value-1", tags: ["a"] },
      { key: "key-2", value: "value-2", tags: ["b"] },
      { key: "key-3", value: "value-3", tags: ["c"] },
    ];

    for (const entry of entries) {
      repo.upsert(entry);
    }

    const all = repo.list();
    expect(all).toHaveLength(3);
  });
});

describe("base-repo coverage — constructor with prepareStatements", () => {
  it("stores all prepared statements on the instance", async () => {
    const db = createRawDb(path.join(tmpDir, "test-constructor.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    expect(repo.upsertStmt).toBeDefined();
    expect(repo.getByKeyStmt).toBeDefined();
    expect(repo.getLatestStmt).toBeDefined();
    expect(repo.listStmt).toBeDefined();
  });

  it("stores the raw db instance", async () => {
    const db = createRawDb(path.join(tmpDir, "test-constructor.db"));
    const memoryDb = createMemoryDb(db);
    const TestRepo = await createTestRepoClass(memoryDb);
    const repo = new TestRepo(memoryDb);

    expect(repo.db).toBeInstanceOf(Database);
  });
});
