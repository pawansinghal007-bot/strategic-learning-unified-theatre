// src/knowledge/ingest/ingest-sprint-history.ts
import fs from "node:fs/promises";
import path from "node:path";

// src/knowledge/ingest/milvus-client.ts
import { MilvusClient, DataType } from "@zilliz/milvus2-sdk-node";
var KNOWLEDGE_COLLECTION = "knowledge_chunks";
var MILVUS_CONTAINER_NAME = "default-milvus-1";
var MILVUS_GRPC_PORT = 19530;
var DEFAULT_MILVUS_ADDRESS = `${MILVUS_CONTAINER_NAME}:${MILVUS_GRPC_PORT}`;
var MILVUS_ADDRESS = process.env.MILVUS_ADDRESS ?? DEFAULT_MILVUS_ADDRESS;
var _client = null;
function getMilvusClient() {
  _client ??= new MilvusClient({ address: MILVUS_ADDRESS });
  return _client;
}
async function ensureKnowledgeCollection() {
  const client = getMilvusClient();
  const exists = await client.hasCollection({
    collection_name: KNOWLEDGE_COLLECTION
  });
  if (exists.value) return;
  await client.createCollection({
    collection_name: KNOWLEDGE_COLLECTION,
    fields: [
      {
        name: "chunk_id",
        data_type: DataType.VarChar,
        is_primary_key: true,
        max_length: 256
      },
      { name: "doc_id", data_type: DataType.VarChar, max_length: 256 },
      { name: "source_type", data_type: DataType.VarChar, max_length: 64 },
      { name: "sprint", data_type: DataType.Int64 },
      { name: "module", data_type: DataType.VarChar, max_length: 128 },
      { name: "feature_area", data_type: DataType.VarChar, max_length: 128 },
      { name: "version", data_type: DataType.VarChar, max_length: 64 },
      { name: "path", data_type: DataType.VarChar, max_length: 512 },
      { name: "section", data_type: DataType.VarChar, max_length: 256 },
      { name: "importance", data_type: DataType.Float },
      { name: "hash", data_type: DataType.VarChar, max_length: 64 },
      { name: "created_at", data_type: DataType.Int64 },
      { name: "dense_vector", data_type: DataType.FloatVector, dim: 1024 }
    ]
  });
  await client.createIndex({
    collection_name: KNOWLEDGE_COLLECTION,
    field_name: "dense_vector",
    index_type: "HNSW",
    metric_type: "COSINE",
    params: { M: 16, efConstruction: 256 }
  });
  await client.loadCollection({ collection_name: KNOWLEDGE_COLLECTION });
}

// src/knowledge/ingest/chunking.ts
import { createHash } from "node:crypto";
var CHUNK_SIZE = 512;
var CHUNK_OVERLAP = 64;
function makeChunkId(docId, index) {
  return `${docId}:chunk:${index}`;
}
function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}
function splitIntoWindows(text, size, overlap) {
  const words = text.split(/\s+/).filter(Boolean);
  const windows = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + size, words.length);
    windows.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start += size - overlap;
  }
  return windows;
}
function chunkDocument(doc) {
  const windows = splitIntoWindows(doc.rawText, CHUNK_SIZE, CHUNK_OVERLAP);
  const now = Date.now();
  return windows.map((text, index) => ({
    chunkId: makeChunkId(doc.id, index),
    docId: doc.id,
    sourceType: doc.sourceType,
    text,
    sprint: doc.sprint,
    module: doc.module,
    featureArea: doc.featureArea,
    version: doc.version,
    path: doc.path,
    section: void 0,
    importance: 1,
    hash: hashText(text),
    createdAt: now,
    denseVector: []
  }));
}

// src/knowledge/ingest/embedder.ts
var _pipeline = null;
async function getEmbedder() {
  if (!_pipeline) {
    const { pipeline } = await import("@xenova/transformers");
    _pipeline = await pipeline("feature-extraction", "Xenova/bge-m3");
  }
  return _pipeline;
}
async function embedTextBatch(texts) {
  const embedder = await getEmbedder();
  const vectors = [];
  for (const text of texts) {
    const output = await embedder(text, { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data));
  }
  return vectors;
}

// src/knowledge/ingest/ingest-sprint-history.ts
var SPRINT_REPORT_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".txt"]);
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
    if (Number.isFinite(num)) return num;
  }
  const leading = /^(\d{1,3})[_-]/.exec(base);
  if (leading) {
    const num = Number(leading[1]);
    if (Number.isFinite(num)) return num;
  }
  return void 0;
}
async function loadSprintReportDocument(filePath, defaultFeatureArea) {
  const rawText = await fs.readFile(filePath, "utf8");
  const sprint = parseSprintNumberFromFilename(filePath);
  const title = sprint == null ? `Sprint Report: ${path.basename(filePath)}` : `Sprint ${sprint} Implementation Report`;
  const docId = sprint == null ? `sprint-report:${path.basename(filePath)}` : `sprint-${sprint}-report`;
  return {
    id: docId,
    sourceType: "sprint_report",
    title,
    path: filePath,
    sprint,
    featureArea: defaultFeatureArea,
    rawText
  };
}
function chunkToMilvusEntity(chunk) {
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
    dense_vector: chunk.denseVector
  };
}
async function ingestSprintHistory(options) {
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
    const vectors = await embedTextBatch(chunks.map((chunk) => chunk.text));
    if (vectors.length !== chunks.length) {
      throw new Error(
        `[knowledge] embedTextBatch returned ${vectors.length} vectors for ${chunks.length} chunks`
      );
    }
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].denseVector = vectors[i];
    }
    const entities = chunks.map(chunkToMilvusEntity);
    const client = getMilvusClient();
    await client.insert({
      collection_name: KNOWLEDGE_COLLECTION,
      data: entities
    });
    console.log(
      `[knowledge] Inserted ${entities.length} chunk(s) for ${doc.id}`
    );
  }
  console.log("[knowledge] Sprint history ingestion complete.");
}
async function main() {
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
await main();
export {
  ingestSprintHistory
};
