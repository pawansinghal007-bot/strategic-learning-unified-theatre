/**
 * src/ai-memory/repositories/base-repo.js
 *
 * Shared base for SQLite-backed repositories that follow the sprint/handoff
 * pattern: upsert-on-conflict, getByKey, getLatest, list, _normalize.
 *
 * Subclasses provide:
 *   - prepareStatements(db) → { upsertStmt, getByKeyStmt, getLatestStmt, listStmt }
 *   - runUpsert(stmts, entry) — calls stmts.upsertStmt.run(...)
 *   - getKey(entry) → string — primary key value used by getBySprint/getByKey
 *   - _normalize(row) → object — JSON-parse any serialized array columns
 */
export class BaseRepo {
  /**
   * @param {object} memoryDb - Initialised MemoryDb instance
   */
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    const stmts = this.prepareStatements(this.db);
    this.upsertStmt = stmts.upsertStmt;
    this.getByKeyStmt = stmts.getByKeyStmt;
    this.getLatestStmt = stmts.getLatestStmt;
    this.listStmt = stmts.listStmt;
  }

  /**
   * Prepare all SQL statements. Must be implemented by subclass.
   * @param {import('better-sqlite3').Database} db
   * @returns {{ upsertStmt, getByKeyStmt, getLatestStmt, listStmt }}
   */
  prepareStatements(_db) {
    throw new Error("BaseRepo.prepareStatements() must be implemented by subclass");
  }

  /**
   * Execute the upsert statement with values from entry. Must be implemented
   * by subclass because each table has a different column set.
   * @param {object} entry
   */
  runUpsert(_entry) {
    throw new Error("BaseRepo.runUpsert() must be implemented by subclass");
  }

  /**
   * Return the primary key value for the given entry (used after upsert to
   * fetch the saved row). Must be implemented by subclass.
   * @param {object} entry
   * @returns {string}
   */
  getKey(_entry) {
    throw new Error("BaseRepo.getKey() must be implemented by subclass");
  }

  /**
   * Upsert an entry and return the normalised saved row.
   * @param {object} entry
   * @returns {object}
   */
  upsert(entry) {
    this.runUpsert(entry);
    return this.getByKey(this.getKey(entry));
  }

  /**
   * Fetch a single row by its primary key.
   * @param {string} key
   * @returns {object|null}
   */
  getByKey(key) {
    const row = this.getByKeyStmt.get(key);
    return row ? this._normalize(row) : null;
  }

  /**
   * Fetch the most recently updated row.
   * @returns {object|null}
   */
  getLatest() {
    const row = this.getLatestStmt.get();
    return row ? this._normalize(row) : null;
  }

  /**
   * Return all rows ordered by updated_at descending.
   * @returns {object[]}
   */
  list() {
    return this.listStmt.all().map((row) => this._normalize(row));
  }

  /**
   * Normalise a raw DB row (parse JSON-serialised array columns).
   * Must be implemented by subclass.
   * @param {object} row
   * @returns {object}
   */
  _normalize(_row) {
    throw new Error("BaseRepo._normalize() must be implemented by subclass");
  }
}
