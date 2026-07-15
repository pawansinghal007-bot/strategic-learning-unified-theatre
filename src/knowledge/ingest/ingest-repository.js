import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  ensureKnowledgeCollection,
  upsertChunks,
} from "../../llm/qdrant-client.js";
import { chunkText } from "../../llm/document-ingester.js";
import { embedTextBatch } from "./embedder.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".json",
]);

const EXCLUDED_FILES = new Set([
  "package-lock.json",
  "sonar-all-issues.json",
  "sonar-security-issues.json",
  "repo-tree.txt",
  "PROJECT_ARCHITECTURE_BASELINE.md",
  "docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE.md",
]);

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "coverage",
  "dist",
  "build",
  ".tmp",
  ".venv",
  "electron-ui",
  "reports",
  "release",
  "test-results",
  "playwright-report",
]);

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const BATCH_SIZE = 10;

function shouldSkipDirectory(dirName) {
  return EXCLUDED_DIRS.has(dirName);
}

async function* walkFiles(root) {
  try {
    const stat = await fs.stat(root);
    if (stat.isFile()) {
      yield root;
      return;
    }
    if (!stat.isDirectory()) return;
    const dir = await fs.opendir(root);
    for await (const dirent of dir) {
      if (shouldSkipDirectory(dirent.name)) continue;
      const child = path.join(root, dirent.name);
      if (dirent.isDirectory()) {
        yield* walkFiles(child);
      } else if (dirent.isFile()) {
        yield child;
      }
    }
  } catch (err) {
    console.warn(`[ingest] Skipping ${root}: ${err}`);
  }
}

function isSupported(filePath) {
  const base = path.basename(filePath);
  if (EXCLUDED_FILES.has(base)) return false;
  if (base.endsWith(".bundled.cjs")) return false;
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function getSourceType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "jsx",
    ".tsx": "tsx",
    ".json": "json",
  };
  return map[ext] || "text";
}

function parseFeatureArea(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  const parts = relative.split(path.sep);
  if (parts.length > 1) return parts[0];
  return undefined;
}

function hashText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function getEffectiveMaxFileBytes(options = {}) {
  const maxFileBytes = Number(
    options.maxFileBytes ?? process.env.KNOWLEDGE_MAX_FILE_BYTES,
  );
  return Number.isFinite(maxFileBytes) && maxFileBytes > 0
    ? maxFileBytes
    : DEFAULT_MAX_FILE_BYTES;
}

async function discoverSupportedFiles(baseDir, effectiveMaxFileBytes) {
  const files = [];
  let skippedLargeFiles = 0;
  for await (const filePath of walkFiles(baseDir)) {
    if (!isSupported(filePath)) continue;
    const stat = await fs.stat(filePath);
    if (stat.size > effectiveMaxFileBytes) {
      skippedLargeFiles += 1;
      continue;
    }
    files.push(filePath);
  }
  return { files, skippedLargeFiles };
}

function createChunksForFile({
  text,
  filePath,
  absoluteBaseDir,
  defaultFeatureArea,
}) {
  if (text.length === 0) return [];
  const featureArea =
    defaultFeatureArea ?? parseFeatureArea(filePath) ?? "unknown";
  const sourceType = getSourceType(filePath);
  const relativePath = path.relative(absoluteBaseDir, filePath);
  const docId = `repo:${relativePath.split(path.sep).join("/")}`;
  const createdAt = Date.now();
  return chunkText(text).map((content, index) => ({
    chunkId: `${docId}:chunk:${index}`,
    docId,
    sourceType,
    sprint: -1,
    module: featureArea,
    featureArea,
    version: "latest",
    path: relativePath,
    section: "",
    importance: 0.5,
    hash: hashText(content),
    createdAt,
    text: content,
    denseVector: [],
  }));
}

async function buildChunksForBatch(batch, absoluteBaseDir, defaultFeatureArea) {
  const chunks = [];
  for (const filePath of batch) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const fileChunks = createChunksForFile({
        text,
        filePath,
        absoluteBaseDir,
        defaultFeatureArea,
      });
      chunks.push(...fileChunks);
    } catch (err) {
      console.warn(`[knowledge] Skipping ${filePath}: ${err}`);
    }
  }
  return chunks;
}

const MAX_CHUNK_CHARS = 6000;

async function attachVectors(chunks) {
  const safeChunks = [];
  const skipped = [];
  for (const c of chunks) {
    if (c.text.length > MAX_CHUNK_CHARS) {
      skipped.push(c);
    } else {
      safeChunks.push(c);
    }
  }
  if (skipped.length > 0) {
    console.warn(
      `[knowledge] Skipping ${skipped.length} oversized chunk(s) over ${MAX_CHUNK_CHARS} chars`,
    );
  }
  if (safeChunks.length === 0) return;
  const vectors = await embedTextBatch(safeChunks.map((chunk) => chunk.text));
  if (vectors.length !== safeChunks.length) {
    throw new Error(
      `[knowledge] embedTextBatch returned ${vectors.length} vectors for ${safeChunks.length} chunks`,
    );
  }
  for (let i = 0; i < safeChunks.length; i++) {
    safeChunks[i].denseVector = vectors[i];
  }
}

function chunkToQdrantPoint(chunk) {
  return {
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
  };
}

async function insertChunkBatch(_client, chunks) {
  const points = chunks.map((chunk) => chunkToQdrantPoint(chunk));
  await upsertChunks(points);
  return points.length;
}

function isDirectRun() {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

export async function ingestRepository(options) {
  const { baseDir, defaultFeatureArea } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const effectiveMaxFileBytes = getEffectiveMaxFileBytes(options);

  await ensureKnowledgeCollection();

  const { files, skippedLargeFiles } = await discoverSupportedFiles(
    absoluteBaseDir,
    effectiveMaxFileBytes,
  );

  console.log(`[knowledge] Found ${files.length} supported file(s)`);
  if (skippedLargeFiles > 0) {
    console.log(
      `[knowledge] Skipped ${skippedLargeFiles} large file(s) over ${effectiveMaxFileBytes} bytes`,
    );
  }

  let totalChunks = 0;
  const totalBatches = Math.ceil(files.length / BATCH_SIZE);

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const chunks = await buildChunksForBatch(
      batch,
      absoluteBaseDir,
      defaultFeatureArea,
    );
    if (chunks.length === 0) continue;

    console.log(
      `[knowledge] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches}: ${chunks.length} chunks from ${batch.length} files`,
    );

    await attachVectors(chunks);
    const insertedCount = await insertChunkBatch(null, chunks);
    totalChunks += insertedCount;
    console.log(`[knowledge] Inserted ${insertedCount} chunk(s) from batch`);
  }

  console.log(
    `[knowledge] Repository ingestion complete: ${totalChunks} chunks`,
  );
}

async function main() {
  if (process.env.VITEST) return;
  const baseDir = process.argv[2] ?? process.cwd();
  const defaultFeatureArea = process.argv[3];
  try {
    await ingestRepository({ baseDir, defaultFeatureArea });
  } catch (err) {
    console.error("[knowledge] Repository ingestion failed:", err);
    process.exitCode = 1;
  }
}

if (isDirectRun()) {
  await main();
}
