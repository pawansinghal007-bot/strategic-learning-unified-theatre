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
