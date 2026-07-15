import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureKnowledgeCollection,
  upsertChunks,
} from "../../llm/qdrant-client.js";
import { chunkDocument } from "./chunking.js";
import { embedTextBatch } from "./embedder.js";

const SPRINT_REPORT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

async function discoverSprintReportFiles(baseDir) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SPRINT_REPORT_EXTENSIONS.has(ext)) continue;
    files.push(path.join(baseDir, entry.name));
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function parseSprintNumberFromFilename(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const match = /sprint[-_ ]?(\d{1,3})/.exec(base);
  if (match) {
    const num = Number(match[1]);
    /* v8 ignore next -- capture group is always \d{1,3}, so Number.isFinite is always true */
    if (Number.isFinite(num)) return num;
  }

  const leading = /^(\d{1,3})[_-]/.exec(base);
  if (leading) {
    const num = Number(leading[1]);
    /* v8 ignore next -- capture group is always \d{1,3}, so Number.isFinite is always true */
    if (Number.isFinite(num)) return num;
  }

  return undefined;
}

async function loadSprintReportDocument(filePath, defaultFeatureArea) {
  const rawText = await fs.readFile(filePath, "utf8");
  const sprint = parseSprintNumberFromFilename(filePath);
  const title =
    sprint == null
      ? `Sprint Report: ${path.basename(filePath)}`
      : `Sprint ${sprint} Implementation Report`;
  const docId =
    sprint == null
      ? `sprint-report:${path.basename(filePath)}`
      : `sprint-${sprint}-report`;

  return {
    id: docId,
    sourceType: "sprint_report",
    title,
    path: filePath,
    sprint,
    featureArea: defaultFeatureArea,
    rawText,
  };
}

export async function ingestSprintHistory(options) {
  const { baseDir, defaultFeatureArea } = options;
  await ensureKnowledgeCollection();

  const files = await discoverSprintReportFiles(baseDir);
  if (files.length === 0) {
    console.warn(`[knowledge] No sprint reports found in ${baseDir}`);
    return;
  }

  console.log(`[knowledge] Found ${files.length} sprint report file(s)`);

  for (const filePath of files) {
    const doc = await loadSprintReportDocument(filePath, defaultFeatureArea);
    console.log(`[knowledge] Ingesting: ${doc.id}`);

    const chunks = chunkDocument(doc);
    if (!chunks.length) {
      console.warn(`[knowledge] Skipping empty report: ${doc.id}`);
      continue;
    }

    // Safety guard: skip oversized chunks that would exceed embedding context limits
    const MAX_CHUNK_CHARS = 6000;
    const safeChunks = [];
    let skippedCount = 0;
    for (const c of chunks) {
      if (String(c.text ?? "").length > MAX_CHUNK_CHARS) {
        skippedCount++;
      } else {
        safeChunks.push(c);
      }
    }
    if (skippedCount > 0) {
      console.warn(
        `[knowledge] Skipping ${skippedCount} oversized chunk(s) over ${MAX_CHUNK_CHARS} chars for ${doc.id}`,
      );
    }
    if (safeChunks.length === 0) continue;

    const vectors = await embedTextBatch(safeChunks.map((chunk) => chunk.text));
    if (vectors.length !== safeChunks.length) {
      throw new Error(
        `[knowledge] embedTextBatch returned ${vectors.length} vectors for ${safeChunks.length} chunks`,
      );
    }

    for (let i = 0; i < safeChunks.length; i++) {
      safeChunks[i].denseVector = vectors[i];
    }

    const points = safeChunks.map((chunk) => ({
      chunk_id: chunk.chunkId,
      doc_id: chunk.docId,
      source_type: chunk.sourceType,
      sprint: chunk.sprint ?? -1,
      module: chunk.module ?? "",
      feature_area: chunk.featureArea ?? "",
      version: chunk.version ?? "",
      path: chunk.path ?? "",
      section: chunk.section ?? "",
      importance: chunk.importance,
      hash: chunk.hash,
      created_at: chunk.createdAt,
      text: String(chunk.text ?? "").slice(0, 16_384),
      dense_vector: chunk.denseVector,
      content: String(chunk.text ?? "").slice(0, 16_384),
    }));

    await upsertChunks(points);

    console.log(`[knowledge] Inserted ${points.length} chunk(s) for ${doc.id}`);
  }

  console.log("[knowledge] Sprint history ingestion complete.");
}

// ── CLI entry point (ESM top-level await) ─────────────────────────────────────
async function main() {
  // Skip execution if running under test (Vitest sets VITEST env var)
  /* v8 ignore next 3 -- VITEST is always set under the test runner; the
     production CLI-execution path is exercised manually, not by Vitest */
  if (process.env.VITEST) {
    return;
  }
  const baseDir = process.argv[2] ?? "./sprints";
  try {
    await ingestSprintHistory({ baseDir });
  } catch (err) {
    console.error("[knowledge] Ingestion failed:", err);
    process.exitCode = 1;
  }
}

// Top-level await invocation
// const isMain =
// process.argv[1] &&
// (await import("url")).fileURLToPath(import.meta.url) === process.argv[1];
// if (isMain) await main();

// No top-level await — use synchronous module detection
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  try {
    await main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
