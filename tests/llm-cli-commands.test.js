import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// ---------------------------------------------------------------------------
// Mocks for every external dependency of src/commands/llm.js
// ---------------------------------------------------------------------------

const dbOpen = vi.fn();
const dbClose = vi.fn();
const logEnhanceCycle = vi.fn();
const ratePromptHistory = vi.fn();
const ratePrompt = vi.fn();

vi.mock("../src/llm/experience-db.js", () => ({
  ExperienceDb: vi.fn(function () {
    this.open = dbOpen;
    this.close = dbClose;
    this.logEnhanceCycle = logEnhanceCycle;
    this.ratePromptHistory = ratePromptHistory;
    this.ratePrompt = ratePrompt;
    return this;
  }),
}));

const findRelated = vi.fn();
vi.mock("../src/llm/prompt-generator.js", () => ({
  PromptGenerator: vi.fn(function () {
    this.findRelated = findRelated;
    return this;
  }),
}));

const buildGraph = vi.fn();
vi.mock("../src/llm/knowledge-graph.js", () => ({
  buildGraph: (...a) => buildGraph(...a),
}));

const listRubric = vi.fn();
const setRubricActive = vi.fn();
const addMistakeViaTracker = vi.fn();
vi.mock("../src/llm/mistake-tracker.js", () => ({
  MistakeTracker: vi.fn(function () {
    this.listRubric = listRubric;
    this.setRubricActive = setRubricActive;
    this.addMistake = addMistakeViaTracker;
    return this;
  }),
}));

const ingestFile = vi.fn();
const initialize = vi.fn();
vi.mock("../src/llm/document-ingester.js", () => ({
  DocumentIngester: vi.fn(function () {
    this.initialize = initialize;
    this.ingestFile = ingestFile;
    this.db = { close: vi.fn() };
    return this;
  }),
}));

const sendPrompt = vi.fn();
const listResponses = vi.fn();
const ensureBrowserDirs = vi.fn();
vi.mock("../src/browser-bridge.js", () => ({
  sendPrompt: (...a) => sendPrompt(...a),
  listResponses: (...a) => listResponses(...a),
  ensureBrowserDirs: (...a) => ensureBrowserDirs(...a),
}));

