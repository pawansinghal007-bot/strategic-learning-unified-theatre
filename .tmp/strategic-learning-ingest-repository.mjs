// src/knowledge/ingest/ingest-repository.js
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// src/knowledge/ingest/milvus-client.ts
import { MilvusClient, DataType } from "@zilliz/milvus2-sdk-node";
var KNOWLEDGE_COLLECTION = "knowledge_chunks";
var MILVUS_GRPC_PORT = 19530;
var DEFAULT_MILVUS_ADDRESS = `localhost:${MILVUS_GRPC_PORT}`;
var REQUIRED_FIELDS = /* @__PURE__ */ new Set([
  "chunk_id",
  "doc_id",
  "source_type",
  "sprint",
  "module",
  "feature_area",
  "version",
  "path",
  "section",
  "importance",
  "hash",
  "created_at",
  "text",
  "dense_vector"
]);
var MILVUS_ADDRESS = process.env.MILVUS_ADDRESS ?? DEFAULT_MILVUS_ADDRESS;
var _client = null;
function getMilvusClient() {
  _client ??= new MilvusClient({ address: MILVUS_ADDRESS });
  return _client;
}
async function createKnowledgeCollection(client) {
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
      { name: "text", data_type: DataType.VarChar, max_length: 16384 },
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
async function validateKnowledgeCollection(client) {
  const description = await client.describeCollection({
    collection_name: KNOWLEDGE_COLLECTION
  });
  const fields = description.schema?.fields ?? description.fields ?? [];
  const fieldNames = new Set(fields.map((field) => field.name));
  const missing = [...REQUIRED_FIELDS].filter((name) => !fieldNames.has(name));
  if (missing.length === 0) {
    await client.loadCollection({ collection_name: KNOWLEDGE_COLLECTION });
    return;
  }
  if (process.env.KNOWLEDGE_RESET_COLLECTION === "1") {
    await client.dropCollection({ collection_name: KNOWLEDGE_COLLECTION });
    await createKnowledgeCollection(client);
    return;
  }
  throw new Error(
    [
      `Milvus collection ${KNOWLEDGE_COLLECTION} is missing required field(s): ${missing.join(", ")}.`,
      "Set KNOWLEDGE_RESET_COLLECTION=1 and rerun ingestion to rebuild the local RAG index."
    ].join(" ")
  );
}
async function ensureKnowledgeCollection() {
  const client = getMilvusClient();
  const exists = await client.hasCollection({
    collection_name: KNOWLEDGE_COLLECTION
  });
  if (exists.value) {
    await validateKnowledgeCollection(client);
    return;
  }
  await createKnowledgeCollection(client);
}

// src/internal/config.js
import { z } from "zod";
var DEFAULT_CONFIG = {
  watchedRepos: [],
  gitPollIntervalMs: 3e4,
  storagePaths: [],
  storageIndexMaxAgeDays: 30,
  browserResponsesIngest: true,
  enhanceSchedule: null,
  vscodeLearn: {
    enabled: false,
    stagedSignalsDir: null,
    captureSources: ["diagnostic", "editor", "task", "git"],
    maxSignalAgeDays: 30,
    flushIntervalMs: 3e4,
    debounceMs: 6e5,
    maxFileSizeBytes: 102400,
    excludePatterns: ["**/test/**", "**/fixtures/**"],
    hardExcludePatterns: [
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/*.secret",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**"
    ],
    allowedExtensions: [
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".md",
      ".json",
      ".yaml",
      ".yml",
      ".txt"
    ]
  },
  policy: {
    apiVersion: "1",
    pluginSearchPaths: [],
    features: {
      localDbEnabled: true,
      browserCaptureEnabled: true,
      llmCommandsEnabled: true
    }
  },
  // Browser integration settings
  browserPaths: {},
  platformTriggers: {
    // domain -> platform mapping example
    // "chat.openai.com": "chatgpt",
    // "cloud.ai": "claude",
    // "perplexity.ai": "perplexity",
    // "gemini.google.com": "gemini"
  },
  captureSchedule: {
    enabled: false,
    intervalMs: 15 * 60 * 1e3
    // default 15 minutes
  }
};
var VscodeLearnConfigSchema = z.object({
  enabled: z.boolean().default(false),
  stagedSignalsDir: z.string().nullable().default(null),
  captureSources: z.array(z.string()).default(["diagnostic", "editor", "task", "git"]),
  maxSignalAgeDays: z.number().nonnegative().default(30),
  flushIntervalMs: z.number().positive().default(3e4),
  debounceMs: z.number().positive().default(6e5),
  maxFileSizeBytes: z.number().positive().default(102400),
  excludePatterns: z.array(z.string()).default(["**/test/**", "**/fixtures/**"]),
  hardExcludePatterns: z.array(z.string()).default([
    "**/.env*",
    "**/*.key",
    "**/*.pem",
    "**/*.secret",
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**"
  ]),
  allowedExtensions: z.array(z.string()).default([
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".txt"
  ])
});
var CaptureScheduleSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z.number().positive().default(15 * 60 * 1e3)
});
var PolicySchema = z.object({
  apiVersion: z.string().default("1"),
  allowedPlatforms: z.array(z.string()).optional(),
  allowedModels: z.array(z.string()).optional(),
  rateLimits: z.object({
    perPlatformPerMinute: z.number().int().positive().optional(),
    perModelPerMinute: z.number().int().positive().optional()
  }).optional(),
  watchRepos: z.array(
    z.object({
      path: z.string(),
      branch: z.string().default("main")
    })
  ).optional(),
  features: z.object({
    localDbEnabled: z.boolean().default(true),
    browserCaptureEnabled: z.boolean().default(true),
    llmCommandsEnabled: z.boolean().default(true)
  }).default({}),
  pluginSearchPaths: z.array(z.string()).optional()
}).default({});
var ConfigSchema = z.object({
  watchedRepos: z.array(z.string()).default([]),
  gitPollIntervalMs: z.number().positive().default(3e4),
  storagePaths: z.array(z.string()).default([]),
  storageIndexMaxAgeDays: z.number().nonnegative().default(30),
  browserResponsesIngest: z.boolean().default(true),
  enhanceSchedule: z.unknown().nullable().default(null),
  vscodeLearn: VscodeLearnConfigSchema.default({}),
  browserPaths: z.record(z.string()).default({}),
  platformTriggers: z.record(z.string()).default({}),
  captureSchedule: CaptureScheduleSchema.default({}),
  policy: PolicySchema
});

