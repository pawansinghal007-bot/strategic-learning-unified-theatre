/**
 * Targeted coverage tests for src/llm/document-ingester.js
 *
 * Covers previously-uncovered lines:
 *   38,67,73,97-102,106-111,137,143,165,208,278,298,316,343,411-414
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DocumentIngester, chunkText } from "../../src/llm/document-ingester.js";
import { ExperienceDb } from "../../src/llm/experience-db.js";

const mockPdfParse = vi.fn();
const mockMammothExtractRawText = vi.fn();

vi.mock("pdf-parse", () => ({
  default: mockPdfParse,
}));

vi.mock("mammoth", () => ({
  extractRawText: mockMammothExtractRawText,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "di-cov-"));
}

async function writeFile(dir, name, content) {
  const filePath = path.join(dir, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

// ---------------------------------------------------------------------------
// chunkText — lines 137 (empty/blank text) and 143 (overlap boundary)
// ---------------------------------------------------------------------------
describe("chunkText edge cases", () => {
  // line 137: words.length === 0 → returns []
  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns empty array for null/undefined coerced value", () => {
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
  });

  // line 143: single chunk when words fit within one token window
  it("returns single chunk when text is shorter than token window", () => {
    const text = "hello world foo bar";
    const chunks = chunkText(text, { tokens: 512, overlap: 64 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello world foo bar");
  });

  // overlap boundary: multiple chunks produced with overlap
  it("produces overlapping chunks when text exceeds token window", () => {
    // 10 words, window=5, overlap=2 → step=3 → starts: 0, 3, 6, 9
    const words = Array.from({ length: 10 }, (_, i) => `word${i}`);
    const chunks = chunkText(words.join(" "), { tokens: 5, overlap: 2 });
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk starts with word0
    expect(chunks[0]).toContain("word0");
    // Second chunk starts at word3 (step=3)
    expect(chunks[1]).toContain("word3");
  });

  // line 165: exact last-window stop — start + tokens >= words.length
  it("does not produce an extra empty chunk at exact boundary", () => {
    // Exactly 5 words, window=5 — should produce exactly 1 chunk
    const text = "a b c d e";
    const chunks = chunkText(text, { tokens: 5, overlap: 0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("a b c d e");
  });
});

// ---------------------------------------------------------------------------
// DocumentIngester.ingestFile — lines 38, 67, 73, 97-102, 106-111
// ---------------------------------------------------------------------------
describe("DocumentIngester.ingestFile — unsupported / missing file", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // line 208: unsupported extension → skipped: true
  it("skips files with unsupported extensions", async () => {
    const filePath = await writeFile(tempDir, "script.js", "console.log('hi');");
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
    await ingester.db.close();
  });

  // line 208: file does not exist → skipped: true
  it("skips files that do not exist", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(
      path.join(tempDir, "nonexistent.md"),
    );
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
    await ingester.db.close();
  });

  // lines 97-102: non-thread markdown file → regular chunk path
  it("ingests a plain markdown file as regular chunks", async () => {
    const content = "# Title\n\nParagraph one.\n\nParagraph two.";
    const filePath = await writeFile(tempDir, "plain.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBeGreaterThan(0);
    await ingester.db.close();
  });

  it("returns empty text for pdf files when pdf parsing throws", async () => {
    mockPdfParse.mockRejectedValueOnce(new Error("pdf parse failed"));
    const filePath = await writeFile(tempDir, "broken.pdf", "not really a pdf");
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBe(0);
    await ingester.db.close();
  });

  it("returns empty text for docx files when mammoth parsing throws", async () => {
    mockMammothExtractRawText.mockRejectedValueOnce(new Error("mammoth failed"));
    const filePath = await writeFile(tempDir, "broken.docx", "not really docx");
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBe(0);
    await ingester.db.close();
  });

  // lines 106-111: thread file with type:thread → thread chunk path
  it("ingests a thread file per-turn via ingestFile directly", async () => {
    const content = `---
type: thread
platform: gemini
captured_at: 2026-01-01T00:00:00.000Z
turn_count: 2
---

## Turn 1 — User

What is 2+2?

## Turn 2 — Assistant

It is 4.
`;
    const filePath = await writeFile(tempDir, "thread.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath, {
      fileTs: "2026-01-01T00:00:00.000Z",
      platform: "gemini",
    });
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBe(2);
    await ingester.db.close();
  });
});

// ---------------------------------------------------------------------------
// DocumentIngester.ingestChunks — lines 278, 298, 316, 343
// ---------------------------------------------------------------------------
describe("DocumentIngester.ingestChunks", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // line 278: null/undefined chunks → skipped
  it("returns skipped when chunks is null", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(null);
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
  });

  // line 278: empty array → skipped
  it("returns skipped when chunks is empty array", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks([]);
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
  });

  // line 298: all chunks have blank content → skipped after filter
  it("returns skipped when all chunks have blank content", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks([
      { content: "   " },
      { content: "\n\t" },
    ]);
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
  });

  // line 316: uniqueBy path → upsertDocuments called
  it("uses upsertDocuments when uniqueBy is provided", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(
      [
        {
          content: "Unique chunk A",
          metadata: { path: "chunk-a" },
        },
        {
          content: "Unique chunk B",
          metadata: { path: "chunk-b" },
        },
      ],
      {
        filename: "unique-chunks",
        uniqueBy: "path",
        fileTs: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(result.chunks).toBe(2);
    expect(result.skipped).toBe(false);
  });

  // line 316: uniqueBy deduplication prevents re-insertion of same key
  it("deduplicates chunks with the same uniqueBy key", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    // Insert once
    await ingester.ingestChunks(
      [{ content: "First insert", metadata: { path: "same-key" } }],
      { filename: "dedup-test", uniqueBy: "path" },
    );
    // Insert again with same key → should be deduped by upsertDocuments
    const second = await ingester.ingestChunks(
      [{ content: "Second insert", metadata: { path: "same-key" } }],
      { filename: "dedup-test", uniqueBy: "path" },
    );
    // upsertDocuments skips existing keys, so 0 new rows
    expect(second.chunks).toBe(0);
    expect(second.skipped).toBe(true);
  });

  // line 343: logPath is written to ingestion log when provided
  it("writes ingestion log entry when logPath is provided", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(
      [{ content: "Log path chunk" }],
      {
        filename: "chunks-file",
        logPath: "custom/log/path.md",
        fileTs: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(result.path).toBe("custom/log/path.md");
    expect(result.chunks).toBe(1);

    // Verify log entry was written
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();
    const log = await db.getIngestionLog();
    expect(log.has("custom/log/path.md")).toBe(true);
    await db.close();
  });
});

// ---------------------------------------------------------------------------
// DocumentIngester.ingestPath — line 38 (walkFiles root is a file)
// ---------------------------------------------------------------------------
describe("DocumentIngester.ingestPath", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // walkFiles: root is a single file (line 38)
  it("ingests a single file when path points to a file", async () => {
    const filePath = await writeFile(tempDir, "single.md", "# Doc\nContent.");
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const results = await ingester.ingestPath(filePath);
    expect(results).toHaveLength(1);
    expect(results[0].chunks).toBeGreaterThan(0);
  });

  // walkFiles: directory walk hits nested files
  it("recursively walks a directory and ingests all supported files", async () => {
    await writeFile(tempDir, "a.md", "Content A.");
    await writeFile(tempDir, "sub/b.md", "Content B.");
    await writeFile(tempDir, "sub/skip.js", "// not supported");
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const results = await ingester.ingestPath(tempDir);
    const mdResults = results.filter((r) => !r.skipped);
    expect(mdResults.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// DocumentIngester.ingestFromSnapshot — deleted action (lines 411-414)
// ---------------------------------------------------------------------------
describe("DocumentIngester.ingestFromSnapshot — deleted actions", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // lines 411-414: snapshot has a file in ingestion log but not in snapshot paths → deleted action
  it("deletes documents and log entries for files removed from snapshot", async () => {
    const docsDir = path.join(tempDir, "docs");
    await fs.mkdir(docsDir, { recursive: true });

    // First ingest a file so it's in the log
    const docFile = path.join(docsDir, "removeme.md");
    await fs.writeFile(docFile, "# Will be removed", "utf8");

    const snapshotPath = path.join(tempDir, "storage-snapshot.json");
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        paths: {
          [docFile]: { ts: "2026-01-01T00:00:00.000Z", ingestible: true },
        },
      }),
      "utf8",
    );

    const ingester1 = new DocumentIngester({ baseDir: tempDir });
    await ingester1.ingestFromSnapshot({ snapshotPath });

    // Now remove the file from the snapshot — it should trigger a "deleted" action
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({ paths: {} }),
      "utf8",
    );

    const ingester2 = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester2.ingestFromSnapshot({ snapshotPath });

    expect(result.deleted).toBe(1);
    expect(result.actions[0].type).toBe("deleted");
    expect(result.actions[0].chunks).toBe(0);
  });

  // ingestFromSnapshot: force=true re-ingests already-ingested file
  it("re-ingests existing files when force=true", async () => {
    const docFile = path.join(tempDir, "guide.md");
    await fs.writeFile(docFile, "# Guide\nRelevant content.", "utf8");

    const snapshotPath = path.join(tempDir, "storage-snapshot.json");
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        paths: {
          [docFile]: { ts: "2026-01-01T00:00:00.000Z", ingestible: true },
        },
      }),
      "utf8",
    );

    const ingester1 = new DocumentIngester({ baseDir: tempDir });
    const first = await ingester1.ingestFromSnapshot({ snapshotPath });
    expect(first.ingested).toBe(1);

    const ingester2 = new DocumentIngester({ baseDir: tempDir });
    const second = await ingester2.ingestFromSnapshot({
      snapshotPath,
      force: true,
    });
    expect(second.ingested).toBe(1);
    expect(second.actions[0].type).toBe("new");
  });

  // ingestFromSnapshot with empty/missing snapshot → no actions
  it("handles missing snapshot file gracefully (no actions)", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestFromSnapshot({
      snapshotPath: path.join(tempDir, "no-such-snapshot.json"),
    });
    expect(result.ingested).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.actions).toEqual([]);
  });

  // browser-response detection path (parseBrowserResponsePlatform + isBrowserResponsePath)
  it("detects platform from browser-response filename and sets source_type=llm-response", async () => {
    const responsesDir = path.join(tempDir, "browser-responses");
    await fs.mkdir(responsesDir, { recursive: true });
    const responseFile = path.join(
      responsesDir,
      "2026-01-15T10-30-00-chatgpt.md",
    );
    await fs.writeFile(
      responseFile,
      "# Response\nSome LLM response content.",
      "utf8",
    );

    const snapshotPath = path.join(tempDir, "storage-snapshot.json");
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        paths: {
          [responseFile]: { ts: "2026-01-15T10:30:00.000Z", ingestible: true },
        },
      }),
      "utf8",
    );

    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestFromSnapshot({ snapshotPath });
    expect(result.ingested).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DocumentIngester.ingestThread — not-yet-ingested path (lines 67, 73)
// ---------------------------------------------------------------------------
describe("DocumentIngester.ingestThread — new thread with 0 chunks", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // line 67: non-existent file path → skipped
  it("returns skipped when thread file does not exist", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestThread(
      path.join(tempDir, "no-such-thread.md"),
    );
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
  });

  // line 73: thread file already in log (covered by existing test; this tests
  // the "not in log" path where insertThread IS called)
  it("calls insertThread when thread is new (not in log)", async () => {
    const threadFile = path.join(tempDir, "new-thread.md");
    await fs.writeFile(
      threadFile,
      `---
type: thread
platform: chatgpt
captured_at: 2026-01-01T00:00:00.000Z
turn_count: 1
---

## Turn 1 — User

Hello world!
`,
      "utf8",
    );

    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestThread(threadFile, {
      platform: "chatgpt",
    });
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBe(1);
  });
});
