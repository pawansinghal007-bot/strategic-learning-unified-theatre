export class SprintStateRepo {
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    this.upsertStmt = this.db.prepare(`INSERT INTO sprint_state
      (sprint_name, status, current_goal, blockers, next_steps, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sprint_name) DO UPDATE SET
        status = excluded.status,
        current_goal = excluded.current_goal,
        blockers = excluded.blockers,
        next_steps = excluded.next_steps,
        updated_at = excluded.updated_at`);
    this.getBySprintStmt = this.db.prepare("SELECT * FROM sprint_state WHERE sprint_name = ?");
    this.getLatestStmt = this.db.prepare("SELECT * FROM sprint_state ORDER BY updated_at DESC LIMIT 1");
    this.listStmt = this.db.prepare("SELECT * FROM sprint_state ORDER BY updated_at DESC");
  }

  upsert(entry) {
    const updatedAt = entry.updated_at ?? new Date().toISOString();
    this.upsertStmt.run(
      entry.sprint_name,
      entry.status ?? "active",
      entry.current_goal ?? "",
      JSON.stringify(entry.blockers ?? []),
      JSON.stringify(entry.next_steps ?? []),
      updatedAt
    );
    return this.getBySprint(entry.sprint_name);
  }

  getBySprint(sprintName) {
    const row = this.getBySprintStmt.get(sprintName);
    return row ? this._normalize(row) : null;
  }

  getLatest() {
    const row = this.getLatestStmt.get();
    return row ? this._normalize(row) : null;
  }

  list() {
    return this.listStmt.all().map((row) => this._normalize(row));
  }

  _normalize(row) {
    return {
      ...row,
      blockers: row.blockers ? JSON.parse(row.blockers) : [],
      next_steps: row.next_steps ? JSON.parse(row.next_steps) : []
    };
  }
}