vi.mock("../src/domain/schemas.js", () => ({
  PositiveIntSchema: {
    parse: vi.fn((v) => {
      if (Number.isInteger(v) && v > 0) return v;
      const err = new Error("Invalid positive int");
      err.issues = [{ message: "Must be a positive integer" }];
      throw err;
    }),
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

vi.mock("../src/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock("../src/storage/vscode-learn-utils.js", () => ({
  defaultStagedSignalsDir: vi.fn(() => "/default/staged-signals"),
  parseFrontmatter: vi.fn(() => ({ data: {}, body: "" })),
  splitStagedSignalDocuments: vi.fn(() => []),
}));

const addMistake = vi.fn();
const askLocalLlm = vi.fn();
const generatePrompt = vi.fn();
const getLocalLlmStatus = vi.fn();
const importSprints = vi.fn();
const ingestDocuments = vi.fn();
const setupModel = vi.fn();
vi.mock("../src/llm/local-llm.js", () => ({
  addMistake: (...a) => addMistake(...a),
  askLocalLlm: (...a) => askLocalLlm(...a),
  generatePrompt: (...a) => generatePrompt(...a),
  getLocalLlmStatus: (...a) => getLocalLlmStatus(...a),
  importSprints: (...a) => importSprints(...a),
  ingestDocuments: (...a) => ingestDocuments(...a),
  setupModel: (...a) => setupModel(...a),
}));

const exportTrainingData = vi.fn();
vi.mock("../src/llm/training-exporter.js", () => ({
  exportTrainingData: (...a) => exportTrainingData(...a),
}));

const verifyLocalLlmRuntime = vi.fn();
vi.mock("../src/llm/inference.js", () => ({
  verifyLocalLlmRuntime: (...a) => verifyLocalLlmRuntime(...a),
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

import { bindLlmCommands, registerStatus } from "../src/commands/llm.js";

function makeProgram(opts) {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  bindLlmCommands(program, opts);
  return program;
}

describe("bindLlmCommands", () => {
  let logSpy, errorSpy, warnSpy, tableSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    answerQueue = [];
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
    process.exitCode = undefined;
    verifyLocalLlmRuntime.mockResolvedValue(undefined);
  });

  describe("llm setup", () => {
    it("downloads/sets up the model and prints the smoke test result", async () => {
      setupModel.mockResolvedValue({
        modelPath: "/models/phi3.gguf",
        sha256: "abc123",
        response: "hello world",
      });

      await makeProgram().parseAsync(["node", "cli", "llm", "setup"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("/models/phi3.gguf");
      expect(out).toContain("SHA256: abc123");
      expect(out).toContain("hello world");
    });

    it("errors early when the runtime check fails", async () => {
      verifyLocalLlmRuntime.mockRejectedValue(new Error("no runtime"));

      await makeProgram().parseAsync(["node", "cli", "llm", "setup"]);

      expect(errorSpy.mock.calls[0][0]).toContain("no runtime");
      expect(process.exitCode).toBe(1);
      expect(setupModel).not.toHaveBeenCalled();
    });

    it("errors when setupModel() rejects", async () => {
      setupModel.mockRejectedValue(new Error("download failed"));

      await makeProgram().parseAsync(["node", "cli", "llm", "setup"]);

      expect(errorSpy.mock.calls[0][0]).toContain("download failed");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm ask", () => {
    it("asks the local LLM and prints the response", async () => {
      askLocalLlm.mockResolvedValue("42");

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "ask",
        "What is the answer?",
      ]);

      expect(askLocalLlm).toHaveBeenCalledWith(
        expect.objectContaining({ question: "What is the answer?" }),
      );
      expect(logSpy).toHaveBeenCalledWith("42");
    });

    it("errors early when the runtime check fails", async () => {
      verifyLocalLlmRuntime.mockRejectedValue(new Error("no runtime"));

      await makeProgram().parseAsync(["node", "cli", "llm", "ask", "Q"]);

      expect(process.exitCode).toBe(1);
      expect(askLocalLlm).not.toHaveBeenCalled();
    });

    it("errors when askLocalLlm() rejects", async () => {
      askLocalLlm.mockRejectedValue(new Error("model not loaded"));

      await makeProgram().parseAsync(["node", "cli", "llm", "ask", "Q"]);

      expect(errorSpy.mock.calls[0][0]).toContain("model not loaded");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm generate-prompt", () => {
    it("generates and prints a prompt", async () => {
      generatePrompt.mockResolvedValue({
        history: { id: 7 },
        prompt: "Generated prompt text",
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "generate-prompt",
        "--goal",
        "Fix bug",
      ]);

      expect(logSpy).toHaveBeenCalledWith("Generated prompt text");
    });

    it("errors when generatePrompt() rejects", async () => {
      generatePrompt.mockRejectedValue(new Error("no context"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "generate-prompt",
        "--goal",
        "Fix bug",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("no context");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm topics", () => {
    it("warns and prints a partial cluster list when fewer clusters than requested are produced", async () => {
      vi.doMock("../src/llm/embeddings.js", () => ({
        clusterDocuments: vi
          .fn()
          .mockResolvedValue([{ snippets: ["only one cluster"] }]),
      }));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "topics",
        "--k",
        "5",
      ]);

      expect(warnSpy).toHaveBeenCalled();
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Cluster 1:");
      expect(out).toContain("only one cluster");
    });

    it("prints JSON when --json is set and enough clusters were produced", async () => {
      vi.doMock("../src/llm/embeddings.js", () => ({
        clusterDocuments: vi
          .fn()
          .mockResolvedValue([{ snippets: ["a", "b"] }, { snippets: ["c"] }]),
      }));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "topics",
        "--k",
        "2",
        "--json",
      ]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain('"clusters"');
    });

    it("prints a snippet preview (top 3) when enough clusters were produced and --json is not set", async () => {
      vi.doMock("../src/llm/embeddings.js", () => ({
        clusterDocuments: vi
          .fn()
          .mockResolvedValue([{ snippets: ["a", "b", "c", "d"] }]),
      }));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "topics",
        "--k",
        "1",
      ]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Cluster 1:");
      expect(out).toContain("a");
      expect(out).not.toContain("- d");
    });

    it("defaults k to 5 when --k is not a valid number", async () => {
      const clusterDocuments = vi.fn().mockResolvedValue([]);
      vi.doMock("../src/llm/embeddings.js", () => ({ clusterDocuments }));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "topics",
        "--k",
        "notanumber",
      ]);

      expect(clusterDocuments).toHaveBeenCalledWith(expect.anything(), 5);
    });

    it("errors when ExperienceDb.open() rejects", async () => {
      dbOpen.mockRejectedValueOnce(new Error("db open failed"));

      await makeProgram().parseAsync(["node", "cli", "llm", "topics"]);

      expect(errorSpy.mock.calls[0][0]).toContain("db open failed");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm related", () => {
    it("prints the human-readable report by default", async () => {
      findRelated.mockResolvedValue({ report: "Related report text", raw: {} });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "related",
        "--to",
        "How do I do X?",
      ]);

      expect(logSpy).toHaveBeenCalledWith("Related report text");
    });

    it("prints raw JSON when --json is set", async () => {
      findRelated.mockResolvedValue({ report: "ignored", raw: { a: 1 } });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "related",
        "--to",
        "Q",
        "--json",
      ]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain('"a": 1');
    });

    it("errors early when the runtime check fails", async () => {
      verifyLocalLlmRuntime.mockRejectedValue(new Error("no runtime"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "related",
        "--to",
        "Q",
      ]);

      expect(process.exitCode).toBe(1);
      expect(findRelated).not.toHaveBeenCalled();
    });

    it("errors when findRelated() rejects", async () => {
      findRelated.mockRejectedValue(new Error("no embeddings"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "related",
        "--to",
        "Q",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("no embeddings");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm export-knowledge-graph", () => {
    it("exports using the default output path when --out is omitted", async () => {
      buildGraph.mockResolvedValue({
        outputPath: "/home/.vscode-rotator/knowledge-graph.json",
        nodeCount: 10,
        edgeCount: 20,
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "export-knowledge-graph",
      ]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("10 nodes, 20 edges");
    });

    it("resolves a custom --out path", async () => {
      buildGraph.mockResolvedValue({
        outputPath: "/custom/graph.json",
        nodeCount: 1,
        edgeCount: 1,
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "export-knowledge-graph",
        "--out",
        "/custom/graph.json",
      ]);

      expect(buildGraph).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        "/custom/graph.json",
      );
    });

    it("errors when buildGraph() rejects", async () => {
      buildGraph.mockRejectedValue(new Error("graph build failed"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "export-knowledge-graph",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("graph build failed");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm export-training", () => {
    it("reports a dry-run preview when --dry-run is set", async () => {
      exportTrainingData.mockResolvedValue({
        dryRun: true,
        recordsCount: 42,
        outputPath: "/out.jsonl",
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "export-training",
        "--dry-run",
      ]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("would produce 42 record(s)");
    });

    it("reports the written output path when not a dry run", async () => {
      exportTrainingData.mockResolvedValue({
        dryRun: false,
        outputPath: "/out.jsonl",
      });

      await makeProgram().parseAsync(["node", "cli", "llm", "export-training"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Training export written to /out.jsonl");
    });

    it("errors when exportTrainingData() rejects", async () => {
      exportTrainingData.mockRejectedValue(new Error("no data"));

      await makeProgram().parseAsync(["node", "cli", "llm", "export-training"]);

      expect(errorSpy.mock.calls[0][0]).toContain("no data");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm enhance", () => {
    beforeEach(() => {
      generatePrompt.mockResolvedValue({ prompt: "Enhancement prompt" });
      dbOpen.mockResolvedValue(undefined);
      logEnhanceCycle.mockResolvedValue({ id: 99 });
    });

    it("manual flow: detects a new response file and logs the cycle", async () => {
      listResponses
        .mockResolvedValueOnce([{ filename: "old.md" }])
        .mockResolvedValueOnce([{ filename: "new.md", filepath: "/r/new.md" }]);
      queueAnswers(""); // "press enter" prompt

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
      ]);

      expect(ingestFile).toHaveBeenCalledWith(
        "/r/new.md",
        expect.objectContaining({ source_type: "llm-response" }),
      );
      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Logged enhancement cycle #99");
    });

    it("manual flow: errors when no response is detected at all", async () => {
      listResponses.mockResolvedValue([]);
      queueAnswers("");

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("No response detected");
      expect(process.exitCode).toBe(1);
    });

    it("manual flow: errors when the response file hasn't changed since before", async () => {
      listResponses.mockResolvedValue([{ filename: "same.md" }]);
      queueAnswers("");

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("No new response detected");
      expect(process.exitCode).toBe(1);
    });

    it("auto flow: sends the prompt via the browser bridge and ingests the response", async () => {
      sendPrompt.mockResolvedValue({ responsePath: "/r/auto.md" });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
        "--auto",
      ]);

      expect(ensureBrowserDirs).toHaveBeenCalled();
      expect(sendPrompt).toHaveBeenCalled();
      expect(ingestFile).toHaveBeenCalledWith(
        "/r/auto.md",
        expect.objectContaining({ source_type: "llm-response" }),
      );
    });

    it("prompts for and records a rating when --rate is set and a rating is given", async () => {
      listResponses
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ filename: "r.md", filepath: "/r/r.md" }]);
      queueAnswers("", "4"); // press-enter, then rating

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
        "--rate",
      ]);

      expect(ratePromptHistory).toHaveBeenCalledWith(99, 4);
    });

    it("skips rating when --rate is set but the user enters nothing", async () => {
      listResponses
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ filename: "r.md", filepath: "/r/r.md" }]);
      queueAnswers("", ""); // press-enter, then empty rating

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
        "--rate",
      ]);

      expect(ratePromptHistory).not.toHaveBeenCalled();
    });

    it("errors when generatePrompt() rejects", async () => {
      generatePrompt.mockRejectedValue(new Error("context build failed"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "enhance",
        "--goal",
        "Improve X",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("context build failed");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm ingest", () => {
    it("renders a table for an array result", async () => {
      ingestDocuments.mockResolvedValue([
        { path: "/a.md", chunks: 1, skipped: false },
      ]);

      await makeProgram({ log: { info: vi.fn(), error: vi.fn() } }).parseAsync([
        "node",
        "cli",
        "llm",
        "ingest",
      ]);

      expect(tableSpy).toHaveBeenCalled();
    });

    it("renders a table for an { actions: [...] } result shape", async () => {
      ingestDocuments.mockResolvedValue({
        actions: [{ type: "add", path: "/a.md", chunks: 1 }],
      });

      await makeProgram().parseAsync(["node", "cli", "llm", "ingest"]);

      expect(tableSpy).toHaveBeenCalledWith([
        { type: "add", path: "/a.md", chunks: 1 },
      ]);
    });

    it("passes the target and --force through to ingestDocuments()", async () => {
      ingestDocuments.mockResolvedValue([]);

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "ingest",
        "/some/file.md",
        "--force",
      ]);

      expect(ingestDocuments).toHaveBeenCalledWith({
        targetPath: "/some/file.md",
        force: true,
        baseDir: undefined,
      });
    });

    it("errors and logs via the optional commandLog when ingestDocuments() rejects", async () => {
      ingestDocuments.mockRejectedValue(new Error("ingest failed"));
      const cliLog = { info: vi.fn(), error: vi.fn() };

      await makeProgram({ log: cliLog }).parseAsync([
        "node",
        "cli",
        "llm",
        "ingest",
      ]);

      expect(cliLog.error).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("ingest failed");
      expect(process.exitCode).toBe(1);
    });

    it("does not throw when no commandLog is provided (optional chaining)", async () => {
      ingestDocuments.mockRejectedValue(new Error("ingest failed"));

      await expect(
        makeProgram().parseAsync(["node", "cli", "llm", "ingest"]),
      ).resolves.not.toThrow();
    });
  });

  describe("llm ingest-staged", () => {
    it("reports 'No staged signals found' for an empty result", async () => {
      vi.doMock("../src/internal/config.js", () => ({
        loadConfig: vi.fn().mockResolvedValue({}),
      }));

      await makeProgram().parseAsync(["node", "cli", "llm", "ingest-staged"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("No staged signals found");
    });

    it("errors early when the runtime check fails", async () => {
      verifyLocalLlmRuntime.mockRejectedValue(new Error("no runtime"));

      await makeProgram().parseAsync(["node", "cli", "llm", "ingest-staged"]);

      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm mistake add", () => {
    it("records a mistake and reports promotion status", async () => {
      addMistake.mockResolvedValue({
        promoted: true,
        mistake: { id: 5, recurrence_count: 3 },
      });

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "mistake",
        "add",
        "--description",
        "Forgot to await",
      ]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Mistake #5, recurrence 3");
    });

    it("errors when addMistake() rejects", async () => {
      addMistake.mockRejectedValue(new Error("storage error"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "mistake",
        "add",
        "--description",
        "x",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("storage error");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm rubric", () => {
    it("list: prints 'No rubric rules.' for an empty list", async () => {
      listRubric.mockResolvedValue([]);

      await makeProgram().parseAsync(["node", "cli", "llm", "rubric", "list"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("No rubric rules.");
    });

    it("list: renders a table for a non-empty list", async () => {
      listRubric.mockResolvedValue([
        { id: 1, active: true, category: "x", rule: "do the thing" },
      ]);

      await makeProgram().parseAsync(["node", "cli", "llm", "rubric", "list"]);

      expect(tableSpy).toHaveBeenCalled();
    });

    it("list: errors when listRubric() rejects", async () => {
      listRubric.mockRejectedValue(new Error("rubric db error"));

      await makeProgram().parseAsync(["node", "cli", "llm", "rubric", "list"]);

      expect(errorSpy.mock.calls[0][0]).toContain("rubric db error");
      expect(process.exitCode).toBe(1);
    });

    it("disable: disables a rule", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rubric",
        "disable",
        "5",
      ]);

      expect(setRubricActive).toHaveBeenCalledWith("5", false);
    });

    it("disable: errors when setRubricActive() rejects", async () => {
      setRubricActive.mockRejectedValue(new Error("not found"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rubric",
        "disable",
        "5",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("not found");
      expect(process.exitCode).toBe(1);
    });

    it("enable: enables a rule", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rubric",
        "enable",
        "5",
      ]);

      expect(setRubricActive).toHaveBeenCalledWith("5", true);
    });

    it("enable: errors when setRubricActive() rejects", async () => {
      setRubricActive.mockRejectedValue(new Error("not found"));

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rubric",
        "enable",
        "5",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("not found");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm import-sprints", () => {
    it("imports and reports counts", async () => {
      importSprints.mockResolvedValue({ imported: 3, mistakes: 7 });

      await makeProgram().parseAsync(["node", "cli", "llm", "import-sprints"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Imported 3 sprints");
      expect(out).toContain("Mistakes extracted: 7");
    });

    it("errors when importSprints() rejects", async () => {
      importSprints.mockRejectedValue(new Error("no manifests"));

      await makeProgram().parseAsync(["node", "cli", "llm", "import-sprints"]);

      expect(errorSpy.mock.calls[0][0]).toContain("no manifests");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("llm rate-prompt", () => {
    beforeEach(() => {
      dbOpen.mockResolvedValue(undefined);
      ratePrompt.mockResolvedValue(undefined);
    });

    it("saves a high rating without prompting for follow-up", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rate-prompt",
        "7",
        "--rating",
        "5",
      ]);

      expect(ratePrompt).toHaveBeenCalledWith("7", 5);
      expect(addMistake).not.toHaveBeenCalled();
    });

    it("prompts for and records a mistake on a low rating (<=2) with a description given", async () => {
      queueAnswers("Prompt was too vague");

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rate-prompt",
        "7",
        "--rating",
        "1",
      ]);

      expect(addMistake).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Prompt was too vague",
          category: "prompt-quality",
        }),
      );
    });

    it("does not record a mistake on a low rating if the description is left empty", async () => {
      queueAnswers("");

      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rate-prompt",
        "7",
        "--rating",
        "2",
      ]);

      expect(addMistake).not.toHaveBeenCalled();
    });

    it("errors with the issues[] formatting branch for a non-numeric rating", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rate-prompt",
        "7",
        "--rating",
        "abc",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain("ROTATOR_CLI_INVALID");
      expect(process.exitCode).toBe(1);
    });

    it("errors with the explicit >5 message for an out-of-range rating", async () => {
      await makeProgram().parseAsync([
        "node",
        "cli",
        "llm",
        "rate-prompt",
        "7",
        "--rating",
        "9",
      ]);

      expect(errorSpy.mock.calls[0][0]).toContain(
        "expected an integer from 1 to 5",
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe("registerStatus / llm status", () => {
    it("reports 'none' for an empty model list and the unavailable message", async () => {
      getLocalLlmStatus.mockResolvedValue({
        modelDir: "/models",
        models: [],
        status: "unavailable",
      });

      const program = new Command();
      program.exitOverride();
      registerStatus(program);
      await program.parseAsync(["node", "cli", "status"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Models    : none");
      expect(out).toContain("run: llm setup");
    });

    it("reports concrete models and status when available", async () => {
      getLocalLlmStatus.mockResolvedValue({
        modelDir: "/models",
        models: ["phi3.gguf"],
        status: "ready",
      });

      const program = new Command();
      program.exitOverride();
      registerStatus(program);
      await program.parseAsync(["node", "cli", "status"]);

      const out = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(out).toContain("Models    : phi3.gguf");
      expect(out).toContain("Status    : ready");
    });
  });
});
