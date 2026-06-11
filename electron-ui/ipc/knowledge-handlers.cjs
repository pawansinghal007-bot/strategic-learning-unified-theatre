'use strict';

const { ipcMain } = require('electron');

function knowledge() {
  return require('../../src/knowledge/index.js');
}

function registerKnowledgeHandlers() {
  ipcMain.handle('knowledge:ingest', async (_event, baseDir, featureArea) => {
    const { ingestSprintHistory } = knowledge();
    await ingestSprintHistory({
      baseDir: baseDir ?? './docs/sprints',
      defaultFeatureArea: featureArea ?? undefined,
    });
    return { ok: true };
  });

  ipcMain.handle('knowledge:search', async (_event, queryText, options) => {
    const { getMilvusClient, embedTextBatch } = knowledge();
    const vectors = await embedTextBatch([queryText]);
    const client = getMilvusClient();

    const result = await client.search({
      collection_name: 'knowledge_chunks',
      data: vectors,
      limit: options?.limit ?? 5,
      output_fields: [
        'chunk_id', 'doc_id', 'source_type', 'sprint',
        'feature_area', 'path', 'section', 'importance',
      ],
      filter: options?.filter ?? undefined,
    });

    return result.results ?? [];
  });
}

module.exports = { registerKnowledgeHandlers };
