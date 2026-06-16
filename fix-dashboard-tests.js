#!/usr/bin/env node
/**

* fix-dashboard-tests.js
*
* Patches dashboard-related tests so assertions can see both:
* * src/ui/provider-dashboard.html
* * src/ui/dashboard.js
*
* Handles:
*
* Pattern A:
* function read(rel) { ... }
*
* Pattern B:
* const html = readFileSync(...provider-dashboard.html...)
*
* Safe to run multiple times.
  */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const TESTS_DIR = path.join(PROJECT_ROOT, "tests");

if (!fs.existsSync(TESTS_DIR)) {
console.error(`Tests directory not found: ${TESTS_DIR}`);
process.exit(1);
}

const allTestFiles = fs
.readdirSync(TESTS_DIR)
.filter((f) => f.endsWith(".test.js") || f.endsWith(".spec.js"))
.map((f) => path.join(TESTS_DIR, f));

const impacted = allTestFiles.filter((filePath) => {
const content = fs.readFileSync(filePath, "utf8");
return content.includes("provider-dashboard.html");
});

console.log(`Found ${impacted.length} impacted test files.\n`);

let patched = 0;
let skipped = 0;
let failed = 0;

for (const filePath of impacted) {
try {
const original = fs.readFileSync(filePath, "utf8");
let updated = original;

```
const rel = path.relative(PROJECT_ROOT, filePath);

// ------------------------------------------------------------
// Skip files already patched
// ------------------------------------------------------------
if (
  updated.includes('const jsPath = join(root, "src/ui/dashboard.js")') ||
  updated.includes("const _jsPath = join(root,") ||
  updated.includes("_jsExtra")
) {
  console.log(`  SKIP  ${rel}  (already patched)`);
  skipped++;
  continue;
}

// ------------------------------------------------------------
// Pattern A
// function read(rel) { ... }
// ------------------------------------------------------------
const READ_HELPER_PATTERN =
  /function\s+read\(rel\)\s*\{[\s\S]*?\}/m;

if (
  READ_HELPER_PATTERN.test(updated) &&
  updated.includes("provider-dashboard.html")
) {
  updated = updated.replace(
    READ_HELPER_PATTERN,
```

`function read(rel) {
const base = readFileSync(join(root, rel), "utf8");
const jsPath = join(root, "src/ui/dashboard.js");
const extra = existsSync(jsPath)
? readFileSync(jsPath, "utf8")
: "";

return base + "\n" + extra;
}`
);
}

```
// ------------------------------------------------------------
// Pattern B
// Inline:
// const html = readFileSync(...provider-dashboard.html...)
// ------------------------------------------------------------
const INLINE_PATTERN =
  /const\s+(\w+)\s*=\s*readFileSync\([\s\S]*?provider-dashboard\.html[\s\S]*?\);/g;

updated = updated.replace(
  INLINE_PATTERN,
  (match, variableName) => {
    return `const ${variableName} = (() => {
```

const _html = readFileSync(
join(root, "src/ui/provider-dashboard.html"),
"utf8"
);

const _jsPath = join(root, "src/ui/dashboard.js");

const _js = existsSync(_jsPath)
? readFileSync(_jsPath, "utf8")
: "";

return _html + "\n" + _js;
})();`;
}
);

```
if (updated === original) {
  console.log(`  SKIP  ${rel}  (no matching pattern found)`);
  skipped++;
  continue;
}

fs.writeFileSync(filePath, updated, "utf8");

console.log(`  PATCH ${rel}`);
patched++;
```

} catch (err) {
console.error(`  ERROR ${filePath}`);
console.error(err.message);
failed++;
}
}

console.log("");
console.log("Done.");
console.log(`Patched: ${patched}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed : ${failed}`);

console.log("");
console.log("Next steps:");
console.log("  npx vitest run tests/sprint25-smoke.test.js");
console.log("  npx vitest run --reporter=dot");
