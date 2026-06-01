import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ExperienceDb } from "./experience-db.js";

function parseSince(since) {
  if (!since) return null;
  const when = new Date(String(since));
  if (!Number.isFinite(when.getTime())) {
    throw new Error(`Invalid since date: ${since}`);
  }
  return when;
}

function normalizeQuality(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

function documentTimestamp(doc) {
  const candidate =
    doc.file_ts ||
    doc.last_ingested ||
    doc.metadata?.created_at ||
    doc.metadata?.captured_at;
  if (!candidate) return null;
  const date = new Date(String(candidate));
  return Number.isFinite(date.getTime()) ? date : null;
}

function groupDocuments(documents) {
  const sessionGroups = new Map();
  const threadGroups = new Map();
  const llmResponses = [];

  for (const doc of documents) {
    if (doc.source_type === "bc2-chat" && doc.metadata?.bc2_session_id) {
      const sessionId = String(doc.metadata.bc2_session_id);
      if (!sessionGroups.has(sessionId)) sessionGroups.set(sessionId, []);
      sessionGroups.get(sessionId).push(doc);
      continue;
    }

    if (doc.source_type === "thread-turn") {
      const threadId = String(
        doc.metadata?.thread_id ??
          doc.metadata?.thread_file ??
          doc.filename ??
          "unknown-thread",
      );
      if (!threadGroups.has(threadId)) threadGroups.set(threadId, []);
      threadGroups.get(threadId).push(doc);
      continue;
    }

    if (doc.source_type === "llm-response") {
      llmResponses.push({
        type: "llm-response",
        platform: doc.platform ?? null,
        content: doc.content ?? null,
        quality: doc.quality ?? null,
        metadata: doc.metadata ?? null,
      });
    }
  }

  return { sessionGroups, threadGroups, llmResponses };
}

function buildSessionRecords(sessionGroups) {
  const records = [];

  for (const [sessionId, docs] of sessionGroups.entries()) {
    docs.sort((a, b) => {
      const aTime = documentTimestamp(a)?.getTime() ?? 0;
      const bTime = documentTimestamp(b)?.getTime() ?? 0;
      return aTime - bTime;
    });

    for (let index = 0; index < docs.length - 1; index += 1) {
      const current = docs[index];
      const next = docs[index + 1];
      if (
        current.metadata?.role === "user" &&
        next.metadata?.role === "assistant"
      ) {
        records.push({
          type: "bc2-chat",
          platform: current.platform ?? next.platform ?? null,
          session_id: sessionId,
          user: current.content ?? null,
          assistant: next.content ?? null,
          metadata: {
            user_message_id: current.metadata?.bc2_message_id,
            assistant_message_id: next.metadata?.bc2_message_id,
            created_at: current.metadata?.created_at,
            assistant_created_at: next.metadata?.created_at,
          },
        });
      }
    }
  }

  return records;
}

function buildThreadRecords(threadGroups) {
  const records = [];

  for (const [threadId, docs] of threadGroups.entries()) {
    docs.sort((a, b) => Number(a.turn_index ?? 0) - Number(b.turn_index ?? 0));
    for (let index = 0; index < docs.length - 1; index += 1) {
      const current = docs[index];
      const next = docs[index + 1];
      if (
        current.metadata?.role === "user" &&
        next.metadata?.role === "assistant"
      ) {
        records.push({
          type: "thread-turn",
          platform: current.platform ?? null,
          thread_id: threadId,
          user: current.content ?? null,
          assistant: next.content ?? null,
          metadata: {
            thread_file: current.metadata?.thread_file,
            turn_count: current.metadata?.turn_count,
            user_turn: current.metadata?.turn,
            assistant_turn: next.metadata?.turn,
          },
        });
      }
    }
  }

  return records;
}

function buildExportRecords(documents, qualityFilter) {
  const { sessionGroups, threadGroups, llmResponses } =
    groupDocuments(documents);
  const records = [
    ...llmResponses,
    ...buildSessionRecords(sessionGroups),
    ...buildThreadRecords(threadGroups),
  ];

  if (qualityFilter) {
    return records.filter(
      (record) => normalizeQuality(record.quality) === qualityFilter,
    );
  }
  return records;
}

export async function exportTrainingData({
  baseDir,
  db,
  outputPath,
  since,
  platform,
  quality,
  dryRun = false,
  minPairs = 0,
} = {}) {
  const trainingDb = db || new ExperienceDb({ baseDir });
  let shouldClose = false;
  if (!db) {
    await trainingDb.open();
    shouldClose = true;
  }

  try {
    const sinceDate = parseSince(since);
    const qualityFilter = normalizeQuality(quality);
    const allDocuments = Array.isArray(trainingDb.state.documents)
      ? trainingDb.state.documents.map((doc) => ({
          ...doc,
          metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
        }))
      : [];

    const filteredDocuments = allDocuments.filter((doc) => {
      if (
        platform &&
        String(doc.platform ?? "").trim() !== String(platform).trim()
      )
        return false;
      if (sinceDate) {
        const timestamp = documentTimestamp(doc);
        if (!timestamp || timestamp < sinceDate) return false;
      }
      if (qualityFilter && normalizeQuality(doc.quality) !== qualityFilter) {
        return false;
      }
      return ["bc2-chat", "thread-turn", "llm-response"].includes(
        doc.source_type,
      );
    });

    const records = buildExportRecords(filteredDocuments, qualityFilter);
    const output = outputPath
      ? path.resolve(outputPath)
      : path.join(
          baseDir || path.join(os.homedir(), ".vscode-rotator"),
          "training-export.jsonl",
        );

    if (
      minPairs > 0 &&
      records.filter((record) => record.type !== "llm-response").length <
        minPairs
    ) {
      throw new Error(
        `Training export produced fewer than ${minPairs} conversation pair(s).`,
      );
    }

    if (!dryRun) {
      await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      const randomSuffix = crypto.randomBytes(8).toString("hex");
      const tempPath = `${output}.${process.pid}.${Date.now()}.${randomSuffix}.tmp`;
      await fs.writeFile(
        tempPath,
        records.map((record) => JSON.stringify(record)).join("\n") +
          (records.length ? "\n" : ""),
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.rename(tempPath, output);
    }

    return {
      outputPath: output,
      recordsCount: records.length,
      pairCount: records.filter((record) => record.type !== "llm-response")
        .length,
      dryRun: Boolean(dryRun),
    };
  } finally {
    if (shouldClose) {
      await trainingDb.close();
    }
  }
}
