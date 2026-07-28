import { BaseRepo } from "./base-repo.js";

export class SprintStateRepo extends BaseRepo {
  prepareStatements(db) {
    return {
      upsertStmt: db.prepare(`INSERT INTO sprint_state
        (sprint_name, status, current_goal, blockers, next_steps, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(sprint_name) DO UPDATE SET
          status = excluded.status,
          current_goal = excluded.current_goal,
          blockers = excluded.blockers,
          next_steps = excluded.next_steps,
          updated_at = excluded.updated_at`),
      getByKeyStmt: db.prepare("SELECT * FROM sprint_state WHERE sprint_name = ?"),
      getLatestStmt: db.prepare("SELECT * FROM sprint_state ORDER BY updated_at DESC LIMIT 1"),
      listStmt: db.prepare("SELECT * FROM sprint_state ORDER BY updated_at DESC"),
    };
  }

  runUpsert(entry) {
    const updatedAt = entry.updated_at ?? new Date().toISOString();
    this.upsertStmt.run(
      entry.sprint_name,
      entry.status ?? "active",
      entry.current_goal ?? "",
      JSON.stringify(entry.blockers ?? []),
      JSON.stringify(entry.next_steps ?? []),
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
      blockers: row.blockers ? JSON.parse(row.blockers) : [],
      next_steps: row.next_steps ? JSON.parse(row.next_steps) : [],
    };
  }
}
