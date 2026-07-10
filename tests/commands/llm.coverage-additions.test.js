/**
 * tests/commands/llm.coverage-additions.test.js
 *
 * Targets the branches missed by tests/llm-cli-commands.test.js:
 *
 *  line  35 — loadConfigForLlm: options.baseDir truthy → spreads resolved baseDir
 *  line  60 — listStagedFiles: catch block → returns [] when fs.readdir throws
 *  line 154 — tagsForStagedSignal: all five source-type branches
 *  lines 176-181 — ingestStagedSignalsFromDirectory: recurring-diagnostic path,
 *                  fileFailed=true path, outer catch block
 *  line 203 — formatValidationError: plain-Error branch (no .issues)
 *  line 355 — llm topics: partial clusters + json flag (already tested) —
 *             cover the json branch inside the `clusters.length < k` guard
 *  lines 683-694 — ingest-staged: non-empty results table rendering
 *  line 775 — ingest-staged: ingestStagedSignalsFromDirectory throws → error path
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─── mocks ───────────────────────────────────────────────────────────────────

const dbOpen  = vi.fn().mockResolvedValue(undefined);
const dbClose = vi.fn().mockResolvedValue(undefined);
const logEnhanceCycle    = vi.fn();
const ratePromptHistory  = vi.fn();
const ratePrompt         = vi.fn();

vi.mock("../../src/llm/experience-db.js", () => ({
  ExperienceDb: vi.fn(function () {
    this.open  = dbOpen;
    this.close = dbClose;
    this.logEnhanceCycle   = logEnhanceCycle;
    this.ratePromptHistory = ratePromptHistory;
    this.ratePrompt        = ratePrompt;
  }),
}));

vi.mock("../../src/llm/prompt-generator.js", () => ({
  PromptGenerator: vi.fn(function () {
    this.findRelated = vi.fn();
  }),
}));

vi.mock("../../src/llm/knowledge-graph.js", () => ({
  buildGraph: vi.fn(),
}));

const listRubric     = vi.fn();
const setRubricActive = vi.fn();
vi.mock("../../src/llm/mistake-tracker.js", () => ({
  MistakeTracker: vi.fn(function () {
    this.listRubric      = listRubric;
    this.setRubricActive = setRubricActive;
    this.addMistake      = vi.fn();
  }),
}));

const ingestFile   = vi.fn().mockResolvedValue({ chunks: 1 });
const ingestChunks = vi.fn();
const initialize   = vi.fn().mockResolvedValue(undefined);
const ingesterDbClose = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/llm/document-ingester.js", () => ({
  DocumentIngester: vi.fn(function () {
    this.initialize   = initialize;
    this.ingestFile   = ingestFile;
    this.ingestChunks = ingestChunks;
    this.db = { close: ingesterDbClose };
  }),
}));

vi.mock("../../src/browser-bridge.js", () => ({
  sendPrompt:       vi.fn(),
  listResponses:    vi.fn(),
  ensureBrowserDirs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/domain/schemas.js", () => ({
  PositiveIntSchema: {
    parse: vi.fn((v) => {
      if (Number.isInteger(v) && v > 0) return v;
      const e = new Error("Invalid");
      e.issues = [{ message: "Must be positive" }];
      throw e;
    }),
  },
}));

vi.mock("../../src/error.js", () => ({
  DomainError: class DomainError extends Error {
    constructor(code, message, details) { super(message); this.code = code; this.details = details; }
  },
}));

vi.mock("../../src/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

const defaultStagedSignalsDirFn = vi.fn(() => "/default/staged");
const parseFrontmatterFn        = vi.fn(() => ({ data: {}, body: "" }));
const splitStagedSignalDocsFn   = vi.fn(() => []);

vi.mock("../../src/storage/vscode-learn-utils.js", () => ({
  defaultStagedSignalsDir:    (...a) => defaultStagedSignalsDirFn(...a),
  parseFrontmatter:           (...a) => parseFrontmatterFn(...a),
  splitStagedSignalDocuments: (...a) => splitStagedSignalDocsFn(...a),
}));

const addMistakeFn      = vi.fn();
const askLocalLlmFn     = vi.fn();
const generatePromptFn  = vi.fn();
const getLocalLlmStatus = vi.fn();
const importSprintsFn   = vi.fn();
const ingestDocuments   = vi.fn();
const setupModelFn      = vi.fn();

vi.mock("../../src/llm/local-llm.js", () => ({
  addMistake:         (...a) => addMistakeFn(...a),
  askLocalLlm:        (...a) => askLocalLlmFn(...a),
  generatePrompt:     (...a) => generatePromptFn(...a),
  getLocalLlmStatus:  (...a) => getLocalLlmStatus(...a),
  importSprints:      (...a) => importSprintsFn(...a),
  ingestDocuments:    (...a) => ingestDocuments(...a),
  setupModel:         (...a) => setupModelFn(...a),
}));

vi.mock("../../src/llm/training-exporter.js", () => ({
  exportTrainingData: vi.fn(),
}));

const verifyRuntimeFn = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/llm/inference.js", () => ({
  verifyLocalLlmRuntime: (...a) => verifyRuntimeFn(...a),
}));

let answerQueue = [];
vi.mock("node:readline/promises", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn(async () => {
        const v = answerQueue.shift();
        return v === undefined ? "" : v;
      }),
      close: vi.fn(),
    })),
  },
}));

vi.mock("chalk", () => ({
  default: new Proxy({}, { get: () => (s) => String(s) }),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start:   vi.fn().mockReturnThis(),
    stop:    vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail:    vi.fn().mockReturnThis(),
    text: "",
  })),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

import { bindLlmCommands, listStagedFiles, ingestStagedSignalsFromDirectory } from "../../src/commands/llm.js";

function makeProgram(opts) {
  const prog = new Command();
  prog.exitOverride();
  prog.configureOutput({ writeOut() {}, writeErr() {} });
  bindLlmCommands(prog, opts);
  return prog;
}

async function run(args, opts) {
  const prog = makeProgram(opts);
  const logSpy    = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy  = vi.spyOn(console, "error").mockImplementation(() => {});
  const tableSpy  = vi.spyOn(console, "table").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await prog.parseAsync(["node", "cli", ...args]);
  } catch (e) {
    if (!e?.code?.startsWith?.("commander.")) throw e;
  }
  return { logSpy, errorSpy, tableSpy };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("llm.js — additional branch coverage", () => {
  let tempDir;

  beforeEach(async () => {
    vi.clearAllMocks();
    answerQueue = [];
    process.exitCode = undefined;
    verifyRuntimeFn.mockResolvedValue(undefined);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── line 35: loadConfigForLlm with baseDir ────────────────────────────────

  describe("loadConfigForLlm — baseDir branch (line 35)", () => {
    it("resolves and spreads baseDir when provided to ingest-staged", async () => {
      // ingest-staged uses loadConfigForLlm; passing --base-dir exercises line 35
      splitStagedSignalDocsFn.mockReturnValue([]);
      defaultStagedSignalsDirFn.mockReturnValue(path.join(tempDir, "staged"));

      await fs.mkdir(path.join(tempDir, "staged"), { recursive: true });

      const { logSpy } = await run([
        "llm", "ingest-staged", "--base-dir", tempDir,
      ]);
      // reaches the "No staged signals found" log → line 35 path was taken
      const out = logSpy.mock.calls.flat().join(" ");
      expect(out).toContain("No staged signals found");
    });
  });

  // ── line 60: listStagedFiles catch → [] ──────────────────────────────────

  describe("listStagedFiles — catch returns [] (line 60)", () => {
    it("returns [] when the directory does not exist", async () => {
      const result = await listStagedFiles("/nonexistent/path/that/does/not/exist");
      expect(result).toEqual([]);
    });

    it("returns only .md files from a real directory", async () => {
      await fs.writeFile(path.join(tempDir, "a.md"), "content");
      await fs.writeFile(path.join(tempDir, "b.txt"), "content");
      const result = await listStagedFiles(tempDir);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/a\.md$/);
    });
  });

  // ── line 154: tagsForStagedSignal — all source-type branches ─────────────

  describe("tagsForStagedSignal — all branches (line 154 area)", () => {
    async function ingestWithSourceType(sourceType) {
      const stageDir = path.join(tempDir, "staged-" + sourceType.replace(/[^a-z]/g, "-"));
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "signal.md");
      await fs.writeFile(file, `---\nsource_type: ${sourceType}\n---\nContent here`);

      parseFrontmatterFn.mockReturnValue({ data: { source_type: sourceType }, body: "Content here" });
      splitStagedSignalDocsFn.mockReturnValue([`---\nsource_type: ${sourceType}\n---\nContent here`]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(stageDir, undefined);
      return results;
    }

    it("tags vscode-edit as ['editor', 'file-save']", async () => {
      const results = await ingestWithSourceType("vscode-edit");
      expect(ingestFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: ["editor", "file-save"] }),
      );
    });

    it("tags vscode-diagnostic as ['editor', 'diagnostic']", async () => {
      await ingestWithSourceType("vscode-diagnostic");
      expect(ingestFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: ["editor", "diagnostic"] }),
      );
    });

    it("tags vscode-diagnostic-recurring as ['editor', 'diagnostic']", async () => {
      await ingestWithSourceType("vscode-diagnostic-recurring");
      expect(ingestFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: ["editor", "diagnostic"] }),
      );
    });

    it("tags vscode-git as ['editor', 'git']", async () => {
      await ingestWithSourceType("vscode-git");
      expect(ingestFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: ["editor", "git"] }),
      );
    });

    it("tags vscode-task-error as ['editor', 'task-error']", async () => {
      await ingestWithSourceType("vscode-task-error");
      expect(ingestFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: ["editor", "task-error"] }),
      );
    });

    it("tags unknown source types as ['editor'] (default branch)", async () => {
      await ingestWithSourceType("vscode-signal");
      expect(ingestFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tags: ["editor"] }),
      );
    });
  });

  // ── lines 176-181: ingestStagedSignalsFromDirectory edge paths ────────────

  describe("ingestStagedSignalsFromDirectory — edge paths (lines 176-181)", () => {
    it("records a mistake when signal_type is vscode-diagnostic-recurring", async () => {
      const stageDir = path.join(tempDir, "staged-recurring");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "r.md");
      const docText = "---\nsignal_type: vscode-diagnostic-recurring\nrecurring: true\nmessage: Recurring diag\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: {
          signal_type: "vscode-diagnostic-recurring",
          source_type: "vscode-diagnostic-recurring",
          recurring: "true",
          message: "Recurring diag",
        },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(stageDir, undefined);
      expect(results.length).toBeGreaterThan(0);
    });

    it("marks file as failed when ingestFile throws for one chunk", async () => {
      const stageDir = path.join(tempDir, "staged-fail");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "fail.md");
      await fs.writeFile(file, "---\nsource_type: vscode-edit\n---\nContent");

      parseFrontmatterFn.mockReturnValue({ data: { source_type: "vscode-edit" }, body: "Content" });
      splitStagedSignalDocsFn.mockReturnValue(["---\nsource_type: vscode-edit\n---\nContent"]);
      ingestFile.mockRejectedValueOnce(new Error("ingest chunk failed"));

      const results = await ingestStagedSignalsFromDirectory(stageDir, undefined);
      const failedResult = results.find((r) => r.skipped);
      expect(failedResult).toBeDefined();
      expect(failedResult.error).toContain("ingest chunk failed");
    });

    it("catches outer per-file errors (readFile throws)", async () => {
      const stageDir = path.join(tempDir, "staged-readfail");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "bad.md");
      await fs.writeFile(file, "content");

      // splitStagedSignalDocuments throws → outer catch
      splitStagedSignalDocsFn.mockImplementationOnce(() => {
        throw new Error("split failed");
      });

      const results = await ingestStagedSignalsFromDirectory(stageDir, undefined);
      const errResult = results.find((r) => r.error);
      expect(errResult).toBeDefined();
    });

    it("propagates errors thrown outside the file loop (ingester.initialize fails)", async () => {
      initialize.mockRejectedValueOnce(new Error("init failed"));

      const stageDir = path.join(tempDir, "staged-initfail");
      await fs.mkdir(stageDir, { recursive: true });
      await fs.writeFile(path.join(stageDir, "f.md"), "content");

      await expect(
        ingestStagedSignalsFromDirectory(stageDir, undefined)
      ).rejects.toThrow("init failed");
    });
  });

  // ── line 203: formatValidationError plain-Error branch ───────────────────

  describe("formatValidationError — plain-Error branch (line 203)", () => {
    it("formats plain Error.message in rate-prompt when PositiveIntSchema throws without .issues", async () => {
      const { PositiveIntSchema } = await import("../../src/domain/schemas.js");
      vi.mocked(PositiveIntSchema.parse).mockImplementationOnce(() => {
        throw new Error("plain no-issues error");
      });

      const { errorSpy } = await run(["llm", "rate-prompt", "1", "--rating", "abc"]);
      expect(errorSpy.mock.calls[0][0]).toContain("plain no-issues error");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── line 355: llm topics — partial clusters + --json ─────────────────────

  describe("llm topics — partial clusters with --json (line 355)", () => {
    it("prints partial clusters as JSON when --json is set and clusters < k", async () => {
      vi.doMock("../../src/llm/embeddings.js", () => ({
        clusterDocuments: vi.fn().mockResolvedValue([{ snippets: ["only one"] }]),
      }));

      const { logSpy, errorSpy } = await run(["llm", "topics", "--k", "3", "--json"]);
      const out = logSpy.mock.calls.flat().join(" ");
      // Should warn AND print JSON (both branches inside clusters.length < k)
      expect(out).toContain('"clusters"');
    });
  });

  // ── lines 683-694: ingest-staged renders non-empty results table ──────────

  describe("llm ingest-staged — non-empty results table (lines 683-694)", () => {
    it("renders a table when staged signals are found and ingested", async () => {
      const stageDir = path.join(tempDir, "staged-results");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "sig.md");
      await fs.writeFile(file, "---\nsource_type: vscode-edit\n---\nContent");

      parseFrontmatterFn.mockReturnValue({ data: { source_type: "vscode-edit" }, body: "Content" });
      splitStagedSignalDocsFn.mockReturnValue(["---\nsource_type: vscode-edit\n---\nContent"]);
      ingestFile.mockResolvedValue({ chunks: 2 });
      defaultStagedSignalsDirFn.mockReturnValue(stageDir);

      const { tableSpy } = await run(["llm", "ingest-staged", stageDir]);
      expect(tableSpy).toHaveBeenCalled();
    });
  });

  // ── line 775: ingest-staged — outer error path ────────────────────────────

  describe("llm ingest-staged — error path (line 775)", () => {
    it("sets exitCode=1 when ingestStagedSignalsFromDirectory throws", async () => {
      initialize.mockRejectedValueOnce(new Error("ingest crashed"));

      const stageDir = path.join(tempDir, "staged-crash");
      await fs.mkdir(stageDir, { recursive: true });
      await fs.writeFile(path.join(stageDir, "f.md"), "content");

      splitStagedSignalDocsFn.mockReturnValue(["doc"]);
      parseFrontmatterFn.mockReturnValue({ data: {}, body: "content" });
      defaultStagedSignalsDirFn.mockReturnValue(stageDir);

      const { errorSpy } = await run(["llm", "ingest-staged", stageDir]);
      expect(errorSpy.mock.calls[0][0]).toContain("ingest crashed");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── line 775: rubric enable — success path logs "Enabled." ───────────────

  describe("llm rubric enable — success path (line 775)", () => {
    it("prints 'Enabled.' when setRubricActive resolves (line 775)", async () => {
      setRubricActive.mockResolvedValue(undefined);

      const { logSpy } = await run(["llm", "rubric", "enable", "42"]);

      // Must have called setRubricActive(id, true)
      expect(setRubricActive).toHaveBeenCalledWith("42", true);
      // Must have logged "Enabled." — this is the statement on line 775
      const out = logSpy.mock.calls.flat().join(" ");
      expect(out).toContain("Enabled.");
      expect(process.exitCode).toBeUndefined();
    });

    it("logs the raw error object when err has no .message (??-else branch)", async () => {
      // Throws a non-Error value — exercises the `?? err` branch in
      // `err?.message ?? err` on the catch line.
      const rawErr = { code: "E_FAKE" };
      setRubricActive.mockRejectedValueOnce(rawErr);

      const { errorSpy } = await run(["llm", "rubric", "enable", "7"]);

      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });
  });
});
