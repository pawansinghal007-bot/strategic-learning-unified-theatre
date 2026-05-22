#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const INDEX_PATH = path.resolve(process.cwd(), 'strategic-learning-unified-theatre-file-index.json');
function loadIndex() {
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading file index:', err.message);
    process.exit(2);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node tools/file-index.js <query-substring>');
  process.exit(0);
}
const q = args.join(' ').toLowerCase();
const index = loadIndex();
const results = index.filter(p => p.toLowerCase().includes(q));
if (results.length === 0) {
  console.log('No matches.');
  process.exit(0);
}
for (const r of results) console.log(r);
