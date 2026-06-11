"use strict";

const { ipcMain } = require("electron");

function knowledge() {
  return require("../../src/knowledge/index.js");
}

function toScoreNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

function normalizeHit(hit) {
  return {
    chunk_id: hit.chunk_id ?? hit.chunkId ?? "",
    doc_id: hit.doc_id ?? hit.docId ?? "",
    source_type: hit.source_type ?? hit.sourceType ?? "",
    sprint: Number(hit.sprint ?? 0),
    feature_area: hit.feature_area ?? hit.featureArea ?? "",
    path: hit.path ?? "",
    section: hit.section ?? "",
    importance: Number(hit.importance ?? 0),
    score: toScoreNumber(hit.score ?? hit.distance ?? hit.similarity),
    text: hit.text ?? "",
  };
}

function registerKnowledgeHandlers() {
  ipcMain.handle("knowledge:ingest", async (_event, baseDir, featureArea) => {
    const { ingestSprintHistory } = knowledge();
    await ingestSprintHistory({
      baseDir: baseDir ?? "./docs/sprints",
      defaultFeatureArea: featureArea ?? undefined,
    });
    return { ok: true };
  });

  ipcMain.handle("knowledge:search", async (_event, queryText, options) => {
    const { getMilvusClient, embedTextBatch } = knowledge();
    const vectors = await embedTextBatch([queryText]);
    const client = getMilvusClient();

    const result = await client.search({
      collection_name: "knowledge_chunks",
      data: vectors,
      limit: options?.limit ?? 5,
      output_fields: [
        "chunk_id",
        "doc_id",
        "source_type",
        "sprint",
        "feature_area",
        "path",
        "section",
        "importance",
        "text",
      ],
      filter: options?.filter ?? undefined,
    });

    const hits = Array.isArray(result?.results) ? result.results : [];
    return hits.map(normalizeHit);
  });
}

module.exports = { registerKnowledgeHandlers };
