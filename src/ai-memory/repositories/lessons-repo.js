export class LessonsRepo {
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    this.insertStmt = this.db.prepare(`INSERT INTO ai_lessons_learned
      (problem, fix, prevention_rule, related_files, created_at)
      VALUES (?, ?, ?, ?, ?)`);
    this.listStmt = this.db.prepare("SELECT * FROM ai_lessons_learned ORDER BY created_at DESC");
  }

  add(entry) {
    const createdAt = entry.created_at ?? new Date().toISOString();
    const result = this.insertStmt.run(
      entry.problem,
      entry.fix ?? "",
      entry.prevention_rule ?? "",
      JSON.stringify(entry.related_files ?? []),
      createdAt
    );
    return this.getById(result.lastInsertRowid);
  }

  list() {
    return this.listStmt.all().map((row) => ({
      ...row,
      related_files: row.related_files ? JSON.parse(row.related_files) : []
    }));
  }

  getById(id) {
    const row = this.db.prepare("SELECT * FROM ai_lessons_learned WHERE id = ?").get(id);
    return row ? { ...row, related_files: row.related_files ? JSON.parse(row.related_files) : [] } : null;
  }
}
