export class HandoffRepo {
  constructor(memoryDb) {
    this.db = memoryDb.getDb();
    this.upsertStmt = this.db.prepare(`INSERT INTO handoff_state
      (sprint_name, resume_summary, completed_steps, pending_tasks, last_agent_output, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sprint_name) DO UPDATE SET
        resume_summary = excluded.resume_summary,
        completed_steps = excluded.completed_steps,
        pending_tasks = excluded.pending_tasks,
        last_agent_output = excluded.last_agent_output,
        updated_at = excluded.updated_at`);
    this.getBySprintStmt = this.db.prepare("SELECT * FROM handoff_state WHERE sprint_name = ?");
    this.getLatestStmt = this.db.prepare("SELECT * FROM handoff_state ORDER BY updated_at DESC LIMIT 1");
    this.listStmt = this.db.prepare("SELECT * FROM handoff_state ORDER BY updated_at DESC");
  }

  upsert(entry) {
    const updatedAt = entry.updated_at ?? new Date().toISOString();
    this.upsertStmt.run(
      entry.sprint_name,
      entry.resume_summary ?? "",
      JSON.stringify(entry.completed_steps ?? []),
      JSON.stringify(entry.pending_tasks ?? []),
      entry.last_agent_output ?? "",
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
      completed_steps: row.completed_steps ? JSON.parse(row.completed_steps) : [],
      pending_tasks: row.pending_tasks ? JSON.parse(row.pending_tasks) : []
    };
  }
}
