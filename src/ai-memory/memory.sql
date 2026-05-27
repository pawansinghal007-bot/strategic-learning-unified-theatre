CREATE TABLE IF NOT EXISTS sprint_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  current_goal TEXT,
  blockers TEXT,
  next_steps TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS architectural_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  rationale TEXT,
  decision TEXT,
  affected_files TEXT,
  superseded_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS implementation_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subsystem TEXT NOT NULL,
  summary TEXT,
  important_files TEXT,
  constraints TEXT,
  known_issues TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoff_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_name TEXT NOT NULL UNIQUE,
  resume_summary TEXT,
  completed_steps TEXT,
  pending_tasks TEXT,
  last_agent_output TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT NOT NULL,
  passing_tests INTEGER NOT NULL,
  failing_tests INTEGER NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS important_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  powershell_command TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_lessons_learned (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem TEXT NOT NULL,
  fix TEXT,
  prevention_rule TEXT,
  related_files TEXT,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Sprint 14 S3 — Session resume tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS session_resume_metadata (
  session_id      TEXT    PRIMARY KEY,
  provider        TEXT    NOT NULL DEFAULT 'unknown',
  model           TEXT    NOT NULL DEFAULT 'unknown',
  workspace_path  TEXT    NOT NULL DEFAULT 'unknown',
  status          TEXT    NOT NULL DEFAULT 'pending',
  blocked_reason  TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  reset_at        INTEGER,
  retry_at        INTEGER,
  last_seen_at    INTEGER
);

CREATE TABLE IF NOT EXISTS session_continuation_state (
  session_id                      TEXT PRIMARY KEY,
  current_goal                    TEXT,
  goal_redacted                   TEXT,
  last_prompt_hash                TEXT,
  last_response_summary_redacted  TEXT,
  resume_prompt                   TEXT,
  completion_state                TEXT,

  FOREIGN KEY (session_id)
    REFERENCES session_resume_metadata (session_id)
    ON DELETE CASCADE
);