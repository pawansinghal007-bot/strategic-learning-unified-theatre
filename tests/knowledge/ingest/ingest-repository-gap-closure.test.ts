/**
 * Gap closure tests for src/knowledge/ingest/ingest-repository.js
 *
 * Targets testable BRDA branches:
 * - BRDA:61,1,0,0: walkFiles — stat.isFile() true path (line 61)
 * - BRDA:68,4,1,0: walkFiles — else if dirent.isFile() path (line 68)
 * - BRDA:79,5,0,0: isSupported — EXCLUDED_FILES.has(base) true path (line 79)
 * - BRDA:80,6,0,0: isSupported — base.endsWith(".bundled.cjs") true path (line 80)
 * - BRDA:97,7,1,0: getSourceType — map[ext] || "text" fallback (line 97)
 * - BRDA:141,15,0,0: createChunksForFile — text.length === 0 early return (line 141)
 * - BRDA:202,19,0,0: attachVectors — vector count mismatch throw (line 202)
 *
 * Untestable branches (handled via v8-ignore in source):
 * - BRDA:191/197: attachVectors oversized chunk skip (chunkText produces max 3000-char chunks < 6000 threshold)
 * - BRDA:219-224: chunkToQdrantPoint field defaults (createChunksForFile always sets all fields)
 * - BRDA:228/230: chunkToQdrantPoint null text fallback (createChunksForFile always sets text)
 * - BRDA:294-305: main() CLI entry (VITEST-gated, not exported, env mutation risk)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Mock dependencies
const mocks = {
  embedTextBatch: vi.fn(),
  upsertChunks: vi.fn(),
  ensureKnowledgeCollection: vi.fn(),
  getExistingFileHashes: vi.fn(),
  deleteChunksByDocId: vi.fn(),
};

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: mocks.embedTextBatch,
}));

vi.mock("../../../src/llm/qdrant-client.js", () => ({
  upsertChunks: mocks.upsertChunks,
  ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
  getExistingFileHashes: mocks.getExistingFileHashes,
  deleteChunksByDocId: mocks.deleteChunksByDocId,
}));

describe("ingest-repository.js — gap closure", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-gap-"));
    mocks.embedTextBatch.mockReset();
    mocks.upsertChunks.mockReset();
    mocks.ensureKnowledgeCollection.mockReset();
    mocks.getExistingFileHashes.mockReset();
    mocks.getExistingFileHashes.mockResolvedValue(new Map());
    mocks.deleteChunksByDocId.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // =====================================================================
  // Category 1: walkFiles uncovered branches (lines 61, 68)
  // =====================================================================

  describe("walkFiles branches", () => {
    // BRDA:61,1,0,0 — stat.isFile() true path (line 61)
    it("BRDA:61 — walkFiles yields file when baseDir is a direct file path", async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      const testFile = path.join(tempDir, "direct.md");
      await fs.writeFile(testFile, "direct file content");

      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await ingestRepository({ baseDir: testFile });

      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    });

    // BRDA:68,4,1,0 — else if dirent.isFile() path (line 68)
    it("BRDA:68 — walkFiles yields child via dirent.isFile() branch", async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      const subDir = path.join(tempDir, "src");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(
        path.join(subDir, "component.ts"),
        "export const x = 1;",
      );

      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await ingestRepository({ baseDir: tempDir });

      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
      const insertedData = mocks.upsertChunks.mock.calls[0][0];
      expect(insertedData[0].path).toMatch("component.ts");
    });
  });

  // =====================================================================
  // Category 2: isSupported uncovered branches (lines 79, 80)
  // =====================================================================

  describe("isSupported branches", () => {
    // BRDA:79,5,0,0 — EXCLUDED_FILES.has(base) true path (line 79)
    it("BRDA:79 — isSupported returns false for EXCLUDED_FILES", async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      await fs.writeFile(
        path.join(tempDir, "package-lock.json"),
        '{"name": "test"}',
      );
      await fs.writeFile(path.join(tempDir, "readme.md"), "# Hello");

      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await ingestRepository({ baseDir: tempDir });

      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
      const insertedData = mocks.upsertChunks.mock.calls[0][0];
      expect(insertedData[0].path).toMatch("readme.md");
    });

    // BRDA:80,6,0,0 — base.endsWith(".bundled.cjs") true path (line 80)
    it('BRDA:80 — isSupported returns false for ".bundled.cjs" files', async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      await fs.writeFile(
        path.join(tempDir, "vendor.bundled.cjs"),
        "module.exports = 1;",
      );
      await fs.writeFile(path.join(tempDir, "index.js"), "console.log(1);");

      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await ingestRepository({ baseDir: tempDir });

      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
      const insertedData = mocks.upsertChunks.mock.calls[0][0];
      expect(insertedData[0].path).toMatch("index.js");
    });
  });

  // =====================================================================
  // Category 3: getSourceType fallback (line 97)
  // =====================================================================

  describe("getSourceType branches", () => {
    // BRDA:97,7,1,0 — map[ext] || "text" fallback for .txt extension
    it('BRDA:97 — getSourceType returns "text" for .txt files', async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      await fs.writeFile(path.join(tempDir, "notes.txt"), "some notes");

      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await ingestRepository({ baseDir: tempDir });

      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
      const insertedData = mocks.upsertChunks.mock.calls[0][0];
      expect(insertedData[0].source_type).toBe("text");
    });
  });

  // =====================================================================
  // Category 4: createChunksForFile empty text (line 141)
  // =====================================================================

  describe("createChunksForFile branches", () => {
    // BRDA:141,15,0,0 — text.length === 0 early return
    it("BRDA:141 — createChunksForFile returns [] for empty text", async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      await fs.writeFile(path.join(tempDir, "empty.md"), "");

      mocks.embedTextBatch.mockResolvedValue([]);

      await ingestRepository({ baseDir: tempDir });

      expect(mocks.upsertChunks).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Category 5: attachVectors vector count mismatch (line 202)
  // =====================================================================

  describe("attachVectors branches", () => {
    // BRDA:202,19,0,0 — vector count mismatch throw
    it("BRDA:202 — attachVectors throws on vector count mismatch", async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      await fs.writeFile(
        path.join(tempDir, "mismatch.md"),
        "normal content for embedding",
      );

      // Return 0 vectors for 1+ chunks → mismatch
      mocks.embedTextBatch.mockResolvedValue([]);

      await expect(ingestRepository({ baseDir: tempDir })).rejects.toThrow(
        "embedTextBatch returned",
      );
    });
  });

  // =====================================================================
  // Category 6: buildChunksForBatch catch branch (lines 175-190)
  // =====================================================================

  describe("buildChunksForBatch branches", () => {
    // BRDA:186,20,0,0 — catch (err) branch when readFile fails
    it("BRDA:186 — buildChunksForBatch catches readFile errors and continues", async () => {
      const { ingestRepository } =
        await import("../../../src/knowledge/ingest/ingest-repository.js");

      // Create a readable file and an unreadable file
      await fs.writeFile(path.join(tempDir, "good.md"), "good content");
      const badFile = path.join(tempDir, "bad.md");
      await fs.writeFile(badFile, "bad content");
      // Make the file unreadable by removing permissions
      await fs.chmod(badFile, 0o000);

      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      // Should not throw — the catch branch should skip the unreadable file
      await ingestRepository({ baseDir: tempDir });

      // Should have processed the good file
      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
      const insertedData = mocks.upsertChunks.mock.calls[0][0];
      expect(insertedData[0].path).toMatch("good.md");

      // Cleanup: restore permissions so temp dir can be removed
      await fs.chmod(badFile, 0o644).catch(() => {});
    });
  });
});
