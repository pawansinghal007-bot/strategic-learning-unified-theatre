const fs = require("fs");
const path = require("path");

const TEST_DIR = path.join(process.cwd(), "tests");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.name.endsWith(".test.js")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(TEST_DIR);

let patched = 0;
let skipped = 0;

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes("provider-dashboard.html")) {
    continue;
  }

  let changed = false;

  // add helper once
  if (
    !text.includes("function loadDashboardSurface()") &&
    text.includes("provider-dashboard.html")
  ) {
    const importMatch = text.match(
      /import\s+\{\s*existsSync\s*,\s*readFileSync\s*\}\s+from\s+["']fs["'];/,
    );

    if (!importMatch) {
      console.log(
        `SKIP ${path.relative(process.cwd(), file)} (fs import pattern unknown)`,
      );
      skipped++;
      continue;
    }

    const helper = `

function loadDashboardSurface() {
  const dashboardPath = join(
    process.cwd(),
    "src/ui/provider-dashboard.html",
  );

  const jsPath = join(
    process.cwd(),
    "src/ui/dashboard.js",
  );

  return (
    readFileSync(dashboardPath, "utf8") +
    "\\n" +
    (existsSync(jsPath)
      ? readFileSync(jsPath, "utf8")
      : "")
  );
}

`;

    text =
      text.slice(0, importMatch.index + importMatch[0].length) +
      helper +
      text.slice(importMatch.index + importMatch[0].length);

    changed = true;
  }

  // replace common patterns

  const patterns = [
    /readFileSync\(\s*dashboardPath\s*,\s*["']utf8["']\s*\)/g,

    /readFileSync\(\s*join\(\s*process\.cwd\(\)\s*,\s*["']src\/ui\/provider-dashboard\.html["']\s*\)\s*,\s*["']utf-?8["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, "loadDashboardSurface()");
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file + ".bak", fs.readFileSync(file));
    fs.writeFileSync(file, text);
    patched++;
    console.log(`PATCH ${path.relative(process.cwd(), file)}`);
  } else {
    skipped++;
    console.log(`SKIP ${path.relative(process.cwd(), file)}`);
  }
}

console.log("");
console.log(`Patched: ${patched}`);
console.log(`Skipped: ${skipped}`);
