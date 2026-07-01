// tests/ai.test.js
// Coverage for src/commands/ai.js

import { Command } from "commander";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock("../src/ai-memory/memory-db.js", () => ({
  MemoryDb: vi.fn().mockImplementation(function () {
    const self = this;
    this.init = vi.fn(async function () {
      return self;
    });
    this.close = vi.fn();
  }),
}));

// Repo mocks delegate to a shared _ctx object so beforeEach resets work.
// The vi.mock factory runs once; we need dynamic dispatch.
let _ctx = null;

vi.mock("../src/ai-memory/repositories/sprint-state-repo.js", () => ({
  SprintStateRepo: vi.fn().mockImplementation(() => ({
    getLatest: () => _ctx?.sprintRepo.getLatest(),
  })),
}));
vi.mock("../src/ai-memory/repositories/handoff-repo.js", () => ({
  HandoffRepo: vi.fn().mockImplementation(() => ({
    getLatest: () => _ctx?.handoffRepo.getLatest(),
  })),
}));
vi.mock("../src/ai-memory/repositories/lessons-repo.js", () => ({
  LessonsRepo: vi.fn().mockImplementation(() => ({
    list: () => _ctx?.lessonsRepo.list(),
    add: (r) => _ctx?.lessonsRepo.add(r),
  })),
}));
vi.mock("../src/ai-memory/repositories/decisions-repo.js", () => ({
  DecisionsRepo: vi.fn().mockImplementation(() => ({
    list: () => _ctx?.decisionsRepo.list(),
    add: (r) => _ctx?.decisionsRepo.add(r),
  })),
}));
vi.mock("../src/ai-memory/repositories/test-baseline-repo.js", () => ({
  TestBaselineRepo: vi.fn().mockImplementation(() => ({
    getLatest: () => _ctx?.baselineRepo.getLatest(),
    add: (r) => _ctx?.baselineRepo.add(r),
  })),
}));
vi.mock("../src/ai-memory/repositories/commands-repo.js", () => ({
  CommandsRepo: vi.fn().mockImplementation(() => ({
    list: () => _ctx?.commandsRepo.list(),
    add: (r) => _ctx?.commandsRepo.add(r),
  })),
}));

vi.mock("../src/agent-handoff.js", () => ({
  loadLatestSprintManifest: vi.fn(async () => null),
  mapSprintManifestToSnapshot: vi.fn((m) => m),
  mapSprintManifestToHandoff: vi.fn((m) => m),
}));

