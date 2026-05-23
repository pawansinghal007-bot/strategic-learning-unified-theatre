import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PromptGenerator } from "../../src/llm/prompt-generator.js";
import { ExperienceDb } from "../../src/llm/experience-db.js";
import { tagResponse } from "../../src/browser-bridge.js";

describe("e2e response feedback", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-learning-unified-theatre-e2e-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    if (originalHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates a mistake record for bad-quality browser response tagging without notes", async () => {
    const responsesDir = path.join(tempDir, ".vscode-rotator", "browser-responses");
    await fs.mkdir(responsesDir, { recursive: true, mode: 0o700 });

    const filename = "2026-05-20T10-00-00-chatgpt.md";
    const responsePath = path.join(responsesDir, filename);
    await fs.writeFile(responsePath, "# Response\n\nBad response content", "utf8");

    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();
    await db.replaceDocumentsForFile(responsePath, [
      {
        content: "Bad response content",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        file_ts: "2026-05-20T10:00:00.000Z"
      }
    ]);
    await db.close();

    const result = await tagResponse(filename, { quality: "bad" });
    expect(result.mistakeCreated).toBe(true);

    const db2 = new ExperienceDb();
    await db2.open();
    const mistakeEntries = db2.state.mistakes.filter((m) => m.description.includes(filename));
    await db2.close();

    expect(mistakeEntries.length).toBeGreaterThan(0);
    expect(mistakeEntries[0].description).toContain(filename);
  });

  it("surfaces quality-ordered llm-response chunks in generated prompt context", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();

    const responseFile1 = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T10-00-00-chatgpt.md");
    await fs.mkdir(path.dirname(responseFile1), { recursive: true, mode: 0o700 });
    await db.replaceDocumentsForFile(responseFile1, [
      {
        content: "High quality response content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "good",
        file_ts: "2026-05-20T10:00:00.000Z"
      }
    ]);

    const responseFile2 = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T09-00-00-chatgpt.md");
    await db.replaceDocumentsForFile(responseFile2, [
      {
        content: "Low quality response content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "bad",
        file_ts: "2026-05-20T09:00:00.000Z"
      }
    ]);

    expect(db.state.documents.length).toBe(2);

    const mockInference = { generate: async ({ system }) => system };
    const mockEmbeddings = {
      initialize: async () => {},
      embed: async () => Array.from({ length: 768 }, () => 0)
    };

    const generator = new PromptGenerator({ db, inference: mockInference, embeddings: mockEmbeddings });
    const context = await generator.buildContext({ goal: "test flow", project: "strategic-learning-unified-theatre", platform: "chatgpt" });

    const firstIndex = context.system.indexOf("High quality response content.");
    const secondIndex = context.system.indexOf("Low quality response content.");

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
  });
});

