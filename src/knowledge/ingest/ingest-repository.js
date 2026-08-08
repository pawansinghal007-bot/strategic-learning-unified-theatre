import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";
import {
  ensureKnowledgeCollection,
  upsertChunks,
  getExistingFileHashes,
  deleteChunksByDocId,
} from "../../llm/qdrant-client.js";
import {
  deleteLexicalChunksByDocId,
  upsertLexicalChunks,
} from "../../llm/lexical-index.js";
import { embedChunksWithCache } from "./embedder.js";
import { hashText } from "./chunking.js";

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
  "project_audit_dump.txt",
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
  "baselines",
  "reports",
  "release",
  "test-results",
  "playwright-report",
  // Generated Playwright report directories (UI and human-run variants)
  "playwright-report-ui",
  "playwright-report-human",
  // Scratch coverage directories left over from parallel coverage runs
  "coverage-tmp",
  "coverage-tmp2",
  "coverage-tmp3",
  // Generated audit/output/dump artifact directories
  "audit_chunks",
  "output",
  "dumps",
  // HTML coverage report output
  "html",
  // Robot Framework results
  "robot-results",
]);

const DEFAULT_MAX_FILE_BYTES = 512 * 2560;
const BATCH_SIZE = 10;
// Maximum number of points to send to Qdrant in a single upsert.
// Keeps payloads well below Qdrant's 32 MB request limit.
const QDRANT_UPSERT_BATCH_SIZE = 100;

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
  if (/^PROJECT_ARCHITECTURE_BASELINE.*\.md$/.test(base)) return false;
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
  // v8 ignore next - getSourceType is only called for supported extensions from isSupported(), so the fallback is effectively unreachable in normal ingestion.
  return map[ext] || "text";
}

function getScriptKind(filePath) {
  if (getSourceType(filePath).startsWith("ts")) {
    return ts.ScriptKind.TS;
  }
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.JS;
}

