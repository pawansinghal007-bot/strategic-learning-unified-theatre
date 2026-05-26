import fs from 'fs/promises';
import path from 'path';
import coveragePkg from 'istanbul-lib-coverage';
import { convert } from 'ast-v8-to-istanbul';
import { parseAstAsync } from 'vite';

const { createCoverageMap } = coveragePkg;
const base = path.resolve('coverage', '.tmp');
const files = await fs.readdir(base);
const coverageMap = createCoverageMap({});
for (const file of files) {
  const content = JSON.parse(await fs.readFile(path.join(base, file), 'utf8'));
  for (const result of content.result) {
    try {
      const url = new URL(result.url);
      let filepath = decodeURIComponent(url.pathname);
      filepath = path.normalize(filepath);
      if (filepath.startsWith(path.sep) && /^[A-Za-z]:/.test(filepath.slice(1, 3))) {
        filepath = filepath.slice(1);
      }
      if (!(await fs.stat(filepath).catch(() => false))) {
        continue;
      }
      const code = await fs.readFile(filepath, 'utf8');
      const ast = await parseAstAsync(code);
      const cov = await convert({ ast, code, coverage: result, wrapperLength: 0 });
      if (cov) coverageMap.merge(cov);
    } catch (err) {
      console.error('SKIP', result.url, err.message);
    }
  }
}
const targets = [
  'src/secret-store.js',
  'src/daemon-runner.js',
  'src/browser-bridge.js',
  'src/agent-handoff.js',
  'src/local-llm.js',
  'src/idea-store.js',
];
for (const target of targets) {
  const full = path.resolve(target);
  if (!coverageMap.data[full]) {
    console.log(`MISSING|${target}`);
    continue;
  }
  const fileCov = coverageMap.fileCoverageFor(full);
  const summary = fileCov.toSummary().data;
  console.log(`${target}|${summary.statements.pct}|${summary.branches.pct}|${summary.functions.pct}|${summary.lines.pct}`);
}
