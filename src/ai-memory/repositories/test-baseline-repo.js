export class TestBaselineRepo {
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    this.insertStmt = this.db.prepare(`INSERT INTO test_baselines
      (recorded_at, passing_tests, failing_tests, notes)
      VALUES (?, ?, ?, ?)`);
    this.listStmt = this.db.prepare("SELECT * FROM test_baselines ORDER BY recorded_at DESC");
    this.getLatestStmt = this.db.prepare("SELECT * FROM test_baselines ORDER BY recorded_at DESC LIMIT 1");
  }

  add(entry) {
    const recordedAt = entry.recorded_at ?? new Date().toISOString();
    const result = this.insertStmt.run(
      recordedAt,
      Number(entry.passing_tests ?? 0),
      Number(entry.failing_tests ?? 0),
      entry.notes ?? ""
    );
    return this.getById(result.lastInsertRowid);
  }

  list() {
    return this.listStmt.all();
  }

  getLatest() {
    return this.getLatestStmt.get() || null;
  }

  getById(id) {
    return this.db.prepare("SELECT * FROM test_baselines WHERE id = ?").get(id);
  }
}
