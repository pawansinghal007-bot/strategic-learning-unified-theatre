import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

// Mock ora so spinner doesn't interfere with console output capture in tests
vi.mock("ora", () => ({
  default: () => ({
    start: function () {
      return this;
    },
    stop: function () {
      return this;
    },
    succeed: function () {
      return this;
    },
    fail: function () {
      return this;
    },
  }),
}));

import { MemoryDb } from "../src/ai-memory/memory-db.js";
import { SprintStateRepo } from "../src/ai-memory/repositories/sprint-state-repo.js";
import { HandoffRepo } from "../src/ai-memory/repositories/handoff-repo.js";
import { LessonsRepo } from "../src/ai-memory/repositories/lessons-repo.js";
import { DecisionsRepo } from "../src/ai-memory/repositories/decisions-repo.js";
import { TestBaselineRepo } from "../src/ai-memory/repositories/test-baseline-repo.js";
import { bindAiCommands } from "../src/commands/ai.js";

// Helper: fresh program per call — commander cannot be reused across parseAsync calls
function makeProgram() {
  const program = new Command();
  program.exitOverride(); // prevent process.exit on unknown commands; throw instead
  bindAiCommands(program);
  return program;
}

describe("MemoryDb unit behavior", () => {
  let tempDir;
  let originalHome;
  let originalDbPath;
  let originalVitest;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "memory-db-unit-"));
    originalHome = process.env.HOME;
    originalDbPath = process.env.DB_PATH;
    originalVitest = process.env.VITEST;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalDbPath == null) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalVitest == null) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("getDb() throws before init() has been called (line 55)", () => {
    const db = new MemoryDb();
    expect(() => db.getDb()).toThrow("MemoryDb is not initialized.");
  });

  it("close() is a no-op when the db was never initialized", () => {
    const db = new MemoryDb();
    expect(() => db.close()).not.toThrow();
  });

  it("close() is idempotent — calling it twice after init() doesn't throw", async () => {
    const db = new MemoryDb();
    await db.init();
    db.close();
    expect(() => db.close()).not.toThrow();
    expect(() => db.getDb()).toThrow("MemoryDb is not initialized.");
  });

  it("uses an explicit baseDir when provided, resolved to an absolute path", async () => {
    const explicitBase = path.join(tempDir, "custom-base");
    const db = new MemoryDb({ baseDir: explicitBase });
    expect(db.baseDir).toBe(path.resolve(explicitBase));
    await db.init();
    db.close();
  });

  it("uses an explicit dbPath constructor argument over env/default", async () => {
    const explicitDbPath = path.join(tempDir, "custom.db");
    const db = new MemoryDb({ dbPath: explicitDbPath });
    expect(db.dbPath).toBe(explicitDbPath);
    await db.init();
    db.close();
  });

  it("falls back to process.env.DB_PATH when no dbPath argument is given", async () => {
    const envDbPath = path.join(tempDir, "env-configured.db");
    process.env.DB_PATH = envDbPath;
    const db = new MemoryDb();
    expect(db.dbPath).toBe(envDbPath);
    await db.init();
    db.close();
  });

  it("falls back to HOME/.vscode-rotator when VITEST is unset and no baseDir/HOME override applies", () => {
    delete process.env.VITEST;
    const db = new MemoryDb();
    expect(db.baseDir).toBe(path.join(tempDir, ".vscode-rotator"));
  });

  it("falls back to os.homedir() when both VITEST and HOME are unset (line 12)", () => {
    delete process.env.VITEST;
    delete process.env.HOME;
    const db = new MemoryDb();
    expect(db.baseDir).toBe(path.join(os.homedir(), ".vscode-rotator"));
  });
});

