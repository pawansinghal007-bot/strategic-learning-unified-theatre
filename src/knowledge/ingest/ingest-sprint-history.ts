import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getMilvusClient,
  KNOWLEDGE_COLLECTION,
  ensureKnowledgeCollection,
} from './milvus-client.js';
import { chunkDocument } from './chunking.js';
import { embedTextBatch } from './embedder.js';
import type { KnowledgeDocument } from '../schema/documents.js';
import type { KnowledgeChunk } from '../schema/metadata.js';

const SPRINT_REPORT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

interface IngestOptions {
  baseDir: string;
  defaultFeatureArea?: string;
}

async function discoverSprintReportFiles(baseDir: string): Promise<string[]> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SPRINT_REPORT_EXTENSIONS.has(ext)) continue;
    files.push(path.join(baseDir, entry.name));
  }

  return files.sort();
}

function parseSprintNumberFromFilename(filePath: string): number | undefined {
  const base = path.basename(filePath).toLowerCase();
  const match = base.match(/sprint[-_ ]?(\d{1,3})/);
  if (match && match[1]) {
    const num = Number(match[1]);
    return Number.isFinite(num) ? num : undefined;
  }

  const leading = base.match(/^(\d{1,3})[_-]/);
  if (leading && leading[1]) {
    const num = Number(leading[1]);
    return Number.isFinite(num) ? num : undefined;
  }

  return undefined;
}

async function loadSprintReportDocument(
  filePath: string,
  defaultFeatureArea?: string,
): Promise<KnowledgeDocument> {
  const rawText = await fs.readFile(filePath, 'utf8');
  const sprint = parseSprintNumberFromFilename(filePath);
  const title = sprint != null
    ? `Sprint ${sprint} Implementation Report`
    : `Sprint Report: ${path.basename(filePath)}`;
  const docId = sprint != null
    ? `sprint-${sprint}-report`
    : `sprint-report:${path.basename(filePath)}`;

  return {
    id: docId,
    sourceType: 'sprint_report',
    title,
    path: filePath,
    sprint,
    featureArea: defaultFeatureArea,
    rawText,
  };
}

function chunkToMilvusEntity(chunk: KnowledgeChunk) {
  return {
    chunk_id: chunk.chunkId,
    doc_id: chunk.docId,
    source_type: chunk.sourceType,
    sprint: chunk.sprint ?? -1,
    module: chunk.module ?? '',
    feature_area: chunk.featureArea ?? '',
    version: chunk.version ?? '',
    path: chunk.path ?? '',
    section: chunk.section ?? '',
    importance: chunk.importance,
    hash: chunk.hash,
    created_at: chunk.createdAt,
    dense_vector: chunk.denseVector,
  };
}

export async function ingestSprintHistory(options: IngestOptions): Promise<void> {
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
        `[knowledge] embedTextBatch returned ${vectors.length} vectors for ${chunks.length} chunks`,
      );
    }

    for (let i = 0; i < chunks.length; i++) {
      chunks[i].denseVector = vectors[i];
    }

    const entities = chunks.map(chunkToMilvusEntity);
    const client = getMilvusClient();

    await client.insert({
      collection_name: KNOWLEDGE_COLLECTION,
      data: entities,
    });

    console.log(`[knowledge] Inserted ${entities.length} chunk(s) for ${doc.id}`);
  }

  console.log('[knowledge] Sprint history ingestion complete.');
}

if (process.argv[1] && process.argv[1].includes('ingest-sprint-history')) {
  const baseDir = process.argv[2] ?? './docs/sprints';
  ingestSprintHistory({ baseDir }).catch((err) => {
    console.error('[knowledge] Ingestion failed:', err);
    process.exitCode = 1;
  });
}

