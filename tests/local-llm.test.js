import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentIngester } from "../src/llm/document-ingester.js";
import { ExperienceDb } from "../src/llm/experience-db.js";
import { MistakeTracker } from "../src/llm/mistake-tracker.js";
import { PromptGenerator } from "../src/llm/prompt-generator.js";
import { LocalLlmInference } from "../src/llm/inference.js";
import { ingestStagedSignalsFromDirectory } from "../src/commands/llm.js";

describe("Local Dev-LLM", () => {
  let tempDir;
  let oldMock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-llm-test-"));
    oldMock = process.env.VSCODE_ROTATOR_MOCK_LLM;
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (oldMock == null) delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    else process.env.VSCODE_ROTATOR_MOCK_LLM = oldMock;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("ingests only new and changed snapshot documents", async () => {
    const docsDir = path.join(tempDir, "docs");
    const stateDir = path.join(tempDir, "state");
    await fs.mkdir(docsDir, { recursive: true });
    const guide = path.join(docsDir, "guide.md");
    await fs.writeFile(guide, "# Guide\nUse the account health endpoint.", "utf8");

    const snapshotPath = path.join(stateDir, "storage-snapshot.json");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        lastScan: "2026-05-19T00:00:00.000Z",
        paths: {
          [guide]: { ts: "2026-05-19T00:00:00.000Z", ingestible: true }
        }
      }),
      "utf8"
    );

    const ingester = new DocumentIngester({ baseDir: stateDir });
    const first = await ingester.ingestFromSnapshot({ snapshotPath });
    const second = await ingester.ingestFromSnapshot({ snapshotPath });

    expect(first.ingested).toBe(1);
    expect(first.actions[0]).toMatchObject({ type: "new", chunks: 1 });
    expect(second.actions).toEqual([]);
  });

  it("promotes recurring mistakes into rubric rules", async () => {
    const tracker = new MistakeTracker({ baseDir: tempDir });
    await tracker.addMistake({
      description: "Forgot to await async call",
      category: "api-misuse",
      fix: "Added await"
    });
    await tracker.addMistake({
      description: "Forgot to await async call",
      category: "api-misuse",
      fix: "Added await"
    });
    const third = await tracker.addMistake({
      description: "Forgot to await async call",
      category: "api-misuse",
      fix: "Added await"
    });

    const rules = await tracker.listRubric();
    expect(third.promoted).toBe(true);
    expect(rules[0].rule).toContain("Forgot to await async call");
  });

  it("generates prompts with document, sprint, idea, and rubric context", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();
    await db.upsertSprint({
      id: "sprint-1",
      date: "2026-05-19T00:00:00.000Z",
      agent: "chatgpt",
      goal: "Build health checks",
      completed_tasks: [{ description: "Added storage monitor" }],
      pending_tasks: [{ description: "Add endpoint" }],
      files_changed: ["src/health.js"],
      tests_failed: [],
      status: "paused"
    });
    await db.addRubricRule({ rule: "Always await async calls.", category: "api-misuse" });
    await db.replaceDocumentsForFile(path.join(tempDir, "guide.md"), [
      {
        content: "Account health endpoints should return status and reset time.",
        embedding: Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)),
        source_type: "md",
        file_ts: "2026-05-19T00:00:00.000Z"
      }
    ]);
    await db.close();

    const generator = new PromptGenerator({
      baseDir: tempDir,
      inference: new LocalLlmInference({ baseDir: tempDir })
    });
    const result = await generator.generate({
      goal: "Add REST endpoint for account health",
      project: "vscode-rotator",
      platform: "chatgpt"
    });

    expect(result.prompt).toContain("Always await async calls");
    expect(result.prompt).toContain("Build health checks");
    expect(result.history.id).toBe(1);
  });

  it("persists source_type and platform and prepends recent LLM responses", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();

    const responseFile = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-19T10-30-45-chatgpt.md");
    await fs.mkdir(path.dirname(responseFile), { recursive: true });
    const responseRows = await db.replaceDocumentsForFile(responseFile, [
      {
        content: "ChatGPT responded with a helpful answer.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        file_ts: "2026-05-19T10:30:45.000Z"
      }
    ]);

    expect(responseRows[0].source_type).toBe("llm-response");
    expect(responseRows[0].platform).toBe("chatgpt");

    const staticFile = path.join(tempDir, "guide.md");
    await db.replaceDocumentsForFile(staticFile, [
      {
        content: "Project documentation content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "md",
        file_ts: "2026-05-19T00:00:00.000Z"
      }
    ]);

    await db.close();

    const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(),
      embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0))
    };

    const generator = new PromptGenerator({ baseDir: tempDir, inference: mockInference, embeddings: mockEmbeddings });
    await generator.generate({ goal: "Leverage recent chatgpt response", project: "vscode-rotator", platform: "chatgpt" });

    expect(mockInference.generate).toHaveBeenCalled();
    const systemPrompt = mockInference.generate.mock.calls[0][0].system;
    expect(systemPrompt).toContain("### Recent LLM Responses (platform: chatgpt)");
    expect(systemPrompt.indexOf("ChatGPT responded with a helpful answer.")).toBeLessThan(systemPrompt.indexOf("Project documentation content."));
  });

  it("returns llm-response chunks ordered by quality preference", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();

    const responseFile = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T10-00-00-chatgpt.md");
    await fs.mkdir(path.dirname(responseFile), { recursive: true });
    await db.replaceDocumentsForFile(responseFile, [
      {
        content: "Bad response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "bad",
        file_ts: "2026-05-20T10:00:00.000Z"
      },
      {
        content: "Neutral response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: null,
        file_ts: "2026-05-20T10:01:00.000Z"
      },
      {
        content: "Partial response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "partial",
        file_ts: "2026-05-20T10:02:00.000Z"
      },
      {
        content: "Good response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "good",
        file_ts: "2026-05-20T10:03:00.000Z"
      }
    ]);

    const results = await db.recentLlmResponseChunks("chatgpt", 4);
    expect(results.map((doc) => doc.quality)).toEqual(["good", null, "partial", "bad"]);
    await db.close();
  });

  it("respects limit when retrieving recent LLM response chunks", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();

    const responseFile = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T10-00-00-chatgpt.md");
    await fs.mkdir(path.dirname(responseFile), { recursive: true });
    await db.replaceDocumentsForFile(responseFile, [
      {
        content: "Good response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "good",
        file_ts: "2026-05-20T10:03:00.000Z"
      },
      {
        content: "Neutral response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: null,
        file_ts: "2026-05-20T10:01:00.000Z"
      },
      {
        content: "Partial response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "partial",
        file_ts: "2026-05-20T10:02:00.000Z"
      },
      {
        content: "Bad response",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "bad",
        file_ts: "2026-05-20T10:00:00.000Z"
      }
    ]);

    const results = await db.recentLlmResponseChunks("chatgpt", 2);
    expect(results).toHaveLength(2);
    expect(results.map((doc) => doc.quality)).toEqual(["good", null]);
    await db.close();
  });

  it("buildContext includes llm-response chunk content", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();

    const responseFile = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T10-00-00-chatgpt.md");
    await fs.mkdir(path.dirname(responseFile), { recursive: true });
    await db.replaceDocumentsForFile(responseFile, [
      {
        content: "Helpful LLM response content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "good",
        file_ts: "2026-05-20T10:00:00.000Z"
      }
    ]);

    await db.replaceDocumentsForFile(path.join(tempDir, "guide.md"), [
      {
        content: "Project documentation content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "md",
        file_ts: "2026-05-19T00:00:00.000Z"
      }
    ]);
    await db.close();

    const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(),
      embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0))
    };

    const generator = new PromptGenerator({ baseDir: tempDir, inference: mockInference, embeddings: mockEmbeddings });
    const context = await generator.buildContext({ goal: "test goal", project: "vscode-rotator", platform: "chatgpt" });

    expect(context.system).toContain("Helpful LLM response content.");
    expect(context.system).toContain("Project documentation content.");
  });

  it("queries topic-aware thread context with goal and platform", async () => {
    const mockDb = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue(),
      vectorSearchDocuments: vi.fn().mockResolvedValue([]),
      recentLlmResponseChunks: vi.fn().mockResolvedValue([]),
      getThreadContext: vi.fn().mockResolvedValue([]),
      recentSprints: vi.fn().mockResolvedValue([]),
      listRubricRules: vi.fn().mockResolvedValue([])
    };
    const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(),
      embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0))
    };

    const generator = new PromptGenerator({ db: mockDb, inference: mockInference, embeddings: mockEmbeddings });
    await generator.buildContext({ goal: "Use browser thread", project: "vscode-rotator", platform: "chatgpt" });

    expect(mockDb.getThreadContext).toHaveBeenCalledWith("Use browser thread", "chatgpt");
  });

  it("renders thread chunks before recent LLM responses in the system prompt", async () => {
    const mockDb = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue(),
      vectorSearchDocuments: vi.fn().mockResolvedValue([]),
      recentLlmResponseChunks: vi.fn().mockResolvedValue([
        { content: "LLM response content." }
      ]),
      getThreadContext: vi.fn().mockResolvedValue([
        {
          filename: "thread.md",
          turn_index: 1,
          content: "Thread chunk content.",
          metadata: { role: "assistant" },
          score: 0.7
        }
      ]),
      recentSprints: vi.fn().mockResolvedValue([]),
      listRubricRules: vi.fn().mockResolvedValue([])
    };
    const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(),
      embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0))
    };

    const generator = new PromptGenerator({ db: mockDb, inference: mockInference, embeddings: mockEmbeddings });
    const context = await generator.buildContext({ goal: "test goal", project: "vscode-rotator", platform: "chatgpt" });

    const threadIndex = context.system.indexOf("Thread chunk content.");
    const responseIndex = context.system.indexOf("LLM response content.");
    expect(threadIndex).toBeGreaterThan(-1);
    expect(responseIndex).toBeGreaterThan(-1);
    expect(threadIndex).toBeLessThan(responseIndex);
  });

  it("includes thread chunks before unrelated document chunks in buildContext", async () => {
    const mockDb = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue(),
      vectorSearchDocuments: vi.fn().mockResolvedValue([
        {
          filename: "doc.md",
          chunk_index: 0,
          content: "Unrelated documentation content.",
          score: 0.1
        }
      ]),
      recentLlmResponseChunks: vi.fn().mockResolvedValue([]),
      getThreadContext: vi.fn().mockResolvedValue([
        {
          filename: "thread.md",
          turn_index: 1,
          content: "Relevant thread chunk content.",
          metadata: { role: "assistant" },
          score: 0.9
        }
      ]),
      recentSprints: vi.fn().mockResolvedValue([]),
      listRubricRules: vi.fn().mockResolvedValue([])
    };
    const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(),
      embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0))
    };

    const generator = new PromptGenerator({ db: mockDb, inference: mockInference, embeddings: mockEmbeddings });
    const context = await generator.buildContext({ goal: "relevant thread", project: "vscode-rotator", platform: "chatgpt" });

    const threadIndex = context.system.indexOf("Relevant thread chunk content.");
    const docIndex = context.system.indexOf("Unrelated documentation content.");
    expect(threadIndex).toBeGreaterThan(-1);
    expect(docIndex).toBeGreaterThan(-1);
    expect(threadIndex).toBeLessThan(docIndex);
  });

  it("falls back gracefully when no platform is specified", async () => {
    const mockDb = {
      open: vi.fn().mockResolvedValue(),
      close: vi.fn().mockResolvedValue(),
      vectorSearchDocuments: vi.fn().mockResolvedValue([]),
      recentLlmResponseChunks: vi.fn().mockResolvedValue([]),
      getThreadContext: vi.fn().mockResolvedValue([]),
      recentSprints: vi.fn().mockResolvedValue([]),
      listRubricRules: vi.fn().mockResolvedValue([])
    };
    const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(),
      embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0))
    };

    const generator = new PromptGenerator({ db: mockDb, inference: mockInference, embeddings: mockEmbeddings });
    const context = await generator.buildContext({ goal: "Ask without platform", project: "vscode-rotator" });

    expect(context.system).toContain("You are an expert software developer");
    expect(context.system).toContain("Target platform: chatgpt");
    expect(mockDb.getThreadContext).toHaveBeenCalledWith("Ask without platform", null);
  });

  describe("staged VS Code signal ingestion", () => {
    async function writeStagedFile(name, content) {
      const stagedDir = path.join(tempDir, "vscode-signals");
      await fs.mkdir(stagedDir, { recursive: true });
      const filePath = path.join(stagedDir, name);
      await fs.writeFile(filePath, content, "utf8");
      return { stagedDir, filePath };
    }

    function stagedSignal(frontmatter, body = "Captured signal body") {
      return `---
${Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(String(value))}`).join("\n")}
---
${body}
`;
    }

    it("exits cleanly for an empty staging directory", async () => {
      const stagedDir = path.join(tempDir, "empty-signals");
      await fs.mkdir(stagedDir, { recursive: true });

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);

      expect(results).toEqual([]);
    });

    it("ingests every chunk in a staged file and deletes it after success", async () => {
      const { stagedDir, filePath } = await writeStagedFile(
        "signals.md",
        [
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode", captured_at: "2026-05-21T10:00:00.000Z" }, "console.log('one');"),
          stagedSignal({ type: "signal", signal_type: "vscode-git", source_type: "vscode-git", platform: "vscode", captured_at: "2026-05-21T10:01:00.000Z" }, "commit abc123")
        ].join("\n---\n")
      );

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const sourceTypes = db.state.documents.map((doc) => doc.source_type).sort();

      expect(results).toHaveLength(2);
      expect(sourceTypes).toEqual(["vscode-edit", "vscode-git"]);
      await expect(fs.access(filePath)).rejects.toThrow();
      await db.close();
    });

    it("retains a staged file when one chunk fails and continues non-fatally", async () => {
      const { stagedDir, filePath } = await writeStagedFile(
        "failing-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "console.log('fail');")
      );
      const ingestSpy = vi.spyOn(DocumentIngester.prototype, "ingestFile").mockRejectedValueOnce(new Error("boom"));

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);

      expect(ingestSpy).toHaveBeenCalledTimes(1);
      expect(results[0]).toMatchObject({ chunks: 0, skipped: true });
      expect(results[0].error).toContain("boom");
      await expect(fs.access(filePath)).resolves.toBeUndefined();
    });

    it("creates a mistake for recurring diagnostic chunks", async () => {
      const mistakeSpy = vi.spyOn(MistakeTracker.prototype, "addMistake").mockResolvedValue({
        mistake: { id: 1, description: "Cannot find name x" },
        matched: false,
        promoted: false
      });
      const { stagedDir } = await writeStagedFile(
        "diagnostic-signals.md",
        stagedSignal(
          {
            type: "signal",
            signal_type: "vscode-diagnostic-recurring",
            source_type: "vscode-diagnostic-recurring",
            platform: "vscode",
            recurring: "true",
            message: "Cannot find name x"
          },
          "Cannot find name x"
        )
      );

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);

      expect(results).toHaveLength(1);
      expect(mistakeSpy).toHaveBeenCalledWith(expect.objectContaining({
        category: "vscode-diagnostic",
        description: "Cannot find name x"
      }));
    });

    it("stores editor/file-save tags for vscode-edit chunks", async () => {
      const { stagedDir } = await writeStagedFile(
        "edit-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "const edited = true;")
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const editDoc = db.state.documents.find((doc) => doc.source_type === "vscode-edit");
      const metadata = JSON.parse(editDoc.metadata);

      expect(metadata.tags).toEqual(["editor", "file-save"]);
      await db.close();
    });

    it("stores editor/diagnostic tags for vscode-diagnostic chunks", async () => {
      const { stagedDir } = await writeStagedFile(
        "diagnostic-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-diagnostic", source_type: "vscode-diagnostic", platform: "vscode", message: "Type error" }, "Type error in file")
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const diagDoc = db.state.documents.find((doc) => doc.source_type === "vscode-diagnostic");
      const metadata = JSON.parse(diagDoc.metadata);

      expect(metadata.tags).toEqual(["editor", "diagnostic"]);
      await db.close();
    });

    it("stores editor/git tags for vscode-git chunks", async () => {
      const { stagedDir } = await writeStagedFile(
        "git-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-git", source_type: "vscode-git", platform: "vscode" }, "Git commit message")
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const gitDoc = db.state.documents.find((doc) => doc.source_type === "vscode-git");
      const metadata = JSON.parse(gitDoc.metadata);

      expect(metadata.tags).toEqual(["editor", "git"]);
      await db.close();
    });

    it("stores editor/task-error tags for vscode-task-error chunks", async () => {
      const { stagedDir } = await writeStagedFile(
        "task-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-task-error", source_type: "vscode-task-error", platform: "vscode" }, "Task error output")
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const taskDoc = db.state.documents.find((doc) => doc.source_type === "vscode-task-error");
      const metadata = JSON.parse(taskDoc.metadata);

      expect(metadata.tags).toEqual(["editor", "task-error"]);
      await db.close();
    });

    it("preserves captured_at timestamp through ingestion", async () => {
      const fixedTimestamp = "2026-05-21T14:30:45.123Z";
      const { stagedDir } = await writeStagedFile(
        "timestamp-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode", captured_at: fixedTimestamp }, "content")
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const doc = db.state.documents.find((d) => d.source_type === "vscode-edit");

      expect(doc.file_ts).toBe(fixedTimestamp);
      await db.close();
    });

    it("handles staged file with mixed signal types", async () => {
      const { stagedDir } = await writeStagedFile(
        "mixed-signals.md",
        [
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "edit 1"),
          stagedSignal({ type: "signal", signal_type: "vscode-diagnostic", source_type: "vscode-diagnostic", platform: "vscode", severity: 0, message: "error" }, "diagnostic 1"),
          stagedSignal({ type: "signal", signal_type: "vscode-git", source_type: "vscode-git", platform: "vscode" }, "git 1"),
          stagedSignal({ type: "signal", signal_type: "vscode-task-error", source_type: "vscode-task-error", platform: "vscode" }, "task error 1")
        ].join("\n---\n")
      );

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      expect(results).toHaveLength(4);

      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const sourceTypes = db.state.documents.map((d) => d.source_type).sort();
      expect(sourceTypes).toEqual(["vscode-diagnostic", "vscode-edit", "vscode-git", "vscode-task-error"]);
      await db.close();
    });

    it("handles ingestion error on first chunk and continues with rest", async () => {
      const { stagedDir } = await writeStagedFile(
        "partial-fail-signals.md",
        [
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "edit 1"),
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "edit 2"),
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "edit 3")
        ].join("\n---\n")
      );

      let callCount = 0;
      const ingestSpy = vi.spyOn(DocumentIngester.prototype, "ingestFile").mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Second chunk fails");
        }
        return { chunks: 1 };
      });

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);

      expect(ingestSpy).toHaveBeenCalledTimes(3);
      expect(results.filter((r) => r.error)).toHaveLength(1);
      expect(results.filter((r) => !r.error)).toHaveLength(2);
    });

    it("does not delete staged file when any chunk fails", async () => {
      const { stagedDir, filePath } = await writeStagedFile(
        "fail-no-delete.md",
        [
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "edit 1"),
          stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode" }, "edit 2")
        ].join("\n---\n")
      );

      let callCount = 0;
      const ingestSpy = vi.spyOn(DocumentIngester.prototype, "ingestFile").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("First chunk fails");
        }
        return { chunks: 1 };
      });

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);

      // File should still exist because one chunk failed
      await expect(fs.access(filePath)).resolves.toBeUndefined();
    });

    it("stores source_type field in database documents", async () => {
      const { stagedDir } = await writeStagedFile(
        "source-type-signals.md",
        stagedSignal({ type: "signal", signal_type: "vscode-edit", source_type: "vscode-edit", platform: "vscode", captured_at: "2026-05-21T10:00:00.000Z" }, "content")
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const doc = db.state.documents.find((d) => d.source_type === "vscode-edit");

      expect(doc.source_type).toBe("vscode-edit");
      await db.close();
    });

    it("handles empty signal files gracefully", async () => {
      const stagedDir = path.join(tempDir, "empty-file-signals");
      await fs.mkdir(stagedDir, { recursive: true });
      await fs.writeFile(path.join(stagedDir, "empty.md"), "", "utf8");

      const results = await ingestStagedSignalsFromDirectory(stagedDir, tempDir);
      expect(results).toEqual([]);
    });

    it("creates mistake for vscode-diagnostic-recurring with correct description", async () => {
      const mistakeSpy = vi.spyOn(MistakeTracker.prototype, "addMistake").mockResolvedValue({
        mistake: { id: 1, description: "Type mismatch" },
        matched: false,
        promoted: false
      });

      const { stagedDir } = await writeStagedFile(
        "recurring-diagnostic.md",
        stagedSignal(
          {
            type: "signal",
            signal_type: "vscode-diagnostic-recurring",
            source_type: "vscode-diagnostic-recurring",
            platform: "vscode",
            message: "Type mismatch: string expected",
            recurring: "true"
          },
          "Type error details"
        )
      );

      await ingestStagedSignalsFromDirectory(stagedDir, tempDir);

      expect(mistakeSpy).toHaveBeenCalledWith(expect.objectContaining({
        category: "vscode-diagnostic",
        description: "Type mismatch: string expected"
      }));
    });
  });

  describe("Conversation thread ingestion", () => {
    it("chunks thread files per-turn with turn_index metadata", async () => {
      const threadFile = path.join(tempDir, "thread.md");
      const threadContent = `---
platform: chatgpt
captured_at: 2026-05-20T12:00:00.000Z
type: thread
turn_count: 2
---

## Turn 1 — User

What is machine learning?

## Turn 2 — Assistant

Machine learning is a branch of AI that enables systems to learn from data.
`;
      await fs.writeFile(threadFile, threadContent, "utf8");

      const ingester = new DocumentIngester({ baseDir: tempDir });
      const result = await ingester.ingestFile(threadFile, {
        fileTs: "2026-05-20T12:00:00.000Z",
        source_type: "thread-turn",
        platform: "chatgpt"
      });

      expect(result.chunks).toBe(2);

      // Verify chunks have turn_index
      const db = new ExperienceDb({ baseDir: tempDir });
      const docs = await db.getDocumentsByFile(threadFile);
      expect(docs.length).toBe(2);
      expect(docs[0].turn_index).toBe(1);
      expect(docs[1].turn_index).toBe(2);
      expect(docs[0].source_type).toBe("thread-turn");
      expect(docs[0].platform).toBe("chatgpt");
      await db.close();
    });

    it("does not affect non-thread file chunking", async () => {
      const docFile = path.join(tempDir, "doc.md");
      const docContent = `# Documentation

This is paragraph one with multiple words that should be chunked together.

This is paragraph two with more content for testing the regular chunking logic.`;

      await fs.writeFile(docFile, docContent, "utf8");

      const ingester = new DocumentIngester({ baseDir: tempDir });
      const result = await ingester.ingestFile(docFile, {
        fileTs: "2026-05-20T12:00:00.000Z"
      });

      // Regular files should have chunks
      expect(result.chunks).toBeGreaterThan(0);

      const db = new ExperienceDb({ baseDir: tempDir });
      const docs = await db.getDocumentsByFile(docFile);
      
      // Regular documents should not have turn_index
      for (const doc of docs) {
        expect(doc.turn_index).toBeNull();
        expect(doc.source_type).not.toBe("thread-turn");
      }
      await db.close();
    });

    it("retrieves threads by platform ordered by filename and turn_index", async () => {
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();

      // Insert multiple thread documents
      const threadFile1 = path.join(tempDir, "2026-05-20-thread1.md");
      await db.replaceDocumentsForFile(threadFile1, [
        {
          content: "Turn 1 content",
          embedding: Array.from({ length: 768 }, () => 0),
          source_type: "thread-turn",
          platform: "chatgpt",
          turn_index: 1,
          file_ts: "2026-05-20T12:00:00.000Z"
        },
        {
          content: "Turn 2 content",
          embedding: Array.from({ length: 768 }, () => 0),
          source_type: "thread-turn",
          platform: "chatgpt",
          turn_index: 2,
          file_ts: "2026-05-20T12:00:00.000Z"
        }
      ]);

      const threadFile2 = path.join(tempDir, "2026-05-20-thread2.md");
      await db.replaceDocumentsForFile(threadFile2, [
        {
          content: "Turn 1 content 2",
          embedding: Array.from({ length: 768 }, () => 0),
          source_type: "thread-turn",
          platform: "chatgpt",
          turn_index: 1,
          file_ts: "2026-05-20T13:00:00.000Z"
        }
      ]);

      const threads = await db.getThreadsByPlatform("chatgpt");
      expect(threads.length).toBe(3);
      
      // Verify ordering by filename, then turn_index
      expect(threads[0].filename).toBe(threadFile1);
      expect(threads[0].turn_index).toBe(1);
      expect(threads[1].filename).toBe(threadFile1);
      expect(threads[1].turn_index).toBe(2);
      expect(threads[2].filename).toBe(threadFile2);
      expect(threads[2].turn_index).toBe(1);

      await db.close();
    });

    it("persists conversation thread metadata in a dedicated conversation_threads collection", async () => {
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();

      await db.insertThread({
        platform: "chatgpt",
        captured_at: "2026-05-20T12:00:00.000Z",
        turn_count: 2,
        file_path: path.join(tempDir, "2026-05-20T12-00-00-chatgpt-thread.md")
      });

      const threads = await db.getThreads(5);
      expect(threads.length).toBe(1);
      expect(threads[0].platform).toBe("chatgpt");
      expect(threads[0].captured_at).toBe("2026-05-20T12:00:00.000Z");
      expect(threads[0].turn_count).toBe(2);

      await db.close();
    });

    it("skips ingesting a thread file twice and preserves existing chunks", async () => {
      const responsesDir = path.join(tempDir, ".vscode-rotator", "browser-responses");
      await fs.mkdir(responsesDir, { recursive: true, mode: 0o700 });

      const threadFile = path.join(responsesDir, "2026-05-20T12-00-00-chatgpt-thread.md");
      const threadContent = `---
platform: chatgpt
captured_at: 2026-05-20T12:00:00.000Z
type: thread
turn_count: 2
---

## Turn 1 — User

What is machine learning?

## Turn 2 — Assistant

Machine learning is a branch of AI that enables systems to learn from data.
`;
      await fs.writeFile(threadFile, threadContent, "utf8");

      const ingester = new DocumentIngester({ baseDir: tempDir });
      const firstResult = await ingester.ingestThread(threadFile, { platform: "chatgpt" });
      expect(firstResult.skipped).toBe(false);
      expect(firstResult.chunks).toBe(2);

      const secondResult = await ingester.ingestThread(threadFile, { platform: "chatgpt" });
      expect(secondResult.skipped).toBe(true);
      expect(secondResult.chunks).toBe(0);

      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      const docs = await db.getDocumentsByFile(threadFile);
      expect(docs.length).toBe(2);
      await db.close();
    });

    it("includes past conversation context before project documents in generated prompts", async () => {
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      await db.replaceDocumentsForFile(path.join(tempDir, "doc.md"), [
        {
          content: "Unrelated project documentation about a different topic.",
          embedding: Array.from({ length: 768 }, () => 0),
          source_type: "md",
          file_ts: "2026-05-19T00:00:00.000Z"
        }
      ]);
      await db.replaceDocumentsForFile(path.join(tempDir, "2026-05-20T12-00-00-chatgpt-thread.md"), [
        {
          content: "What is machine learning?",
          embedding: Array.from({ length: 768 }, () => 0),
          source_type: "thread-turn",
          platform: "chatgpt",
          metadata: { turn: 1, role: "user", thread_file: "2026-05-20T12-00-00-chatgpt-thread.md" },
          turn_index: 1,
          file_ts: "2026-05-20T12:00:00.000Z"
        }
      ]);
      await db.close();

      const mockInference = { generate: vi.fn().mockResolvedValue("generated prompt") };
      const generator = new PromptGenerator({ baseDir: tempDir, inference: mockInference });
      await generator.generate({ goal: "machine learning", project: "vscode-rotator", platform: "chatgpt" });

      const systemPrompt = mockInference.generate.mock.calls[0][0].system;
      expect(systemPrompt).toContain("## Past conversation context");
      expect(systemPrompt).toContain("What is machine learning?");
      expect(systemPrompt.indexOf("## Past conversation context")).toBeLessThan(systemPrompt.indexOf("### Project Documents"));
    });

    it("logs an enhance cycle to prompt_history", async () => {
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();

      const history = await db.logEnhanceCycle({
        goal: "Improve my understanding of X",
        platform: "chatgpt",
        promptText: "Please explain X clearly.",
        responseFile: path.join(tempDir, "response.md")
      });

      const stored = db.state.prompt_history.find((row) => row.id === history.id);
      expect(stored).toBeTruthy();
      expect(stored.goal).toBe("Improve my understanding of X");
      expect(stored.platform).toBe("chatgpt");
      expect(stored.response_file).toBe(path.join(tempDir, "response.md"));
      await db.close();
    });

    it("rates a prompt history entry and creates a mistake on low rating", async () => {
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();

      const history = await db.logEnhanceCycle({
        goal: "Understand X better",
        platform: "chatgpt",
        promptText: "Explain X in detail.",
        responseFile: path.join(tempDir, "response.md")
      });

      const updated = await db.ratePromptHistory(history.id, 2);
      expect(updated.rating).toBe(2);
      expect(updated.quality_rating).toBe(2);

      await db.close();

      const tracker = new MistakeTracker({ baseDir: tempDir });
      const rules = await tracker.listRubric();
      expect(rules.some((rule) => rule.rule.includes("Understand X better"))).toBe(true);
    });

    it("enhance command generates a prompt with goal context", async () => {
      const db = new ExperienceDb({ baseDir: tempDir });
      await db.open();
      await db.upsertSprint({
        id: "sprint-1",
        date: "2026-05-19T00:00:00.000Z",
        agent: "chatgpt",
        goal: "Track progress accurately",
        completed_tasks: [],
        pending_tasks: [],
        files_changed: [],
        tests_failed: [],
        status: "paused"
      });
      await db.addRubricRule({ rule: "Always keep prompts concrete and actionable.", category: "prompt-quality" });
      await db.close();

      const mockInference = {
        generate: vi.fn(async ({ system }) => `${system}\n\nGenerated prompt based on context.`)
      };

      const generator = new PromptGenerator({ baseDir: tempDir, inference: mockInference });
      const result = await generator.generate({
        goal: "understand X",
        project: "vscode-rotator",
        platform: "chatgpt"
      });

      expect(result.prompt).toContain("Always keep prompts concrete and actionable.");
      expect(result.prompt).toContain("understand X");
      expect(result.history.id).toBe(1);
    });
  });
});
