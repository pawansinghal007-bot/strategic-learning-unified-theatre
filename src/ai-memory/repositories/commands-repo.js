export class CommandsRepo {
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    this.insertStmt = this.db.prepare(`INSERT INTO important_commands
      (category, powershell_command, notes, created_at)
      VALUES (?, ?, ?, ?)`);
    this.listStmt = this.db.prepare("SELECT * FROM important_commands ORDER BY created_at DESC");
  }

  add(entry) {
    const createdAt = entry.created_at ?? new Date().toISOString();
    const result = this.insertStmt.run(
      entry.category ?? "general",
      entry.powershell_command,
      entry.notes ?? "",
      createdAt
    );
    return this.getById(result.lastInsertRowid);
  }

  list() {
    return this.listStmt.all();
  }

  getById(id) {
    return this.db.prepare("SELECT * FROM important_commands WHERE id = ?").get(id);
  }
}
