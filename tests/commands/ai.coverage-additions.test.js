/**
 * tests/commands/ai.coverage-additions.test.js
 *
 * Covers the branches missed by tests/ai.test.js:
 *
 *  lines 304-309 — snapshot/resume: the sub-branch where currentSprint is set
 *    (truthy) but handoff is null, AND a manifest is available:
 *      - mapSprintManifestToSnapshot must NOT be called (sprint already exists)
 *      - mapSprintManifestToHandoff MUST be called (handoff was null)
 *
 *  lines 200-231 — loadAiMemoryContext: dead-code private function; its
 *    branches are all equivalent to the inlined action logic already covered
 *    in tests/ai.test.js. We use the injected-ctx path (same as ai.test.js)
 *    to cover the symmetric branches in snapshot and resume.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// ─── hoisted mocks ───────────────────────────────────────────────────────────

const { mockLoadLatest, mockMapSnapshot, mockMapHandoff } = vi.hoisted(() => ({
  mockLoadLatest:  vi.fn(async () => null),
  mockMapSnapshot: vi.fn((m) => ({ ...m, _fromSnapshot: true })),
  mockMapHandoff:  vi.fn((m) => ({ ...m, _fromHandoff: true })),
}));

vi.mock("../../src/ai-memory/memory-db.js", () => ({
  MemoryDb: vi.fn().mockImplementation(function () {
    this.init  = vi.fn(async () => this);
    this.close = vi.fn();
  }),
}));

let _ctx = null;

vi.mock("../../src/ai-memory/repositories/sprint-state-repo.js", () => ({
  SprintStateRepo: vi.fn().mockImplementation(() => ({
    getLatest: () => _ctx?.sprintRepo.getLatest(),
  })),
}));
vi.mock("../../src/ai-memory/repositories/handoff-repo.js", () => ({
  HandoffRepo: vi.fn().mockImplementation(() => ({
    getLatest: () => _ctx?.handoffRepo.getLatest(),
  })),
}));
vi.mock("../../src/ai-memory/repositories/lessons-repo.js", () => ({
  LessonsRepo: vi.fn().mockImplementation(() => ({
    list: () => [],
    add: vi.fn((r) => ({ id: "l1", ...r })),
  })),
}));
vi.mock("../../src/ai-memory/repositories/decisions-repo.js", () => ({
  DecisionsRepo: vi.fn().mockImplementation(() => ({
    list: () => [],
    add: vi.fn((r) => ({ id: "d1", ...r })),
  })),
}));
vi.mock("../../src/ai-memory/repositories/test-baseline-repo.js", () => ({
  TestBaselineRepo: vi.fn().mockImplementation(() => ({
    getLatest: () => null,
    add: vi.fn((r) => ({ id: "b1", ...r })),
  })),
}));
vi.mock("../../src/ai-memory/repositories/commands-repo.js", () => ({
  CommandsRepo: vi.fn().mockImplementation(() => ({
    list: () => [],
    add: vi.fn((r) => ({ id: "c1", ...r })),
  })),
}));

vi.mock("../../src/agent-handoff.js", () => ({
  loadLatestSprintManifest:    (...a) => mockLoadLatest(...a),
  mapSprintManifestToSnapshot: (...a) => mockMapSnapshot(...a),
  mapSprintManifestToHandoff:  (...a) => mockMapHandoff(...a),
}));

vi.mock("chalk", () => ({
  default: {
    bold: (s) => s, yellow: (s) => s,
    green: (s) => s, red: (s) => s,
  },
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn(function () { return this; }),
    stop:  vi.fn(),
  })),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

import { bindAiCommands } from "../../src/commands/ai.js";

function makeCtx(overrides = {}) {
  return {
    sprintRepo:    { getLatest: vi.fn(() => null) },
    handoffRepo:   { getLatest: vi.fn(() => null) },
    baselineRepo:  { getLatest: vi.fn(() => null), add: vi.fn((r) => ({ id: "b1", ...r })) },
    lessonsRepo:   { list: vi.fn(() => []),          add: vi.fn((r) => ({ id: "l1", ...r })) },
    decisionsRepo: { list: vi.fn(() => []),          add: vi.fn((r) => ({ id: "d1", ...r })) },
    commandsRepo:  { list: vi.fn(() => []),          add: vi.fn((r) => ({ id: "c1", ...r })) },
    ...overrides,
  };
}

function makeProgram() {
  const prog = new Command();
  prog.exitOverride();
  bindAiCommands(prog, _ctx);
  return prog;
}

async function run(args) {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy   = vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await makeProgram().parseAsync(["node", "cli", ...args]);
  } catch (e) {
    if (!e?.code?.startsWith?.("commander.")) throw e;
  }
  return { consoleSpy, errorSpy };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ai.js — additional manifest branch coverage (lines 304-309)", () => {
  beforeEach(() => {
    _ctx = makeCtx();
    process.exitCode = undefined;
    mockLoadLatest.mockReset();
    mockMapSnapshot.mockReset();
    mockMapHandoff.mockReset();
    mockLoadLatest.mockResolvedValue(null);
    mockMapSnapshot.mockImplementation((m) => m);
    mockMapHandoff.mockImplementation((m) => m);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  // ── snapshot: sprint exists, handoff null, manifest available ─────────────

  describe("ai snapshot — sprint present, handoff null, manifest available (lines 304-309)", () => {
    it("calls mapHandoff but NOT mapSnapshot when sprint exists and handoff is null", async () => {
      _ctx.sprintRepo.getLatest.mockReturnValue({
        sprint_name: "S1", status: "active", current_goal: "g",
        blockers: [], next_steps: [], updated_at: "t",
      });
      // handoff remains null (default)
      mockLoadLatest.mockResolvedValue({ resume_data: "manifest-handoff" });

      await run(["ai", "snapshot"]);

      expect(mockMapSnapshot).not.toHaveBeenCalled();
      expect(mockMapHandoff).toHaveBeenCalledWith({ resume_data: "manifest-handoff" });
    });

    it("calls neither mapSnapshot nor mapHandoff when sprint present, handoff null, manifest null", async () => {
      _ctx.sprintRepo.getLatest.mockReturnValue({
        sprint_name: "S2", status: "active", current_goal: "g",
        blockers: [], next_steps: [], updated_at: "t",
      });
      mockLoadLatest.mockResolvedValue(null);

      await run(["ai", "snapshot"]);

      expect(mockMapSnapshot).not.toHaveBeenCalled();
      expect(mockMapHandoff).not.toHaveBeenCalled();
    });

    it("calls mapSnapshot but NOT mapHandoff when handoff present and sprint is null", async () => {
      _ctx.handoffRepo.getLatest.mockReturnValue({
        resume_summary: "r", completed_steps: [], pending_tasks: [],
        last_agent_output: "x", updated_at: "t",
      });
      // sprint remains null
      mockLoadLatest.mockResolvedValue({ sprint_name: "from-manifest" });

      await run(["ai", "snapshot"]);

      expect(mockMapSnapshot).toHaveBeenCalledWith({ sprint_name: "from-manifest" });
      expect(mockMapHandoff).not.toHaveBeenCalled();
    });
  });

  // ── resume: sprint exists, handoff null, manifest available (line 308) ────

  describe("ai resume — sprint present, handoff null, manifest available (line 308)", () => {
    it("calls mapHandoff but NOT mapSnapshot when sprint exists and handoff is null", async () => {
      _ctx.sprintRepo.getLatest.mockReturnValue({
        sprint_name: "SR1", status: "active", current_goal: "g",
        blockers: [], next_steps: [], updated_at: "t",
      });
      mockLoadLatest.mockResolvedValue({ resume_data: "manifest" });

      await run(["ai", "resume"]);

      expect(mockMapSnapshot).not.toHaveBeenCalled();
      expect(mockMapHandoff).toHaveBeenCalled();
    });

    it("calls mapSnapshot but NOT mapHandoff when handoff present and sprint is null (resume)", async () => {
      _ctx.handoffRepo.getLatest.mockReturnValue({
        resume_summary: "r", completed_steps: [], pending_tasks: [],
        last_agent_output: "x", updated_at: "t",
      });
      mockLoadLatest.mockResolvedValue({ sprint_name: "manifest-sprint" });

      await run(["ai", "resume"]);

      expect(mockMapSnapshot).toHaveBeenCalled();
      expect(mockMapHandoff).not.toHaveBeenCalled();
    });

    it("calls both maps when both sprint and handoff are null and manifest is available (resume)", async () => {
      // Both null → both checked inside the if block
      mockLoadLatest.mockResolvedValue({ sprint_name: "m", resume_data: "m" });

      await run(["ai", "resume"]);

      expect(mockMapSnapshot).toHaveBeenCalled();
      expect(mockMapHandoff).toHaveBeenCalled();
    });
  });
});


// ─── renderArray non-empty items path (line 36) ──────────────────────────────

describe("renderArray — non-empty items renders joined string (line 36)", () => {
  beforeEach(() => {
    _ctx = makeCtx();
    process.exitCode = undefined;
    mockLoadLatest.mockReset();
    mockMapSnapshot.mockReset();
    mockMapHandoff.mockReset();
    mockLoadLatest.mockResolvedValue(null);
    mockMapSnapshot.mockImplementation((m) => m);
    mockMapHandoff.mockImplementation((m) => m);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("renders blockers list when sprint has non-empty blockers (line 36 true branch)", async () => {
    _ctx.sprintRepo.getLatest.mockReturnValue({
      sprint_name: "Sprint-RenderArray",
      status: "active",
      current_goal: "cover line 36",
      // Non-empty arrays → takes the `return \`${label}: ...\`` branch
      blockers: ["blocker-alpha", "blocker-beta"],
      next_steps: ["step-one"],
      updated_at: "2026-01-01T00:00:00Z",
    });

    const { consoleSpy } = await run(["ai", "snapshot"]);
    const out = consoleSpy.mock.calls.flat().join(" ");

    // renderArray("Blockers", ["blocker-alpha","blocker-beta"]) → "Blockers: blocker-alpha, blocker-beta"
    expect(out).toContain("blocker-alpha");
    expect(out).toContain("blocker-beta");
    // renderArray("Next steps", ["step-one"]) → "Next steps: step-one"
    expect(out).toContain("step-one");
  });

  it("renders next_steps list in resume command when non-empty (line 36 via resume)", async () => {
    _ctx.sprintRepo.getLatest.mockReturnValue({
      sprint_name: "Sprint-Resume-RenderArray",
      status: "active",
      current_goal: "g",
      blockers: [],
      next_steps: ["next-step-alpha", "next-step-beta"],
      updated_at: "2026-01-01T00:00:00Z",
    });

    const { consoleSpy } = await run(["ai", "resume"]);
    const out = consoleSpy.mock.calls.flat().join(" ");

    expect(out).toContain("next-step-alpha");
    expect(out).toContain("next-step-beta");
  });

  it("renders completed_steps in handoff when non-empty (line 36 via handoff completed_steps)", async () => {
    _ctx.handoffRepo.getLatest.mockReturnValue({
      resume_summary: "pick up here",
      completed_steps: ["step-done-1", "step-done-2"],
      pending_tasks: ["pending-task-x"],
      last_agent_output: "output",
      updated_at: "2026-01-01T00:00:00Z",
    });

    const { consoleSpy } = await run(["ai", "snapshot"]);
    const out = consoleSpy.mock.calls.flat().join(" ");

    expect(out).toContain("step-done-1");
    expect(out).toContain("pending-task-x");
  });
});
