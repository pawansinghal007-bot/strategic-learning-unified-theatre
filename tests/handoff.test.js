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

// Partial mock of agent-handoff.js: every export delegates to the real
// implementation by default, except listSprints is wrapped in a vi.fn() so
// a single test can force it to throw (exercising the "list" command's
// catch block, which the real implementation won't trigger under normal
// conditions since it swallows malformed-manifest errors internally).
vi.mock("../src/agent-handoff.js", async () => {
  const actual = await vi.importActual("../src/agent-handoff.js");
  return { ...actual, listSprints: vi.fn(actual.listSprints) };
});

import { bindHandoffCommands } from "../src/commands/handoff.js";
import { createSprint, listSprints } from "../src/agent-handoff.js";

// Helper: fresh program per call — commander cannot be reused across parseAsync calls
function makeProgram() {
  const program = new Command();
  program.exitOverride();
  bindHandoffCommands(program);
  return program;
}

function run(...args) {
  return makeProgram().parseAsync([
    "node",
    "strategic-learning-unified-theatre",
    "handoff",
    ...args,
  ]);
}

describe("handoff CLI commands", () => {
  let tempDir;
  let originalHome;
  let logSpy;
  let errorSpy;
  let stdoutSpy;
  let stderrSpy;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-cli-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    process.exitCode = undefined;

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    vi.restoreAllMocks();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function logText() {
    return logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  function errorText() {
    return errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  // ── handoff create ────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a sprint with defaults and prints the sprint id (lines 95-106)", async () => {
      await run("create", "--goal", "Ship the feature");

      expect(logText()).toMatch(/[0-9a-f-]{8,}/);
      expect(process.exitCode).toBeUndefined();
    });

    it("creates a sprint with all options explicitly provided", async () => {
      await run(
        "create",
        "--goal",
        "Ship it",
        "--agent",
        "claude",
        "--model",
        "claude-sonnet-4-6",
        "--limit",
        "5000",
        "--status",
        "active",
      );

      expect(logText().length).toBeGreaterThan(0);
      expect(process.exitCode).toBeUndefined();
    });

    it("reports an error and sets exitCode when --limit is invalid (line 22's common path)", async () => {
      await run("create", "--goal", "Bad limit", "--limit", "not-a-number");

      expect(process.exitCode).toBe(1);
      expect(errorText()).toContain("--limit");
    });

    it("reports an error and sets exitCode when --status is invalid", async () => {
      await run("create", "--goal", "Bad status", "--status", "nonsense");

      expect(process.exitCode).toBe(1);
      expect(errorText()).toContain("--status");
    });
  });

  // ── handoff update ────────────────────────────────────────────────────────

  describe("update", () => {
    async function createTestSprint(patch = {}) {
      return await createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Update target",
        tokensLimit: 1000,
        ...patch,
      });
    }

    it("does nothing to token budget when neither flag is given, and reports success (lines 130-141, 161-165)", async () => {
      const sprint = await createTestSprint();

      await run("update", sprint.sprintId);

      expect(process.exitCode).toBeUndefined();
      expect(logText()).toContain(sprint.sprintId);
    });

    it("updates both tokensUsed and tokensLimit when both flags are given (lines 63-72)", async () => {
      const sprint = await createTestSprint({ tokensLimit: 1000 });

      await run(
        "update",
        sprint.sprintId,
        "--tokens-used",
        "50",
        "--tokens-limit",
        "2000",
      );

      expect(process.exitCode).toBeUndefined();
    });

    it("writes warnings to stderr when the token budget update produces any (lines 162-164)", async () => {
      const sprint = await createTestSprint({ tokensLimit: 100 });

      // 86 of 100 crosses the 85% warning threshold used elsewhere in this
      // codebase's token-budget warnings.
      await run("update", sprint.sprintId, "--tokens-used", "86");

      expect(stderrSpy).toHaveBeenCalled();
    });

    it("adds one or more pending tasks via repeated --add-task flags (lines 142-147, accumulate)", async () => {
      const sprint = await createTestSprint();

      await run(
        "update",
        sprint.sprintId,
        "--add-task",
        "First task",
        "--add-task",
        "Second task",
        "--priority",
        "1",
      );

      expect(process.exitCode).toBeUndefined();
    });

    it("completes one or more pending tasks via repeated --complete-task flags (lines 149-153)", async () => {
      const sprint = await createTestSprint();
      const { addPendingTask } = await import("../src/agent-handoff.js");
      const withTask = await addPendingTask(sprint.sprintId, "To complete", 2);
      const taskId = withTask.pendingTasks[0].id;

      await run("update", sprint.sprintId, "--complete-task", taskId);

      expect(process.exitCode).toBeUndefined();
    });

    it("adds one or more blockers via repeated --add-blocker flags (lines 155-159)", async () => {
      const sprint = await createTestSprint();

      await run(
        "update",
        sprint.sprintId,
        "--add-blocker",
        "Blocked on review",
        "--add-blocker",
        "Blocked on infra",
      );

      expect(process.exitCode).toBeUndefined();
    });

    it("reports an error and sets exitCode for a nonexistent sprint (lines 166-170)", async () => {
      await run("update", "does-not-exist");

      expect(process.exitCode).toBe(1);
      expect(errorText().length).toBeGreaterThan(0);
    });

    it("reports an error when --priority is invalid", async () => {
      const sprint = await createTestSprint();

      await run(
        "update",
        sprint.sprintId,
        "--add-task",
        "Some task",
        "--priority",
        "not-a-number",
      );

      expect(process.exitCode).toBe(1);
      expect(errorText()).toContain("--priority");
    });
  });

  // ── handoff close ─────────────────────────────────────────────────────────

  describe("close", () => {
    it("closes a sprint and prints the sprint id (lines 184-189)", async () => {
      const sprint = await createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Close target",
        tokensLimit: 1000,
      });

      await run("close", sprint.sprintId, "--status", "complete");

      expect(process.exitCode).toBeUndefined();
      expect(logText()).toContain(sprint.sprintId);
    });

    it("reports an error and sets exitCode for a nonexistent sprint (lines 190-193)", async () => {
      await run("close", "does-not-exist", "--status", "complete");

      expect(process.exitCode).toBe(1);
      expect(errorText().length).toBeGreaterThan(0);
    });

    it("reports an error when --status is invalid", async () => {
      const sprint = await createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Close target 2",
        tokensLimit: 1000,
      });

      await run("close", sprint.sprintId, "--status", "nonsense");

      expect(process.exitCode).toBe(1);
      expect(errorText()).toContain("--status");
    });
  });

  // ── handoff resume ────────────────────────────────────────────────────────

  describe("resume", () => {
    it("prints the sprint's own resumePrompt when it is already set (line 205 true branch)", async () => {
      const sprint = await createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Resume target",
        tokensLimit: 100,
      });
      // Closing with "paused" causes a resumePrompt to be generated and
      // stored on the sprint (per this codebase's agent-handoff.js).
      const { closeSprint } = await import("../src/agent-handoff.js");
      await closeSprint(sprint.sprintId, "paused");

      await run("resume", sprint.sprintId);

      expect(process.exitCode).toBeUndefined();
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it("falls back to generateResumePrompt when resumePrompt is empty (line 205 false branch)", async () => {
      const sprint = await createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Resume target 2",
        tokensLimit: 100,
      });
      // A freshly created, still-active sprint has resumePrompt === "".

      await run("resume", sprint.sprintId);

      expect(process.exitCode).toBeUndefined();
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it("reports an error and sets exitCode for a nonexistent sprint (lines 207-209)", async () => {
      await run("resume", "does-not-exist");

      expect(process.exitCode).toBe(1);
      expect(errorText().length).toBeGreaterThan(0);
    });
  });

  // ── handoff list ──────────────────────────────────────────────────────────

  describe("list", () => {
    it("prints 'No sprints found.' when there are none (lines 219-222)", async () => {
      await run("list");

      expect(process.exitCode).toBeUndefined();
      expect(logText()).toContain("No sprints found.");
    });

    it("prints a table of sprints, truncating long goals (lines 223-233, truncate())", async () => {
      await createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "A very long sprint goal description that definitely exceeds thirty characters",
        tokensLimit: 1000,
      });
      await createSprint({
        agent: "chatgpt",
        model: "gpt-4",
        goal: "Short goal",
        tokensLimit: 500,
      });

      const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

      await run("list");

      expect(process.exitCode).toBeUndefined();
      expect(tableSpy).toHaveBeenCalledOnce();
      const rows = tableSpy.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      // Long goal should be truncated to 30 chars (29 chars + the ellipsis).
      const longRow = rows.find((r) => r.goal.includes("…"));
      expect(longRow).toBeDefined();
      expect(longRow.goal.length).toBe(30);
      const shortRow = rows.find((r) => r.goal === "Short goal");
      expect(shortRow).toBeDefined();
    });

    it("reports an error and sets exitCode when listSprints itself throws (lines 235-236)", async () => {
      listSprints.mockImplementationOnce(async () => {
        throw new Error("listSprints exploded");
      });

      await run("list");

      expect(process.exitCode).toBe(1);
      expect(errorText()).toContain("listSprints exploded");
    });
  });
});
