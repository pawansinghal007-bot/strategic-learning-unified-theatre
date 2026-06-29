// scripts/check-accounts-guide.cjs

const fs = require("fs");
const path = require("path");

// 1. Resolve repo root (directory containing this script)
// __dirname is /home/pawan/vscodeagent/Solution/scripts
const repoRoot = path.join(__dirname, "..");

// 2. Paths in your repo (from your find output)
const guidePath = path.join(
  repoRoot,
  "scripts",
  "docs",
  "beginner-guide-accounts-switching.md",
);

const filesToScan = [
  // Renderer Accounts screen
  path.join(repoRoot, "renderer", "screens", "Accounts.jsx"),

  // IPC main handlers
  path.join(repoRoot, "electron-ui", "ipc", "handlers.cjs"),
  path.join(repoRoot, "electron-ui", "ipc", "knowledge-handlers.cjs"), // NEW

  // Backend accounts modules
  path.join(repoRoot, "src", "accounts", "store.js"),
  path.join(repoRoot, "src", "accounts", "secret-store.js"),
  path.join(repoRoot, "src", "accounts", "switcher.js"),
  path.join(repoRoot, "src", "accounts", "health.js"),

  // Backend knowledge / LLM modules (paths from project-status-dump)
  path.join(repoRoot, "src", "knowledge", "index.ts"), // srcknowledgeindex.ts
  path.join(repoRoot, "src", "knowledge", "ingest-sprint-history.ts"), // srcknowledgeingest-sprint-history.ts
  path.join(repoRoot, "src", "knowledge", "ingest-repository.js"), // srcknowledgeingest-repository.js
  path.join(repoRoot, "src", "knowledge", "milvus-client.ts"), // srcknowledgeingestmilvus-client.ts
  path.join(repoRoot, "src", "llm", "document-ingester.js"), // srcllmdocument-ingester.js
  path.join(repoRoot, "src", "llm", "embeddings.js"), // srcllmembeddings.js
  path.join(repoRoot, "src", "llm", "gateway.ts"), // srcllmgateway.ts

  // NEW: Security Overview & Secrets IPC
  path.join(repoRoot, "electron-ui", "ipc", "security-overview-handlers.cjs"),
  path.join(repoRoot, "electron-ui", "ipc", "secrets-handlers.cjs"),
];

// 3. Identifiers that should exist in guide + code
// Adjust these if actual names differ slightly (case, spelling).
const requiredStrings = [
  // Accounts IPC channel names
  "accounts:list",
  "accounts:listDetails",
  "accounts:add",
  "accounts:capture",
  "accounts:update",
  "accounts:remove",
  "accounts:info",
  "accounts:health",
  "switcher:switch",

  // Accounts backend
  "AccountStore",
  "SecretStoreClass",
  "SwitcherService",
  "probeAccount",

  // Knowledgebase IPC
  "knowledge:ingest",
  "knowledge:search",

  // Knowledgebase / LLM backend
  "ingestSprintHistory",
  "embedTextBatch",
  "getMilvusClient",
  "DocumentIngester",

  // NEW: Security Overview & Secrets IPC
  "securityOverview:autoScan",
  "secrets:scan",
];

// 4. Helpers

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    return null;
  }
}

function checkInGuide(guideText) {
  console.log(`Checking guide: ${guidePath}\n`);

  console.log("=== In Guide (beginner-guide-accounts-switching.md) ===");
  for (const s of requiredStrings) {
    const present = guideText.includes(s);
    console.log(`${present ? "[OK]" : "[MISS]"} guide mentions "${s}"`);
  }
  console.log("");
}

function checkInCode() {
  console.log("=== In Code Files ===");

  for (const s of requiredStrings) {
    const foundIn = [];

    for (const file of filesToScan) {
      const content = readFileSafe(file);
      if (!content) continue;
      if (content.includes(s)) {
        foundIn.push(path.relative(repoRoot, file));
      }
    }

    if (foundIn.length > 0) {
      console.log(`[OK] "${s}" found in: ${foundIn.join(", ")}`);
    } else {
      console.log(`[MISS] "${s}" NOT found in any scanned file`);
    }
  }
}

// 5. Main

function main() {
  const guide = readFileSafe(guidePath);
  if (!guide) {
    console.error(`Guide not found at: ${guidePath}`);
    process.exit(1);
  }

  checkInGuide(guide);
  checkInCode();
}

main();
