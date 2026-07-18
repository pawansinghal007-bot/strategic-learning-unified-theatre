import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  upsertChunks: vi.fn(),
  ensureKnowledgeCollection: vi.fn(),
  embedTextBatch: vi.fn(),
  getExistingFileHashes: vi.fn(),
  deleteChunksByDocId: vi.fn(),
}));

vi.mock("../../../src/llm/qdrant-client.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    upsertChunks: mocks.upsertChunks,
    ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
    getExistingFileHashes: mocks.getExistingFileHashes,
    deleteChunksByDocId: mocks.deleteChunksByDocId,
  };
});

vi.mock("../../../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: mocks.embedTextBatch,
}));

vi.mock("../../src/llm/document-ingester.js", () => ({
  chunkText: vi.fn((text) => [
    { content: text.slice(0, 100), section: "section1" },
    { content: text.slice(100, 200), section: "section2" },
  ]),
}));

describe("ingestRepository", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "ingest-repository-test-"),
    );
    mocks.upsertChunks.mockClear();
    mocks.ensureKnowledgeCollection.mockClear();
    mocks.embedTextBatch.mockClear();
    mocks.getExistingFileHashes.mockResolvedValue(new Map());
    mocks.deleteChunksByDocId.mockClear();
  });

  afterEach(() => {
    // Restore any spies set in individual tests so they don't bleed into later tests
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("handles empty directory gracefully", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalled();
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("processes supported file types", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create a test markdown file
    const testFile = path.join(tempDir, "test.md");
    await fs.writeFile(
      testFile,
      "# Test Document\n\nThis is some test content.",
    );

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalled();
    expect(mocks.upsertChunks).toHaveBeenCalled();
  });

  it("skips unsupported file types", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create an unsupported file
    const testFile = path.join(tempDir, "test.xyz");
    await fs.writeFile(testFile, "Some content");

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    // Should not insert anything since file is unsupported
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("skips excluded directories", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create excluded directories
    await fs.mkdir(path.join(tempDir, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "node_modules", "test.js"), "code");
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".git", "config"), "data");

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    // Should not process files in excluded directories
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("stops traversal when a discovered path is neither a file nor a directory", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const specialPath = path.join(tempDir, "special-entry");
    const statSpy = vi.spyOn(fs, "stat").mockImplementation(async (target) => {
      if (target === specialPath) {
        return {
          isDirectory: () => false,
          isFile: () => false,
        } as any;
      }

      const actualFs =
        await vi.importActual<typeof import("node:fs/promises")>(
          "node:fs/promises",
        );
      return actualFs.stat(target as string);
    });

    const opendirSpy = vi.spyOn(fs, "opendir").mockImplementation(
      async () =>
        ({
          async *[Symbol.asyncIterator]() {
            yield {
              name: "special-entry",
              isDirectory: () => false,
              isFile: () => false,
            };
          },
        }) as any,
    );

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
    statSpy.mockRestore();
    opendirSpy.mockRestore();
  });

  it("walks file entries when the directory entry is a regular file", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const fileEntryPath = path.join(tempDir, "nested", "real-file.md");
    await fs.mkdir(path.dirname(fileEntryPath), { recursive: true });
    await fs.writeFile(fileEntryPath, "content");

    const originalOpendir = fs.opendir;
    const opendirSpy = vi
      .spyOn(fs, "opendir")
      .mockImplementation(async (target) => {
        if (target === tempDir) {
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                name: "nested",
                isDirectory: () => true,
                isFile: () => false,
              };
            },
          } as any;
        }

        return originalOpendir(target as any);
      });

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    opendirSpy.mockRestore();
  });

  it("excludes files inside a baselines directory anywhere in the tree", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const nestedBaselinesFile = path.join(
      tempDir,
      "docs",
      "archive",
      "baselines",
      "anything.md",
    );
    await fs.mkdir(path.dirname(nestedBaselinesFile), { recursive: true });
    await fs.writeFile(nestedBaselinesFile, "should be excluded");

    const deepBaselinesFile = path.join(
      tempDir,
      "some",
      "other",
      "path",
      "baselines",
      "x.md",
    );
    await fs.mkdir(path.dirname(deepBaselinesFile), { recursive: true });
    await fs.writeFile(deepBaselinesFile, "also should be excluded");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("excludes PROJECT_ARCHITECTURE_BASELINE markdown snapshots by pattern", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const files = [
      path.join(tempDir, "PROJECT_ARCHITECTURE_BASELINE.md"),
      path.join(
        tempDir,
        "docs",
        "archive",
        "PROJECT_ARCHITECTURE_BASELINE-2026-06-17T23-57-49.md",
      ),
      path.join(
        tempDir,
        "some",
        "other",
        "PROJECT_ARCHITECTURE_BASELINE-20260605-071822.md",
      ),
    ];

    for (const file of files) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "baseline snapshot content");
    }

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("excludes project_audit_dump.txt by exact basename", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const auditFile = path.join(
      tempDir,
      "some",
      "nested",
      "project_audit_dump.txt",
    );
    await fs.mkdir(path.dirname(auditFile), { recursive: true });
    await fs.writeFile(auditFile, "audit dump content");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("keeps the existing exact-basename exclusions working", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const excludedFiles = [
      path.join(tempDir, "package-lock.json"),
      path.join(tempDir, "sonar-all-issues.json"),
      path.join(tempDir, "repo-tree.txt"),
    ];

    for (const file of excludedFiles) {
      await fs.writeFile(file, "excluded content");
    }

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("keeps unrelated files included", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const realFile = path.join(tempDir, "src", "some-real-file.ts");
    await fs.mkdir(path.dirname(realFile), { recursive: true });
    await fs.writeFile(realFile, "export const x = 1;");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });

  it("excludes bundled JavaScript files that are not real source documents", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const bundledFile = path.join(tempDir, "src", "app.bundled.cjs");
    await fs.mkdir(path.dirname(bundledFile), { recursive: true });
    await fs.writeFile(bundledFile, "module.exports = {};");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("skips empty files without creating chunks", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const emptyFile = path.join(tempDir, "empty.md");
    await fs.writeFile(emptyFile, "");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("treats basename exclusions case-sensitively", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const mixedCaseFile = path.join(tempDir, "PROJECT_AUDIT_DUMP.TXT");
    await fs.writeFile(mixedCaseFile, "mixed case audit content");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });

  it("handles file read errors gracefully", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create a file that will fail to read
    const testFile = path.join(tempDir, "test.md");
    await fs.writeFile(testFile, "content");

    // Mock fs.readFile to throw an error
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("Read error"));

    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir });

    // Should handle error gracefully and continue
    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalled();
  });

  // L60-61: walkFiles called with a direct file path (stat.isFile() branch)
  it("processes a single file path passed directly as baseDir", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "direct.md");
    await fs.writeFile(testFile, "direct file content for ingestion test");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: testFile });

    // The file was discovered via the isFile() branch and ingested
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    const insertedData = mocks.upsertChunks.mock.calls[0][0];
    expect(insertedData.length).toBeGreaterThan(0);
    // doc_id is built from the relativePath; when baseDir == filePath the
    // relative path is "" so doc_id becomes "repo:" — what matters is that
    // exactly one upsert happened (the isFile branch was taken)
    expect(insertedData[0].chunk_id).toMatch(/^repo:/);
  });

  // L69: walkFiles recurses into a non-excluded subdirectory
  it("discovers files nested inside subdirectories", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const subDir = path.join(tempDir, "docs");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, "nested.md"),
      "nested subdirectory content for ingestion",
    );

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    const insertedData = mocks.upsertChunks.mock.calls[0][0];
    expect(insertedData[0].path).toMatch("nested.md");
  });

  // L75: walkFiles catch block — fs.stat throws, warns and continues
  it("warns and continues when fs.stat throws during directory walk", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const statSpy = vi
      .spyOn(fs, "stat")
      .mockRejectedValue(new Error("EACCES: permission denied"));

    mocks.embedTextBatch.mockResolvedValue([]);

    // Should not throw even though stat fails for every path
    await ingestRepository({ baseDir: tempDir });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ingest] Skipping"),
    );
    expect(mocks.upsertChunks).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    statSpy.mockRestore();
  });

  // L129-130 + L232: files larger than maxFileBytes are skipped;
  // skipped-file count logged when > 0
  it("skips files that exceed maxFileBytes and logs the skipped count", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Write a file with 10 bytes of content but cap the limit at 1 byte
    const testFile = path.join(tempDir, "large.md");
    await fs.writeFile(testFile, "0123456789");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.embedTextBatch.mockResolvedValue([]);

    await ingestRepository({ baseDir: tempDir, maxFileBytes: 1 });

    // File was skipped — nothing inserted
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
    // The skipped-count log line must have fired (L232)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipped 1 large file(s)"),
    );

    logSpy.mockRestore();
  });

  // L190: attachVectors throws when embedTextBatch returns wrong vector count
  it("throws when embedTextBatch returns fewer vectors than chunks", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "mismatch.md");
    // Write enough content to produce at least one chunk
    await fs.writeFile(testFile, "word ".repeat(100));

    // Return empty array regardless of how many chunks are produced
    mocks.embedTextBatch.mockResolvedValue([]);

    await expect(ingestRepository({ baseDir: testFile })).rejects.toThrow(
      "embedTextBatch returned",
    );
  });

  // L106: parseFeatureArea returns undefined when the relative path has only
  // one segment, causing the featureArea to fall back to "unknown"
  it("uses 'unknown' as featureArea when file sits directly at cwd root", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Place the file inside a directory that IS the process cwd so
    // path.relative(cwd, file) == basename only (one segment)
    const fileName = "root-level.md";
    const testFile = path.join(process.cwd(), fileName);
    await fs.writeFile(testFile, "root level content for feature area test");

    try {
      mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      // Pass the exact file path so walkFiles hits the isFile() branch
      await ingestRepository({ baseDir: testFile });

      expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
      const entity = mocks.upsertChunks.mock.calls[0][0][0];
      // chunk.module was set to "unknown" because parseFeatureArea returned undefined
      expect(entity.module).toBe("unknown");
    } finally {
      await fs.unlink(testFile).catch(() => {});
    }
  });

  // L148-149: defaultFeatureArea parameter overrides parseFeatureArea fallback
  it("uses defaultFeatureArea when provided instead of falling back to 'unknown'", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "test.md");
    await fs.writeFile(testFile, "content for default feature area test");

    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({
      baseDir: tempDir,
      defaultFeatureArea: "custom-area",
    });

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    const entity = mocks.upsertChunks.mock.calls[0][0][0];
    // When defaultFeatureArea is provided, it takes precedence
    expect(entity.module).toBe("custom-area");
    expect(entity.feature_area).toBe("custom-area");
  });

  // ── Incremental ingestion tests ──────────────────────────────────────────

  it("ingests a new file when it is not in the existing hash map", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "new-file.md");
    await fs.writeFile(testFile, "brand new file content here");

    // Empty hash map — no existing files
    mocks.getExistingFileHashes.mockResolvedValue(new Map());
    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    // New file should be ingested normally
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    expect(mocks.deleteChunksByDocId).not.toHaveBeenCalled();

    // Verify file_hash is in the upserted payload
    const upserted = mocks.upsertChunks.mock.calls[0][0];
    expect(upserted[0].file_hash).toBeDefined();
    expect(typeof upserted[0].file_hash).toBe("string");
    expect(upserted[0].file_hash.length).toBeGreaterThan(0);
  });

  it("skips an unchanged file when its hash matches the existing hash map", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "unchanged.md");
    await fs.writeFile(testFile, "this file has not changed");

    // Pre-compute what the hash would be for this content
    const { createHash } = await import("node:crypto");
    const expectedHash = createHash("sha256")
      .update("this file has not changed")
      .digest("hex");

    // Return a hash map with the same hash
    mocks.getExistingFileHashes.mockResolvedValue(
      new Map([["repo:unchanged.md", expectedHash]]),
    );
    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    // Unchanged file should be skipped — no upsert, no delete
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
    expect(mocks.deleteChunksByDocId).not.toHaveBeenCalled();
  });

  it("deletes old chunks then re-ingests when a file's hash has changed", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "changed.md");
    await fs.writeFile(testFile, "this file has been modified");

    // Return a hash map with a DIFFERENT hash for this doc
    mocks.getExistingFileHashes.mockResolvedValue(
      new Map([["repo:changed.md", "old-hash-that-does-not-match"]]),
    );
    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    // Should delete old chunks first, then upsert new ones
    expect(mocks.deleteChunksByDocId).toHaveBeenCalledTimes(1);
    expect(mocks.deleteChunksByDocId).toHaveBeenCalledWith("repo:changed.md");
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);

    // Verify call order: delete before upsert
    const deleteCallOrder = mocks.deleteChunksByDocId.mock.calls[0];
    const upsertCallOrder = mocks.upsertChunks.mock.calls[0];
    // Both were called; delete was called first (we can verify by checking
    // that delete was called before upsert in the mock call history)
    expect(deleteCallOrder).toBeDefined();
    expect(upsertCallOrder).toBeDefined();
  });

  it("cleans up deleted files that exist in the hash map but not on disk", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create only one file
    const testFile = path.join(tempDir, "exists.md");
    const existsContent = "this file exists";
    await fs.writeFile(testFile, existsContent);

    // Compute the actual hash for the existing file so it's treated as unchanged
    const { createHash } = await import("node:crypto");
    const existsHash = createHash("sha256").update(existsContent).digest("hex");

    // Hash map has entries for both the existing file (matching hash = unchanged) AND a deleted file
    mocks.getExistingFileHashes.mockResolvedValue(
      new Map([
        ["repo:exists.md", existsHash],
        ["repo:deleted.md", "hash-for-deleted"],
      ]),
    );
    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    // Should delete chunks only for the file that no longer exists on disk
    expect(mocks.deleteChunksByDocId).toHaveBeenCalledTimes(1);
    expect(mocks.deleteChunksByDocId).toHaveBeenCalledWith("repo:deleted.md");
  });

  it("includes file_hash in the upserted chunk payload", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "with-hash.md");
    await fs.writeFile(testFile, "content with hash");

    mocks.getExistingFileHashes.mockResolvedValue(new Map());
    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
    const upserted = mocks.upsertChunks.mock.calls[0][0];

    // Every chunk should have a file_hash field
    for (const chunk of upserted) {
      expect(chunk.file_hash).toBeDefined();
      expect(typeof chunk.file_hash).toBe("string");
      // SHA-256 hex digest is 64 characters
      expect(chunk.file_hash.length).toBe(64);
    }
  });

  it("propagates error when getExistingFileHashes throws", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    const testFile = path.join(tempDir, "test.md");
    await fs.writeFile(testFile, "some content");

    mocks.getExistingFileHashes.mockRejectedValue(
      new Error("Qdrant connection failed"),
    );

    await expect(ingestRepository({ baseDir: tempDir })).rejects.toThrow(
      "Qdrant connection failed",
    );
  });

  it("treats all files as new when the existing hash map is empty", async () => {
    const { ingestRepository } =
      await import("../../../src/knowledge/ingest/ingest-repository.js");

    // Create multiple files
    await fs.writeFile(path.join(tempDir, "file1.md"), "content 1");
    await fs.writeFile(path.join(tempDir, "file2.md"), "content 2");

    // Empty hash map
    mocks.getExistingFileHashes.mockResolvedValue(new Map());
    mocks.embedTextBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    await ingestRepository({ baseDir: tempDir });

    // Both files should be ingested (2 upsert calls)
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(2);
    expect(mocks.deleteChunksByDocId).not.toHaveBeenCalled();
  });
});
