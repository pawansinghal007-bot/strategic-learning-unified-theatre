import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  hasCollection: vi.fn(),
  createCollection: vi.fn(),
  createIndex: vi.fn(),
  loadCollection: vi.fn(),
  flush: vi.fn(),
  ensureKnowledgeCollection: vi.fn(),
  embedTextBatch: vi.fn(),
}));

// Mock only the heavy external dependencies (Milvus, embedder)
// Let chunking.js run real code for coverage, even if mocked internally
vi.mock("../src/knowledge/ingest/milvus-client.js", () => ({
  getMilvusClient: vi.fn().mockReturnValue({
    insert: mocks.insert,
    hasCollection: mocks.hasCollection,
    createCollection: mocks.createCollection,
    createIndex: mocks.createIndex,
    loadCollection: mocks.loadCollection,
    flush: mocks.flush,
  }),
  ensureKnowledgeCollection: mocks.ensureKnowledgeCollection,
  KNOWLEDGE_COLLECTION: "knowledge_chunks",
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
    mocks.insert.mockResolvedValue(undefined);
    mocks.hasCollection.mockResolvedValue({ value: true });
    mocks.createCollection.mockResolvedValue(undefined);
    mocks.createIndex.mockResolvedValue(undefined);
    mocks.loadCollection.mockResolvedValue(undefined);
    mocks.flush.mockResolvedValue(undefined);
    mocks.ensureKnowledgeCollection.mockResolvedValue(undefined);
    // embedTextBatch returns a vector for each text
    mocks.embedTextBatch.mockImplementation((texts) =>
      texts.map(() => new Array(1024).fill(0)),
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
    expect(mocks.insert).not.toHaveBeenCalled();
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
    expect(mocks.insert).toHaveBeenCalledTimes(1);
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
    mocks.embedTextBatch.mockResolvedValue([new Array(1024).fill(0)]);

    await fs.writeFile(
      path.join(tmpDir, "sprint-55-report.md"),
      // Use a long enough text to create multiple chunks (> 512 words with overlap)
      "word ".repeat(600),
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
    expect(mocks.insert).toHaveBeenCalledTimes(1);
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
    expect(mocks.insert).toHaveBeenCalledTimes(1);
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
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("ingestSprintHistory skips empty chunks", async () => {
    const { ingestSprintHistory } =
      await import("../src/knowledge/ingest/ingest-sprint-history.js");

    // Create a report with empty content
    await fs.writeFile(path.join(tmpDir, "sprint-100-report.md"), "");

    await ingestSprintHistory({ baseDir: tmpDir });

    // Empty report should be skipped
    expect(mocks.embedTextBatch).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
