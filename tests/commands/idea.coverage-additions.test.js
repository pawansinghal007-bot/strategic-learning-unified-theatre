/**
 * tests/commands/idea.coverage-additions.test.js
 *
 * Targets the branches not yet hit in tests/idea.test.js:
 *
 *  lines  29-69  — formatValidationError (both branches), parseIdeaPriority,
 *                  promptFactory / promptForValue, getBodyWithEditor, askBodyInline
 *                  — these are exercised indirectly through "idea add" actions in
 *                  idea.test.js but the module-level functions themselves need
 *                  direct invocation paths via bindIdeaCommands (since bindIdeaCommands
 *                  is async).
 *
 *  line  142     — idea add: body comes from getBodyWithEditor AND it is non-empty
 *                  (EDITOR set, spawnSync produces content)
 *
 *  lines 178-244 — all sub-commands of idea that tests/idea.test.js may not reach
 *                  because bindIdeaCommands is async and idea.test.js calls it
 *                  synchronously. Ensure the await path is exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";

// ─── mocks (must match idea.test.js patterns) ────────────────────────────────

const createIdea = vi.fn();
const findIdeaById = vi.fn();
const listIdeas = vi.fn();
const markIdeaDone = vi.fn();
const linkIdeaToSprint = vi.fn();
const exportIdeas = vi.fn();

vi.mock("../../src/idea-store.js", () => ({
  createIdea: (...a) => createIdea(...a),
  findIdeaById: (...a) => findIdeaById(...a),
  listIdeas: (...a) => listIdeas(...a),
  markIdeaDone: (...a) => markIdeaDone(...a),
  linkIdeaToSprint: (...a) => linkIdeaToSprint(...a),
  exportIdeas: (...a) => exportIdeas(...a),
}));

const parsePriority = vi.fn((v) => {
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
  const err = new Error("Invalid priority");
  err.issues = [{ message: "Priority must be an integer between 1 and 5" }];
  throw err;
});

vi.mock("../../src/domain/schemas.js", () => ({
  IdeaPrioritySchema: { parse: (...a) => parsePriority(...a) },
}));

vi.mock("../../src/error.js", () => ({
  DomainError: class DomainError extends Error {
    constructor(code, message, details) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock("chalk", () => ({
  default: new Proxy({}, { get: () => (s) => String(s) }),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

let answerQueue = [];
vi.mock("node:readline/promises", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn(async () => {
        const next = answerQueue.shift();
        return next === undefined ? "" : next;
      }),
      close: vi.fn(),
    })),
  },
}));

const spawnSync = vi.fn();
vi.mock("node:child_process", () => ({
  spawnSync: (...a) => spawnSync(...a),
  default: { spawnSync: (...a) => spawnSync(...a) },
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

import { bindIdeaCommands } from "../../src/commands/idea.js";

async function makeProgram() {
  const prog = new Command();
  prog.exitOverride();
  prog.configureOutput({ writeOut() {}, writeErr() {} });
  await bindIdeaCommands(prog); // ← async bind
  return prog;
}

async function run(args) {
  const prog = await makeProgram();
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  process.exitCode = undefined;
  try {
    await prog.parseAsync(["node", "cli", ...args]);
  } catch (e) {
    if (!e?.code?.startsWith?.("commander.")) throw e;
  }
  return { logSpy, errorSpy, stdoutSpy };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("idea.js — async bindIdeaCommands coverage additions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerQueue = [];
    process.exitCode = undefined;
    delete process.env.EDITOR;
  });

  // ── lines 29-45: formatValidationError both branches via parseIdeaPriority ─

  describe("formatValidationError branches (lines 29-45)", () => {
    it("formats Zod-style issues[] (true branch, line 31)", async () => {
      // parsePriority throws with .issues — default mock behaviour
      const { errorSpy } = await run(["idea", "add", "--priority", "99"]);
      expect(errorSpy.mock.calls[0][0]).toContain(
        "Priority must be an integer between 1 and 5",
      );
      expect(process.exitCode).toBe(1);
    });

    it("formats plain Error.message (false branch, line 33)", async () => {
      parsePriority.mockImplementationOnce(() => {
        throw new Error("just a plain error");
      });
      const { errorSpy } = await run(["idea", "add", "--priority", "2"]);
      expect(errorSpy.mock.calls[0][0]).toContain("just a plain error");
      expect(process.exitCode).toBe(1);
    });

    it("formats non-Error value via String(err) (else branch)", async () => {
      parsePriority.mockImplementationOnce(() => {
        throw "raw string thrown"; // not an Error
      });
      const { errorSpy } = await run(["idea", "add", "--priority", "2"]);
      expect(errorSpy.mock.calls[0][0]).toContain("raw string thrown");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lines 47-69: promptFactory / promptForValue / askBodyInline ───────────

  describe("promptForValue / askBodyInline inline flow (lines 47-69)", () => {
    it("collects multi-line body from askBodyInline then creates idea", async () => {
      answerQueue = ["My Idea Title", "Line one", "Line two", ""];
      createIdea.mockResolvedValue({ id: "idea-abc" });

      const { logSpy } = await run(["idea", "add"]);
      expect(createIdea).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "# My Idea Title\n\nLine one\nLine two",
        }),
      );
      expect(logSpy.mock.calls.flat().join(" ")).toContain("idea-abc");
    });

    it("errors when body is empty after inline prompt", async () => {
      answerQueue = ["Empty Body Idea", ""];
      const { errorSpy } = await run(["idea", "add"]);
      expect(errorSpy.mock.calls[0][0]).toContain("Idea body is required.");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── line 142: getBodyWithEditor — EDITOR set, non-empty body ─────────────

  describe("getBodyWithEditor (line 142)", () => {
    it("uses editor content as body when EDITOR is set and produces non-empty result", async () => {
      process.env.EDITOR = "fake-editor";
      answerQueue = ["Editor Idea Title"];

      spawnSync.mockImplementation((_editor, [tempFile]) => {
        writeFileSync(tempFile, "Written by editor", "utf8");
        return { error: undefined };
      });
      createIdea.mockResolvedValue({ id: "idea-editor" });

      const { logSpy } = await run(["idea", "add"]);
      expect(createIdea).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "# Editor Idea Title\n\nWritten by editor",
        }),
      );
      expect(logSpy.mock.calls.flat().join(" ")).toContain("idea-editor");
    });

    it("falls back to inline prompt when editor produces empty content", async () => {
      process.env.EDITOR = "fake-editor";
      answerQueue = ["Fallback Title", "Inline body text", ""];

      spawnSync.mockImplementation((_editor, [tempFile]) => {
        writeFileSync(tempFile, "  ", "utf8"); // whitespace only
        return { error: undefined };
      });
      createIdea.mockResolvedValue({ id: "idea-fallback" });

      const { logSpy } = await run(["idea", "add"]);
      expect(createIdea).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "# Fallback Title\n\nInline body text",
        }),
      );
    });
  });

  // ── lines 178-196: idea list ──────────────────────────────────────────────

  describe("idea list (lines 178-196)", () => {
    it("shows 'No ideas found.' for empty result", async () => {
      listIdeas.mockResolvedValue([]);
      const { logSpy } = await run(["idea", "list"]);
      expect(logSpy.mock.calls.flat().join(" ")).toContain("No ideas found.");
    });

    it("renders table for non-empty result", async () => {
      const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
      listIdeas.mockResolvedValue([
        {
          id: "i1",
          project: "p",
          status: "active",
          priority: 2,
          tags: ["a"],
          created: "2026-01-01T00:00:00Z",
        },
      ]);
      await run([
        "idea",
        "list",
        "--project",
        "p",
        "--tag",
        "a",
        "--status",
        "active",
      ]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("errors when listIdeas rejects", async () => {
      listIdeas.mockRejectedValue(new Error("list failed"));
      const { errorSpy } = await run(["idea", "list"]);
      expect(errorSpy.mock.calls[0][0]).toContain("list failed");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lines 200-208: idea view ──────────────────────────────────────────────

  describe("idea view (lines 200-208)", () => {
    it("writes raw file content to stdout", async () => {
      findIdeaById.mockResolvedValue({ filePath: "/ideas/i.md" });
      vi.spyOn(fs, "readFile").mockResolvedValue("# My Idea\n\nContent");
      const { stdoutSpy } = await run(["idea", "view", "i1"]);
      expect(stdoutSpy).toHaveBeenCalledWith("# My Idea\n\nContent\n");
    });

    it("errors when findIdeaById rejects", async () => {
      findIdeaById.mockRejectedValue(new Error("not found"));
      const { errorSpy } = await run(["idea", "view", "bad-id"]);
      expect(errorSpy.mock.calls[0][0]).toContain("not found");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lines 211-222: idea link ──────────────────────────────────────────────

  describe("idea link (lines 211-222)", () => {
    it("links idea to sprint", async () => {
      linkIdeaToSprint.mockResolvedValue(undefined);
      await run(["idea", "link", "i1", "--sprint", "s1"]);
      expect(linkIdeaToSprint).toHaveBeenCalledWith("i1", "s1");
    });

    it("errors when linkIdeaToSprint rejects", async () => {
      linkIdeaToSprint.mockRejectedValue(new Error("link fail"));
      const { errorSpy } = await run(["idea", "link", "i1", "--sprint", "s1"]);
      expect(errorSpy.mock.calls[0][0]).toContain("link fail");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lines 225-234: idea done ──────────────────────────────────────────────

  describe("idea done (lines 225-234)", () => {
    it("marks idea done", async () => {
      markIdeaDone.mockResolvedValue(undefined);
      await run(["idea", "done", "i1"]);
      expect(markIdeaDone).toHaveBeenCalledWith("i1");
    });

    it("errors when markIdeaDone rejects", async () => {
      markIdeaDone.mockRejectedValue(new Error("done fail"));
      const { errorSpy } = await run(["idea", "done", "i1"]);
      expect(errorSpy.mock.calls[0][0]).toContain("done fail");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── lines 237-244: idea export ────────────────────────────────────────────

  describe("idea export (lines 237-244)", () => {
    it("writes exported markdown to stdout", async () => {
      exportIdeas.mockResolvedValue("# Export\n\ncontent");
      const { stdoutSpy } = await run(["idea", "export"]);
      expect(stdoutSpy).toHaveBeenCalledWith("# Export\n\ncontent\n");
      expect(exportIdeas).toHaveBeenCalledWith({
        project: undefined,
        status: "active",
      });
    });

    it("passes explicit --project and --status", async () => {
      exportIdeas.mockResolvedValue("output");
      await run(["idea", "export", "--project", "p1", "--status", "done"]);
      expect(exportIdeas).toHaveBeenCalledWith({
        project: "p1",
        status: "done",
      });
    });

    it("errors when exportIdeas rejects", async () => {
      exportIdeas.mockRejectedValue(new Error("export fail"));
      const { errorSpy } = await run(["idea", "export"]);
      expect(errorSpy.mock.calls[0][0]).toContain("export fail");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── non-Error throw branches (err?.message ?? err branch 1) ──────────────
  // Lines 142/178/193/210/226/244: when err is a string (not Error object),
  // err?.message is undefined so ?? falls through to err itself.

  describe("catch blocks — non-Error rejection (err?.message ?? err branch 1)", () => {
    it("idea add: createIdea rejects with string hits err?.message ?? err branch 1 (line 142)", async () => {
      answerQueue = ["Title", "Body line", ""];
      createIdea.mockRejectedValue("string error no .message property");
      const { errorSpy } = await run(["idea", "add"]);
      expect(errorSpy.mock.calls[0][0]).toContain(
        "string error no .message property",
      );
      expect(process.exitCode).toBe(1);
    });

    it("idea list: listIdeas rejects with string hits err?.message ?? err branch 1 (line 178)", async () => {
      listIdeas.mockRejectedValue("list string error");
      const { errorSpy } = await run(["idea", "list"]);
      expect(errorSpy.mock.calls[0][0]).toContain("list string error");
      expect(process.exitCode).toBe(1);
    });

    it("idea view: findIdeaById rejects with string hits err?.message ?? err branch 1 (line 193)", async () => {
      findIdeaById.mockRejectedValue("view string error");
      const { errorSpy } = await run(["idea", "view", "bad-id"]);
      expect(errorSpy.mock.calls[0][0]).toContain("view string error");
      expect(process.exitCode).toBe(1);
    });

    it("idea link: linkIdeaToSprint rejects with string hits err?.message ?? err branch 1 (line 210)", async () => {
      linkIdeaToSprint.mockRejectedValue("link string error");
      const { errorSpy } = await run(["idea", "link", "i1", "--sprint", "s1"]);
      expect(errorSpy.mock.calls[0][0]).toContain("link string error");
      expect(process.exitCode).toBe(1);
    });

    it("idea done: markIdeaDone rejects with string hits err?.message ?? err branch 1 (line 226)", async () => {
      markIdeaDone.mockRejectedValue("done string error");
      const { errorSpy } = await run(["idea", "done", "i1"]);
      expect(errorSpy.mock.calls[0][0]).toContain("done string error");
      expect(process.exitCode).toBe(1);
    });

    it("idea export: exportIdeas rejects with string hits err?.message ?? err branch 1 (line 244)", async () => {
      exportIdeas.mockRejectedValue("export string error");
      const { errorSpy } = await run(["idea", "export"]);
      expect(errorSpy.mock.calls[0][0]).toContain("export string error");
      expect(process.exitCode).toBe(1);
    });
  });
});
