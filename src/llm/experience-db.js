import crypto from "node:crypto";
import { renameSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DomainError } from "../error.js";
import { loadConfig, assertFeatureEnabled } from "../internal/config.js";
import {
  cosineSimilarity,
  decodeEmbedding,
  encodeEmbedding,
  EmbeddingProvider,
} from "./embeddings.js";

function appBaseDir(baseDir) {
  const home = process.env.HOME || os.homedir();
  return baseDir ?? path.join(home, ".vscode-rotator");
}

function defaultState() {
  return {
    sprints: [],
    mistakes: [],
    rubric_rules: [],
    documents: [],
    ingestion_log: [],
    prompt_history: [],
    conversation_threads: [],
    counters: {
      mistakes: 0,
      rubric_rules: 0,
      documents: 0,
      prompt_history: 0,
      conversation_threads: 0,
    },
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

function isCorruptDbError(err) {
  return (
    err?.code === "SQLITE_CORRUPT" ||
    err?.code === "SQLITE_NOTADB" ||
    err instanceof SyntaxError
  );
}

function quarantineCorruptDb(dbPath) {
  try {
    renameSync(dbPath, `${dbPath}.corrupt-${Date.now()}`);
  } catch {}
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await fs.rename(tmp, filePath);
  } catch {
    try {
      await fs.unlink(filePath);
    } catch {}
    await fs.rename(tmp, filePath);
  }
}

function nextId(state, table) {
  state.counters[table] = Number(state.counters[table] ?? 0) + 1;
  return state.counters[table];
}

function toJson(value) {
  return JSON.stringify(value ?? []);
}

function fromJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class ExperienceDb {
  constructor({ baseDir, dbPath } = {}) {
    // If tests are running, avoid loading the user's real data directory by
    // redirecting the baseDir to a temporary test-specific folder when a
    // baseDir was not explicitly provided.
    const inferredBase = appBaseDir(baseDir);
    // Only override the baseDir when tests are running and HOME was not
    // explicitly redirected by the test harness. If `HOME` is set (the
    // tests set it to a temporary folder), use that so other helper
    // functions (like `rotatorPath`) remain consistent.
    if (
      !baseDir &&
      (process.env.VITEST ||
        process.env.VITEST_WORKER_ID ||
        process.env.NODE_ENV === "test") &&
      (process.env.HOME == null || process.env.HOME === os.homedir())
    ) {
      // Use a homedir-scoped test directory instead of a world-writable tmp
      // directory to avoid S5443: public writable directories. Create the
      // directory with restrictive permissions (owner-only).
      const home = process.env.HOME ?? os.homedir();
      const testRoot = path.join(home, ".vscode-rotator-test-dir");
      try {
        mkdirSync(testRoot, { recursive: true, mode: 0o700 });
      } catch {}
      // Use a per-process subdir to avoid cross-worker collisions
      this.baseDir = path.join(testRoot, String(process.pid));
    } else {
      this.baseDir = inferredBase;
    }

    // If a caller explicitly supplied `baseDir`, ensure it is scoped under
    // the user's home directory to avoid using world-writable locations.
    if (baseDir && !process.env.VITEST && !process.env.VITEST_WORKER_ID) {
      const home = process.env.HOME ?? os.homedir();
      const resolvedBase = path.resolve(baseDir);
      const resolvedHome = path.resolve(home) + path.sep;
      if (
        !resolvedBase.startsWith(resolvedHome) &&
        resolvedBase !== path.resolve(home)
      ) {
        throw new DomainError(
          "ROTATOR_INVALID_BASE_DIR",
          `Refusing to use baseDir outside user home directory: ${baseDir}`,
        );
      }
    }

    // Ensure the base directory exists with owner-only permissions.
    try {
      mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    } catch {}
    this.dbPath = dbPath ?? path.join(this.baseDir, "experience.db");
    this.state = null;
    // Serialize writes to avoid concurrent rename/copy issues on Windows.
    this._writeLock = Promise.resolve();
  }

  async _serializeWrite(task) {
    this._writeLock = this._writeLock.catch(() => {}).then(() => task());
    return this._writeLock;
  }

  _initSchema() {
    this.state = defaultState();
    this.state.counters = { ...defaultState().counters };
    return this;
  }

  async open() {
    const cfg = await loadConfig();
    assertFeatureEnabled(cfg, "localDbEnabled", "capture-and-ingest");
    try {
      const loaded = await readJson(this.dbPath, null);
      this.state =
        loaded && typeof loaded === "object"
          ? { ...defaultState(), ...loaded }
          : defaultState();
      this.state.counters = {
        ...defaultState().counters,
        ...(this.state.counters ?? {}),
      };
      return this;
    } catch (err) {
      if (err?.code === "SQLITE_BUSY") {
        throw new DomainError(
          "ROTATOR_LLM_DB_LOCKED",
          `Experience DB is locked at ${this.dbPath}`,
          err,
        );
      }

      if (isCorruptDbError(err)) {
        quarantineCorruptDb(this.dbPath);
        return this._initSchema();
      }

      throw err;
    }
  }

  async close() {
    if (this.state)
      await this._serializeWrite(() => writeJson(this.dbPath, this.state));
  }

  async save() {
    if (!this.state) await this.open();
    await this._serializeWrite(() => writeJson(this.dbPath, this.state));
  }

  async ensureOpen() {
    if (!this.state) await this.open();
  }

  async upsertSprint(sprint) {
    await this.ensureOpen();
    const row = {
      id: sprint.id ?? sprint.sprintId,
      date: sprint.date ?? new Date().toISOString(),
      agent: sprint.agent ?? "other",
      goal: sprint.goal ?? "",
      tokens_used: Number(sprint.tokens_used ?? sprint.tokensUsed ?? 0),
      completed_tasks: toJson(
        sprint.completed_tasks ?? sprint.completedTasks ?? [],
      ),
      pending_tasks: toJson(sprint.pending_tasks ?? sprint.pendingTasks ?? []),
      files_changed: toJson(
        sprint.files_changed ??
          sprint.filesChanged ?? [
            ...(sprint.filesCreated ?? []),
            ...(sprint.filesModified ?? []),
          ],
      ),
      tests_failed: toJson(sprint.tests_failed ?? sprint.testsFailed ?? []),
      status: sprint.status ?? "active",
    };
    const index = this.state.sprints.findIndex((item) => item.id === row.id);
    if (index >= 0) this.state.sprints[index] = row;
    else this.state.sprints.push(row);
    await this.save();
    return row;
  }

  async recentSprints(limit = 3) {
    await this.ensureOpen();
    return this.state.sprints
      .slice()
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, limit)
      .map((sprint) => ({
        ...sprint,
        completed_tasks: fromJson(sprint.completed_tasks),
        pending_tasks: fromJson(sprint.pending_tasks),
        files_changed: fromJson(sprint.files_changed),
        tests_failed: fromJson(sprint.tests_failed),
      }));
  }

  async addMistake(mistake) {
    await this.ensureOpen();
    const row = {
      id: nextId(this.state, "mistakes"),
      date: mistake.date ?? new Date().toISOString(),
      sprint_id: mistake.sprint_id ?? mistake.sprintId ?? null,
      description: String(mistake.description ?? ""),
      root_cause: String(mistake.root_cause ?? mistake.rootCause ?? ""),
      fix_applied: String(
        mistake.fix_applied ?? mistake.fix ?? mistake.fixApplied ?? "",
      ),
      category: String(mistake.category ?? "general"),
      recurrence_count: Number(mistake.recurrence_count ?? 0),
      embedding: mistake.embedding ? encodeEmbedding(mistake.embedding) : null,
    };
    this.state.mistakes.push(row);
    await this.save();
    return row;
  }

  async listMistakes() {
    await this.ensureOpen();
    return this.state.mistakes.map((mistake) => ({
      ...mistake,
      embedding: decodeEmbedding(mistake.embedding),
    }));
  }

  async incrementMistake(id) {
    await this.ensureOpen();
    const row = this.state.mistakes.find((mistake) => mistake.id === id);
    if (!row) return null;
    row.recurrence_count = Number(row.recurrence_count ?? 0) + 1;
    await this.save();
    return row;
  }

  async addRubricRule({
    rule,
    category = "general",
    created_from_mistake_id = null,
    active = 1,
  }) {
    await this.ensureOpen();
    const existing = this.state.rubric_rules.find((item) => item.rule === rule);
    if (existing) return existing;
    const row = {
      id: nextId(this.state, "rubric_rules"),
      rule,
      category,
      created_from_mistake_id,
      active: active ? 1 : 0,
    };
    this.state.rubric_rules.push(row);
    await this.save();
    return row;
  }

  async insertThread({ platform, captured_at, turn_count, file_path }) {
    await this.ensureOpen();
    const row = {
      id: nextId(this.state, "conversation_threads"),
      platform: platform ?? null,
      captured_at: captured_at ?? new Date().toISOString(),
      turn_count: Number.isFinite(Number(turn_count)) ? Number(turn_count) : 0,
      file_path,
      created_at: new Date().toISOString(),
    };
    this.state.conversation_threads.push(row);
    await this.save();
    return row;
  }

  async getThreads(limit = 20) {
    await this.ensureOpen();
    return this.state.conversation_threads
      .slice()
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }

  async listRubricRules({ activeOnly = false } = {}) {
    await this.ensureOpen();
    return this.state.rubric_rules.filter(
      (rule) => !activeOnly || Number(rule.active) === 1,
    );
  }

  async setRubricActive(id, active) {
    await this.ensureOpen();
    const row = this.state.rubric_rules.find((rule) => rule.id === Number(id));
    if (!row) throw new Error(`Rubric rule not found: ${id}`);
    row.active = active ? 1 : 0;
    await this.save();
    return row;
  }

  async replaceDocumentsForFile(filename, chunks) {
    await this.ensureOpen();
    this.state.documents = this.state.documents.filter(
      (doc) => doc.filename !== filename,
    );
    const now = new Date().toISOString();
    const rows = chunks.map((chunk, index) => ({
      id: nextId(this.state, "documents"),
      filename,
      chunk_index: index,
      content: chunk.content,
      embedding: encodeEmbedding(chunk.embedding),
      source_type: chunk.source_type ?? null,
      platform: chunk.platform ?? null,
      metadata: chunk.metadata ? toJson(chunk.metadata) : null,
      quality: chunk.quality ?? null,
      notes: chunk.notes ?? null,
      turn_index: chunk.turn_index ?? null,
      last_ingested: now,
      file_ts: chunk.file_ts,
    }));
    this.state.documents.push(...rows);
    await this.save();
    return rows;
  }

  async upsertDocuments(chunks, { filename = null, uniqueBy = null } = {}) {
    await this.ensureOpen();
    const now = new Date().toISOString();
    const existingKeys = new Set();

    if (uniqueBy) {
      for (const document of this.state.documents) {
        const metadata = document.metadata
          ? fromJson(document.metadata, {})
          : {};
        if (metadata && metadata[uniqueBy] != null) {
          existingKeys.add(String(metadata[uniqueBy]));
        }
      }
    }

    const startingIndex = this.state.documents.filter(
      (doc) => doc.filename === filename,
    ).length;
    const rows = [];
    for (const [index, chunk] of chunks.entries()) {
      const metadata = chunk.metadata ?? null;
      const uniqueValue =
        uniqueBy && metadata && metadata[uniqueBy] != null
          ? String(metadata[uniqueBy])
          : null;
      if (uniqueBy && uniqueValue && existingKeys.has(uniqueValue)) continue;

      if (uniqueValue) {
        existingKeys.add(uniqueValue);
      }

      rows.push({
        id: nextId(this.state, "documents"),
        filename,
        chunk_index: startingIndex + index,
        content: chunk.content,
        embedding: encodeEmbedding(chunk.embedding),
        source_type: chunk.source_type ?? null,
        platform: chunk.platform ?? null,
        metadata: metadata ? toJson(metadata) : null,
        quality: chunk.quality ?? null,
        notes: chunk.notes ?? null,
        turn_index: chunk.turn_index ?? null,
        last_ingested: now,
        file_ts: chunk.file_ts,
      });
    }

    if (rows.length > 0) {
      this.state.documents.push(...rows);
      await this.save();
    }
    return rows;
  }

  async getDocumentsByFile(filename) {
    await this.ensureOpen();
    return this.state.documents
      .filter((doc) => doc.filename === filename)
      .map((doc) => ({
        ...doc,
        embedding: decodeEmbedding(doc.embedding),
      }))
      .map((doc) => ({
        ...doc,
        metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
        embedding: decodeEmbedding(doc.embedding),
      }));
  }

  async deleteDocumentsForFile(filename) {
    await this.ensureOpen();
    this.state.documents = this.state.documents.filter(
      (doc) => doc.filename !== filename,
    );
    await this.save();
  }

  async vectorSearchDocuments(queryEmbedding, limit = 5) {
    await this.ensureOpen();
    return this.state.documents
      .map((doc) => ({
        ...doc,
        embedding: decodeEmbedding(doc.embedding),
        score: cosineSimilarity(queryEmbedding, decodeEmbedding(doc.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async relatedTo(queryEmbedding, opts = {}) {
    await this.ensureOpen();
    const topDocs = Number.isFinite(Number(opts.topDocs))
      ? Number(opts.topDocs)
      : 5;
    const documents = await this.vectorSearchDocuments(queryEmbedding, topDocs);

    const sprints = Array.isArray(this.state.sprints)
      ? this.state.sprints
          .slice()
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
          .slice(0, 5)
          .map((sprint) => ({
            ...sprint,
            startedAt: sprint.date,
          }))
      : [];

    const promptHistory = Array.isArray(this.state.prompt_history)
      ? this.state.prompt_history
          .slice()
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
          .slice(0, 5)
      : [];

    return { documents, sprints, promptHistory };
  }

  async recentLlmResponseChunks(platform, limit = 3) {
    await this.ensureOpen();
    const getPriority = (quality) => {
      if (quality === "good") return 1;
      if (quality == null) return 2;
      if (quality === "partial") return 3;
      if (quality === "bad") return 4;
      return 5;
    };

    return this.state.documents
      .filter(
        (doc) =>
          doc.source_type === "llm-response" && doc.platform === platform,
      )
      .slice()
      .sort((a, b) => {
        const priorityA = getPriority(a.quality);
        const priorityB = getPriority(b.quality);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return Number(b.id) - Number(a.id);
      })
      .slice(0, limit)
      .map((doc) => ({
        ...doc,
        embedding: decodeEmbedding(doc.embedding),
      }));
  }

  async getThreadsByPlatform(platform) {
    await this.ensureOpen();
    const threadsMap = new Map();

    // Group documents by filename and turn_index
    for (const doc of this.state.documents) {
      if (doc.source_type === "thread-turn" && doc.platform === platform) {
        if (!threadsMap.has(doc.filename)) {
          threadsMap.set(doc.filename, []);
        }
        threadsMap.get(doc.filename).push({
          ...doc,
          metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
          embedding: decodeEmbedding(doc.embedding),
        });
      }
    }

    // Sort each thread by turn_index
    const result = [];
    for (const [filename, docs] of threadsMap.entries()) {
      docs.sort((a, b) => Number(a.turn_index) - Number(b.turn_index));
      result.push(...docs);
    }

    // Final sort by filename and turn_index
    result.sort((a, b) => {
      if (a.filename !== b.filename) {
        return a.filename.localeCompare(b.filename);
      }
      return Number(a.turn_index) - Number(b.turn_index);
    });

    return result;
  }

  async getThreadContext(query, platform = null, limit = 3) {
    await this.ensureOpen();
    if (!query || !String(query).trim()) {
      return [];
    }

    const provider = new EmbeddingProvider();
    await provider.initialize();
    const queryEmbedding = await provider.embed(String(query));

    const threadDocs = this.state.documents
      .filter(
        (doc) =>
          doc.source_type === "thread-turn" &&
          (!platform || doc.platform === platform),
      )
      .map((doc) => ({
        ...doc,
        metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
        embedding: decodeEmbedding(doc.embedding),
      }));

    if (threadDocs.length === 0) {
      return [];
    }

    return threadDocs
      .map((doc) => ({
        ...doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.filename !== b.filename)
          return a.filename.localeCompare(b.filename);
        return Number(a.turn_index) - Number(b.turn_index);
      })
      .slice(0, limit);
  }

  async getIngestionLog() {
    await this.ensureOpen();
    return new Map(this.state.ingestion_log.map((row) => [row.path, row]));
  }

  async upsertIngestionLog(row) {
    await this.ensureOpen();
    const next = {
      path: row.path,
      file_ts: row.file_ts,
      chunk_count: Number(row.chunk_count ?? 0),
      last_run: row.last_run ?? new Date().toISOString(),
    };
    const index = this.state.ingestion_log.findIndex(
      (item) => item.path === next.path,
    );
    if (index >= 0) this.state.ingestion_log[index] = next;
    else this.state.ingestion_log.push(next);
    await this.save();
    return next;
  }

  async deleteIngestionLog(filePath) {
    await this.ensureOpen();
    this.state.ingestion_log = this.state.ingestion_log.filter(
      (row) => row.path !== filePath,
    );
    await this.save();
  }

  async addPromptHistory(prompt) {
    await this.ensureOpen();
    const now = new Date().toISOString();
    const row = {
      id: nextId(this.state, "prompt_history"),
      date: prompt.date ?? now,
      goal: String(prompt.goal ?? ""),
      platform: prompt.platform ?? "chatgpt",
      prompt: prompt.prompt ?? prompt.prompt_text ?? "",
      prompt_text: prompt.prompt_text ?? prompt.prompt ?? "",
      response_file: prompt.response_file ?? null,
      cycle_ts: prompt.cycle_ts ?? null,
      response_summary: prompt.response_summary ?? prompt.responseSummary ?? "",
      sprint_id: prompt.sprint_id ?? prompt.sprintId ?? null,
      tokens_estimated: Number(
        prompt.tokens_estimated ?? prompt.tokensEstimated ?? 0,
      ),
      rating: prompt.rating ?? prompt.quality_rating ?? null,
      quality_rating: prompt.quality_rating ?? prompt.rating ?? null,
    };
    this.state.prompt_history.push(row);
    await this.save();
    return row;
  }

  async logEnhanceCycle({
    goal,
    platform,
    promptText,
    responseFile,
    cycleTs = null,
    rating = null,
    sprintId = null,
  } = {}) {
    await this.ensureOpen();
    return this.addPromptHistory({
      goal,
      platform,
      prompt_text: promptText,
      prompt: promptText,
      response_file: responseFile,
      cycle_ts: cycleTs ?? new Date().toISOString(),
      rating,
      quality_rating: rating,
      sprint_id: sprintId,
    });
  }

  async _updatePromptRating(id, rating) {
    await this.ensureOpen();
    const row = this.state.prompt_history.find(
      (prompt) => prompt.id === Number(id),
    );
    if (!row) throw new Error(`Prompt history not found: ${id}`);
    row.rating = Number(rating);
    row.quality_rating = Number(rating);
    await this.save();

    if (Number(rating) <= 2) {
      const description = row.goal
        ? `Low-quality response for goal: ${row.goal}`
        : `Low-quality response for historic prompt #${row.id}`;

      await this.addMistake({
        description,
        category: "llm-response-quality",
        fix: "Review the prompt and response to improve quality.",
        recurrence_count: 1,
      });
      await this.addRubricRule({
        rule: `Avoid low-quality responses for goal: ${row.goal || "unnamed goal"}.`,
        category: "llm-response-quality",
      });
    }

    return row;
  }

  async ratePrompt(id, rating) {
    return this._updatePromptRating(id, rating);
  }

  async ratePromptHistory(id, rating) {
    return this._updatePromptRating(id, rating);
  }
}