describe("AI Memory Foundation", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-memory-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    process.exitCode = undefined;
  });

  afterEach(async () => {
    if (originalHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    vi.restoreAllMocks();
    // Small delay to let better-sqlite3 release file handles before deletion
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("initializes the SQLite DB and persists records", async () => {
    const db = new MemoryDb();
    await db.init();

    const sprintRepo = new SprintStateRepo(db);
    const handoffRepo = new HandoffRepo(db);
    const lessonsRepo = new LessonsRepo(db);
    const decisionsRepo = new DecisionsRepo(db);
    const baselineRepo = new TestBaselineRepo(db);

    sprintRepo.upsert({
      sprint_name: "sprint-15",
      status: "active",
      current_goal: "Foundation only",
      blockers: ["none"],
      next_steps: ["implement db"],
      updated_at: "2026-05-21T00:00:00.000Z",
    });

    handoffRepo.upsert({
      sprint_name: "sprint-15",
      resume_summary: "Resume state snapshot",
      completed_steps: ["scaffold"],
      pending_tasks: ["persist state"],
      last_agent_output: "Ready to continue",
      updated_at: "2026-05-21T00:00:00.000Z",
    });

    lessonsRepo.add({
      problem: "Missing structured memory",
      fix: "Added SQLite persistence",
      prevention_rule: "Store state in DB, not files",
      related_files: ["src/ai-memory/memory-db.js"],
    });

    decisionsRepo.add({
      title: "Persistent AI memory database",
      rationale: "Avoid large markdown resume prompts",
      decision: "Use SQLite with better-sqlite3",
      affected_files: ["src/ai-memory/memory.sql"],
      superseded_by: null,
    });

    baselineRepo.add({
      passing_tests: 214,
      failing_tests: 0,
      notes: "Post Sprint 12 clean baseline",
    });

    expect(sprintRepo.getLatest().sprint_name).toBe("sprint-15");
    expect(handoffRepo.getLatest().resume_summary).toContain(
      "Resume state snapshot",
    );
    expect(lessonsRepo.list().length).toBe(1);
    expect(decisionsRepo.list().length).toBe(1);
    expect(baselineRepo.getLatest().passing_tests).toBe(214);

    db.close();
  });

  it("prints a compact snapshot from the ai snapshot command", async () => {
    const db = new MemoryDb();
    await db.init();
    const sprintRepo = new SprintStateRepo(db);
    const handoffRepo = new HandoffRepo(db);
    const lessonsRepo = new LessonsRepo(db);
    const decisionsRepo = new DecisionsRepo(db);
    const baselineRepo = new TestBaselineRepo(db);

    sprintRepo.upsert({
      sprint_name: "sprint-15",
      status: "active",
      current_goal: "Foundation only",
      blockers: ["none"],
      next_steps: ["implement db"],
      updated_at: "2026-05-21T00:00:00.000Z",
    });
    handoffRepo.upsert({
      sprint_name: "sprint-15",
      resume_summary: "Resume state snapshot",
      completed_steps: [],
      pending_tasks: ["persist state"],
      last_agent_output: "Ready to continue",
      updated_at: "2026-05-21T00:00:00.000Z",
    });
    lessonsRepo.add({
      problem: "Missing structured memory",
      fix: "Added SQLite persistence",
      prevention_rule: "Store state in DB, not files",
    });
    decisionsRepo.add({
      title: "Persistent AI memory database",
      rationale: "Avoid large markdown resume prompts",
      decision: "Use SQLite with better-sqlite3",
    });
    baselineRepo.add({
      passing_tests: 214,
      failing_tests: 0,
      notes: "Baseline capture",
    });
    db.close();

    const output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "snapshot",
    ]);

    expect(output.some((line) => line.includes("AI Memory Snapshot"))).toBe(
      true,
    );
    expect(output.some((line) => line.includes("Current sprint:"))).toBe(true);
  });

  it("falls back to the latest sprint manifest when AI-memory repos are empty", async () => {
    const manifestDir = path.join(
      process.env.HOME,
      ".vscode-rotator",
      "sprints",
    );
    await fs.mkdir(manifestDir, { recursive: true, mode: 0o700 });
    const manifest = {
      sprintId: "00000000-0000-0000-0000-000000000000",
      date: "2026-05-24T00:00:00.000Z",
      agent: "other",
      model: "unknown",
      goal: "Fix snapshot fallback",
      tokensUsed: 0,
      tokensLimit: 100,
      status: "active",
      completedTasks: [],
      pendingTasks: [{ id: "1", description: "Add fallback", priority: 1 }],
      blockers: [
        {
          description: "No DB rows",
          suggestedFix: "Use file manifest fallback",
        },
      ],
      filesCreated: [],
      filesModified: [],
      testsPassed: [],
      testsFailed: [],
      resumePrompt: "Resume sprint from manifest",
    };
    await fs.writeFile(
      path.join(
        manifestDir,
        "2026-05-24-00000000-0000-0000-0000-000000000000.json",
      ),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "snapshot",
    ]);

    expect(output.some((line) => line.includes("AI Memory Snapshot"))).toBe(
      true,
    );
    expect(output.some((line) => line.includes("Current sprint:"))).toBe(true);
    expect(output.some((line) => line.includes("Handoff summary:"))).toBe(true);
  });

  it("records PowerShell commands and lists them via ai commands list", async () => {
    const output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "commands",
      "add",
      "--category",
      "setup",
      "--powershell-command",
      String.raw`Set-Location 'C:\temp'`,
      "--notes",
      "Test command",
    ]);

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "commands",
      "list",
    ]);

    expect(output.some((line) => line.includes("Command saved"))).toBe(true);
    expect(output.some((line) => line.includes("setup"))).toBe(true);
    expect(
      output.some((line) => line.includes(String.raw`Set-Location 'C:\temp'`)),
    ).toBe(true);
  });

  it("records a new test baseline with ai baseline add", async () => {
    const output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "baseline",
      "add",
      "--passing",
      "150",
      "--failing",
      "0",
      "--notes",
      "Baseline test",
    ]);

    expect(output.some((line) => line.includes("Baseline recorded"))).toBe(
      true,
    );
    expect(output.some((line) => line.match(/id: \d+/))).toBe(true);
  });

  it("refuses to record a failing baseline unless explicitly allowed", async () => {
    const errors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "baseline",
      "add",
      "--passing",
      "150",
      "--failing",
      "2",
      "--notes",
      "Should not become the latest snapshot baseline",
    ]);

    expect(process.exitCode).toBe(1);
    expect(errors.some((line) => line.includes("--allow-failing"))).toBe(true);

    const db = new MemoryDb();
    await db.init();
    const baselineRepo = new TestBaselineRepo(db);
    expect(baselineRepo.getLatest()).toBeNull();
    db.close();
  });
});


