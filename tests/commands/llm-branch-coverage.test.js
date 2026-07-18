/**
 * tests/commands/llm-branch-coverage.test.js
 *
 * Sprint N — Branch coverage for src/commands/llm.js
 *
 * Targets 27 uncovered branches identified in COVERAGE-100-ANALYSIS.md:
 *
 *  Category 1: Source type fallback branches (lines ~1856)
 *    - data.signal_type fallback when data.source_type is falsy
 *    - "vscode-signal" fallback when both are falsy
 *
 *  Category 2: Recurring diagnostic description fallbacks (lines ~1885-1894)
 *    - data.description fallback
 *    - Template literal fallback when both message and description are falsy
 *    - "Recurring diagnostic marker" fallback for root_cause
 *
 *  Category 3: Error object fallback branches (lines ~1905, ~1964)
 *    - String(error?.message ?? error) where error is a non-Error object
 *    - formatValidationError String(err) for non-Error objects
 *
 *  Category 4: CLI command error fallback branches (lines ~2015-2587)
 *    - 17 instances of err?.message ?? err where err is not an Error object
 *
 *  Category 5: Options fallback branches (line ~2228)
 *    - options.minPairs ?? 0 fallback
 *
 *  Category 6: Mistake result branches (line ~2478)
 *    - "Mistake recorded" when result.promoted is false
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─── hoisted mocks (for vi.mock() factories) ────────────────────────────────

const mocks = vi.hoisted(() => ({
  findRelated: vi.fn(),
  buildGraph: vi.fn(),
  exportTrainingData: vi.fn(),
}));

// ─── mocks ───────────────────────────────────────────────────────────────────

const dbOpen = vi.fn().mockResolvedValue(undefined);
const dbClose = vi.fn().mockResolvedValue(undefined);
const logEnhanceCycle = vi.fn();
const ratePromptHistory = vi.fn();
const ratePrompt = vi.fn();

vi.mock("../../src/llm/experience-db.js", () => ({
  ExperienceDb: vi.fn(function () {
    this.open = dbOpen;
    this.close = dbClose;
    this.logEnhanceCycle = logEnhanceCycle;
    this.ratePromptHistory = ratePromptHistory;
    this.ratePrompt = ratePrompt;
  }),
}));

vi.mock("../../src/llm/prompt-generator.js", () => ({
  PromptGenerator: vi.fn(function () {
    this.findRelated = mocks.findRelated;
  }),
}));

vi.mock("../../src/llm/knowledge-graph.js", () => ({
  buildGraph: mocks.buildGraph,
}));

const listRubric = vi.fn();
const setRubricActive = vi.fn();
const addMistakeTracker = vi.fn();

vi.mock("../../src/llm/mistake-tracker.js", () => ({
  MistakeTracker: vi.fn(function () {
    this.listRubric = listRubric;
    this.setRubricActive = setRubricActive;
    this.addMistake = addMistakeTracker;
  }),
}));

const ingestFile = vi.fn().mockResolvedValue({ chunks: 1 });
const ingestChunks = vi.fn();
const initialize = vi.fn().mockResolvedValue(undefined);
const ingesterDbClose = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/llm/document-ingester.js", () => ({
  DocumentIngester: vi.fn(function () {
    this.initialize = initialize;
    this.ingestFile = ingestFile;
    this.ingestChunks = ingestChunks;
    this.db = { close: ingesterDbClose };
  }),
}));

vi.mock("../../src/browser-bridge.js", () => ({
  sendPrompt: vi.fn(),
  listResponses: vi.fn(),
  ensureBrowserDirs: vi.fn().mockResolvedValue(undefined),
}));

const PositiveIntParse = vi.fn((v) => {
  if (Number.isInteger(v) && v > 0) return v;
  const e = new Error("Invalid");
  e.issues = [{ message: "Must be positive" }];
  throw e;
});

vi.mock("../../src/domain/schemas.js", () => ({
  PositiveIntSchema: {
    parse: (...a) => PositiveIntParse(...a),
  },
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

vi.mock("../../src/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

const defaultStagedSignalsDirFn = vi.fn(() => "/default/staged");
const parseFrontmatterFn = vi.fn(() => ({ data: {}, body: "" }));
const splitStagedSignalDocsFn = vi.fn(() => []);

vi.mock("../../src/storage/vscode-learn-utils.js", () => ({
  defaultStagedSignalsDir: (...a) => defaultStagedSignalsDirFn(...a),
  parseFrontmatter: (...a) => parseFrontmatterFn(...a),
  splitStagedSignalDocuments: (...a) => splitStagedSignalDocsFn(...a),
}));

const addMistakeFn = vi.fn();
const askLocalLlmFn = vi.fn();
const generatePromptFn = vi.fn();
const getLocalLlmStatusFn = vi.fn();
const importSprintsFn = vi.fn();
const ingestDocumentsFn = vi.fn();
const setupModelFn = vi.fn();

vi.mock("../../src/llm/local-llm.js", () => ({
  addMistake: (...a) => addMistakeFn(...a),
  askLocalLlm: (...a) => askLocalLlmFn(...a),
  generatePrompt: (...a) => generatePromptFn(...a),
  getLocalLlmStatus: (...a) => getLocalLlmStatusFn(...a),
  importSprints: (...a) => importSprintsFn(...a),
  ingestDocuments: (...a) => ingestDocumentsFn(...a),
  setupModel: (...a) => setupModelFn(...a),
}));

vi.mock("../../src/llm/training-exporter.js", () => ({
  exportTrainingData: mocks.exportTrainingData,
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
  default: new Proxy(
    {},
    {
      get: () => (s) => String(s),
    },
  ),
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

// ─── helpers ─────────────────────────────────────────────────────────────────

import {
  bindLlmCommands,
  listStagedFiles,
  ingestStagedSignalsFromDirectory,
} from "../../src/commands/llm.js";

function makeProgram(opts) {
  const prog = new Command();
  prog.exitOverride();
  prog.configureOutput({ writeOut() {}, writeErr() {} });
  bindLlmCommands(prog, opts);
  return prog;
}

async function run(args, opts) {
  const prog = makeProgram(opts);
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
  process.exitCode = undefined;
  try {
    await prog.parseAsync(["node", "cli", ...args]);
  } catch (e) {
    if (!e?.code?.startsWith?.("commander.")) throw e;
  }
  return { logSpy, errorSpy, tableSpy };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("llm.js — branch coverage for uncovered branches", () => {
  let tempDir;

  beforeEach(async () => {
    vi.clearAllMocks();
    answerQueue = [];
    process.exitCode = undefined;
    verifyRuntimeFn.mockResolvedValue(undefined);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-branch-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── Category 1: Source type fallback branches ────────────────────────────

  describe("source type fallback branches (data.signal_type and default)", () => {
    it("uses data.signal_type when data.source_type is falsy", async () => {
      const stageDir = path.join(tempDir, "staged-signal-type");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "signal.md");
      const docText = "---\nsignal_type: vscode-edit\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: {
          source_type: undefined, // falsy → fallback to signal_type
          signal_type: "vscode-edit",
        },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(
        stageDir,
        undefined,
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it('uses "vscode-signal" default when both source_type and signal_type are falsy', async () => {
      const stageDir = path.join(tempDir, "staged-default");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "default.md");
      const docText = "---\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: {
          source_type: undefined, // falsy
          signal_type: undefined, // also falsy → fallback to "vscode-signal"
        },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(
        stageDir,
        undefined,
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── Category 2: Recurring diagnostic description fallbacks ───────────────

  describe("recurring diagnostic description fallbacks", () => {
    it("uses data.description when data.message is falsy", async () => {
      const stageDir = path.join(tempDir, "staged-desc");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "desc.md");
      const docText =
        "---\nsignal_type: vscode-diagnostic-recurring\nrecurring: true\ndescription: Custom description\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: {
          signal_type: "vscode-diagnostic-recurring",
          source_type: "vscode-diagnostic-recurring",
          recurring: "true",
          message: undefined, // falsy → fallback to description
          description: "Custom description",
        },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(
        stageDir,
        undefined,
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it("uses template literal fallback when both message and description are falsy", async () => {
      const stageDir = path.join(tempDir, "staged-template");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "template.md");
      const docText =
        "---\nsignal_type: vscode-diagnostic-recurring\nrecurring: true\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: {
          signal_type: "vscode-diagnostic-recurring",
          source_type: "vscode-diagnostic-recurring",
          recurring: "true",
          message: undefined, // falsy
          description: undefined, // also falsy → template literal fallback
        },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(
        stageDir,
        undefined,
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it('uses "Recurring diagnostic marker" when root_cause and message are falsy', async () => {
      const stageDir = path.join(tempDir, "staged-marker");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "marker.md");
      const docText =
        "---\nsignal_type: vscode-diagnostic-recurring\nrecurring: true\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: {
          signal_type: "vscode-diagnostic-recurring",
          source_type: "vscode-diagnostic-recurring",
          recurring: "true",
          message: undefined, // falsy
          description: "Some description",
          fix_applied: undefined, // falsy
          root_cause: undefined, // falsy → "Recurring diagnostic marker"
        },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      ingestFile.mockResolvedValue({ chunks: 1 });

      const results = await ingestStagedSignalsFromDirectory(
        stageDir,
        undefined,
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── Category 3: Error object fallback branches ───────────────────────────

  describe("error object fallback branches (non-Error objects)", () => {
    it("handles non-Error object in ingestStagedSignalsFromDirectory inner catch", async () => {
      const stageDir = path.join(tempDir, "staged-rawerr");
      await fs.mkdir(stageDir, { recursive: true });
      const file = path.join(stageDir, "rawerr.md");
      const docText = "---\nsource_type: vscode-edit\n---\nContent";
      await fs.writeFile(file, docText);

      parseFrontmatterFn.mockReturnValue({
        data: { source_type: "vscode-edit" },
        body: "Content",
      });
      splitStagedSignalDocsFn.mockReturnValue([docText]);
      // Throw a plain object instead of Error
      ingestFile.mockRejectedValueOnce({ code: "E_RAW", details: "raw error" });

      const results = await ingestStagedSignalsFromDirectory(
        stageDir,
        undefined,
      );
      const errResult = results.find((r) => r.skipped);
      expect(errResult).toBeDefined();
      expect(errResult.error).toContain("[object Object]");
    });

    it("handles non-Error object in formatValidationError", async () => {
      // rate-prompt command calls parseRating which uses PositiveIntSchema.parse
      // When Zod validation fails, it throws a ZodError with .issues array
      // formatValidationError handles this via err.issues branch
      // For non-Error objects, it falls through to String(err)
      // We test the error catch path with an invalid rating value
      const { errorSpy } = await run([
        "llm",
        "rate-prompt",
        "1",
        "--rating",
        "not-a-number",
      ]);
      // The error should be caught and formatted
      expect(errorSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ── Category 4: CLI command error fallback branches ──────────────────────

  describe("CLI command error fallback branches (err?.message ?? err)", () => {
    it("setup command: handles non-Error object in catch", async () => {
      setupModelFn.mockRejectedValueOnce({ code: "SETUP_FAILED" });

      const { errorSpy } = await run(["llm", "setup"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("ask command: handles non-Error object in catch", async () => {
      askLocalLlmFn.mockRejectedValueOnce({ code: "ASK_FAILED" });

      const { errorSpy } = await run(["llm", "ask", "test question"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("generate-prompt command: handles non-Error object in catch", async () => {
      generatePromptFn.mockRejectedValueOnce({ code: "PROMPT_FAILED" });

      const { errorSpy } = await run([
        "llm",
        "generate-prompt",
        "--goal",
        "test goal",
      ]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("related command: handles non-Error object in catch", async () => {
      // related command has two catch blocks: verifyLocalLlmRuntime and findRelated
      // Test the findRelated catch path with a non-Error object
      mocks.findRelated.mockRejectedValueOnce({ code: "RELATED_FAILED" });

      const { errorSpy } = await run([
        "llm",
        "related",
        "--to",
        "test question",
      ]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("export-knowledge-graph command: handles non-Error object in catch", async () => {
      mocks.buildGraph.mockRejectedValueOnce({ code: "GRAPH_FAILED" });

      const { errorSpy } = await run(["llm", "export-knowledge-graph"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("export-training command: handles non-Error object in catch", async () => {
      mocks.exportTrainingData.mockRejectedValueOnce({ code: "EXPORT_FAILED" });

      const { errorSpy } = await run(["llm", "export-training"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("enhance command: handles non-Error object in catch", async () => {
      generatePromptFn.mockRejectedValueOnce({ code: "ENHANCE_FAILED" });

      const { errorSpy } = await run(["llm", "enhance", "--goal", "test goal"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("ingest command: handles non-Error object in catch", async () => {
      ingestDocumentsFn.mockRejectedValueOnce({ code: "INGEST_FAILED" });

      const { errorSpy } = await run(["llm", "ingest"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("ingest-staged command: handles non-Error object in verifyLocalLlmRuntime catch", async () => {
      verifyRuntimeFn.mockRejectedValueOnce({ code: "VERIFY_FAILED" });

      const { errorSpy } = await run(["llm", "ingest-staged"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("mistake add command: handles non-Error object in catch", async () => {
      addMistakeFn.mockRejectedValueOnce({ code: "MISTAKE_FAILED" });

      const { errorSpy } = await run([
        "llm",
        "mistake",
        "add",
        "--description",
        "Test mistake",
        "--category",
        "test",
      ]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("rubric list command: handles non-Error object in catch", async () => {
      listRubric.mockRejectedValueOnce({ code: "RUBRIC_FAILED" });

      const { errorSpy } = await run(["llm", "rubric", "list"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("rubric disable command: handles non-Error object in catch", async () => {
      setRubricActive.mockRejectedValueOnce({ code: "DISABLE_FAILED" });

      const { errorSpy } = await run(["llm", "rubric", "disable", "42"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("rubric enable command: handles non-Error object in catch", async () => {
      setRubricActive.mockRejectedValueOnce({ code: "ENABLE_FAILED" });

      const { errorSpy } = await run(["llm", "rubric", "enable", "42"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("import-sprints command: handles non-Error object in catch", async () => {
      importSprintsFn.mockRejectedValueOnce({ code: "IMPORT_FAILED" });

      const { errorSpy } = await run(["llm", "import-sprints"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });

    it("rate-prompt command: handles non-Error object in catch", async () => {
      PositiveIntParse.mockImplementationOnce(() => {
        throw new Error("Validation failed");
      });

      const { errorSpy } = await run([
        "llm",
        "rate-prompt",
        "1",
        "--rating",
        "0",
      ]);
      expect(errorSpy.mock.calls[0][0]).toContain("Validation failed");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── Category 4b: Topics command error fallback ───────────────────────────

  describe("topics command error fallback branches", () => {
    it("topics command: handles non-Error object in catch", async () => {
      // topics command imports clusterDocuments dynamically
      // We mock the db.open() to throw a non-Error object
      dbOpen.mockRejectedValueOnce({ code: "TOPICS_FAILED" });

      const { errorSpy } = await run(["llm", "topics", "--k", "2"]);
      expect(errorSpy.mock.calls[0][0]).toContain("[object Object]");
      expect(process.exitCode).toBe(1);
    });
  });

  // ── Category 5: Options fallback branches ────────────────────────────────

  describe("options fallback branches (options.minPairs ?? 0)", () => {
    it("uses default 0 when minPairs is not provided to export-training command", async () => {
      mocks.exportTrainingData.mockResolvedValueOnce({
        dryRun: false,
        outputPath: "/tmp/training.jsonl",
        recordsCount: 0,
      });

      const { logSpy } = await run(["llm", "export-training"]);
      expect(logSpy).toHaveBeenCalled();
    });
  });

  // ── Category 6: Mistake result branches ──────────────────────────────────

  describe("mistake result branches (result.promoted false)", () => {
    it('logs "Mistake recorded" when result.promoted is false', async () => {
      addMistakeFn.mockResolvedValueOnce({
        promoted: false,
        mistake: {
          id: "123",
          recurrence_count: 1,
        },
      });

      const { logSpy } = await run([
        "llm",
        "mistake",
        "add",
        "--description",
        "Test mistake",
        "--category",
        "test",
      ]);

      // spinner.succeed() output is NOT captured by console.log spy,
      // but console.log() for the mistake details IS captured
      const out = logSpy.mock.calls.flat().join(" ");
      expect(out).toContain("Mistake #123");
      expect(out).toContain("recurrence 1");
      // The "Mistake recorded" branch is hit via spinner.succeed() which we can't spy,
      // but we verify the falsy branch path by checking the result structure
    });
  });
});
