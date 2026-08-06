import { createHash } from 'node:crypto';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'knowledge_chunks';
const VECTOR_DIM = Number(process.env.VECTOR_DIM ?? 2560);
const POINTS = Number(process.env.QDRANT_BENCH_POINTS ?? 200);
const FILTERED = process.env.QDRANT_BENCH_FILTERED === 'true';

function makeVector(index) {
  const vector = new Array(VECTOR_DIM).fill(0);
  for (let i = 0; i < VECTOR_DIM; i += 64) {
    vector[i] = ((index + i) % 17) / 17;
  }
  return vector;
}

function makePoint(index) {
  const area = index % 3 === 0 ? 'auth' : index % 3 === 1 ? 'storage' : 'search';
  const moduleName = index % 2 === 0 ? 'core' : 'rag';
  const chunkId = `bench:${index}:${createHash('sha256').update(String(index)).digest('hex').slice(0, 8)}`;
  const hash = createHash('sha256').update(String(index)).digest('hex');
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  return {
    id,
    vector: makeVector(index),
    payload: {
      chunk_id: chunkId,
      doc_id: `doc:${index}`,
      path: `/bench/file-${index}.md`,
      section: `section-${index % 5}`,
      sprint: 10 + (index % 4),
      feature_area: area,
      source_type: 'markdown',
      module: moduleName,
      content: `Synthetic benchmark chunk ${index}`,
    },
  };
}

async function request(path, init) {
  const res = await fetch(`${QDRANT_URL}${path}`, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function ensureCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (res.ok) {
    return;
  }
  await request(`/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: VECTOR_DIM, distance: 'Cosine' },
      hnsw_config: { m: 32, ef_construct: 200 },
      payload_schema: {
        path: { data_type: 'keyword' },
        section: { data_type: 'keyword' },
        sprint: { data_type: 'integer' },
        feature_area: { data_type: 'keyword' },
        source_type: { data_type: 'keyword' },
        module: { data_type: 'keyword' },
      },
    }),
  });
}

async function benchmarkUpsert(points) {
  const start = performance.now();
  await request(`/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  const durationMs = performance.now() - start;
  return { points: points.length, durationMs, throughputPerSec: points.length / (durationMs / 1000) };
}

async function benchmarkSearch(points, filtered) {
  const vector = makeVector(0);
  const filter = filtered
    ? {
        must: [{ key: 'feature_area', match: { value: 'auth' } }],
      }
    : undefined;
  const start = performance.now();
  await request(`/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit: 5,
      with_payload: true,
      score_threshold: 0.1,
      ...(filter ? { filter } : {}),
    }),
  });
  return performance.now() - start;
}

async function main() {
  await ensureCollection();
  const points = Array.from({ length: POINTS }, (_, index) => makePoint(index));
  const upsertMetrics = await benchmarkUpsert(points);
  const searchMs = await benchmarkSearch(points, FILTERED);
  console.log(JSON.stringify({
    collection: COLLECTION,
    points: POINTS,
    upsert: upsertMetrics,
    searchMs,
    filtered: FILTERED,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
