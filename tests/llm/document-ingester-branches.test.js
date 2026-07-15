/**
 * document-ingester-branches.test.js
 *
 * Targets branch gaps in src/llm/document-ingester.js:
 *   Line  67   — ingestFile: thread text but chunkThread returns null (non-thread type)
 *   Lines 97-102 — ingestFile with metadata/tags options
 *   Lines 106-111 — chunkThread: frontmatter.type !== "thread" → null
 *                   chunkThread: turns regex matches = 0 → null
 *                   chunkThread: all turn content empty → null (turns.length === 0)
 *   Line  137  — chunkText overlap=0 (step === tokens)
 *   Line  143  — chunkText last-window stop (start + tokens >= words.length inside loop)
 *   Line  165  — buildSnapshotActions "changed" action (newer file_ts)
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { DocumentIngester, chunkText } from "../../src/llm/document-ingester.js";

// ── helpers ────────────────────────────────────────────────────────────────
async function makeTempDir(prefix = "di-branch-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(dir, name, content) {
  const filePath = path.join(dir, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

// ── chunkText branch coverage (lines 137, 143) ─────────────────────────────

describe("chunkText — step and overlap branches", () => {
  // overlap=0 → step = maxChars, no overlap, clean character windows
  it("produces non-overlapping chunks when overlap=0 (line 137)", () => {
    // 20-char string, maxChars=10, overlap=0 → step=10 → 2 clean chunks
    const text = "0123456789abcdefghij";
    const chunks = chunkText(text, { maxChars: 10, overlap: 0 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("0123456789");
    expect(chunks[1]).toBe("abcdefghij");
  });

  // maxChars - overlap = 1 → step = 1 (maximum overlap)
  it("step clamped to 1 when maxChars - overlap = 1", () => {
    // maxChars=5, overlap=4 → step=1
    const text = "0123456789";
    const chunks = chunkText(text, { maxChars: 5, overlap: 4 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each window slides by 1 character
    expect(chunks[0]).toBe("01234");
    expect(chunks[1]).toBe("12345");
  });

  // Exact boundary: last chunk's start + maxChars === str.length → break (line 143)
  it("stops exactly at boundary without producing an extra empty chunk (line 143)", () => {
    // 10-char string, maxChars=5, overlap=0 → chunks at [0:5) and [5:10) → break
    const text = "0123456789";
    const chunks = chunkText(text, { maxChars: 5, overlap: 0 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("01234");
    expect(chunks[1]).toBe("56789");
  });

  // Non-exact boundary: last chunk shorter than maxChars window
  it("last chunk can be smaller than the maxChars window", () => {
    // 11-char string, maxChars=5, overlap=0 → starts: 0, 5, 10 → 3 chunks
    const text = "0123456789a";
    const chunks = chunkText(text, { maxChars: 5, overlap: 0 });
    expect(chunks).toHaveLength(3);
    expect(chunks[2]).toBe("a");
  });

  // Single word fits in one chunk
  it("single word produces one chunk", () => {
    expect(chunkText("hello", { maxChars: 10, overlap: 0 })).toEqual(["hello"]);
  });
});

// ── chunkThread branch coverage (lines 106-111) ────────────────────────────

describe("chunkThread via ingestFile — null branches", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // chunkThread: frontmatter.type !== "thread" → returns null → falls through to regular chunks
  // Line 67: text.includes("type: thread") is TRUE but chunkThread returns null
  it("falls back to regular chunk path when file contains 'type: thread' but type field is not 'thread' in frontmatter (line 67)", async () => {
    // YAML frontmatter type differs from "thread" — but the raw text has "type: thread"
    // This is a corner case: we put "type: thread" in the body, not frontmatter
    const content = `---
type: document
---

This document mentions "type: thread" somewhere in the body.
More content here.
`;
    const filePath = await writeFile(tempDir, "notthread.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    // Should ingest as regular chunks (not thread turns)
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBeGreaterThan(0);
    await ingester.db.close();
  });

  // chunkThread: no ## Turn matches → returns null
  it("falls back to regular chunks when 'type: thread' frontmatter has no Turn sections", async () => {
    const content = `---
type: thread
platform: chatgpt
---

This has type thread but no ## Turn headers at all.
Just plain paragraph content.
`;
    const filePath = await writeFile(tempDir, "thread-no-turns.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    // chunkThread returns null → falls through to regular chunking
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBeGreaterThan(0);
    await ingester.db.close();
  });

  // chunkThread: all turn content is empty after trim → turns.length === 0 → null
  it("falls back to regular chunks when all thread turns have empty content", async () => {
    // ## Turn headers exist but content between them is blank
    const content = `---
type: thread
platform: chatgpt
turn_count: 2
---

## Turn 1 — User

## Turn 2 — Assistant

`;
    const filePath = await writeFile(tempDir, "thread-empty-turns.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath);
    // chunkThread returns null (all turns empty) → regular chunking
    // The file has very little text so might be 0 or 1 chunk
    expect(result.skipped).toBe(false);
    await ingester.db.close();
  });
});

// ── ingestFile with metadata/tags (lines 97-102) ───────────────────────────

describe("ingestFile — metadata and tags options", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Line 97-100: metadata passed explicitly
  it("attaches explicit metadata to chunks when metadata option provided", async () => {
    const content = "# Document\nContent paragraph.";
    const filePath = await writeFile(tempDir, "meta.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath, {
      metadata: { project: "test-project", version: "1.0" },
    });
    expect(result.skipped).toBe(false);
    expect(result.chunks).toBeGreaterThan(0);
    // Verify metadata stored in db
    const docs = await ingester.db.getDocumentsByFile(
      path.resolve(filePath),
    );
    expect(docs[0].metadata).toMatchObject({ project: "test-project" });
    await ingester.db.close();
  });

  // Line 101-102: tags passed — creates inferredMetadata = { tags }
  it("converts tags option into metadata.tags on chunks", async () => {
    const content = "# Tagged Doc\nTagged content paragraph.";
    const filePath = await writeFile(tempDir, "tagged.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath, {
      tags: ["llm", "sprint"],
    });
    expect(result.skipped).toBe(false);
    const docs = await ingester.db.getDocumentsByFile(path.resolve(filePath));
    expect(docs[0].metadata).toMatchObject({ tags: ["llm", "sprint"] });
    await ingester.db.close();
  });

  // source_type=llm-response sets inferredPlatform from platform option
  it("sets platform on chunks when source_type=llm-response and platform provided", async () => {
    const content = "# LLM Response\nThe assistant said something.";
    const filePath = await writeFile(tempDir, "response.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath, {
      source_type: "llm-response",
      platform: "gemini",
    });
    expect(result.skipped).toBe(false);
    const docs = await ingester.db.getDocumentsByFile(path.resolve(filePath));
    expect(docs[0].platform).toBe("gemini");
    await ingester.db.close();
  });

  // source_type != llm-response → inferredPlatform = null (line 99)
  it("does not set platform when source_type is not llm-response", async () => {
    const content = "# Regular Doc\nNormal content.";
    const filePath = await writeFile(tempDir, "normdoc.md", content);
    const ingester = new DocumentIngester({ baseDir: tempDir });
    await ingester.db.open();
    const result = await ingester.ingestFile(filePath, {
      source_type: "md",
      platform: "chatgpt", // should be ignored since not llm-response
    });
    expect(result.skipped).toBe(false);
    const docs = await ingester.db.getDocumentsByFile(path.resolve(filePath));
    expect(docs[0].platform).toBeNull();
    await ingester.db.close();
  });
});

// ── buildSnapshotActions "changed" action (line 165) ──────────────────────

describe("buildSnapshotActions — changed action (line 165)", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("produces a 'changed' action when snapshot file_ts is newer than log entry", async () => {
    const docFile = path.join(tempDir, "evolving.md");
    await fs.writeFile(docFile, "# Version 1\nFirst content.", "utf8");

    // First snapshot: ingest at an old timestamp
    const snapshotPath = path.join(tempDir, "snapshot.json");
    const oldTs = "2020-01-01T00:00:00.000Z";
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        paths: {
          [docFile]: { ts: oldTs, file_ts: oldTs, ingestible: true },
        },
      }),
      "utf8",
    );

    const ingester1 = new DocumentIngester({ baseDir: tempDir });
    await ingester1.ingestFromSnapshot({ snapshotPath });

    // Second snapshot: same file but NEWER timestamp → triggers "changed" action
    const newTs = "2026-06-01T00:00:00.000Z";
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        paths: {
          [docFile]: { ts: newTs, file_ts: newTs, ingestible: true },
        },
      }),
      "utf8",
    );
    await fs.writeFile(docFile, "# Version 2\nUpdated content.", "utf8");

    const ingester2 = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester2.ingestFromSnapshot({ snapshotPath });

    const changedAction = result.actions.find((a) => a.type === "changed");
    expect(changedAction).toBeDefined();
    expect(result.ingested).toBe(1);
  });

  it("does NOT produce changed/new action when file_ts is identical to log entry", async () => {
    const docFile = path.join(tempDir, "stable.md");
    await fs.writeFile(docFile, "# Stable\nContent.", "utf8");

    const sameTs = "2024-01-01T00:00:00.000Z";
    const snapshotPath = path.join(tempDir, "snapshot2.json");
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        paths: {
          [docFile]: { ts: sameTs, file_ts: sameTs, ingestible: true },
        },
      }),
      "utf8",
    );

    // Ingest once
    const ingester1 = new DocumentIngester({ baseDir: tempDir });
    await ingester1.ingestFromSnapshot({ snapshotPath });

    // Ingest again with same timestamp — no change
    const ingester2 = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester2.ingestFromSnapshot({ snapshotPath });

    // No new or changed action (timestamp didn't change, not forced)
    expect(result.actions).toHaveLength(0);
    expect(result.ingested).toBe(0);
  });
});

// ── ingestChunks — chunk metadata merging branches ─────────────────────────

describe("ingestChunks — additional branch coverage", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Chunk has its own metadata → merged with outer metadata option
  it("merges chunk.metadata with outer metadata option", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(
      [
        {
          content: "Chunk with own metadata",
          metadata: { chunkProp: "chunk-value" },
        },
      ],
      {
        filename: "merged.md",
        metadata: { outerProp: "outer-value" },
      },
    );
    expect(result.chunks).toBe(1);
    // Metadata should have both chunkProp and outerProp
    const rows = result.rows;
    const parsed = JSON.parse(rows[0].metadata);
    expect(parsed.chunkProp).toBe("chunk-value");
    expect(parsed.outerProp).toBe("outer-value");
  });

  // Chunk has no metadata → outer metadata used directly
  it("uses outer metadata when chunk has no metadata", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(
      [{ content: "No chunk metadata" }],
      { filename: "outer-meta.md", metadata: { key: "val" } },
    );
    expect(result.chunks).toBe(1);
    const parsed = JSON.parse(result.rows[0].metadata);
    expect(parsed.key).toBe("val");
  });

  // chunk.source_type overrides outer source_type
  it("chunk source_type overrides outer source_type", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(
      [{ content: "Thread turn", source_type: "thread-turn", turn_index: 1 }],
      { filename: "override.md", source_type: "md" },
    );
    expect(result.rows[0].source_type).toBe("thread-turn");
    expect(result.rows[0].turn_index).toBe(1);
  });

  // quality and notes pass through
  it("preserves quality and notes from chunk", async () => {
    const ingester = new DocumentIngester({ baseDir: tempDir });
    const result = await ingester.ingestChunks(
      [{ content: "Quality chunk", quality: "good", notes: "reviewed" }],
      { filename: "qnotes.md" },
    );
    expect(result.rows[0].quality).toBe("good");
    expect(result.rows[0].notes).toBe("reviewed");
  });
});

// ── ingestThread — already-ingested skip path ──────────────────────────────

describe("ingestThread — already ingested skip", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });

  afterEach(async () => {
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("skips thread file that is already in ingestion log", async () => {
    const threadFile = await writeFile(
      tempDir,
      "existing-thread.md",
      `---
type: thread
platform: chatgpt
turn_count: 1
---

## Turn 1 — User

Hello world!
`,
    );

    // Ingest it once
    const ingester1 = new DocumentIngester({ baseDir: tempDir });
    await ingester1.ingestThread(threadFile, { platform: "chatgpt" });

    // Second call — already in log → should skip
    const ingester2 = new DocumentIngester({ baseDir: tempDir });
    await ingester2.db.open();
    const result = await ingester2.ingestThread(threadFile, { platform: "chatgpt" });
    expect(result.skipped).toBe(true);
    expect(result.chunks).toBe(0);
  });
});
