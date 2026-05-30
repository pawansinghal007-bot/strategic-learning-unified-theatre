import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

// Mock ora so spinner doesn't interfere with console output capture in tests
vi.mock("ora", () => ({
  default: () => ({
    start: function () { return this; },
    stop: function () { return this; },
    succeed: function () { return this; },
    fail: function () { return this; },
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
      updated_at: "2026-05-21T00:00:00.000Z"
    });

    handoffRepo.upsert({
      sprint_name: "sprint-15",
      resume_summary: "Resume state snapshot",
      completed_steps: ["scaffold"],
      pending_tasks: ["persist state"],
      last_agent_output: "Ready to continue",
      updated_at: "2026-05-21T00:00:00.000Z"
    });

    lessonsRepo.add({
      problem: "Missing structured memory",
      fix: "Added SQLite persistence",
      prevention_rule: "Store state in DB, not files",
      related_files: ["src/ai-memory/memory-db.js"]
    });

    decisionsRepo.add({
      title: "Persistent AI memory database",
      rationale: "Avoid large markdown resume prompts",
      decision: "Use SQLite with better-sqlite3",
      affected_files: ["src/ai-memory/memory.sql"],
      superseded_by: null
    });

    baselineRepo.add({
      passing_tests: 214,
      failing_tests: 0,
      notes: "Post Sprint 12 clean baseline"
    });

    expect(sprintRepo.getLatest().sprint_name).toBe("sprint-15");
    expect(handoffRepo.getLatest().resume_summary).toContain("Resume state snapshot");
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
      updated_at: "2026-05-21T00:00:00.000Z"
    });
    handoffRepo.upsert({
      sprint_name: "sprint-15",
      resume_summary: "Resume state snapshot",
      completed_steps: [],
      pending_tasks: ["persist state"],
      last_agent_output: "Ready to continue",
      updated_at: "2026-05-21T00:00:00.000Z"
    });
    lessonsRepo.add({
      problem: "Missing structured memory",
      fix: "Added SQLite persistence",
      prevention_rule: "Store state in DB, not files"
    });
    decisionsRepo.add({
      title: "Persistent AI memory database",
      rationale: "Avoid large markdown resume prompts",
      decision: "Use SQLite with better-sqlite3"
    });
    baselineRepo.add({ passing_tests: 214, failing_tests: 0, notes: "Baseline capture" });
    db.close();

    const output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    await makeProgram().parseAsync(["node", "strategic-learning-unified-theatre", "ai", "snapshot"]);

    expect(output.some((line) => line.includes("AI Memory Snapshot"))).toBe(true);
    expect(output.some((line) => line.includes("Current sprint:"))).toBe(true);
  });

  it("falls back to the latest sprint manifest when AI-memory repos are empty", async () => {
    const manifestDir = path.join(process.env.HOME, ".vscode-rotator", "sprints");
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
      blockers: [{ description: "No DB rows", suggestedFix: "Use file manifest fallback" }],
      filesCreated: [],
      filesModified: [],
      testsPassed: [],
      testsFailed: [],
      resumePrompt: "Resume sprint from manifest"
    };
    await fs.writeFile(path.join(manifestDir, "2026-05-24-00000000-0000-0000-0000-000000000000.json"), JSON.stringify(manifest, null, 2), "utf8");

    const output = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      output.push(args.join(" "));
    });

    await makeProgram().parseAsync(["node", "strategic-learning-unified-theatre", "ai", "snapshot"]);

    expect(output.some((line) => line.includes("AI Memory Snapshot"))).toBe(true);
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
      "Set-Location 'C:\\temp'",
      "--notes",
      "Test command"
    ]);

    await makeProgram().parseAsync([
      "node",
      "strategic-learning-unified-theatre",
      "ai",
      "commands",
      "list"
    ]);

    expect(output.some((line) => line.includes("Command saved"))).toBe(true);
    expect(output.some((line) => line.includes("setup"))).toBe(true);
    expect(output.some((line) => line.includes("Set-Location 'C:\\temp'"))).toBe(true);
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
      "Baseline test"
    ]);

    expect(output.some((line) => line.includes("Baseline recorded"))).toBe(true);
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
      "Should not become the latest snapshot baseline"
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

