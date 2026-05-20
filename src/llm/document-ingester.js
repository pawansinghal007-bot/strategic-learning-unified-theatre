import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ExperienceDb } from "./experience-db.js";
import { EmbeddingProvider } from "./embeddings.js";

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".md", ".txt", ".docx"]);

function appBaseDir(baseDir) {
  return baseDir ?? path.join(process.env.HOME || os.homedir(), ".vscode-rotator");
}

function browserResponsesDir(baseDir) {
  return path.join(appBaseDir(baseDir), "browser-responses");
}

function parseBrowserResponsePlatform(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/(\d{4}-\d{2}-\d{2}T[\d-]+-([a-z]+)\.md)$/);
  return match ? match[2] : null;
}

function isBrowserResponsePath(filePath, baseDir) {
  const responseDir = browserResponsesDir(baseDir);
  const normalized = path.resolve(filePath);
  return normalized.startsWith(path.resolve(responseDir) + path.sep);
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sourceType(filePath) {
  return path.extname(filePath).toLowerCase().replace(/^\./, "") || "text";
}

function isSupported(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function* walkFiles(root) {
  const stat = await fs.stat(root);
  if (stat.isFile()) {
    yield root;
    return;
  }
  if (!stat.isDirectory()) return;
  const dir = await fs.opendir(root);
  for await (const dirent of dir) {
    const child = path.join(root, dirent.name);
    if (dirent.isDirectory()) yield* walkFiles(child);
    else if (dirent.isFile()) yield child;
  }
}

async function readDocumentText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(await fs.readFile(filePath));
      return parsed.text || "";
    } catch {
      return "";
    }
  }
  if (ext === ".docx") {
    try {
      const mammoth = await import("mammoth");
      const parsed = await mammoth.extractRawText({ path: filePath });
      return parsed.value || "";
    } catch {
      return "";
    }
  }
  return fs.readFile(filePath, "utf8");
}

export function chunkText(text, { tokens = 512, overlap = 64 } = {}) {
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

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: content };
  try {
    const lines = match[1].split("\n");
    const data = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        const value = valueParts.join(":").trim();
        data[key.trim()] = value.replace(/^["']|["']$/g, "");
      }
    }
    const body = content.slice(match[0].length);
    return { data, body };
  } catch {
    return { data: {}, body: content };
  }
}

function chunkThread(content, { fileTs, platform, threadFile } = {}) {
  const { data: frontmatter, body } = parseFrontmatter(content);

  if (frontmatter.type !== "thread") {
    return null;
  }

  const turnRegex = /^## Turn (\d+) — (User|Assistant)\s*$/gmi;
  const matches = Array.from(body.matchAll(turnRegex));
  if (matches.length === 0) {
    return null;
  }

  const turns = matches
    .map((match, index) => {
      const turnIndex = Number(match[1]);
      const role = match[2];
      const contentStart = match.index + match[0].length;
      const contentEnd = index + 1 < matches.length ? matches[index + 1].index : body.length;
      const turnContent = body.slice(contentStart, contentEnd).trim();

      if (!turnContent) return null;
      return {
        turn_index: Number.isFinite(turnIndex) ? turnIndex : index + 1,
        role: role.toLowerCase(),
        content: turnContent
      };
    })
    .filter(Boolean);

  if (turns.length === 0) {
    return null;
  }

  return turns.map((turn) => ({
    content: turn.content,
    source_type: "thread-turn",
    platform,
    file_ts: fileTs,
    turn_index: turn.turn_index,
    metadata: {
      turn: turn.turn_index,
      role: turn.role,
      threadFile: threadFile || null
    }
  }));
}

// chunkText is defined above and exported once

export class DocumentIngester {
  constructor({ baseDir, db, embeddings } = {}) {
    this.baseDir = baseDir;
    this.db = db ?? new ExperienceDb({ baseDir });
    this.embeddings = embeddings ?? new EmbeddingProvider();
  }

  async initialize() {
    await this.db.open();
    await this.embeddings.initialize();
    return this;
  }

