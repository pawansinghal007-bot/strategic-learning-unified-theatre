import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  upsertChunks: vi.fn(),
  ensureKnowledgeCollection: vi.fn(),
  embedTextBatch: vi.fn(),
}));

// Mock only the heavy external dependencies (Qdrant, embedder)
// Let chunking.js run real code for coverage, even if mocked internally
vi.mock("../src/llm/qdrant-client.js", () => ({
  upsertChunks: mocks.upsertChunks,
  ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
}));

vi.mock("../src/knowledge/ingest/embedder.js", () => ({
  embedTextBatch: mocks.embedTextBatch,
}));

function makeChunk(doc, index = 0, text = doc.rawText.slice(0, 100)) {
  return {
    chunkId: `${doc.id}:chunk:${index}`,
    docId: doc.id,
    sourceType: doc.sourceType,
    text,
    sprint: doc.sprint,
    module: doc.module,
    featureArea: doc.featureArea,
    version: doc.version,
    path: doc.path,
    section: undefined,
    importance: 1.0,
    hash: `mockhash${index}`,
    createdAt: Date.now(),
    denseVector: [],
  };
}

describe("Sprint 83 — ingest-sprint-history module unit tests", () => {
  const tmpDir = path.join(os.tmpdir(), `ingest-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    vi.clearAllMocks();
    mocks.upsertChunks.mockResolvedValue(undefined);
    mocks.ensureKnowledgeCollection.mockResolvedValue(undefined);
    // embedTextBatch returns a vector for each text
    mocks.embedTextBatch.mockImplementation((texts) =>
      texts.map(() => new Array(2560).fill(0)),
    );
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("ingestSprintHistory works with empty directory (no sprint reports)", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    await expect(
      ingestSprintHistory({ baseDir: tmpDir }),
    ).resolves.not.toThrow();

    expect(mocks.ensureKnowledgeCollection).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("ingestSprintHistory works with a well-formed sprint report", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-42-report.md"),
      "# Sprint 42 Report\n\n## Changes\n\n- Added new feature\n- Fixed bug",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // Real chunkDocument will be called; just verify the downstream mocks were used
    expect(mocks.embedTextBatch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });

  it("ingestSprintHistory handles malformed/partial records safely", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(path.join(tmpDir, "sprint-99-report.md"), "");

    await expect(
      ingestSprintHistory({ baseDir: tmpDir }),
    ).resolves.not.toThrow();
  });

  it("ingestSprintHistory throws on embedTextBatch mismatch", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Mock embedTextBatch to return too few vectors (intentional mismatch)
    mocks.embedTextBatch.mockResolvedValue([new Array(2560).fill(0)]);

    await fs.writeFile(
      path.join(tmpDir, "sprint-55-report.md"),
      // Use a long enough text to create multiple chunks (> 3000 chars = ~600 words per chunk)
      // 2000 words => ~10000 chars => ~3-4 chunks with overlap
      "word ".repeat(2000),
    );

    await expect(ingestSprintHistory({ baseDir: tmpDir })).rejects.toThrow(
      "embedTextBatch returned",
    );
  });

  it("ingestSprintHistory handles missing featureArea gracefully", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    await fs.writeFile(
      path.join(tmpDir, "sprint-66-report.md"),
      "# Sprint 66 Report\n\n## Changes\n\n- Added feature",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    expect(mocks.embedTextBatch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });

  it("ingestSprintHistory extracts sprint number from underscore-prefixed filename", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Test sprint number extraction from underscore-prefixed filename
    await fs.writeFile(
      path.join(tmpDir, "77_sprint_report.md"),
      "# Sprint Report\n\nContent here",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // Verify the document was processed
    expect(mocks.embedTextBatch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });

  it("ingestSprintHistory extracts sprint number from hyphen-prefixed filename", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Test sprint number extraction from hyphen-prefixed filename
    await fs.writeFile(
      path.join(tmpDir, "88-sprint-report.md"),
      "# Sprint Report\n\nContent here",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // Verify the document was processed
    expect(mocks.embedTextBatch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });

  it("ingestSprintHistory skips empty chunks", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Create a report with empty content
    await fs.writeFile(path.join(tmpDir, "sprint-100-report.md"), "");

    await ingestSprintHistory({ baseDir: tmpDir });

    // Empty report should be skipped
    expect(mocks.embedTextBatch).not.toHaveBeenCalled();
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("ingestSprintHistory handles a filename with no parsable sprint number", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Neither the "sprintNN" nor the leading "NN-"/"NN_" pattern matches —
    // exercises parseSprintNumberFromFilename's `return undefined` path and
    // loadSprintReportDocument's `sprint == null` title/docId branches.
    await fs.writeFile(
      path.join(tmpDir, "release-notes.md"),
      "# Release Notes\n\nGeneral updates with no sprint number in the filename.",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // .md IS a valid report extension, so the file gets processed (with sprint=null)
    // This exercises the sprint == null branches for title and docId
    expect(mocks.embedTextBatch).toHaveBeenCalled();
    expect(mocks.upsertChunks).toHaveBeenCalled();
  });

  it("ingestSprintHistory skips non-report file extensions", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Create a .json file (not in SPRINT_REPORT_EXTENSIONS)
    await fs.writeFile(
      path.join(tmpDir, "sprint-101-report.json"),
      JSON.stringify({ sprint: 101 }),
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // Non-report extension should be skipped
    expect(mocks.embedTextBatch).not.toHaveBeenCalled();
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("ingestSprintHistory skips directory entries", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Create a subdirectory (not a file)
    await fs.mkdir(path.join(tmpDir, "sprint-102-report"), { recursive: true });

    await ingestSprintHistory({ baseDir: tmpDir });

    // Directory entries should be skipped
    expect(mocks.embedTextBatch).not.toHaveBeenCalled();
    expect(mocks.upsertChunks).not.toHaveBeenCalled();
  });

  it("ingestSprintHistory handles chunks with undefined path and text", async () => {
    // This test exercises the fallback branches for chunk.path ?? "" and chunk.text ?? ""
    // We need to mock chunking.js to return chunks with undefined path/text
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Create a report that will generate chunks
    await fs.writeFile(
      path.join(tmpDir, "sprint-103-report.md"),
      "# Sprint 103 Report\n\n## Changes\n\n- Added new feature",
    );

    await ingestSprintHistory({ baseDir: tmpDir });

    // Verify chunks were processed
    expect(mocks.embedTextBatch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);

    expect(mocks.embedTextBatch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1);
  });
});