function parseFeatureArea(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  const parts = relative.split(path.sep);
  if (parts.length > 1) return parts[0];
  return undefined;
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

function computeFileHash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const MAX_PARENT_TEXT_CHARS = Number(
  process.env.PARENT_EXPANSION_MAX_CHARS ?? 8192,
);

function chunkTextWithOffsets(text, { maxChars = 3000, overlap = 300 } = {}) {
  const str = String(text || "").trim();
  if (str.length === 0) return [];

  const chunks = [];
  const step = Math.max(1, maxChars - overlap);
  for (let start = 0; start < str.length; start += step) {
    const slice = str.slice(start, start + maxChars);
    if (slice.length === 0) break;
    chunks.push({ text: slice, start });
    if (start + maxChars >= str.length) break;
  }
  return chunks;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
}

function truncateParentText(text) {
  const normalized = String(text ?? "").trim();
  if (normalized.length <= MAX_PARENT_TEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_PARENT_TEXT_CHARS)}\n\n... [truncated parent context]`;
}

function codeParentNodes(text, docId, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
  const parents = [];

  function addParent(node, name, depth) {
    if (!name) return;
    parents.push({
      parentId: `${docId}:parent:${name}`,
      parentLabel: name,
      parentText: truncateParentText(node.getText(sourceFile)),
      start: node.getStart(sourceFile),
      end: node.getEnd(),
      depth,
    });
  }

  function visit(node, depth = 0) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addParent(node, node.name.text, depth);
    } else if (ts.isClassDeclaration(node) && node.name) {
      addParent(node, node.name.text, depth);
    } else if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      const classDecl = ts.findAncestor(node, (n) => ts.isClassDeclaration(n));
      const name = classDecl?.name?.text
        ? `${classDecl.name.text}.${node.name.text}`
        : node.name.text;
      addParent(node, name, depth);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      addParent(node, node.name.text, depth);
    }
    ts.forEachChild(node, (child) => visit(child, depth + 1));
  }

  visit(sourceFile, 0);
  return parents;
}

function markdownParentNodes(text, docId) {
  const sections = [];
  const headingRegex = /^(#{1,6})\s+(.*)$/gm;
  let lastIndex = 0;
  let lastHeading = "document";
  let match;

  while ((match = headingRegex.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      sections.push({
        parentId: `${docId}:parent:section:${slugify(lastHeading)}`,
        parentText: truncateParentText(text.slice(lastIndex, index)),
        start: lastIndex,
        end: index,
        depth: 0,
      });
    }
    lastHeading = match[2].trim() || "section";
    lastIndex = index;
  }

  sections.push({
    parentId: `${docId}:parent:section:${slugify(lastHeading)}`,
    parentText: truncateParentText(text.slice(lastIndex)),
    start: lastIndex,
    end: text.length,
    depth: 0,
  });

  return sections;
}

function findParentForOffset(parents, offset) {
  let best = null;
  for (const parent of parents) {
    if (parent.start <= offset && offset < parent.end) {
      if (!best || parent.depth > best.depth) {
        best = parent;
      }
    }
  }
  return best;
}

function createChunksForFile({
  text,
  filePath,
  absoluteBaseDir,
  defaultFeatureArea,
}) {
  if (text.length === 0) return [];
  const absoluteFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(absoluteBaseDir, filePath);
  const relativePath = path.relative(absoluteBaseDir, absoluteFilePath);
  const featureArea =
    defaultFeatureArea ?? parseFeatureArea(relativePath) ?? "unknown";
  const sourceType = getSourceType(relativePath);
  const docId = `repo:${relativePath.split(path.sep).join("/")}`;
  const createdAt = Date.now();
  const fileHash = computeFileHash(text);
  const chunkWindows = chunkTextWithOffsets(text);

  let parents = [
    {
      parentId: `${docId}:parent:document`,
      parentText: truncateParentText(text),
      start: 0,
      end: text.length,
      depth: 0,
    },
  ];

  if (sourceType === "markdown") {
    parents = markdownParentNodes(text, docId);
  } else if (
    sourceType === "javascript" ||
    sourceType === "typescript" ||
    sourceType === "jsx" ||
    sourceType === "tsx"
  ) {
    const codeParents = codeParentNodes(text, docId, filePath);
    if (codeParents.length > 0) {
      parents = codeParents;
    }
  }

  return chunkWindows.map((chunk, index) => {
    const parent = findParentForOffset(parents, chunk.start) ?? parents[0];
    return {
      chunkId: `${docId}:chunk:${index}`,
      docId,
      sourceType,
      sprint: -1,
      module: featureArea,
      featureArea,
      version: "latest",
      path: relativePath,
      section: parent.parentId ?? "",
      importance: 0.5,
      hash: hashText(chunk.text),
      createdAt,
      text: chunk.text,
      denseVector: [],
      fileHash,
      parentId: parent.parentId,
      parentText: parent.parentText,
    };
  });
}

async function buildChunksForBatch(batch, absoluteBaseDir, defaultFeatureArea) {
  const chunks = [];
  const fileChunksMap = new Map();
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
      if (fileChunks.length > 0) {
        const relativePath = path.relative(absoluteBaseDir, filePath);
        const docId = `repo:${relativePath.split(path.sep).join("/")}`;
        fileChunksMap.set(docId, fileChunks);
      }
    } catch (err) {
      // v8 ignore next - environment-dependent: root user bypasses file permissions
      console.warn(`[knowledge] Skipping ${filePath}: ${err}`);
    }
  }
  return { chunks, fileChunksMap };
}

const MAX_CHUNK_CHARS = 6000;

async function attachVectors(chunks) {
  const safeChunks = [];
  const skipped = [];
  // v8 ignore start - defensive: chunkText produces max 3000-char chunks, so they always pass the 6000-char check
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
  // v8 ignore end
  const vectors = await embedChunksWithCache(safeChunks);
  if (vectors.length !== safeChunks.length) {
    throw new Error(
      `[knowledge] embedChunksWithCache returned ${vectors.length} vectors for ${safeChunks.length} chunks`,
    );
  }
  for (let i = 0; i < safeChunks.length; i++) {
    safeChunks[i].denseVector = vectors[i];
  }
}

// v8 ignore start - defensive ?? defaults; createChunksForFile always sets all fields
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
    parent_id: chunk.parentId ?? "",
    parent_text: String(chunk.parentText ?? "").slice(0, 16_384),
    importance: chunk.importance,
    hash: chunk.hash,
    created_at: chunk.createdAt,
    file_hash: chunk.fileHash,
    text: String(chunk.text ?? "").slice(0, 16_384),
    dense_vector: chunk.denseVector,
    content: String(chunk.text ?? "").slice(0, 16_384),
  };
}
// v8 ignore end

async function insertChunkBatch(_client, chunks) {
  let inserted = 0;

  for (let i = 0; i < chunks.length; i += QDRANT_UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(i, i + QDRANT_UPSERT_BATCH_SIZE);
    const points = batch.map((chunk) => chunkToQdrantPoint(chunk));

    await upsertChunks(points);
    upsertLexicalChunks(
      batch.map((chunk) => ({
        chunk_id: chunk.chunkId,
        doc_id: chunk.docId,
        path: chunk.path ?? "",
        section: chunk.section ?? "",
        parent_id: chunk.parentId ?? "",
        parent_text: String(chunk.parentText ?? "").slice(0, 16_384),
        feature_area: chunk.featureArea ?? "",
        source_type: chunk.sourceType ?? "",
        sprint: chunk.sprint ?? -1,
        module: chunk.module ?? "",
        content: String(chunk.text ?? "").slice(0, 16_384),
      })),
    );

    inserted += points.length;

    console.log(`[knowledge] Uploaded ${inserted}/${chunks.length} chunk(s)`);
  }

  return inserted;
}

function isDirectRun() {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

/**
 * Builds a map of docId -> fileHash for all files currently on disk.
 */
async function buildCurrentFileHashes(files, absoluteBaseDir) {
  const currentFiles = new Map();
  for (const filePath of files) {
    try {
      const text = await fs.readFile(filePath, "utf8");
      const relativePath = path.relative(absoluteBaseDir, filePath);
      const docId = `repo:${relativePath.split(path.sep).join("/")}`;
      const fileHash = computeFileHash(text);
      currentFiles.set(docId, fileHash);
    } catch (err) {
      console.warn(`[knowledge] Skipping ${filePath}: ${err}`);
    }
  }
  return currentFiles;
}

/**
 * Processes file chunks: skips unchanged, deletes+re-ingests changed.
 * Returns { totalChunks, skippedFiles }.
 */
async function processFileChunks(fileChunksMap, currentFiles, existingHashes) {
  let totalChunks = 0;
  let skippedFiles = 0;

  for (const [docId, chunks] of fileChunksMap) {
    const currentHash = currentFiles.get(docId);
    const existingHash = existingHashes.get(docId);

    if (existingHash === currentHash) {
      skippedFiles++;
      continue;
    }

    if (existingHash) {
      console.log(`[knowledge] Updating changed file: ${docId}`);
      await deleteChunksByDocId(docId);
      deleteLexicalChunksByDocId(docId);
    }

    console.log(`[knowledge] Processing ${docId}: ${chunks.length} chunks`);

    await attachVectors(chunks);
    const insertedCount = await insertChunkBatch(null, chunks);
    totalChunks += insertedCount;
    console.log(`[knowledge] Inserted ${insertedCount} chunk(s) for ${docId}`);
  }

  return { totalChunks, skippedFiles };
}

export async function ingestRepository(options) {
  const { baseDir, defaultFeatureArea } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const effectiveMaxFileBytes = getEffectiveMaxFileBytes(options);

  await ensureKnowledgeCollection();

  // Fetch existing file hashes from Qdrant for incremental ingestion
  const existingHashes = await getExistingFileHashes();

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

  // Build a map of docId -> fileHash for all files currently on disk
  const currentFiles = await buildCurrentFileHashes(files, absoluteBaseDir);

  const { fileChunksMap: builtFileChunksMap } = await buildChunksForBatch(
    files,
    absoluteBaseDir,
    defaultFeatureArea,
  );
  const fileChunksMap = new Map();
  for (const [docId, chunks] of builtFileChunksMap) {
    if (chunks.length > 0) {
      fileChunksMap.set(docId, chunks);
    }
  }

  // Clean up deleted files: docIds in Qdrant but not on disk
  for (const [docId] of existingHashes) {
    if (!currentFiles.has(docId)) {
      console.log(`[knowledge] Deleting chunks for removed file: ${docId}`);
      await deleteChunksByDocId(docId);
    }
  }

  // Process each file: skip unchanged, delete+re-ingest changed
  const { totalChunks, skippedFiles } = await processFileChunks(
    fileChunksMap,
    currentFiles,
    existingHashes,
  );

  if (skippedFiles > 0) {
    console.log(`[knowledge] Skipped ${skippedFiles} unchanged file(s)`);
  }

  console.log(
    `[knowledge] Repository ingestion complete: ${totalChunks} chunks`,
  );
}

export {
  createChunksForFile,
  codeParentNodes,
  markdownParentNodes,
  findParentForOffset,
};

// v8 ignore start - CLI entry: VITEST-gated, not exported, env mutation risk
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
// v8 ignore end

if (isDirectRun()) {
  await main();
}