// ── Targeted coverage gap tests ───────────────────────────────────────────
// Covers:
//   commands-repo.js  lines 14-15: `created_at ?? new Date()...` and
//                                  `category ?? "general"` right-hand sides
//   decisions-repo.js lines 14-15: `rationale ?? ""`, `decision ?? ""`,
//                                  `affected_files ?? []`, `superseded_by ?? null`
//                                  right-hand sides
//   decisions-repo.js lines 26-32: list() `affected_files` null/false branch,
//                                  getById() not-found `null` branch,
//                                  getById() `affected_files` null branch

import fs from "node:fs/promises";
import { CommandsRepo } from "../src/ai-memory/repositories/commands-repo.js";

describe("CommandsRepo — coverage gaps (lines 14-15)", () => {
  let tempDir;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commands-repo-gap-"));
    process.env.HOME = tempDir;
    db = new MemoryDb();
    await db.init();
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses new Date().toISOString() when created_at is absent (line 14 ?? right-hand)", () => {
    // Omit created_at → triggers `entry.created_at ?? new Date().toISOString()`
    const repo = new CommandsRepo(db);
    const result = repo.add({
      powershell_command: "Get-Date",
      // no created_at field
    });
    expect(result).toBeDefined();
    expect(result.created_at).toBeTruthy();
    // Should be a valid ISO string generated at call time
    expect(() => new Date(result.created_at)).not.toThrow();
  });

  it("uses 'general' when category is absent (line 14 ?? right-hand)", () => {
    // Omit category → triggers `entry.category ?? "general"`
    const repo = new CommandsRepo(db);
    const result = repo.add({
      powershell_command: "Get-Process",
      // no category field
    });
    expect(result.category).toBe("general");
  });

  it("uses '' when notes is absent (line 15 ?? right-hand)", () => {
    // Omit notes → triggers `entry.notes ?? ""`
    const repo = new CommandsRepo(db);
    const result = repo.add({
      powershell_command: "Get-Item",
      category: "util",
      // no notes field
    });
    expect(result.notes).toBe("");
  });

  it("uses all defaults together when only powershell_command is provided", () => {
    const repo = new CommandsRepo(db);
    const result = repo.add({ powershell_command: "ls" });
    expect(result.category).toBe("general");
    expect(result.notes).toBe("");
    expect(result.created_at).toBeTruthy();
  });
});