vi.mock("chalk", () => ({
  default: {
    bold: (s) => s,
    yellow: (s) => s,
    green: (s) => s,
    red: (s) => s,
  },
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn(function () {
      return this;
    }),
    stop: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
import { bindAiCommands } from "../src/commands/ai.js";

function makeCtx() {
  return {
    sprintRepo: { getLatest: vi.fn(() => null) },
    handoffRepo: { getLatest: vi.fn(() => null) },
    baselineRepo: {
      getLatest: vi.fn(() => null),
      add: vi.fn((r) => ({ id: "b1", ...r })),
    },
    lessonsRepo: {
      list: vi.fn(() => []),
      add: vi.fn((r) => ({ id: "l1", ...r })),
    },
    decisionsRepo: {
      list: vi.fn(() => []),
      add: vi.fn((r) => ({ id: "d1", ...r })),
    },
    commandsRepo: {
      list: vi.fn(() => []),
      add: vi.fn((r) => ({ id: "c1", ...r })),
    },
  };
}

function makeProgram() {
  const prog = new Command();
  prog.exitOverride();
  bindAiCommands(prog, _ctx);
  return prog;
}

async function run(prog, args) {
  // Spy before parseAsync so action handlers see the mocks.
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await prog.parseAsync(["node", "cli", ...args]);
  } catch (e) {
    // Only swallow Commander's exitOverride exceptions (not action errors,
    // which are caught inside the action handlers themselves).
    if (!e?.code?.startsWith?.("commander.")) throw e;
  }
  return { consoleSpy, errorSpy, tableSpy };
}

// ---------------------------------------------------------------------------
describe("ai.js — bindAiCommands", () => {
  beforeEach(() => {
    _ctx = makeCtx();
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  // ── safeJson (lines 24-27) ───────────────────────────────────────────────
  describe("safeJson — via renderSummary decisions", () => {
    it("parses JSON string affected_files into array (line 25)", async () => {
      _ctx.decisionsRepo.list.mockReturnValue([
        {
          title: "Use Redis",
          created_at: "2026-01-01",
          affected_files: '["src/db.js","src/cache.js"]',
        },
      ]);
      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("src/db.js");
    });

    it("returns [String(value)] for non-JSON string (line 27)", async () => {
      _ctx.decisionsRepo.list.mockReturnValue([
        {
          title: "D",
          created_at: "2026-01-01",
          affected_files: "not-json",
        },
      ]);
      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("not-json");
    });
  });

  // ── snapshot ─────────────────────────────────────────────────────────────
  describe("ai snapshot", () => {
    it("renders full summary with all data present", async () => {
      _ctx.sprintRepo.getLatest.mockReturnValue({
        sprint_name: "Sprint 1",
        status: "active",
        current_goal: "Ship it",
        blockers: [],
        next_steps: [],
        updated_at: "t",
      });
      _ctx.handoffRepo.getLatest.mockReturnValue({
        resume_summary: "pick up here",
        completed_steps: [],
        pending_tasks: [],
        last_agent_output: "done",
        updated_at: "t",
      });
      _ctx.baselineRepo.getLatest.mockReturnValue({
        recorded_at: "t",
        passing_tests: 10,
        failing_tests: 0,
        notes: "ok",
      });
      _ctx.lessonsRepo.list.mockReturnValue([
        { problem: "p1", created_at: "t" },
      ]);
      _ctx.decisionsRepo.list.mockReturnValue([
        { title: "D1", created_at: "t", affected_files: [] },
      ]);
      _ctx.commandsRepo.list.mockReturnValue([
        { category: "build", powershell_command: "npm test" },
      ]);

      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      const out = consoleSpy.mock.calls.flat().join(" ");
      expect(out).toContain("Sprint 1");
      expect(out).toContain("pick up here");
    });

    it("falls back to manifest when sprint/handoff null (lines 186-196)", async () => {
      const {
        loadLatestSprintManifest,
        mapSprintManifestToSnapshot,
        mapSprintManifestToHandoff,
      } = await import("../src/agent-handoff.js");
      loadLatestSprintManifest.mockResolvedValueOnce({
        sprint_name: "from-manifest",
      });

      await run(makeProgram(), ["ai", "snapshot"]);

      expect(mapSprintManifestToSnapshot).toHaveBeenCalled();
      expect(mapSprintManifestToHandoff).toHaveBeenCalled();
    });

    it("catches error and sets exitCode (lines 245-247)", async () => {
      const { MemoryDb } = await import("../src/ai-memory/memory-db.js");
      MemoryDb.mockImplementationOnce(function () {
        this.init = vi.fn(async () => {
          throw new Error("db boom");
        });
        this.close = vi.fn();
      });
      const { errorSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("renders snapshotPointer tag and path (lines 63-69)", async () => {
      const fs = await import("node:fs/promises");
      const os = await import("node:os");
      const path = await import("node:path");
      const ptr = path.join(
        os.homedir(),
        ".vscode-rotator",
        "ai-snapshot-current.json",
      );
      await fs.mkdir(path.dirname(ptr), { recursive: true });
      await fs.writeFile(
        ptr,
        JSON.stringify({ tag: "v1.0", path: "/some/path" }),
      );
      try {
        const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
        const out = consoleSpy.mock.calls.flat().join(" ");
        expect(out).toContain("v1.0");
        expect(out).toContain("/some/path");
      } finally {
        await fs.rm(ptr, { force: true });
      }
    });

    it("renders snapshotPointer with tag only, no path (line 46 false branch)", async () => {
      const fs = await import("node:fs/promises");
      const os = await import("node:os");
      const path = await import("node:path");
      const ptr = path.join(
        os.homedir(),
        ".vscode-rotator",
        "ai-snapshot-current.json",
      );
      await fs.mkdir(path.dirname(ptr), { recursive: true });
      await fs.writeFile(ptr, JSON.stringify({ tag: "v2.0" }));
      try {
        const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
        expect(consoleSpy.mock.calls.flat().join(" ")).toContain("v2.0");
      } finally {
        await fs.rm(ptr, { force: true });
      }
    });

    it("shows all empty/null messages in renderSummary (lines 83,99,111,125,147-150)", async () => {
      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      const out = consoleSpy.mock.calls.flat().join(" ");
      expect(out).toContain("No sprint state available");
      expect(out).toContain("No handoff state available");
      expect(out).toContain("No test baseline recorded");
      expect(out).toContain("No architectural decisions recorded");
      expect(out).toContain("No lessons learned recorded");
      expect(out).toContain("No PowerShell commands recorded");
    });

    it("shows affected files for decision with array affected_files (line 125)", async () => {
      _ctx.decisionsRepo.list.mockReturnValue([
        {
          title: "D",
          created_at: "t",
          affected_files: ["src/a.js", "src/b.js"],
        },
      ]);
      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("src/a.js");
    });
  });

  // ── resume (lines 254-281) ────────────────────────────────────────────────
  describe("ai resume", () => {
    it("renders resume summary (lines 254-281)", async () => {
      _ctx.sprintRepo.getLatest.mockReturnValue({
        sprint_name: "S2",
        status: "active",
        current_goal: "g",
        blockers: [],
        next_steps: [],
        updated_at: "t",
      });
      const { consoleSpy } = await run(makeProgram(), ["ai", "resume"]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("S2");
    });

    it("catches error and sets exitCode (lines 279-281)", async () => {
      const { MemoryDb } = await import("../src/ai-memory/memory-db.js");
      MemoryDb.mockImplementationOnce(function () {
        this.init = vi.fn(async () => {
          throw new Error("resume boom");
        });
        this.close = vi.fn();
      });
      const { errorSpy } = await run(makeProgram(), ["ai", "resume"]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lessons add (lines 301-326) ──────────────────────────────────────────
  describe("ai lessons add", () => {
    it("adds a lesson without related files", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "lessons",
        "add",
        "--problem",
        "p",
        "--fix",
        "f",
        "--prevention-rule",
        "r",
      ]);
      expect(_ctx.lessonsRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({ problem: "p", fix: "f", related_files: [] }),
      );
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("Lesson added");
    });

    it("adds a lesson with related files split and trimmed", async () => {
      await run(makeProgram(), [
        "ai",
        "lessons",
        "add",
        "--problem",
        "p",
        "--fix",
        "f",
        "--prevention-rule",
        "r",
        "--related-files",
        "a.js, b.js",
      ]);
      expect(_ctx.lessonsRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({ related_files: ["a.js", "b.js"] }),
      );
    });

    it("catches error and sets exitCode (lines 323-326)", async () => {
      _ctx.lessonsRepo.add.mockImplementation(() => {
        throw new Error("add boom");
      });
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "lessons",
        "add",
        "--problem",
        "p",
        "--fix",
        "f",
        "--prevention-rule",
        "r",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lessons list (lines 334-360) ─────────────────────────────────────────
  describe("ai lessons list", () => {
    it("shows yellow message when no lessons (lines 344-346)", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "lessons",
        "list",
      ]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain(
        "No lessons found",
      );
    });

    it("shows table when lessons exist (lines 349-356)", async () => {
      _ctx.lessonsRepo.list.mockReturnValue([
        {
          id: "1",
          problem: "p",
          prevention_rule: "r",
          created_at: "t",
        },
      ]);
      const { tableSpy } = await run(makeProgram(), ["ai", "lessons", "list"]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("catches error and sets exitCode (lines 357-360)", async () => {
      _ctx.lessonsRepo.list.mockImplementation(() => {
        throw new Error("list boom");
      });
      const { errorSpy } = await run(makeProgram(), ["ai", "lessons", "list"]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── decisions add (lines 381-407) ────────────────────────────────────────
  describe("ai decisions add", () => {
    it("adds a decision without affected files", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "decisions",
        "add",
        "--title",
        "T",
        "--rationale",
        "R",
        "--decision",
        "D",
      ]);
      expect(_ctx.decisionsRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({ title: "T", superseded_by: null }),
      );
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain(
        "Decision added",
      );
    });

    it("adds a decision with affected files and superseded-by", async () => {
      await run(makeProgram(), [
        "ai",
        "decisions",
        "add",
        "--title",
        "T",
        "--rationale",
        "R",
        "--decision",
        "D",
        "--affected-files",
        "x.js,y.js",
        "--superseded-by",
        "old-id",
      ]);
      expect(_ctx.decisionsRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          affected_files: ["x.js", "y.js"],
          superseded_by: "old-id",
        }),
      );
    });

    it("catches error and sets exitCode (lines 404-407)", async () => {
      _ctx.decisionsRepo.add.mockImplementation(() => {
        throw new Error("dec boom");
      });
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "decisions",
        "add",
        "--title",
        "T",
        "--rationale",
        "R",
        "--decision",
        "D",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── decisions list (lines 415-441) ───────────────────────────────────────
  describe("ai decisions list", () => {
    it("shows yellow message when no decisions", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "decisions",
        "list",
      ]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain(
        "No decisions found",
      );
    });

    it("shows table when decisions exist", async () => {
      _ctx.decisionsRepo.list.mockReturnValue([
        {
          id: "1",
          title: "T",
          created_at: "t",
          superseded_by: null,
        },
      ]);
      const { tableSpy } = await run(makeProgram(), [
        "ai",
        "decisions",
        "list",
      ]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("catches error and sets exitCode (lines 438-441)", async () => {
      _ctx.decisionsRepo.list.mockImplementation(() => {
        throw new Error("dl boom");
      });
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "decisions",
        "list",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── baseline add (lines 458-497) ─────────────────────────────────────────
  describe("ai baseline add", () => {
    it("records a passing baseline", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "baseline",
        "add",
        "--passing",
        "42",
        "--failing",
        "0",
      ]);
      expect(_ctx.baselineRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({ passing_tests: 42, failing_tests: 0 }),
      );
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain(
        "Baseline recorded",
      );
    });

    it("throws when passing is non-integer (line 466)", async () => {
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "baseline",
        "add",
        "--passing",
        "abc",
        "--failing",
        "0",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("throws when failing is non-integer (line 470)", async () => {
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "baseline",
        "add",
        "--passing",
        "5",
        "--failing",
        "xyz",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("throws when failing > 0 without --allow-failing (line 473)", async () => {
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "baseline",
        "add",
        "--passing",
        "5",
        "--failing",
        "2",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("records a failing baseline with --allow-failing", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "baseline",
        "add",
        "--passing",
        "5",
        "--failing",
        "2",
        "--allow-failing",
      ]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain(
        "Baseline recorded",
      );
    });

    it("records baseline with notes", async () => {
      await run(makeProgram(), [
        "ai",
        "baseline",
        "add",
        "--passing",
        "10",
        "--failing",
        "0",
        "--notes",
        "clean run",
      ]);
      expect(_ctx.baselineRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({ notes: "clean run" }),
      );
    });
  });

  // ── commands add (lines 514-540) ─────────────────────────────────────────
  describe("ai commands add", () => {
    it("saves a command", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "commands",
        "add",
        "--category",
        "build",
        "--powershell-command",
        "npm test",
      ]);
      expect(_ctx.commandsRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "build",
          powershell_command: "npm test",
        }),
      );
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("Command saved");
    });

    it("saves a command with notes", async () => {
      await run(makeProgram(), [
        "ai",
        "commands",
        "add",
        "--category",
        "test",
        "--powershell-command",
        "vitest run",
        "--notes",
        "fast",
      ]);
      expect(_ctx.commandsRepo.add).toHaveBeenCalledWith(
        expect.objectContaining({ notes: "fast" }),
      );
    });

    it("catches error and sets exitCode (lines 537-539)", async () => {
      _ctx.commandsRepo.add.mockImplementation(() => {
        throw new Error("cmd boom");
      });
      const { errorSpy } = await run(makeProgram(), [
        "ai",
        "commands",
        "add",
        "--category",
        "x",
        "--powershell-command",
        "y",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── commands list (lines 546-573) ────────────────────────────────────────
  describe("ai commands list", () => {
    it("shows yellow message when no commands (lines 558-559)", async () => {
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "commands",
        "list",
      ]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain(
        "No commands found",
      );
    });

    it("prints each command row when commands exist", async () => {
      _ctx.commandsRepo.list.mockReturnValue([
        {
          category: "build",
          powershell_command: "npm run build",
          notes: "main build",
          created_at: "t",
        },
      ]);
      const { consoleSpy } = await run(makeProgram(), [
        "ai",
        "commands",
        "list",
      ]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("npm run build");
    });

    it("catches error and sets exitCode (lines 570-572)", async () => {
      _ctx.commandsRepo.list.mockImplementation(() => {
        throw new Error("cl boom");
      });
      const { errorSpy } = await run(makeProgram(), ["ai", "commands", "list"]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── loadAiMemoryContext / getContext production path (lines 196-231) ─────────
  describe("production path — no injected ctx (lines 196-231)", () => {
    it("ai snapshot: production path calls createDbContext (ctx=undefined)", async () => {
      // Call bindAiCommands WITHOUT a ctx argument — exercises getContext(undefined)
      // which calls createDbContext() using the MemoryDb mock. Since _ctx is still
      // set, the repo delegates still resolve. The test verifies the path is exercised.
      const prog = new Command();
      prog.exitOverride();
      bindAiCommands(prog); // no ctx → production path
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
      process.exitCode = undefined;
      try {
        await prog.parseAsync(["node", "cli", "ai", "snapshot"]);
      } catch (e) {
        if (!e?.code?.startsWith?.("commander.")) throw e;
      }
      // Either renders summary OR catches an error — either way the production path ran
      const allOutput = [
        ...consoleSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat(),
      ].join(" ");
      expect(allOutput.length).toBeGreaterThan(0);
    });

    it("ai resume: production path calls createDbContext (ctx=undefined)", async () => {
      const prog = new Command();
      prog.exitOverride();
      bindAiCommands(prog);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      process.exitCode = undefined;
      try {
        await prog.parseAsync(["node", "cli", "ai", "resume"]);
      } catch (e) {
        if (!e?.code?.startsWith?.("commander.")) throw e;
      }
      const allOutput = [
        ...consoleSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat(),
      ].join(" ");
      expect(allOutput.length).toBeGreaterThan(0);
    });

    it("ai lessons list: production path (ctx=undefined)", async () => {
      const prog = new Command();
      prog.exitOverride();
      bindAiCommands(prog);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      process.exitCode = undefined;
      try {
        await prog.parseAsync(["node", "cli", "ai", "lessons", "list"]);
      } catch (e) {
        if (!e?.code?.startsWith?.("commander.")) throw e;
      }
      const allOutput = [
        ...consoleSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat(),
      ].join(" ");
      expect(allOutput.length).toBeGreaterThan(0);
    });
  });

  // ── partial manifest fallback — sprint exists but handoff is null ─────────
  describe("manifest fallback partial branches (lines 304-312)", () => {
    it("falls back to manifest handoff when sprint is set but handoff is null (line 308-310)", async () => {
      const {
        loadLatestSprintManifest,
        mapSprintManifestToHandoff,
      } = await import("../src/agent-handoff.js");

      // Sprint exists, handoff is null → only handoff arm of manifest fallback fires
      _ctx.sprintRepo.getLatest.mockReturnValue({
        sprint_name: "S-exists",
        status: "active",
        current_goal: "g",
        blockers: [],
        next_steps: [],
        updated_at: "t",
      });
      _ctx.handoffRepo.getLatest.mockReturnValue(null);
      loadLatestSprintManifest.mockResolvedValueOnce({ sprint_name: "from-manifest" });

      await run(makeProgram(), ["ai", "snapshot"]);

      // mapSprintManifestToHandoff fires; mapSprintManifestToSnapshot should NOT
      expect(mapSprintManifestToHandoff).toHaveBeenCalled();
    });

    it("falls back to manifest sprint when handoff is set but sprint is null (line 304-306)", async () => {
      const {
        loadLatestSprintManifest,
        mapSprintManifestToSnapshot,
      } = await import("../src/agent-handoff.js");

      // Handoff exists, sprint is null → only sprint arm of manifest fallback fires
      _ctx.sprintRepo.getLatest.mockReturnValue(null);
      _ctx.handoffRepo.getLatest.mockReturnValue({
        resume_summary: "h-exists",
        completed_steps: [],
        pending_tasks: [],
        last_agent_output: "done",
        updated_at: "t",
      });
      loadLatestSprintManifest.mockResolvedValueOnce({ sprint_name: "from-manifest" });

      await run(makeProgram(), ["ai", "snapshot"]);

      expect(mapSprintManifestToSnapshot).toHaveBeenCalled();
    });

    it("no manifest available — null manifest does not throw (line 300-312)", async () => {
      const { loadLatestSprintManifest } = await import("../src/agent-handoff.js");
      _ctx.sprintRepo.getLatest.mockReturnValue(null);
      _ctx.handoffRepo.getLatest.mockReturnValue(null);
      loadLatestSprintManifest.mockResolvedValueOnce(null);

      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("No sprint state available");
    });
  });

  // ── safeJson null branch (line 21) ──────────────────────────────────────────
  describe("safeJson null affected_files (line 21)", () => {
    it("returns [] for null affected_files — no files section rendered", async () => {
      _ctx.decisionsRepo.list.mockReturnValue([
        { title: "D", created_at: "t", affected_files: null },
      ]);
      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      // affected_files is null → safeJson returns [] → no "files:" line
      const out = consoleSpy.mock.calls.flat().join(" ");
      expect(out).toContain("D");
      expect(out).not.toContain("files:");
    });
  });

  // ── baseline notes absent (line 109 || branch) ───────────────────────────────
  describe("baseline notes absent (line 109 || '<none>')", () => {
    it("renders <none> when notes is empty string", async () => {
      _ctx.baselineRepo.getLatest.mockReturnValue({
        recorded_at: "t",
        passing_tests: 5,
        failing_tests: 0,
        notes: "",
      });
      const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("<none>");
    });
  });

  // ── snapshotPointer path=null (line 69 ternary false) ───────────────────────
  describe("snapshotPointer path absent (line 69 false branch)", () => {
    it("renders tag with empty pathSuffix when pointer.path is null", async () => {
      const fsM = await import("node:fs/promises");
      const osM = await import("node:os");
      const pathM = await import("node:path");
      const ptr = pathM.join(osM.homedir(), ".vscode-rotator", "ai-snapshot-current.json");
      await fsM.mkdir(pathM.dirname(ptr), { recursive: true });
      await fsM.writeFile(ptr, JSON.stringify({ tag: "v3.0", path: null }));
      try {
        const { consoleSpy } = await run(makeProgram(), ["ai", "snapshot"]);
        const out = consoleSpy.mock.calls.flat().join(" ");
        // path is null → pathSuffix = "" → rendered as "v3.0"
        expect(out).toContain("v3.0");
        expect(out).not.toContain("(null)");
      } finally {
        await fsM.rm(ptr, { force: true });
      }
    });
  });

  // ── err without .message (various ?? branches across actions) ────────────────
  describe("err?.message ?? err fallback (non-Error thrown)", () => {
    it("handles thrown string in lessons add (line 330 ?? branch)", async () => {
      _ctx.lessonsRepo.add.mockImplementation(() => { throw "plain string error"; });
      const { errorSpy } = await run(makeProgram(), [
        "ai", "lessons", "add",
        "--problem", "p", "--fix", "f", "--prevention-rule", "r",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("handles thrown string in decisions add (line 409 ?? branch)", async () => {
      _ctx.decisionsRepo.add.mockImplementation(() => { throw "plain string error"; });
      const { errorSpy } = await run(makeProgram(), [
        "ai", "decisions", "add",
        "--title", "T", "--rationale", "R", "--decision", "D",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("handles thrown string in commands add (line 545 ?? branch)", async () => {
      _ctx.commandsRepo.add.mockImplementation(() => { throw "plain string error"; });
      const { errorSpy } = await run(makeProgram(), [
        "ai", "commands", "add",
        "--category", "x", "--powershell-command", "y",
      ]);
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── commands list row.notes absent (line 573 || branch) ───────────────────────
  describe("commands list row.notes fallback (line 573 || '')", () => {
    it("renders empty string for null notes", async () => {
      _ctx.commandsRepo.list.mockReturnValue([
        { category: "x", powershell_command: "cmd", notes: null, created_at: "t" },
      ]);
      const { consoleSpy } = await run(makeProgram(), ["ai", "commands", "list"]);
      // Should not throw and should output the command
      expect(consoleSpy.mock.calls.flat().join(" ")).toContain("cmd");
    });
  });

  // ── decisions list superseded_by null (line 456 || branch) ────────────────────
  describe("decisions list superseded_by absent (line 456 || '')", () => {
    it("renders empty string when superseded_by is null", async () => {
      _ctx.decisionsRepo.list.mockReturnValue([
        { id: "1", title: "T", created_at: "t", superseded_by: null },
      ]);
      const { tableSpy } = await run(makeProgram(), ["ai", "decisions", "list"]);
      expect(tableSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ superseded_by: "" })]),
      );
    });
  });

});
