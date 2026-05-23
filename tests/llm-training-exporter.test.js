import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExperienceDb } from "../src/llm/experience-db.js";
import { exportTrainingData } from "../src/llm/training-exporter.js";

let tempDir;
let baseDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "training-export-test-"));
  baseDir = path.join(tempDir, "rotator");
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("training exporter", () => {
  it("should export bc2-chat and thread-turn pairs plus llm-response records to JSONL", async () => {
    const db = new ExperienceDb({ baseDir });
    await db.open();

    const commonEmbedding = Array.from({ length: 768 }, () => 0);
    await db.replaceDocumentsForFile("bc2-sync", [
      {
        content: "Hello, are you available?",
        embedding: commonEmbedding,
        source_type: "bc2-chat",
        platform: "github",
        file_ts: "2026-05-01T12:00:00Z",
        metadata: {
          bc2_message_id: "1",
          bc2_session_id: "session-1",
          role: "user",
          created_at: "2026-05-01T12:00:00Z"
        }
      },
      {
        content: "Yes, I can help with that.",
        embedding: commonEmbedding,
        source_type: "bc2-chat",
        platform: "github",
        file_ts: "2026-05-01T12:01:00Z",
        metadata: {
          bc2_message_id: "2",
          bc2_session_id: "session-1",
          role: "assistant",
          created_at: "2026-05-01T12:01:00Z"
        }
      }
    ]);

    await db.replaceDocumentsForFile("thread-file.md", [
      {
        content: "User question in thread.",
        embedding: commonEmbedding,
        source_type: "thread-turn",
        platform: "chatgpt",
        file_ts: "2026-05-02T10:00:00Z",
        turn_index: 1,
        metadata: {
          type: "thread",
          thread_file: "thread-file.md",
          thread_id: "thread-1",
          turn: 1,
          role: "user",
          turn_count: 2
        }
      },
      {
        content: "Assistant reply in thread.",
        embedding: commonEmbedding,
        source_type: "thread-turn",
        platform: "chatgpt",
        file_ts: "2026-05-02T10:01:00Z",
        turn_index: 2,
        metadata: {
          type: "thread",
          thread_file: "thread-file.md",
          thread_id: "thread-1",
          turn: 2,
          role: "assistant",
          turn_count: 2
        }
      }
    ]);

    await db.replaceDocumentsForFile("response-file.md", [
      {
        content: "This is a locally generated response.",
        embedding: commonEmbedding,
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "good",
        file_ts: "2026-05-03T09:00:00Z",
        metadata: {
          response_origin: "test"
        }
      }
    ]);

    const outputPath = path.join(baseDir, "training-export.jsonl");
    const result = await exportTrainingData({ baseDir, outputPath, minPairs: 2 });

    expect(result.outputPath).toBe(outputPath);
    expect(result.pairCount).toBe(2);
    expect(result.recordsCount).toBe(3);
    const content = await fs.readFile(outputPath, "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);
    const records = lines.map((line) => JSON.parse(line));
    expect(records.some((record) => record.type === "bc2-chat")).toBe(true);
    expect(records.some((record) => record.type === "thread-turn")).toBe(true);
    expect(records.some((record) => record.type === "llm-response")).toBe(true);
  });
});
