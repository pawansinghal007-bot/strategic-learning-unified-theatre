import { BaseRepo } from "./base-repo.js";

export class HandoffRepo extends BaseRepo {
  prepareStatements(db) {
    return {
      upsertStmt: db.prepare(`INSERT INTO handoff_state
        (sprint_name, resume_summary, completed_steps, pending_tasks, last_agent_output, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(sprint_name) DO UPDATE SET
          resume_summary = excluded.resume_summary,
          completed_steps = excluded.completed_steps,
          pending_tasks = excluded.pending_tasks,
          last_agent_output = excluded.last_agent_output,
          updated_at = excluded.updated_at`),
      getByKeyStmt: db.prepare("SELECT * FROM handoff_state WHERE sprint_name = ?"),
      getLatestStmt: db.prepare("SELECT * FROM handoff_state ORDER BY updated_at DESC LIMIT 1"),
      listStmt: db.prepare("SELECT * FROM handoff_state ORDER BY updated_at DESC"),
    };
  }

  runUpsert(entry) {
    const updatedAt = entry.updated_at ?? new Date().toISOString();
    this.upsertStmt.run(
      entry.sprint_name,
      entry.resume_summary ?? "",
      JSON.stringify(entry.completed_steps ?? []),
      JSON.stringify(entry.pending_tasks ?? []),
      entry.last_agent_output ?? "",
      updatedAt,
    );
  }

  getKey(entry) {
    return entry.sprint_name;
  }

  /** Alias kept for backwards compatibility — tests and consumers call getBySprint(). */
  getBySprint(sprintName) {
    return this.getByKey(sprintName);
  }

  _normalize(row) {
    return {
      ...row,
      completed_steps: row.completed_steps ? JSON.parse(row.completed_steps) : [],
      pending_tasks: row.pending_tasks ? JSON.parse(row.pending_tasks) : [],
    };
  }
}
