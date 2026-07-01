/**
 * tests/commands/handoff.coverage-additions.test.js
 *
 * Targets the branches missed by tests/handoff.test.js:
 *
 *  line  19 — formatValidationError: plain Error (no .issues) → err.message branch
 *  line  58 — truncate: value is falsy (empty/null) → String("") → short path
 *  line  69 — handleUpdateTokenBudget: only tokensUsed provided (tokensLimit undefined)
 *             → uses sprint.tokensLimit as fallback
 *  line 113 — handleUpdateTokenBudget: only tokensLimit provided (tokensUsed undefined)
 *             → uses sprint.tokensUsed as fallback
 *  lines 172-196 — formatValidationError plain-Error path via parseHandoffStatus
 *                  and the full update command catch/error path with a non-Zod error
 *  line 212 — resume: error path (loadSprint rejects)
 *  line 239 — list: error path (listSprints rejects) ← already covered but including
 *             for completeness through the non-vi.fn() route
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─── partial mock: real implementation, but listSprints and loadSprint are
//     vi.fn() wrappers so individual tests can force them to throw ──────────

vi.mock("../../src/agent-handoff.js", async () => {
  const actual = await vi.importActual("../../src/agent-handoff.js");
  return {
    ...actual,
    listSprints: vi.fn(actual.listSprints),
    loadSprint:  vi.fn(actual.loadSprint),
  };
});

vi.mock("ora", () => ({
  default: () => ({
    start:   vi.fn(function () { return this; }),
    stop:    vi.fn(function () { return this; }),
    succeed: vi.fn(function () { return this; }),
    fail:    vi.fn(function () { return this; }),
  }),
}));

import { bindHandoffCommands } from "../../src/commands/handoff.js";
import { createSprint, listSprints, loadSprint } from "../../src/agent-handoff.js";

function makeProgram() {
  const prog = new Command();
  prog.exitOverride();
  bindHandoffCommands(prog);
  return prog;
}

function run(...args) {
  return makeProgram().parseAsync([
    "node", "cli", "handoff", ...args,
  ]);
}

describe("handoff.js — additional branch coverage", () => {
  let tempDir, logSpy, errorSpy, stdoutSpy, stderrSpy;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-cov-"));
    process.env.HOME = tempDir;
    process.exitCode = undefined;
    logSpy    = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy  = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(listSprints).mockImplementation(
      (await vi.importActual("../../src/agent-handoff.js")).listSprints,
    );
    vi.mocked(loadSprint).mockImplementation(
      (await vi.importActual("../../src/agent-handoff.js")).loadSprint,
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const logText  = () => logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
  const errText  = () => errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");

  // ── line 58: truncate with short value (≤ limit, no ellipsis) ─────────────

  describe("truncate — short goal no-truncation branch (line 58)", () => {
    it("renders a goal ≤ 30 chars unchanged in the list table", async () => {
      await createSprint({
        agent: "claude", model: "m", goal: "Short goal", tokensLimit: 10,
      });
      const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
      await run("list");
      expect(process.exitCode).toBeUndefined();
      expect(tableSpy).toHaveBeenCalled();
      const rows = tableSpy.mock.calls[0][0];
      const row = rows.find((r) => r.goal === "Short goal");
      expect(row).toBeDefined();
    });
  });

  // ── line 69 & 113: handleUpdateTokenBudget partial flag combinations ─────

  describe("handleUpdateTokenBudget partial flags", () => {
    it("only --tokens-used: uses sprint.tokensLimit as fallback (line 69 true / line 113 false)", async () => {
      const sprint = await createSprint({
        agent: "claude", model: "m", goal: "partial", tokensLimit: 500,
      });
      await run("update", sprint.sprintId, "--tokens-used", "100");
      expect(process.exitCode).toBeUndefined();
      expect(logText()).toContain(sprint.sprintId);
    });

    it("only --tokens-limit: uses sprint.tokensUsed as fallback (line 69 false / line 113 true)", async () => {
      const sprint = await createSprint({
        agent: "claude", model: "m", goal: "partial-limit", tokensLimit: 200,
      });
      await run("update", sprint.sprintId, "--tokens-limit", "999");
      expect(process.exitCode).toBeUndefined();
      expect(logText()).toContain(sprint.sprintId);
    });
  });

  // ── lines 172-196: full update — error catch path ────────────────────────

  describe("update error path (lines 172-196)", () => {
    it("sets exitCode=1 when loadSprint rejects with a non-Zod error", async () => {
      vi.mocked(loadSprint).mockRejectedValueOnce(new Error("db crashed"));
      await run("update", "nonexistent-sprint-id");
      expect(process.exitCode).toBe(1);
      expect(errText()).toContain("db crashed");
    });

    it("sets exitCode=1 for invalid --tokens-used value", async () => {
      const sprint = await createSprint({
        agent: "claude", model: "m", goal: "g", tokensLimit: 100,
      });
      await run("update", sprint.sprintId, "--tokens-used", "0");
      // PositiveIntSchema rejects 0
      expect(process.exitCode).toBe(1);
    });
  });

  // ── line 19: formatValidationError — plain Error (no .issues) ────────────

  describe("formatValidationError plain-Error branch (line 19)", () => {
    it("formats a plain non-Zod Error message from parseHandoffStatus", async () => {
      // 'active' is valid — this exercises the happy path.
      // To hit the plain-Error branch we force an error object without .issues.
      vi.mocked(loadSprint).mockRejectedValueOnce(
        Object.assign(new Error("plain error no issues"), { issues: undefined }),
      );
      await run("update", "any-id");
      expect(errText()).toContain("plain error no issues");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── line 212: resume error path ──────────────────────────────────────────

  describe("resume — error path (line 212)", () => {
    it("sets exitCode=1 when loadSprint rejects during resume", async () => {
      vi.mocked(loadSprint).mockRejectedValueOnce(new Error("sprint gone"));
      await run("resume", "gone-sprint");
      expect(process.exitCode).toBe(1);
      expect(errText()).toContain("sprint gone");
    });
  });

  // ── line 239: list error path ─────────────────────────────────────────────

  describe("list — error path (line 239)", () => {
    it("sets exitCode=1 when listSprints rejects", async () => {
      vi.mocked(listSprints).mockRejectedValueOnce(new Error("list crashed"));
      await run("list");
      expect(process.exitCode).toBe(1);
      expect(errText()).toContain("list crashed");
    });
  });
});
