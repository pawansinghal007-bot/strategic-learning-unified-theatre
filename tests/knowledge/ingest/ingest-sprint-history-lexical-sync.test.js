/**
 * Regression tests for ingest-sprint-history lexical index sync (issue #2).
 *
 * Before the fix, ingest-sprint-history.js only wrote to Qdrant — it never
 * called upsertLexicalChunks() or deleteLexicalChunksByDocId(), so sprint
 * report content was invisible to the BM25/FTS5 lexical arm of hybrid search.
 *
 * These tests confirm:
 *  1. ingestSprintHistory() writes to BOTH Qdrant and the lexical index.
 *  2. Re-ingesting a changed sprint report first clears the lexical index
 *     entry (deleteLexicalChunksByDocId) before upserting new content.
 *  3. The lexical upsert receives correctly shaped rows
 *     (chunk_id, doc_id, path, section, feature_area, source_type, sprint,
 *      module, content).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  upsertChunks: vi.fn(),
  ensureKnowledgeCollection: vi.fn(),
  embedTextBatch: vi.fn(),
  upsertLexicalChunks: vi.fn(),
  deleteLexicalChunksByDocId: vi.fn(),
}));

vi.mock("../../../src/llm/qdrant-client.js", () => ({
  upsertChunks: mocks.upsertChunks,
  ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
}));

vi.mock("../../../src/llm/lexical-index.js", () => ({
  upsertLexicalChunks: mocks.upsertLexicalChunks,
  deleteLexicalChunksByDocId: mocks.deleteLexicalChunksByDocId,
}));

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedChunksWithCache: mocks.embedTextBatch,
}));

describe("ingestSprintHistory — lexical index sync regression", () => {
  const tmpDir = path.join(os.tmpdir(), `sprint-lexical-sync-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    vi.clearAllMocks();
    mocks.upsertChunks.mockResolvedValue(undefined);
    mocks.ensureKnowledgeCollection.mockResolvedValue(undefined);
    mocks.embedTextBatch.mockImplementation((chunks) =>
      Promise.resolve(chunks.map(() => new Array(2560).fill(0))),
    );
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // ── Test 1: both indexes are written for a fresh ingest ──────────────────

  it("writes to both Qdrant and the lexical index when ingesting a sprint report", async () => {
    const { ingestSprintHistory } =
      await import("../../../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-42-report.md"),
      "# Sprint 42\n\nImplemented the new feature and fixed the critical bug.",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // Qdrant upsert must have been called
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);

    // Lexical upsert must also have been called (the fix)
    expect(mocks.upsertLexicalChunks).toHaveBeenCalledTimes(1);
  });

  // ── Test 2: lexical rows have the correct shape ───────────────────────────

  it("passes correctly shaped rows to upsertLexicalChunks", async () => {
    const { ingestSprintHistory } =
      await import("../../../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-10-report.md"),
      "# Sprint 10\n\nSome content about the work done.",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    expect(mocks.upsertLexicalChunks).toHaveBeenCalledTimes(1);
    const rows = mocks.upsertLexicalChunks.mock.calls[0][0];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // Required lexical-index fields
      expect(typeof row.chunk_id).toBe("string");
      expect(row.chunk_id.length).toBeGreaterThan(0);
      expect(typeof row.doc_id).toBe("string");
      expect(typeof row.path).toBe("string");
      expect(typeof row.section).toBe("string");
      expect(typeof row.feature_area).toBe("string");
      expect(typeof row.source_type).toBe("string");
      expect(typeof row.sprint).toBe("number");
      expect(typeof row.module).toBe("string");
      expect(typeof row.content).toBe("string");
      expect(row.content.length).toBeGreaterThan(0);
    }
  });

  // ── Test 3: doc_id in lexical rows matches Qdrant points ─────────────────

  it("uses the same doc_id in both Qdrant points and lexical rows", async () => {
    const { ingestSprintHistory } =
      await import("../../../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-7-report.md"),
      "# Sprint 7\n\nContent for doc_id consistency check.",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    const qdrantPoints = mocks.upsertChunks.mock.calls[0][0];
    const lexicalRows = mocks.upsertLexicalChunks.mock.calls[0][0];

    const qdrantDocIds = new Set(qdrantPoints.map((p) => p.doc_id));
    const lexicalDocIds = new Set(lexicalRows.map((r) => r.doc_id));

    // Every doc_id present in Qdrant must also be in lexical index
    for (const docId of qdrantDocIds) {
      expect(lexicalDocIds).toContain(docId);
    }
  });

  // ── Test 4: deleteLexicalChunksByDocId is called before upsert ────────────

  it("calls deleteLexicalChunksByDocId before upsertLexicalChunks on each ingest", async () => {
    const { ingestSprintHistory } =
      await import("../../../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-99-report.md"),
      "# Sprint 99\n\nRe-ingestion scenario content.",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // deleteLexicalChunksByDocId must have been called (stale entry removal)
    expect(mocks.deleteLexicalChunksByDocId).toHaveBeenCalledTimes(1);

    // It must have been called with the correct doc_id
    const deletedDocId = mocks.deleteLexicalChunksByDocId.mock.calls[0][0];
    expect(typeof deletedDocId).toBe("string");
    expect(deletedDocId).toMatch(/sprint-99/);

    // Delete was registered before upsert in the call sequence
    const deleteOrder = mocks.deleteLexicalChunksByDocId.mock.invocationCallOrder[0];
    const upsertLexicalOrder = mocks.upsertLexicalChunks.mock.invocationCallOrder[0];
    const upsertQdrantOrder = mocks.upsertChunks.mock.invocationCallOrder[0];

    expect(deleteOrder).toBeLessThan(upsertQdrantOrder);
    expect(deleteOrder).toBeLessThan(upsertLexicalOrder);
  });

  // ── Test 5: multiple sprint reports each write to both indexes ────────────

  it("writes to both indexes for each sprint report file", async () => {
    const { ingestSprintHistory } =
      await import("../../../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-1-report.md"),
      "# Sprint 1\n\nFirst sprint content.",
    );
    await fs.writeFile(
      path.join(tmpDir, "sprint-2-report.md"),
      "# Sprint 2\n\nSecond sprint content.",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // One lexical delete + one lexical upsert per file
    expect(mocks.deleteLexicalChunksByDocId).toHaveBeenCalledTimes(2);
    expect(mocks.upsertLexicalChunks).toHaveBeenCalledTimes(2);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(2);
  });

  // ── Test 6: empty directory — no lexical calls ───────────────────────────

  it("does not call lexical functions when the directory is empty", async () => {
    const { ingestSprintHistory } =
      await import("../../../src/knowledge/ingest/ingest-sprint-history.js");

    await ingestSprintHistory({ baseDir: tmpDir });

    expect(mocks.upsertLexicalChunks).not.toHaveBeenCalled();
    expect(mocks.deleteLexicalChunksByDocId).not.toHaveBeenCalled();
  });
});
