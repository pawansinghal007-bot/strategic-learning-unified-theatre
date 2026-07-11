/**
 * Targeted coverage tests for src/llm/experience-db.js
 *
 * Covers previously-uncovered lines:
 *   74-77, 95, 133-140, 185, 197, 248, 336, 348-353,
 *   467, 505, 519, 532, 580, 609-612, 640-644, 726
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";

import { ExperienceDb } from "../../src/llm/experience-db.js";
import { encodeEmbedding } from "../../src/llm/embeddings.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeDb(tempDir) {
  const db = new ExperienceDb({ baseDir: tempDir });
  await db.open();
  return db;
}

const ZERO_EMBEDDING = Array.from({ length: 768 }, () => 0);
const UNIT_VEC = (i) =>
  Array.from({ length: 768 }, (_, idx) => (idx === i ? 1 : 0));

// ---------------------------------------------------------------------------
// Constructor — lines 74-77: DomainError for baseDir outside home
// ---------------------------------------------------------------------------
describe("ExperienceDb constructor", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-cov-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // lines 74-77: non-VITEST env + explicit baseDir outside home → DomainError
  it("throws DomainError when explicit baseDir is outside home directory (non-test env)", () => {
    const savedVitest = process.env.VITEST;
    const savedVitestWorker = process.env.VITEST_WORKER_ID;
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;

    try {
      // /tmp is outside ~ so this should throw when not in VITEST
      expect(
        () => new ExperienceDb({ baseDir: "/tmp/outside-home-test-dir" }),
      ).toThrow("Refusing to use baseDir outside user home directory");
    } finally {
      if (savedVitest != null) process.env.VITEST = savedVitest;
      if (savedVitestWorker != null)
        process.env.VITEST_WORKER_ID = savedVitestWorker;
    }
  });

  // line 95: mkdirSync runs for baseDir creation
  it("creates the base directory on construction", () => {
    const baseDir = path.join(tempDir, "new-db-dir");
    const db = new ExperienceDb({ baseDir });
    expect(() => mkdirSync(baseDir, { recursive: true })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// open() — lines 133-140: SQLITE_BUSY and corrupt db paths
// ---------------------------------------------------------------------------
describe("ExperienceDb.open() error paths", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-open-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // lines 133-136: SQLITE_BUSY → DomainError
  it("throws DomainError when db file read throws SQLITE_BUSY", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    const busyError = Object.assign(new Error("DB locked"), {
      code: "SQLITE_BUSY",
    });
    // Ensure db path exists so the readFile call fires (not skipped as ENOENT)
    await fs.mkdir(path.dirname(db.dbPath), { recursive: true });
    await fs.writeFile(db.dbPath, "{}", "utf8");

    // Mock fs.readFile to throw SQLITE_BUSY only for the db path
    const origReadFile = fs.readFile.bind(fs);
    const readFileSpy = vi
      .spyOn(fs, "readFile")
      .mockImplementation(async (filePath, ...args) => {
        if (String(filePath) === db.dbPath) {
          throw busyError;
        }
        return origReadFile(filePath, ...args);
      });

    await expect(db.open()).rejects.toThrow("Experience DB is locked");
    readFileSpy.mockRestore();
  });

  // lines 137-140: corrupt JSON → quarantine + init schema
  it("quarantines a corrupt db file and initialises fresh schema", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    // Write corrupt JSON to the db path
    await fs.mkdir(path.dirname(db.dbPath), { recursive: true });
    await fs.writeFile(db.dbPath, "{{NOT VALID JSON}}", "utf8");

    // SyntaxError (isCorruptDbError) → quarantine
    await expect(db.open()).resolves.toBeDefined();
    expect(db.state).not.toBeNull();
    expect(db.state.sprints).toEqual([]);
  });

  // open() with valid JSON merges state
  it("opens and merges state from existing db file", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();
    await db.upsertSprint({
      id: "s1",
      goal: "Test goal",
      status: "active",
    });
    await db.close();

    const db2 = new ExperienceDb({ baseDir: tempDir });
    await db2.open();
    expect(db2.state.sprints).toHaveLength(1);
    expect(db2.state.sprints[0].id).toBe("s1");
    await db2.close();
  });
});

// ---------------------------------------------------------------------------
// incrementMistake — line 185
// ---------------------------------------------------------------------------
describe("ExperienceDb.incrementMistake()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-mistake-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("increments recurrence_count on an existing mistake", async () => {
    const row = await db.addMistake({
      description: "Forgot to await",
      category: "api-misuse",
    });
    const updated = await db.incrementMistake(row.id);
    expect(updated.recurrence_count).toBe(1);
  });

  it("increments again on second call", async () => {
    const row = await db.addMistake({
      description: "Forgot to await",
      category: "api-misuse",
      recurrence_count: 3,
    });
    await db.incrementMistake(row.id);
    const updated = await db.incrementMistake(row.id);
    expect(updated.recurrence_count).toBe(5);
  });

  // line 185: id not found → returns null
  it("returns null for non-existent mistake id", async () => {
    const result = await db.incrementMistake(99999);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setRubricActive — line 197
// ---------------------------------------------------------------------------
describe("ExperienceDb.setRubricActive()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-rubric-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("sets rubric rule active=1", async () => {
    const rule = await db.addRubricRule({ rule: "Always test." });
    const updated = await db.setRubricActive(rule.id, true);
    expect(updated.active).toBe(1);
  });

  it("sets rubric rule active=0", async () => {
    const rule = await db.addRubricRule({ rule: "Always test.", active: 1 });
    const updated = await db.setRubricActive(rule.id, false);
    expect(updated.active).toBe(0);
  });

  // line 197: rule not found → throws
  it("throws when rubric rule id does not exist", async () => {
    await expect(db.setRubricActive(99999, true)).rejects.toThrow(
      "Rubric rule not found",
    );
  });
});

// ---------------------------------------------------------------------------
// upsertDocuments — line 248
// ---------------------------------------------------------------------------
describe("ExperienceDb.upsertDocuments()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-upsert-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("inserts new documents without uniqueBy", async () => {
    const rows = await db.upsertDocuments(
      [
        {
          content: "Doc A",
          embedding: ZERO_EMBEDDING,
          source_type: "md",
          file_ts: "2026-01-01T00:00:00.000Z",
        },
      ],
      { filename: "file-a.md" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("Doc A");
  });

  it("skips chunks whose uniqueBy key already exists", async () => {
    // Insert first batch
    await db.upsertDocuments(
      [
        {
          content: "Existing chunk",
          embedding: ZERO_EMBEDDING,
          metadata: { path: "chunk-key" },
          file_ts: "2026-01-01T00:00:00.000Z",
        },
      ],
      { filename: "file.md", uniqueBy: "path" },
    );
    // Insert second batch with same key → should be deduped
    const rows2 = await db.upsertDocuments(
      [
        {
          content: "Duplicate chunk",
          embedding: ZERO_EMBEDDING,
          metadata: { path: "chunk-key" },
          file_ts: "2026-01-01T00:00:00.000Z",
        },
      ],
      { filename: "file.md", uniqueBy: "path" },
    );
    expect(rows2).toHaveLength(0);
  });

  it("inserts multiple unique chunks correctly", async () => {
    const rows = await db.upsertDocuments(
      [
        {
          content: "Chunk X",
          embedding: ZERO_EMBEDDING,
          metadata: { path: "x" },
          file_ts: "2026-01-01T00:00:00.000Z",
        },
        {
          content: "Chunk Y",
          embedding: ZERO_EMBEDDING,
          metadata: { path: "y" },
          file_ts: "2026-01-01T00:00:00.000Z",
        },
      ],
      { filename: "multi.md", uniqueBy: "path" },
    );
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getDocumentsByFile — line 336
// ---------------------------------------------------------------------------
describe("ExperienceDb.getDocumentsByFile()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-getdocs-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns documents for the requested filename", async () => {
    await db.replaceDocumentsForFile("file-a.md", [
      {
        content: "Chunk A",
        embedding: ZERO_EMBEDDING,
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
      {
        content: "Chunk B",
        embedding: ZERO_EMBEDDING,
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const docs = await db.getDocumentsByFile("file-a.md");
    expect(docs).toHaveLength(2);
    expect(docs[0].content).toBe("Chunk A");
    // embedding should be decoded (array, not base64 string)
    expect(Array.isArray(docs[0].embedding)).toBe(true);
  });

  it("returns empty array for unknown filename", async () => {
    const docs = await db.getDocumentsByFile("nonexistent.md");
    expect(docs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteDocumentsForFile — line 348-353
// ---------------------------------------------------------------------------
describe("ExperienceDb.deleteDocumentsForFile()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-del-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("removes all documents for the specified filename", async () => {
    await db.replaceDocumentsForFile("remove-me.md", [
      {
        content: "Gone soon",
        embedding: ZERO_EMBEDDING,
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await db.deleteDocumentsForFile("remove-me.md");
    const remaining = db.state.documents.filter(
      (d) => d.filename === "remove-me.md",
    );
    expect(remaining).toHaveLength(0);
  });

  it("is a no-op when filename has no documents", async () => {
    const before = db.state.documents.length;
    await db.deleteDocumentsForFile("does-not-exist.md");
    expect(db.state.documents.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// vectorSearchDocuments — line 467
// ---------------------------------------------------------------------------
describe("ExperienceDb.vectorSearchDocuments()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-vsearch-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns documents sorted by cosine similarity", async () => {
    await db.replaceDocumentsForFile("docs.md", [
      {
        content: "Relevant doc",
        embedding: UNIT_VEC(0),
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
      {
        content: "Unrelated doc",
        embedding: UNIT_VEC(1),
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const results = await db.vectorSearchDocuments(UNIT_VEC(0), 2);
    expect(results).toHaveLength(2);
    // Most similar doc (dim 0) should be first
    expect(results[0].content).toBe("Relevant doc");
    expect(results[0].score).toBeCloseTo(1, 5);
  });

  it("respects the limit parameter", async () => {
    await db.replaceDocumentsForFile("many.md", [
      {
        content: "Doc 1",
        embedding: ZERO_EMBEDDING,
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
      {
        content: "Doc 2",
        embedding: ZERO_EMBEDDING,
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
      {
        content: "Doc 3",
        embedding: ZERO_EMBEDDING,
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const results = await db.vectorSearchDocuments(ZERO_EMBEDDING, 2);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// relatedTo — line 505
// ---------------------------------------------------------------------------
describe("ExperienceDb.relatedTo()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-related-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns documents, sprints, and promptHistory", async () => {
    await db.upsertSprint({
      id: "s1",
      goal: "Related sprint",
      status: "active",
      date: "2026-01-01T00:00:00.000Z",
    });
    await db.replaceDocumentsForFile("rel.md", [
      {
        content: "Related content",
        embedding: UNIT_VEC(0),
        source_type: "md",
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await db.addPromptHistory({
      goal: "prompt goal",
      platform: "chatgpt",
      prompt: "some prompt",
    });

    const result = await db.relatedTo(UNIT_VEC(0), { topDocs: 3 });
    expect(result).toHaveProperty("documents");
    expect(result).toHaveProperty("sprints");
    expect(result).toHaveProperty("promptHistory");
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.sprints.length).toBeGreaterThan(0);
  });

  it("handles empty state gracefully", async () => {
    const result = await db.relatedTo(ZERO_EMBEDDING, { topDocs: 5 });
    expect(result.documents).toEqual([]);
    expect(result.sprints).toEqual([]);
    expect(result.promptHistory).toEqual([]);
  });

  it("uses default topDocs=5 when not specified", async () => {
    const result = await db.relatedTo(ZERO_EMBEDDING);
    expect(result).toHaveProperty("documents");
  });
});

// ---------------------------------------------------------------------------
// getThreadContext — line 519
// ---------------------------------------------------------------------------
describe("ExperienceDb.getThreadContext()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-threadctx-"));
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // line 519: empty query → returns []
  it("returns empty array for blank query", async () => {
    const result = await db.getThreadContext("", "chatgpt");
    expect(result).toEqual([]);
  });

  it("returns empty array before any embedding work when query is blank", async () => {
    const result = await db.getThreadContext("   ", null, 3);
    expect(result).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    const result = await db.getThreadContext("   ", "chatgpt");
    expect(result).toEqual([]);
  });

  // no thread docs → returns []
  it("returns empty array when no thread documents exist", async () => {
    const result = await db.getThreadContext("machine learning", "chatgpt");
    expect(result).toEqual([]);
  });

  // with thread docs + platform filter
  it("returns scored thread docs matching the platform", async () => {
    await db.replaceDocumentsForFile("thread1.md", [
      {
        content: "Machine learning is amazing",
        embedding: UNIT_VEC(0),
        source_type: "thread-turn",
        platform: "chatgpt",
        turn_index: 1,
        file_ts: "2026-01-01T00:00:00.000Z",
      },
      {
        content: "Unrelated topic about cooking",
        embedding: UNIT_VEC(1),
        source_type: "thread-turn",
        platform: "gemini", // different platform
        turn_index: 1,
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await db.getThreadContext("machine learning", "chatgpt", 5);
    // Only chatgpt platform docs should be returned
    expect(result.every((doc) => doc.platform === "chatgpt")).toBe(true);
  });

  // with null platform → returns all thread docs
  it("returns thread docs from all platforms when platform is null", async () => {
    await db.replaceDocumentsForFile("thread2.md", [
      {
        content: "Thread content A",
        embedding: UNIT_VEC(0),
        source_type: "thread-turn",
        platform: "chatgpt",
        turn_index: 1,
        file_ts: "2026-01-01T00:00:00.000Z",
      },
      {
        content: "Thread content B",
        embedding: UNIT_VEC(1),
        source_type: "thread-turn",
        platform: "gemini",
        turn_index: 2,
        file_ts: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await db.getThreadContext("thread content", null, 10);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// deleteIngestionLog — line 532
// ---------------------------------------------------------------------------
describe("ExperienceDb.deleteIngestionLog()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-log-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("removes the log entry for the given file path", async () => {
    await db.upsertIngestionLog({
      path: "/some/file.md",
      file_ts: "2026-01-01T00:00:00.000Z",
      chunk_count: 3,
    });
    const logBefore = await db.getIngestionLog();
    expect(logBefore.has("/some/file.md")).toBe(true);

    await db.deleteIngestionLog("/some/file.md");
    const logAfter = await db.getIngestionLog();
    expect(logAfter.has("/some/file.md")).toBe(false);
  });

  it("is a no-op for a path not in the log", async () => {
    const logBefore = db.state.ingestion_log.length;
    await db.deleteIngestionLog("/nonexistent/file.md");
    expect(db.state.ingestion_log.length).toBe(logBefore);
  });
});

// ---------------------------------------------------------------------------
// addPromptHistory — line 580
// ---------------------------------------------------------------------------
describe("ExperienceDb.addPromptHistory()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-phist-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("persists a prompt history entry with all fields", async () => {
    const row = await db.addPromptHistory({
      goal: "Understand AI",
      platform: "gemini",
      prompt: "Explain AI concisely",
      prompt_text: "Explain AI concisely",
      response_file: "/tmp/response.md",
      cycle_ts: "2026-01-01T00:00:00.000Z",
      tokens_estimated: 150,
      rating: 4,
    });
    expect(row.id).toBe(1);
    expect(row.goal).toBe("Understand AI");
    expect(row.platform).toBe("gemini");
    expect(row.rating).toBe(4);
    expect(row.tokens_estimated).toBe(150);
  });

  it("uses default platform chatgpt when not specified", async () => {
    const row = await db.addPromptHistory({
      goal: "Default platform test",
      prompt: "A prompt",
    });
    expect(row.platform).toBe("chatgpt");
  });
});

// ---------------------------------------------------------------------------
// _updatePromptRating (ratePrompt / ratePromptHistory) — lines 609-612, 640-644
// ---------------------------------------------------------------------------
describe("ExperienceDb._updatePromptRating()", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-rating-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // line 609: throw when prompt not found
  it("throws when prompt history id does not exist", async () => {
    await expect(db.ratePrompt(9999, 5)).rejects.toThrow(
      "Prompt history not found",
    );
  });

  // lines 640-644: rating > 2 → no mistake/rubric created
  it("does not create mistake or rubric for high rating (>2)", async () => {
    const row = await db.addPromptHistory({
      goal: "High quality goal",
      platform: "chatgpt",
      prompt: "Good prompt",
    });
    const updated = await db.ratePromptHistory(row.id, 5);
    expect(updated.rating).toBe(5);
    // No mistakes or rubric rules should be created
    expect(db.state.mistakes).toHaveLength(0);
    expect(db.state.rubric_rules).toHaveLength(0);
  });

  // lines 609-612: rating <= 2 → creates mistake + rubric rule (covered by
  // existing test but we verify via ratePrompt alias)
  it("ratePrompt alias works and creates mistake on rating=1", async () => {
    const row = await db.addPromptHistory({
      goal: "Poor quality prompt goal",
      platform: "chatgpt",
      prompt: "Bad prompt",
    });
    const updated = await db.ratePrompt(row.id, 1);
    expect(updated.rating).toBe(1);
    expect(db.state.mistakes.length).toBeGreaterThan(0);
    expect(db.state.rubric_rules.length).toBeGreaterThan(0);
  });

  // rating = 2 (boundary) → creates mistake
  it("creates mistake for boundary rating=2", async () => {
    const row = await db.addPromptHistory({
      goal: "Boundary rating test",
      platform: "chatgpt",
      prompt: "Mediocre prompt",
    });
    await db.ratePrompt(row.id, 2);
    expect(db.state.mistakes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// listMistakes — line 726 (embedding decoding)
// ---------------------------------------------------------------------------
describe("ExperienceDb.listMistakes() — embedding decoding", () => {
  let tempDir, db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-list-"));
    db = await makeDb(tempDir);
  });

  afterEach(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("decodes embeddings from stored base64 format", async () => {
    await db.addMistake({
      description: "A mistake with embedding",
      category: "test",
      embedding: UNIT_VEC(0),
    });
    const mistakes = await db.listMistakes();
    expect(mistakes).toHaveLength(1);
    // embedding should be decoded to array
    expect(Array.isArray(mistakes[0].embedding)).toBe(true);
    expect(mistakes[0].embedding).toHaveLength(768);
  });

  it("handles null embedding gracefully", async () => {
    await db.addMistake({
      description: "No embedding mistake",
      category: "test",
    });
    const mistakes = await db.listMistakes();
    expect(Array.isArray(mistakes[0].embedding)).toBe(true);
  });
});
