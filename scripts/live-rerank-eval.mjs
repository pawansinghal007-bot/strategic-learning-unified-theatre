import { queryTopK } from '../src/llm/qdrant-client.js';
import { performance } from 'perf_hooks';

const queries = [
  'What is the process for adding a new retrieval provider?',
  'How does the contextual prompt injection work in the gateway?',
  'Where is the Qdrant vector store initialized and queried?',
  'Explain how reranking is implemented in this codebase.',
];

const k = 5;
const results = [];

for (const query of queries) {
  const start = performance.now();
  const chunks = await queryTopK(query, k);
  const duration = performance.now() - start;
  results.push({ query, durationMs: duration, count: chunks.length, chunks });
}

console.log(JSON.stringify({ results }, null, 2));