  async ingestFile(filePath, { fileTs, source_type, platform } = {}) {
    const absolute = path.resolve(filePath);
    if (!isSupported(absolute) || !(await exists(absolute))) return { path: absolute, chunks: 0, skipped: true };
    const stat = await fs.stat(absolute);
    const text = await readDocumentText(absolute);
    const ts = fileTs ?? stat.mtime.toISOString();

    // Check if this is a thread file
    let threadChunks = null;
    if (text.includes("type: thread")) {
      threadChunks = chunkThread(text, { fileTs: ts, platform, threadFile: path.basename(absolute) });
    }

    let chunks;
    if (threadChunks) {
      // For threads, each turn is already a chunk with turn_index
      chunks = threadChunks;
    } else {
      // For regular documents, use paragraph chunking
      const chunkContents = chunkText(text);
      const inferredPlatform = source_type === "llm-response" ? platform : null;
      chunks = chunkContents.map((content, index) => ({
        content,
        source_type: source_type ?? sourceType(absolute),
        platform: inferredPlatform,
        file_ts: ts
      }));
    }

    // Embed all chunks
    const vectors = await this.embeddings.embedMany(chunks.map((c) => c.content));
    const chunksWithEmbeddings = chunks.map((chunk, index) => ({
      ...chunk,
      embedding: vectors[index]
    }));

    await this.db.replaceDocumentsForFile(absolute, chunksWithEmbeddings);
    await this.db.upsertIngestionLog({
      path: absolute,
      file_ts: ts,
      chunk_count: chunksWithEmbeddings.length,
      last_run: new Date().toISOString()
    });
    return { path: absolute, chunks: chunksWithEmbeddings.length, skipped: false };
  }

  async ingestThread(filePath, { platform } = {}) {
    await this.initialize();
    const absolute = path.resolve(filePath);
    if (!(await exists(absolute))) return { path: absolute, chunks: 0, skipped: true };
    // Reuse ingestFile logic which now handles thread files and metadata
    const stat = await fs.stat(absolute);
    const result = await this.ingestFile(absolute, { fileTs: stat.mtime.toISOString(), source_type: "thread-turn", platform });
    await this.db.close();
    return result;
  }

  async ingestPath(targetPath) {
    await this.initialize();
    const results = [];
    for await (const filePath of walkFiles(path.resolve(targetPath))) {
      if (isSupported(filePath)) results.push(await this.ingestFile(filePath));
    }
    await this.db.close();
    return results;
  }

  async ingestFromSnapshot({ snapshotPath, force = false } = {}) {
    await this.initialize();
    const effectiveSnapshot = snapshotPath ?? path.join(this.db.baseDir, "storage-snapshot.json");
    const snapshot = await readJson(effectiveSnapshot, { paths: {} });
    const paths = snapshot?.paths && typeof snapshot.paths === "object" ? snapshot.paths : {};
    const ingestible = new Map(
      Object.entries(paths)
        .filter(([filePath, entry]) => entry?.ingestible === true && isSupported(filePath))
        .map(([filePath, entry]) => [path.resolve(filePath), entry])
    );
    const log = await this.db.getIngestionLog();
    const actions = [];

    for (const [filePath, entry] of ingestible.entries()) {
      const fileTs = entry.file_ts ?? entry.ts;
      const previous = log.get(filePath);
      if (force || !previous) {
        actions.push({ type: "new", path: filePath, fileTs });
      } else if (Date.parse(fileTs) > Date.parse(previous.file_ts)) {
        actions.push({ type: "changed", path: filePath, fileTs });
      }
    }

    for (const oldPath of log.keys()) {
      if (!ingestible.has(oldPath)) actions.push({ type: "deleted", path: oldPath });
    }

    const results = [];
    for (const action of actions) {
      if (action.type === "deleted") {
        await this.db.deleteDocumentsForFile(action.path);
        await this.db.deleteIngestionLog(action.path);
        results.push({ ...action, chunks: 0 });
        continue;
      }
      await this.db.deleteDocumentsForFile(action.path);
      const browserPlatform = parseBrowserResponsePlatform(action.path);
      const isBrowserResponse = browserPlatform && isBrowserResponsePath(action.path, this.baseDir);
      const result = await this.ingestFile(action.path, {
        fileTs: action.fileTs,
        source_type: isBrowserResponse ? "llm-response" : undefined,
        platform: isBrowserResponse ? browserPlatform : undefined
      });
      results.push({ ...action, chunks: result.chunks });
    }

    await this.db.close();
    return {
      snapshotPath: effectiveSnapshot,
      actions: results,
      ingested: results.filter((result) => result.type !== "deleted").length,
      deleted: results.filter((result) => result.type === "deleted").length
    };
  }
}
