import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentIngester } from "../src/llm/document-ingester.js";
import { ExperienceDb } from "../src/llm/experience-db.js";
import { MistakeTracker } from "../src/llm/mistake-tracker.js";
import { PromptGenerator } from "../src/llm/prompt-generator.js";
import { LocalLlmInference } from "../src/llm/inference.js";

describe("Local Dev-LLM", () => {
  let tempDir;
  let oldMock;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-llm-test-"));
    oldMock = process.env.VSCODE_ROTATOR_MOCK_LLM;
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
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

  describe("Conversation thread ingestion", () => {
    it("chunks thread files per-turn with turn_index metadata", async () => {
      const threadFile = path.join(tempDir, "thread.md");
      const threadContent = `---
platform: chatgpt
captured: 2026-05-20T12:00:00.000Z
type: thread
turns: 2
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
  });
});