// src/llm/document-ingester.js
function chunkText(text, { tokens = 512, overlap = 64 } = {}) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks = [];
  const step = Math.max(1, tokens - overlap);
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + tokens);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + tokens >= words.length) break;
  }
  return chunks;
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

// src/knowledge/ingest/ingest-repository.js
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".md",
  ".markdown",
  ".txt",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".json"
]);
var EXCLUDED_FILES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "sonar-all-issues.json",
  "sonar-security-issues.json",
  "repo-tree.txt",
  "PROJECT_ARCHITECTURE_BASELINE.md"
]);
var EXCLUDED_DIRS = /* @__PURE__ */ new Set([
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
  "playwright-report"
]);
var DEFAULT_MAX_FILE_BYTES = 512 * 1024;
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
      if (dirent.isDirectory()) yield* walkFiles(child);
      else if (dirent.isFile()) yield child;
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
    ".json": "json"
  };
  return map[ext] || "text";
}
function parseFeatureArea(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  const parts = relative.split(path.sep);
  if (parts.length > 1) {
    return parts[0];
  }
  return void 0;
}
function hashText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}
function truncateTextForMilvus(text) {
  return String(text ?? "").slice(0, 16384);
}
function chunkToMilvusEntity(chunk, filePath) {
  return {
    chunk_id: chunk.chunkId,
    doc_id: chunk.docId,
    source_type: chunk.sourceType,
    sprint: chunk.sprint ?? -1,
    module: chunk.module ?? "",
    feature_area: chunk.featureArea ?? "",
    version: chunk.version ?? "",
    path: chunk.path ?? filePath,
    section: chunk.section ?? "",
    importance: chunk.importance,
    hash: chunk.hash,
    created_at: chunk.createdAt,
    text: truncateTextForMilvus(chunk.text),
    dense_vector: chunk.denseVector
  };
}
async function ingestRepository(options) {
  const { baseDir, defaultFeatureArea } = options;
  const absoluteBaseDir = path.resolve(baseDir);
  const maxFileBytes = Number(
    options.maxFileBytes ?? process.env.KNOWLEDGE_MAX_FILE_BYTES
  );
  const effectiveMaxFileBytes = Number.isFinite(maxFileBytes) && maxFileBytes > 0 ? maxFileBytes : DEFAULT_MAX_FILE_BYTES;
  await ensureKnowledgeCollection();
  const client = getMilvusClient();
  const files = [];
  let skippedLargeFiles = 0;
  for await (const filePath of walkFiles(absoluteBaseDir)) {
    if (!isSupported(filePath)) continue;
    const stat = await fs.stat(filePath);
    if (stat.size > effectiveMaxFileBytes) {
      skippedLargeFiles += 1;
      continue;
    }
    files.push(filePath);
  }
  console.log(`[knowledge] Found ${files.length} supported file(s)`);
  if (skippedLargeFiles > 0) {
    console.log(
      `[knowledge] Skipped ${skippedLargeFiles} large file(s) over ${effectiveMaxFileBytes} bytes`
    );
  }
  let totalChunks = 0;
  const BATCH_SIZE = 10;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const chunks = [];
    for (const filePath of batch) {
      try {
        const text = await fs.readFile(filePath, "utf8");
        if (text.length === 0) continue;
        const featureArea = defaultFeatureArea ?? parseFeatureArea(filePath) ?? "unknown";
        const sourceType = getSourceType(filePath);
        const relativePath = path.relative(absoluteBaseDir, filePath);
        const docId = `repo:${relativePath.split(path.sep).join("/")}`;
        const fileChunks = chunkText(text).map((content, index) => ({
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
          createdAt: Date.now(),
          text: content,
          denseVector: []
        }));
        chunks.push(...fileChunks);
      } catch (err) {
        console.warn(`[knowledge] Skipping ${filePath}: ${err}`);
      }
    }
    if (chunks.length === 0) continue;
    console.log(
      `[knowledge] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)}: ${chunks.length} chunks from ${batch.length} files`
    );
    const vectors = await embedTextBatch(chunks.map((c) => c.text));
    if (vectors.length !== chunks.length) {
      throw new Error(
        `[knowledge] embedTextBatch returned ${vectors.length} vectors for ${chunks.length} chunks`
      );
    }
    for (let i2 = 0; i2 < chunks.length; i2++) {
      chunks[i2].denseVector = vectors[i2];
    }
    const entities = chunks.map(
      (chunk) => chunkToMilvusEntity(chunk, chunk.path)
    );
    await client.insert({
      collection_name: KNOWLEDGE_COLLECTION,
      data: entities
    });
    totalChunks += entities.length;
    console.log(
      `[knowledge] Inserted ${entities.length} chunk(s) from batch`
    );
  }
  await client.flush({ collection_names: [KNOWLEDGE_COLLECTION] });
  console.log(`[knowledge] Repository ingestion complete: ${totalChunks} chunks`);
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
export {
  ingestRepository
};