describe("DecisionsRepo — coverage gaps (lines 14-15, 26-32)", () => {
  let tempDir;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "decisions-repo-gap-"));
    process.env.HOME = tempDir;
    db = new MemoryDb();
    await db.init();
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── lines 14-15: ?? right-hand fallbacks in add() ────────────────────────

  it("uses '' when rationale is absent (line 14 ?? right-hand)", () => {
    const repo = new DecisionsRepo(db);
    const result = repo.add({ title: "Use SQLite" }); // no rationale
    expect(result.rationale).toBe("");
  });

  it("uses '' when decision is absent (line 14 ?? right-hand)", () => {
    const repo = new DecisionsRepo(db);
    const result = repo.add({ title: "Use SQLite", rationale: "Fast" }); // no decision
    expect(result.decision).toBe("");
  });

  it("uses [] when affected_files is absent (line 15 ?? right-hand)", () => {
    const repo = new DecisionsRepo(db);
    const result = repo.add({ title: "Use Redis" }); // no affected_files
    // affected_files stored as JSON.stringify([]) → getById parses it back
    expect(result.affected_files).toEqual([]);
  });

  it("uses null when superseded_by is absent (line 15 ?? right-hand)", () => {
    const repo = new DecisionsRepo(db);
    const result = repo.add({ title: "Use Postgres" }); // no superseded_by
    expect(result.superseded_by).toBeNull();
  });

  it("uses new Date().toISOString() when created_at is absent (line 13 ?? right-hand)", () => {
    const repo = new DecisionsRepo(db);
    const result = repo.add({ title: "Decision A" }); // no created_at
    expect(result.created_at).toBeTruthy();
    expect(() => new Date(result.created_at)).not.toThrow();
  });

  // ── lines 26-32: list() affected_files null/false branch ─────────────────

  it("list() returns [] for affected_files when stored value is null (line 26-27 false branch)", () => {
    // Insert a row with affected_files = NULL directly via raw SQL so we can
    // test the `row.affected_files ? JSON.parse(...) : []` false branch.
    const rawDb = db.getDb();
    rawDb
      .prepare(
        `INSERT INTO architectural_decisions
         (title, rationale, decision, affected_files, superseded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("Raw insert", "", "", null, null, new Date().toISOString());

    const repo = new DecisionsRepo(db);
    const entries = repo.list();

    const entry = entries.find((e) => e.title === "Raw insert");
    expect(entry).toBeDefined();
    // affected_files was NULL in the DB → the false branch returns []
    expect(entry.affected_files).toEqual([]);
  });

  // ── lines 29-32: getById() branches ──────────────────────────────────────

  it("getById() returns null when no row matches the given id (line 29 false branch)", () => {
    const repo = new DecisionsRepo(db);
    // Pass an id that doesn't exist
    const result = repo.getById(99999);
    expect(result).toBeNull();
  });

  it("getById() returns [] for affected_files when stored value is null (line 29-31 false branch)", () => {
    const rawDb = db.getDb();
    const info = rawDb
      .prepare(
        `INSERT INTO architectural_decisions
         (title, rationale, decision, affected_files, superseded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("Direct null", "", "", null, null, new Date().toISOString());

    const repo = new DecisionsRepo(db);
    const result = repo.getById(info.lastInsertRowid);

    expect(result).not.toBeNull();
    // affected_files is NULL in DB → getById's `row.affected_files ? ... : []` false branch
    expect(result.affected_files).toEqual([]);
  });

  it("getById() parses affected_files JSON when present (line 29-31 true branch — companion guard)", () => {
    const repo = new DecisionsRepo(db);
    const added = repo.add({
      title: "With files",
      affected_files: ["src/a.ts", "src/b.ts"],
    });

    const fetched = repo.getById(added.id);
    expect(fetched.affected_files).toEqual(["src/a.ts", "src/b.ts"]);
  });
});


