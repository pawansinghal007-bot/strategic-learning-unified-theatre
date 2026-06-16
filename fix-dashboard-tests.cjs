#!/usr/bin/env node
/**
 * fix-dashboard-tests.js
 *
 * Patches all test files that read provider-dashboard.html alone so they
 * also include dashboard.js content. Handles two patterns:
 *
 *   Pattern A — read() helper  (sprint44–63 style)
 *   Pattern B — readFileSync inline (sprint26/27/33 style)
 *
 * Run from your project root:
 *   node fix-dashboard-tests.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROJECT_ROOT = process.cwd();
const TESTS_DIR = path.join(PROJECT_ROOT, "tests");

// ── 1. Collect impacted files ─────────────────────────────────────────────────
const allTestFiles = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".test.js") || f.endsWith(".spec.js"))
  .map((f) => path.join(TESTS_DIR, f));

const impacted = allTestFiles.filter((f) =>
  fs.readFileSync(f, "utf8").includes("provider-dashboard.html")
);

console.log(`Found ${impacted.length} impacted test files.\n`);

let patched = 0;
let skipped = 0;

for (const filePath = impacted[0]; false;); // just for structure

for (const filePath of impacted) {
  const original = fs.readFileSync(filePath, "utf8");
  let updated = original;
  const rel = path.relative(PROJECT_ROOT, filePath);

  // ── Pattern A: function read(rel) { return readFileSync(join(...), 'utf-8'); }
  // Replace the helper body so it concatenates html + js
  const READ_FN_PATTERN =
    /function read\(rel\)\s*\{[\s\S]*?return readFileSync\(join\([^)]+\),\s*['"]utf-8?['"]\);\s*\}/;

  if (READ_FN_PATTERN.test(updated)) {
    updated = updated.replace(
      READ_FN_PATTERN,
      `function read(rel) {
  const base = readFileSync(join(process.cwd(), rel), 'utf-8');
  // Also include dashboard.js so JS-only assertions still pass
  const jsPath = join(process.cwd(), 'src/ui/dashboard.js');
  const extra = fs.existsSync(jsPath) ? readFileSync(jsPath, 'utf-8') : '';
  return base + '\\n' + extra;
}`
    );

    // Make sure fs is imported (some files only import { readFileSync, join })
    if (!updated.includes("require('fs')") && !updated.includes('require("fs")')) {
      // Add fs import after the first require line
      updated = updated.replace(
        /^(const\s*\{[^}]+\}\s*=\s*require\(['"]fs['"]\);)/m,
        `const fs = require('fs');\n$1`
      );
    }
  }

  // ── Pattern B: const html = readFileSync(join(process.cwd(), 'src/ui/provider-dashboard.html'), 'utf-8');
  // Replace with a combined variable
  const READFILESYNC_INLINE =
    /const (\w+)\s*=\s*readFileSync\(\s*join\(\s*process\.cwd\(\)\s*,\s*['"]src\/ui\/provider-dashboard\.html['"]\s*\)\s*,\s*['"]utf-8?['"]\s*\);/g;

  if (READFILESYNC_INLINE.test(updated)) {
    // Reset lastIndex
    READFILESYNC_INLINE.lastIndex = 0;

    // Ensure fs is available
    const needFs =
      !updated.includes("require('fs')") && !updated.includes('require("fs")');

    updated = updated.replace(
      READFILESYNC_INLINE,
      (match, varName) =>
        `const ${varName} = (() => {
  const _html = readFileSync(join(process.cwd(), 'src/ui/provider-dashboard.html'), 'utf-8');
  const _jsPath = join(process.cwd(), 'src/ui/dashboard.js');
  const _js = (${needFs ? "require('fs')" : "fs"}).existsSync(_jsPath) ? readFileSync(_jsPath, 'utf-8') : '';
  return _html + '\\n' + _js;
})()`
    );
  }

  if (updated === original) {
    console.log(`  SKIP  ${rel}  (no matching pattern found)`);
    skipped++;
    continue;
  }

  fs.writeFileSync(filePath, updated, "utf8");
  console.log(`  PATCH ${rel}`);
  patched++;
}

console.log(`\nDone. Patched: ${patched}  Skipped: ${skipped}`);
console.log("\nNext: npx vitest run --reporter=dot");
