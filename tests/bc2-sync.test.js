import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExperienceDb } from "../src/llm/experience-db.js";
import { syncBc2Messages } from "../src/commands/bc2-sync.js";

const SAMPLE_SESSION = {
  site: "github",
  url: "https://github.com",
  conversation_key: "session-1",
  model_name: "browser-capture",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z"
};

let tempDir;
let captureDbPath;
let baseDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bc2-sync-test-"));
  captureDbPath = path.join(tempDir, "capture.db");
  baseDir = path.join(tempDir, "rotator");
  const db = new Database(captureDbPath);
  db.exec(`
    CREATE TABLE chat_sessions (
      id INTEGER PRIMARY KEY,
      site TEXT,
      url TEXT,
      conversation_key TEXT,
      model_name TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      chat_session_id INTEGER,
      role TEXT,
      text_content TEXT,
      ts TEXT
    );
  `);
  db.prepare(
    "INSERT INTO chat_sessions (site, url, conversation_key, model_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(SAMPLE_SESSION.site, SAMPLE_SESSION.url, SAMPLE_SESSION.conversation_key, SAMPLE_SESSION.model_name, SAMPLE_SESSION.created_at, SAMPLE_SESSION.updated_at);

  db.prepare("INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)")
    .run(1, "User", "Hello from browser capture.", "2026-05-01T12:00:00Z");
  db.prepare("INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)")
    .run(1, "Assistant", "Hello, how can I help?", "2026-05-01T12:01:00Z");
  db.close();
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("bc2-sync command", () => {
  it("should preview ingestion without writing when dry-run is enabled", async () => {
    const result = await syncBc2Messages({ captureDbPath, baseDir, dryRun: true });
    expect(result.total).toBe(2);
    expect(result.inserted).toBe(2);
    await expect(fs.access(path.join(baseDir, "experience.db"))).rejects.toThrow();
  });

  it("should ingest Browser Capture messages into the experience database and preserve stable keys", async () => {
    const firstResult = await syncBc2Messages({ captureDbPath, baseDir });
    expect(firstResult.total).toBe(2);
    expect(firstResult.inserted).toBe(2);
    expect(firstResult.skipped).toBe(0);

    const db = new ExperienceDb({ baseDir });
    await db.open();
    const docs = await db.getDocumentsByFile("bc2-sync");
    expect(docs).toHaveLength(2);
    expect(docs[0].source_type).toBe("bc2-chat");
    expect(docs[0].metadata.bc2_message_id).toBe("1");
    expect(docs[0].metadata.bc2_session_id).toBe("1");
    expect(docs[0].metadata.role).toBe("user");
    expect(docs[1].metadata.role).toBe("assistant");

    const secondResult = await syncBc2Messages({ captureDbPath, baseDir });
    expect(secondResult.total).toBe(2);
    expect(secondResult.inserted).toBe(0);
    expect(secondResult.skipped).toBe(2);

    await db.close();
  });

  it("should support the since filter", async () => {
    const result = await syncBc2Messages({ captureDbPath, baseDir, since: "2026-05-01T12:00:30Z" });
    expect(result.total).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
  });
});