// ── Targeted coverage gap tests ───────────────────────────────────────────
// Covers:
//   lessons-repo.js      lines 14-15:  `fix ?? ""`, `prevention_rule ?? ""`,
//                                      `related_files ?? []`, `created_at ?? now`
//                                      right-hand sides
//                        lines 25-31:  list() `related_files` null false branch,
//                                      getById() not-found null branch,
//                                      getById() `related_files` null false branch
//   sprint-state-repo.js lines 48-49:  _normalize() `blockers` null false branch,
//                                      `next_steps` null false branch

import { LessonsRepo } from "../src/ai-memory/repositories/lessons-repo.js";
import { SprintStateRepo } from "../src/ai-memory/repositories/sprint-state-repo.js";

describe("LessonsRepo — coverage gaps (lines 14-15, 25-31)", () => {
  let tempDir;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lessons-repo-gap-"));
    process.env.HOME = tempDir;
    db = new MemoryDb();
    await db.init();
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── lines 14-15: ?? right-hand fallbacks in add() ────────────────────────

  it("uses '' when fix is absent (line 14 ?? right-hand)", () => {
    const repo = new LessonsRepo(db);
    const result = repo.add({ problem: "missing tests" }); // no fix
    expect(result.fix).toBe("");
  });

  it("uses '' when prevention_rule is absent (line 14 ?? right-hand)", () => {
    const repo = new LessonsRepo(db);
    const result = repo.add({ problem: "slow queries", fix: "add index" }); // no prevention_rule
    expect(result.prevention_rule).toBe("");
  });

  it("uses [] when related_files is absent (line 15 ?? right-hand)", () => {
    const repo = new LessonsRepo(db);
    const result = repo.add({ problem: "crash on startup" }); // no related_files
    expect(result.related_files).toEqual([]);
  });

  it("uses new Date().toISOString() when created_at is absent (line 14 ?? right-hand)", () => {
    const repo = new LessonsRepo(db);
    const result = repo.add({ problem: "no timestamp" }); // no created_at
    expect(result.created_at).toBeTruthy();
    expect(() => new Date(result.created_at)).not.toThrow();
  });

  it("uses all defaults together when only problem is provided", () => {
    const repo = new LessonsRepo(db);
    const result = repo.add({ problem: "minimal entry" });
    expect(result.fix).toBe("");
    expect(result.prevention_rule).toBe("");
    expect(result.related_files).toEqual([]);
    expect(result.created_at).toBeTruthy();
  });

  // ── lines 25-31: list() and getById() null-related_files branches ─────────

  it("list() returns [] for related_files when stored value is null (line 25 false branch)", () => {
    // Insert directly with related_files = NULL to bypass add()'s JSON.stringify([])
    db.getDb()
      .prepare(
        `INSERT INTO ai_lessons_learned
         (problem, fix, prevention_rule, related_files, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("Raw lesson", "", "", null, new Date().toISOString());

    const repo = new LessonsRepo(db);
    const entries = repo.list();
    const entry = entries.find((e) => e.problem === "Raw lesson");
    expect(entry).toBeDefined();
    // related_files was NULL → the false branch returns []
    expect(entry.related_files).toEqual([]);
  });

  it("getById() returns null when no row matches (line 29 false branch)", () => {
    const repo = new LessonsRepo(db);
    expect(repo.getById(99999)).toBeNull();
  });

  it("getById() returns [] for related_files when stored value is null (line 29-31 false branch)", () => {
    const info = db.getDb()
      .prepare(
        `INSERT INTO ai_lessons_learned
         (problem, fix, prevention_rule, related_files, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("Null files lesson", "", "", null, new Date().toISOString());

    const repo = new LessonsRepo(db);
    const result = repo.getById(info.lastInsertRowid);
    expect(result).not.toBeNull();
    // related_files is NULL in DB → getById's false branch returns []
    expect(result.related_files).toEqual([]);
  });

  it("getById() parses related_files JSON when present (companion true-branch guard)", () => {
    const repo = new LessonsRepo(db);
    const added = repo.add({
      problem: "with files",
      related_files: ["src/a.ts", "src/b.ts"],
    });
    const fetched = repo.getById(added.id);
    expect(fetched.related_files).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("SprintStateRepo — coverage gaps (lines 48-49)", () => {
  let tempDir;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprint-state-gap-"));
    process.env.HOME = tempDir;
    db = new MemoryDb();
    await db.init();
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── lines 48-49: _normalize() null false branches for blockers/next_steps ─

  it("_normalize() returns [] for blockers when stored value is null (line 48 false branch)", () => {
    // Insert directly with blockers = NULL to bypass upsert()'s JSON.stringify
    db.getDb()
      .prepare(
        `INSERT INTO sprint_state
         (sprint_name, status, current_goal, blockers, next_steps, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("sprint-null-blockers", "active", "goal", null, "[]", new Date().toISOString());

    const repo = new SprintStateRepo(db);
    const result = repo.getBySprint("sprint-null-blockers");
    expect(result).not.toBeNull();
    // blockers was NULL → _normalize's false branch returns []
    expect(result.blockers).toEqual([]);
  });

  it("_normalize() returns [] for next_steps when stored value is null (line 49 false branch)", () => {
    db.getDb()
      .prepare(
        `INSERT INTO sprint_state
         (sprint_name, status, current_goal, blockers, next_steps, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("sprint-null-steps", "active", "goal", "[]", null, new Date().toISOString());

    const repo = new SprintStateRepo(db);
    const result = repo.getBySprint("sprint-null-steps");
    expect(result).not.toBeNull();
    // next_steps was NULL → _normalize's false branch returns []
    expect(result.next_steps).toEqual([]);
  });

  it("_normalize() returns [] for both when both blockers and next_steps are null", () => {
    db.getDb()
      .prepare(
        `INSERT INTO sprint_state
         (sprint_name, status, current_goal, blockers, next_steps, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("sprint-both-null", "active", "goal", null, null, new Date().toISOString());

    const repo = new SprintStateRepo(db);
    const result = repo.getBySprint("sprint-both-null");
    expect(result.blockers).toEqual([]);
    expect(result.next_steps).toEqual([]);
  });

  // ── line 42: list() ────────────────────────────────────────────────────────

  it("list() returns all sprint rows normalized (line 42)", () => {
    const repo = new SprintStateRepo(db);
    repo.upsert({ sprint_name: "sprint-list-1", status: "active", current_goal: "g1" });
    repo.upsert({ sprint_name: "sprint-list-2", status: "done",   current_goal: "g2" });

    const all = repo.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.every((r) => Array.isArray(r.blockers))).toBe(true);
    expect(all.every((r) => Array.isArray(r.next_steps))).toBe(true);
  });
});
