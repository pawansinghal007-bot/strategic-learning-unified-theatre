/**
 * experience-db-branches.test.js
 *
 * Targets remaining branch gaps in src/llm/experience-db.js:
 *   Lines 74-77  — writeJson rename-retry: first rename throws → unlink + retry
 *   Line  95     — fromJson: Array.isArray fast-path (value already array)
 *   Line  197    — addRubricRule: existing rule found → return early without insert
 *   Line  248    — recentLlmResponseChunks: quality priority ordering
 *   Line  336    — getThreadsByPlatform: sorting by filename and turn_index
 *   Line  505    — logEnhanceCycle: delegates to addPromptHistory
 *   Line  519    — getThreadContext: query is null/empty
 *   Line  532    — getIngestionLog: empty log returns empty Map
 *   Line  611    — _updatePromptRating: high rating (>2) does NOT add mistake
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ExperienceDb } from "../../src/llm/experience-db.js";
import { encodeEmbedding } from "../../src/llm/embeddings.js";

// ── helpers ────────────────────────────────────────────────────────────────

async function makeDb(overrides = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "xpdb-br-"));
  process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  const db = new ExperienceDb({ baseDir: tempDir });
  await db.open();
  return { db, tempDir };
}

async function closeDb(db, tempDir) {
  try { await db.close(); } catch {}
  delete process.env.VSCODE_ROTATOR_MOCK_LLM;
  await fs.rm(tempDir, { recursive: true, force: true });
}

const ZERO_VEC = Array.from({ length: 768 }, () => 0);
const UNIT_VEC = (i) => Array.from({ length: 768 }, (_, idx) => (idx === i ? 1 : 0));

// ── writeJson rename-retry (lines 74-77) ──────────────────────────────────

describe("ExperienceDb writeJson — rename-retry branch (lines 74-77)", () => {
  it("retries rename via unlink when first rename throws", async () => {
    const { db, tempDir } = await makeDb();
    let renameCount = 0;
    const origRename = fs.rename.bind(fs);

    vi.spyOn(fs, "rename").mockImplementation(async (src, dest) => {
      renameCount++;
      if (renameCount === 1) {
        // Simulate failure on first rename (e.g. destination is locked)
        throw Object.assign(new Error("EPERM"), { code: "EPERM" });
      }
      return origRename(src, dest);
    });

    // Trigger a write by calling save()
    await db.save();

    expect(renameCount).toBeGreaterThanOrEqual(2);

    vi.restoreAllMocks();
    await closeDb(db, tempDir);
  });
});

// ── fromJson Array.isArray fast-path (line 95) ─────────────────────────────

describe("ExperienceDb recentSprints — fromJson with array values", () => {
  it("returns array fields directly when already stored as parsed arrays", async () => {
    const { db, tempDir } = await makeDb();

    // Manually store sprint with array values (already arrays, not JSON strings)
    db.state.sprints.push({
      id: "s1",
      date: "2026-01-01T00:00:00.000Z",
      agent: "test",
      goal: "Test sprint",
      tokens_used: 0,
      completed_tasks: ["task-a", "task-b"],  // already an array (fromJson fast-path)
      pending_tasks: [],
      files_changed: ["file.ts"],
      tests_failed: [],
      status: "active",
    });

    const sprints = await db.recentSprints(5);
    expect(sprints).toHaveLength(1);
    // fromJson receives an array → returns it directly (fast-path)
    expect(sprints[0].completed_tasks).toEqual(["task-a", "task-b"]);
    expect(sprints[0].files_changed).toEqual(["file.ts"]);

    await closeDb(db, tempDir);
  });
});

// ── addRubricRule — existing rule returns early (line 197) ─────────────────

describe("ExperienceDb.addRubricRule — duplicate detection (line 197)", () => {
  it("returns existing rule without inserting a duplicate", async () => {
    const { db, tempDir } = await makeDb();

    const first = await db.addRubricRule({ rule: "Always await promises.", category: "api" });
    const second = await db.addRubricRule({ rule: "Always await promises.", category: "api" });

    // Should return the same row object
    expect(second.id).toBe(first.id);
    // Only one rule should exist
    const rules = await db.listRubricRules();
    expect(rules.filter((r) => r.rule === "Always await promises.")).toHaveLength(1);

    await closeDb(db, tempDir);
  });

  it("inserts different rules independently", async () => {
    const { db, tempDir } = await makeDb();

    await db.addRubricRule({ rule: "Rule A" });
    await db.addRubricRule({ rule: "Rule B" });

    const rules = await db.listRubricRules();
    expect(rules).toHaveLength(2);
    await closeDb(db, tempDir);
  });

  it("listRubricRules activeOnly=true filters inactive rules", async () => {
    const { db, tempDir } = await makeDb();

    await db.addRubricRule({ rule: "Active rule", active: 1 });
    const inactiveRule = await db.addRubricRule({ rule: "Inactive rule", active: 1 });
    await db.setRubricActive(inactiveRule.id, false);

    const active = await db.listRubricRules({ activeOnly: true });
    expect(active.every((r) => Number(r.active) === 1)).toBe(true);
    expect(active.find((r) => r.rule === "Inactive rule")).toBeUndefined();

    await closeDb(db, tempDir);
  });
});

// ── recentLlmResponseChunks — quality priority ordering (line 248) ─────────

describe("ExperienceDb.recentLlmResponseChunks — quality priority (line 248)", () => {
  it("orders docs: good first, then null, then partial, then bad", async () => {
    const { db, tempDir } = await makeDb();

    await db.replaceDocumentsForFile("responses.md", [
      { content: "bad response",     embedding: ZERO_VEC, source_type: "llm-response", platform: "chatgpt", quality: "bad",     file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "partial response", embedding: ZERO_VEC, source_type: "llm-response", platform: "chatgpt", quality: "partial", file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "null response",    embedding: ZERO_VEC, source_type: "llm-response", platform: "chatgpt", quality: null,      file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "good response",    embedding: ZERO_VEC, source_type: "llm-response", platform: "chatgpt", quality: "good",    file_ts: "2026-01-01T00:00:00.000Z" },
    ]);

    const chunks = await db.recentLlmResponseChunks("chatgpt", 10);
    expect(chunks).toHaveLength(4);
    expect(chunks[0].quality).toBe("good");
    expect(chunks[1].quality).toBeNull();
    expect(chunks[2].quality).toBe("partial");
    expect(chunks[3].quality).toBe("bad");

    await closeDb(db, tempDir);
  });

  it("returns empty array when platform has no matching docs", async () => {
    const { db, tempDir } = await makeDb();
    const chunks = await db.recentLlmResponseChunks("perplexity", 5);
    expect(chunks).toEqual([]);
    await closeDb(db, tempDir);
  });

  it("unknown quality value sorts after 'bad' (getPriority else → 5)", async () => {
    const { db, tempDir } = await makeDb();

    await db.replaceDocumentsForFile("weird.md", [
      { content: "good",    embedding: ZERO_VEC, source_type: "llm-response", platform: "gemini", quality: "good",    file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "unknown", embedding: ZERO_VEC, source_type: "llm-response", platform: "gemini", quality: "unknown", file_ts: "2026-01-01T00:00:00.000Z" },
    ]);

    const chunks = await db.recentLlmResponseChunks("gemini", 10);
    expect(chunks[0].quality).toBe("good");
    expect(chunks[1].quality).toBe("unknown");

    await closeDb(db, tempDir);
  });
});

// ── getThreadsByPlatform — sorting (line 336) ─────────────────────────────

describe("ExperienceDb.getThreadsByPlatform — sorting (line 336)", () => {
  it("groups docs by filename and sorts by turn_index", async () => {
    const { db, tempDir } = await makeDb();

    await db.replaceDocumentsForFile("thread-a.md", [
      { content: "Turn 2", embedding: ZERO_VEC, source_type: "thread-turn", platform: "chatgpt", turn_index: 2, file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "Turn 1", embedding: ZERO_VEC, source_type: "thread-turn", platform: "chatgpt", turn_index: 1, file_ts: "2026-01-01T00:00:00.000Z" },
    ]);

    const result = await db.getThreadsByPlatform("chatgpt");
    expect(result).toHaveLength(2);
    expect(Number(result[0].turn_index)).toBe(1);
    expect(Number(result[1].turn_index)).toBe(2);

    await closeDb(db, tempDir);
  });

  it("final-sorts by filename when multiple thread files present", async () => {
    const { db, tempDir } = await makeDb();

    await db.replaceDocumentsForFile("/b/thread.md", [
      { content: "B Turn 1", embedding: ZERO_VEC, source_type: "thread-turn", platform: "chatgpt", turn_index: 1, file_ts: "2026-01-01T00:00:00.000Z" },
    ]);
    await db.replaceDocumentsForFile("/a/thread.md", [
      { content: "A Turn 1", embedding: ZERO_VEC, source_type: "thread-turn", platform: "chatgpt", turn_index: 1, file_ts: "2026-01-01T00:00:00.000Z" },
    ]);

    const result = await db.getThreadsByPlatform("chatgpt");
    // /a/thread.md comes before /b/thread.md lexicographically
    expect(result[0].filename).toBe("/a/thread.md");
    expect(result[1].filename).toBe("/b/thread.md");

    await closeDb(db, tempDir);
  });

  it("returns empty array when no thread docs for given platform", async () => {
    const { db, tempDir } = await makeDb();
    const result = await db.getThreadsByPlatform("unknown-platform");
    expect(result).toEqual([]);
    await closeDb(db, tempDir);
  });
});

// ── logEnhanceCycle (line 505) ────────────────────────────────────────────

describe("ExperienceDb.logEnhanceCycle (line 505)", () => {
  it("creates a prompt history entry via logEnhanceCycle", async () => {
    const { db, tempDir } = await makeDb();

    const row = await db.logEnhanceCycle({
      goal: "Enhance documentation",
      platform: "gemini",
      promptText: "Write better docs",
      responseFile: "/tmp/response.md",
      rating: 4,
      sprintId: "sprint-42",
    });

    expect(row.goal).toBe("Enhance documentation");
    expect(row.platform).toBe("gemini");
    expect(row.prompt).toBe("Write better docs");
    expect(row.prompt_text).toBe("Write better docs");
    expect(row.response_file).toBe("/tmp/response.md");
    expect(row.quality_rating).toBe(4);
    expect(row.sprint_id).toBe("sprint-42");

    await closeDb(db, tempDir);
  });

  it("uses a provided cycleTs", async () => {
    const { db, tempDir } = await makeDb();
    const ts = "2026-03-15T10:00:00.000Z";

    const row = await db.logEnhanceCycle({
      goal: "Test cycle",
      platform: "chatgpt",
      promptText: "Prompt text",
      cycleTs: ts,
    });

    expect(row.cycle_ts).toBe(ts);
    await closeDb(db, tempDir);
  });

  it("uses current timestamp when cycleTs is not provided", async () => {
    const { db, tempDir } = await makeDb();

    const before = Date.now();
    const row = await db.logEnhanceCycle({
      goal: "No cycle ts",
      platform: "chatgpt",
      promptText: "p",
    });
    const after = Date.now();

    const rowTs = Date.parse(row.cycle_ts);
    expect(rowTs).toBeGreaterThanOrEqual(before);
    expect(rowTs).toBeLessThanOrEqual(after);
    await closeDb(db, tempDir);
  });
});

// ── getThreadContext — null/empty query guard (line 519) ──────────────────

describe("ExperienceDb.getThreadContext — null/empty query (line 519)", () => {
  it("returns [] for null query", async () => {
    const { db, tempDir } = await makeDb();
    const result = await db.getThreadContext(null, "chatgpt");
    expect(result).toEqual([]);
    await closeDb(db, tempDir);
  });

  it("returns [] for undefined query", async () => {
    const { db, tempDir } = await makeDb();
    const result = await db.getThreadContext(undefined, "chatgpt");
    expect(result).toEqual([]);
    await closeDb(db, tempDir);
  });

  it("returns [] when query is all whitespace", async () => {
    const { db, tempDir } = await makeDb();
    const result = await db.getThreadContext("   ", null);
    expect(result).toEqual([]);
    await closeDb(db, tempDir);
  });

  it("limits results by the limit parameter", async () => {
    const { db, tempDir } = await makeDb();

    await db.replaceDocumentsForFile("t.md", [
      { content: "Thread turn A", embedding: UNIT_VEC(0), source_type: "thread-turn", platform: "chatgpt", turn_index: 1, file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "Thread turn B", embedding: UNIT_VEC(1), source_type: "thread-turn", platform: "chatgpt", turn_index: 2, file_ts: "2026-01-01T00:00:00.000Z" },
      { content: "Thread turn C", embedding: UNIT_VEC(2), source_type: "thread-turn", platform: "chatgpt", turn_index: 3, file_ts: "2026-01-01T00:00:00.000Z" },
    ]);

    const result = await db.getThreadContext("thread", "chatgpt", 2);
    expect(result.length).toBeLessThanOrEqual(2);

    await closeDb(db, tempDir);
  });
});

// ── getIngestionLog — empty log (line 532) ────────────────────────────────

describe("ExperienceDb.getIngestionLog — empty log", () => {
  it("returns an empty Map when no entries have been ingested", async () => {
    const { db, tempDir } = await makeDb();
    const log = await db.getIngestionLog();
    expect(log).toBeInstanceOf(Map);
    expect(log.size).toBe(0);
    await closeDb(db, tempDir);
  });

  it("returns Map with correct entries after upsertIngestionLog", async () => {
    const { db, tempDir } = await makeDb();

    await db.upsertIngestionLog({
      path: "/some/path.md",
      file_ts: "2026-01-01T00:00:00.000Z",
      chunk_count: 5,
    });
    await db.upsertIngestionLog({
      path: "/another/path.md",
      file_ts: "2026-02-01T00:00:00.000Z",
      chunk_count: 3,
    });

    const log = await db.getIngestionLog();
    expect(log.size).toBe(2);
    expect(log.get("/some/path.md").chunk_count).toBe(5);
    expect(log.get("/another/path.md").chunk_count).toBe(3);

    await closeDb(db, tempDir);
  });

  it("upserts an existing entry (updates rather than appending)", async () => {
    const { db, tempDir } = await makeDb();

    await db.upsertIngestionLog({ path: "/f.md", file_ts: "2026-01-01T00:00:00.000Z", chunk_count: 2 });
    await db.upsertIngestionLog({ path: "/f.md", file_ts: "2026-02-01T00:00:00.000Z", chunk_count: 7 });

    const log = await db.getIngestionLog();
    expect(log.size).toBe(1);
    expect(log.get("/f.md").chunk_count).toBe(7);

    await closeDb(db, tempDir);
  });
});

// ── _updatePromptRating — rating > 2 does not add mistake (line 611) ───────

describe("ExperienceDb._updatePromptRating — no mistake for high rating (line 611)", () => {
  it("updates rating=3 without adding mistake or rubric rule", async () => {
    const { db, tempDir } = await makeDb();

    const row = await db.addPromptHistory({ goal: "Good quality prompt", platform: "chatgpt", prompt: "p" });
    const updated = await db.ratePrompt(row.id, 3);

    expect(updated.rating).toBe(3);
    expect(updated.quality_rating).toBe(3);
    expect(db.state.mistakes).toHaveLength(0);
    expect(db.state.rubric_rules).toHaveLength(0);

    await closeDb(db, tempDir);
  });

  it("updates rating=5 (maximum) without side effects", async () => {
    const { db, tempDir } = await makeDb();

    const row = await db.addPromptHistory({ goal: "Excellent prompt", platform: "gemini", prompt: "q" });
    const updated = await db.ratePromptHistory(row.id, 5);

    expect(updated.rating).toBe(5);
    expect(db.state.mistakes).toHaveLength(0);

    await closeDb(db, tempDir);
  });

  it("still updates rating=2 (boundary) AND adds mistake", async () => {
    const { db, tempDir } = await makeDb();

    const row = await db.addPromptHistory({ goal: "Low quality", platform: "chatgpt", prompt: "r" });
    const updated = await db.ratePrompt(row.id, 2);

    expect(updated.rating).toBe(2);
    expect(db.state.mistakes.length).toBeGreaterThan(0);
    expect(db.state.rubric_rules.length).toBeGreaterThan(0);

    await closeDb(db, tempDir);
  });

  it("_updatePromptRating throws for non-existent id", async () => {
    const { db, tempDir } = await makeDb();
    await expect(db.ratePromptHistory(99999, 4)).rejects.toThrow("Prompt history not found");
    await closeDb(db, tempDir);
  });
});

// ── insertThread and getThreads ────────────────────────────────────────────

describe("ExperienceDb insertThread / getThreads", () => {
  it("inserts a thread and retrieves it via getThreads", async () => {
    const { db, tempDir } = await makeDb();

    const thread = await db.insertThread({
      platform: "chatgpt",
      captured_at: "2026-01-01T00:00:00.000Z",
      turn_count: 4,
      file_path: "/threads/chat.md",
    });

    expect(thread.id).toBe(1);
    expect(thread.platform).toBe("chatgpt");

    const threads = await db.getThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0].file_path).toBe("/threads/chat.md");

    await closeDb(db, tempDir);
  });

  it("getThreads respects limit parameter", async () => {
    const { db, tempDir } = await makeDb();

    for (let i = 0; i < 5; i++) {
      await db.insertThread({
        platform: "gemini",
        captured_at: new Date().toISOString(),
        turn_count: 2,
        file_path: `/threads/t${i}.md`,
      });
    }

    const threads = await db.getThreads(3);
    expect(threads).toHaveLength(3);

    await closeDb(db, tempDir);
  });

  it("insertThread with non-finite turn_count stores 0", async () => {
    const { db, tempDir } = await makeDb();

    const thread = await db.insertThread({
      platform: "claude",
      captured_at: "2026-01-01T00:00:00.000Z",
      turn_count: "not-a-number",
      file_path: "/t.md",
    });

    expect(thread.turn_count).toBe(0);
    await closeDb(db, tempDir);
  });
});
