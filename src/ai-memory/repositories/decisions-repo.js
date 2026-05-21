export class DecisionsRepo {
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    this.insertStmt = this.db.prepare(`INSERT INTO architectural_decisions
      (title, rationale, decision, affected_files, superseded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`);
    this.listStmt = this.db.prepare("SELECT * FROM architectural_decisions ORDER BY created_at DESC");
  }

  add(entry) {
    const createdAt = entry.created_at ?? new Date().toISOString();
    const result = this.insertStmt.run(
      entry.title,
      entry.rationale ?? "",
      entry.decision ?? "",
      JSON.stringify(entry.affected_files ?? []),
      entry.superseded_by ?? null,
      createdAt
    );
    return this.getById(result.lastInsertRowid);
  }

  list() {
    return this.listStmt.all().map((row) => ({
      ...row,
      affected_files: row.affected_files ? JSON.parse(row.affected_files) : []
    }));
  }

  getById(id) {
    const row = this.db.prepare("SELECT * FROM architectural_decisions WHERE id = ?").get(id);
    return row ? { ...row, affected_files: row.affected_files ? JSON.parse(row.affected_files) : [] } : null;
  }
}
