import fs from 'fs/promises';
import path from 'node:path';
import { createCoverageMap } from 'istanbul-lib-coverage';
import { convert } from 'ast-v8-to-istanbul';
import { parseAstAsync } from 'vite';

const base = path.resolve('coverage', '.tmp');
const files = await fs.readdir(base);
const coverageMap = createCoverageMap({});
for (const file of files) {
  const content = JSON.parse(await fs.readFile(path.join(base, file), 'utf8'));
  for (const result of content.result) {
    const url = new URL(result.url);
    const filepath = path.normalize(decodeURIComponent(url.pathname));
    const candidate = filepath.startsWith(path.sep) && /^[A-Za-z]:/.test(filepath.slice(1,3)) ? filepath.slice(1) : filepath;
    if (!await fs.stat(candidate).catch(() => false)) continue;
    const code = await fs.readFile(candidate, 'utf8');
    const ast = await parseAstAsync(code);
    const cov = await convert({ ast, code, coverage: result, wrapperLength: 0 });
    if (cov) coverageMap.merge(cov);
  }
}
const targets = [
  'src\\secret-store.js',
  'src\\daemon-runner.js',
  'src\\browser-bridge.js',
  'src\\agent-handoff.js',
  'src\\local-llm.js',
  'src\\idea-store.js'
].map(p => path.resolve(p));
for (const target of targets) {
  if (!coverageMap.data[target]) {
    console.log(`MISSING|${target}`);
    continue;
  }
  const fileCov = coverageMap.fileCoverageFor(target);
  const summary = fileCov.toSummary().data;
  console.log(`${target}|${summary.lines.pct}|${summary.statements.pct}|${summary.branches.pct}|${summary.functions.pct}`);
}
