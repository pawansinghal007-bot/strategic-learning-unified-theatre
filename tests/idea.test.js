import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createIdea = vi.fn();
const findIdeaById = vi.fn();
const listIdeas = vi.fn();
const markIdeaDone = vi.fn();
const linkIdeaToSprint = vi.fn();
const exportIdeas = vi.fn();

vi.mock("../src/idea-store.js", () => ({
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

vi.mock("../src/domain/schemas.js", () => ({
  IdeaPrioritySchema: {
    parse: (...a) => parsePriority(...a),
  },
}));

vi.mock("../src/error.js", () => ({
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
function queueAnswers(...answers) {
  answerQueue.push(...answers);
}

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
  default: {
    spawnSync: (...a) => spawnSync(...a),
  },
}));

import { bindIdeaCommands } from "../src/commands/idea.js";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  bindIdeaCommands(program);
  return program;
}

describe("bindIdeaCommands", () => {
  let logSpy;
  let errorSpy;
  let stdoutSpy;
  let originalEditor;

  beforeEach(() => {
    vi.clearAllMocks();
    answerQueue = [];
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    process.exitCode = undefined;
    originalEditor = process.env.EDITOR;
    delete process.env.EDITOR;
  });

  afterEach(() => {
    if (originalEditor === undefined) delete process.env.EDITOR;
    else process.env.EDITOR = originalEditor;
  });

  describe("idea add", () => {
    it("creates an idea using the inline prompt flow (no EDITOR set)", async () => {
      queueAnswers("My Great Idea", "First line", "Second line", "");

      createIdea.mockResolvedValue({ id: "idea-1" });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "add",
        "--project",
        "demo",
        "--tag",
        "infra",
        "--tag",
        "urgent",
        "--priority",
        "2",
      ]);

      expect(createIdea).toHaveBeenCalledWith({
        project: "demo",
        tags: ["infra", "urgent"],
        priority: 2,
        body: "# My Great Idea\n\nFirst line\nSecond line",
      });
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Created idea:");
      expect(output).toContain("idea-1");
    });

    it("defaults --tag to [] and --priority to 3 when omitted", async () => {
      queueAnswers("Untagged Idea", "Body text", "");
      createIdea.mockResolvedValue({ id: "idea-2" });

      await makeProgram().parseAsync(["node", "cli", "idea", "add"]);

      expect(createIdea).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [], priority: 3 }),
      );
    });

    it("reports an invalid --priority via the issues[] formatting branch", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "add",
        "--priority",
        "99",
      ]);

      expect(errorSpy).toHaveBeenCalled();
      const message = errorSpy.mock.calls[0][0];
      expect(message).toContain("ROTATOR_CLI_INVALID");
      expect(message).toContain("Priority must be an integer between 1 and 5");
      expect(process.exitCode).toBe(1);
      expect(createIdea).not.toHaveBeenCalled();
    });

    it("reports a non-issues Error via the plain-message formatting branch", async () => {
      parsePriority.mockImplementationOnce(() => {
        throw new Error("boom, not a zod error");
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "add",
        "--priority",
        "2",
      ]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("boom, not a zod error");
      expect(process.exitCode).toBe(1);
    });

    it("uses the $EDITOR body when EDITOR is set and the editor produces non-empty content", async () => {
      process.env.EDITOR = "fake-editor";
      queueAnswers("Editor Idea"); // only the title prompt is needed

      spawnSync.mockImplementation((_editor, [tempFile]) => {
        writeFileSync(tempFile, "Edited body content", "utf8");
        return { error: undefined };
      });
      createIdea.mockResolvedValue({ id: "idea-3" });

      await makeProgram().parseAsync(["node", "cli", "idea", "add"]);

      expect(createIdea).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "# Editor Idea\n\nEdited body content",
        }),
      );
      // askBodyInline's prompt should never have been needed.
      expect(answerQueue).toHaveLength(0);
    });

    it("falls back to the inline prompt when the editor produces an empty body", async () => {
      process.env.EDITOR = "fake-editor";
      queueAnswers("Editor Idea", "Inline fallback body", "");

      spawnSync.mockImplementation((_editor, [tempFile]) => {
        writeFileSync(tempFile, "   ", "utf8"); // trims to empty
        return { error: undefined };
      });
      createIdea.mockResolvedValue({ id: "idea-4" });

      await makeProgram().parseAsync(["node", "cli", "idea", "add"]);

      expect(createIdea).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "# Editor Idea\n\nInline fallback body",
        }),
      );
    });

    it("propagates a spawnSync error from the editor flow", async () => {
      process.env.EDITOR = "fake-editor";
      queueAnswers("Editor Idea");

      spawnSync.mockImplementation(() => ({
        error: new Error("ENOENT: editor not found"),
      }));

      await makeProgram().parseAsync(["node", "cli", "idea", "add"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("ENOENT");
      expect(process.exitCode).toBe(1);
      expect(createIdea).not.toHaveBeenCalled();
    });

    it("errors when the final body is empty/whitespace-only", async () => {
      queueAnswers("Empty Body Idea", "");

      await makeProgram().parseAsync(["node", "cli", "idea", "add"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("Idea body is required.");
      expect(process.exitCode).toBe(1);
      expect(createIdea).not.toHaveBeenCalled();
    });

    it("reports an error when createIdea() rejects", async () => {
      queueAnswers("Idea Title", "Some body", "");
      createIdea.mockRejectedValue(new Error("disk full"));

      await makeProgram().parseAsync(["node", "cli", "idea", "add"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("disk full");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("idea list", () => {
    it("prints 'No ideas found.' for an empty result", async () => {
      listIdeas.mockResolvedValue([]);

      await makeProgram().parseAsync(["node", "cli", "idea", "list"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("No ideas found.");
    });

    it("renders a table for a non-empty result, joining tags and slicing the date", async () => {
      const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
      listIdeas.mockResolvedValue([
        {
          id: "idea-1",
          project: "demo",
          status: "active",
          priority: 2,
          tags: ["a", "b"],
          created: "2026-01-01T12:34:56.000Z",
        },
      ]);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "list",
        "--project",
        "demo",
        "--tag",
        "a",
        "--status",
        "active",
      ]);

      expect(listIdeas).toHaveBeenCalledWith({
        project: "demo",
        status: "active",
        tag: "a",
      });
      expect(tableSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "idea-1",
          tags: "a, b",
          created: "2026-01-01",
        }),
      ]);
    });

    it("reports an error when listIdeas() rejects", async () => {
      listIdeas.mockRejectedValue(new Error("db unavailable"));

      await makeProgram().parseAsync(["node", "cli", "idea", "list"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("db unavailable");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("idea view", () => {
    it("prints the raw file content for a found idea", async () => {
      findIdeaById.mockResolvedValue({ filePath: "/ideas/idea-1.md" });
      vi.spyOn(fs, "readFile").mockResolvedValue("# Idea content");

      await makeProgram().parseAsync(["node", "cli", "idea", "view", "idea-1"]);

      expect(findIdeaById).toHaveBeenCalledWith("idea-1");
      expect(stdoutSpy).toHaveBeenCalledWith("# Idea content\n");
    });

    it("reports an error when the idea isn't found", async () => {
      findIdeaById.mockRejectedValue(new Error("Idea not found: idea-x"));

      await makeProgram().parseAsync(["node", "cli", "idea", "view", "idea-x"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("Idea not found: idea-x");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("idea link", () => {
    it("links an idea to a sprint successfully", async () => {
      linkIdeaToSprint.mockResolvedValue(undefined);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "link",
        "idea-1",
        "--sprint",
        "sprint-7",
      ]);

      expect(linkIdeaToSprint).toHaveBeenCalledWith("idea-1", "sprint-7");
    });

    it("reports an error when linking fails", async () => {
      linkIdeaToSprint.mockRejectedValue(new Error("sprint not found"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "link",
        "idea-1",
        "--sprint",
        "sprint-x",
      ]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("sprint not found");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("idea done", () => {
    it("marks an idea done successfully", async () => {
      markIdeaDone.mockResolvedValue(undefined);

      await makeProgram().parseAsync(["node", "cli", "idea", "done", "idea-1"]);

      expect(markIdeaDone).toHaveBeenCalledWith("idea-1");
    });

    it("reports an error when marking done fails", async () => {
      markIdeaDone.mockRejectedValue(new Error("already done"));

      await makeProgram().parseAsync(["node", "cli", "idea", "done", "idea-1"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("already done");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("idea export", () => {
    it("writes the exported markdown to stdout, defaulting --status to 'active'", async () => {
      exportIdeas.mockResolvedValue("# Exported\n\nContent");

      await makeProgram().parseAsync(["node", "cli", "idea", "export"]);

      expect(exportIdeas).toHaveBeenCalledWith({
        project: undefined,
        status: "active",
      });
      expect(stdoutSpy).toHaveBeenCalledWith("# Exported\n\nContent\n");
    });

    it("passes through explicit --project and --status", async () => {
      exportIdeas.mockResolvedValue("output");

      await makeProgram().parseAsync([
        "node",
        "cli",
        "idea",
        "export",
        "--project",
        "demo",
        "--status",
        "done",
      ]);

      expect(exportIdeas).toHaveBeenCalledWith({
        project: "demo",
        status: "done",
      });
    });

    it("reports an error when exportIdeas() rejects", async () => {
      exportIdeas.mockRejectedValue(new Error("export failed"));

      await makeProgram().parseAsync(["node", "cli", "idea", "export"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("export failed");
      expect(process.exitCode).toBe(1);
    });
  });
});
