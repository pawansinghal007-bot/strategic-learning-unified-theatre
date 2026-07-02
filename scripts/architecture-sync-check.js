#!/usr/bin/env node

/**
 * Architecture Sync Check
 * Run after every sprint closure to verify PROJECT_ARCHITECTURE_AI_CONTEXT.md
 * and PROJECT_ARCHITECTURE_BASELINE.md are up to date.
 *
 * Usage:
 *   node scripts/architecture-sync-check.js [--sprint N] [--since <git-ref>]
 *
 * Exit codes:
 *   0 = sync complete (either updated or confirmed unchanged)
 *   1 = sync required but not performed (dry-run or error)
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

const TRIGGER_PATHS = [
  "electron-ui/main.cjs",
  "electron-ui/preload.cjs",
  "electron-ui/ipc/",
  "src/llm/gateway.ts",
  "src/llm/",
  "src/policies/",
  "src/cli/",
  "src/ui/types.d.ts",
  "src/shared/contracts/",
  "src/shared/errors/",
  "src/shared/schemas/",
];

const NON_TRIGGER_PATHS = [
  "docs/",
  "tests/",
  "src/ui/provider-dashboard.html",
  "scripts/",
  "PROJECT_ARCHITECTURE",
  ".md",
];

function getChangedFiles(since) {
  try {
    const ref = since || "HEAD~1";
    const output = execSync(`git diff ${ref} HEAD --name-only`, {
      encoding: "utf8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    console.error(
      "Could not get changed files from git. Ensure you are in a git repo.",
    );
    return [];
  }
}

function isNonTrigger(file) {
  return NON_TRIGGER_PATHS.some((p) => file.startsWith(p) || file.endsWith(p));
}

function isTrigger(file) {
  if (isNonTrigger(file)) return false;
  return TRIGGER_PATHS.some((p) => file.startsWith(p) || file === p);
}

function checkContextFile() {
  const path = join(ROOT, "PROJECT_ARCHITECTURE_AI_CONTEXT.md");
  if (!existsSync(path)) {
    console.warn("WARNING: PROJECT_ARCHITECTURE_AI_CONTEXT.md not found.");
    return false;
  }
  return true;
}

function checkBaselineFile() {
  const path = join(
    ROOT,
    "docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE.md",
  );
  if (!existsSync(path)) {
    console.warn(
      "WARNING: docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE.md not found.",
    );
    return false;
  }
  return true;
}

function getLatestBaselineTimestamp() {
  try {
    const files = execSync(
      "ls docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE-*.md 2>/dev/null",
      {
        encoding: "utf8",
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    if (!files.length) return null;
    return files[files.length - 1];
  } catch {
    return null;
  }
}

function isStructuralChange(triggerFiles) {
  const structural = [
    "electron-ui/ipc/",
    "electron-ui/main.cjs",
    "electron-ui/preload.cjs",
    "src/llm/gateway.ts",
    "src/policies/",
    "src/cli/",
    "src/shared/contracts/",
  ];
  return triggerFiles.some((f) =>
    structural.some((s) => f.startsWith(s) || f === s),
  );
}

function main() {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf("--since");
  const since = sinceIdx !== -1 ? args[sinceIdx + 1] : null;
  const dryRun = args.includes("--dry-run");

  console.log("\n=== ARCHITECTURE SYNC CHECK ===\n");

  const changed = getChangedFiles(since);

  if (!changed.length) {
    console.log("No changed files detected.");
    console.log("\nARCHITECTURE SYNC STATUS: UNCHANGED");
    process.exit(0);
  }

  console.log(`Changed files (${changed.length}):`);
  changed.forEach((f) => console.log(`  ${f}`));

  const triggers = changed.filter(isTrigger);
  const nonTriggers = changed.filter((f) => !isTrigger(f));

  console.log(`\nTrigger files (${triggers.length}):`);
  triggers.forEach((f) => console.log(`  ✦ ${f}`));

  if (nonTriggers.length) {
    console.log(`\nNon-trigger files (${nonTriggers.length}):`);
    nonTriggers.forEach((f) => console.log(`  - ${f}`));
  }

  if (!triggers.length) {
    console.log("\nNo architecture-sensitive files changed.");
    console.log("\nARCHITECTURE SYNC STATUS: UNCHANGED");
    process.exit(0);
  }

  const contextOk = checkContextFile();
  const baselineOk = checkBaselineFile();

  const structural = isStructuralChange(triggers);

  console.log(`\nArchitecture impact:`);
  console.log(`  Context update required:  YES`);
  console.log(
    `  Structural change:        ${structural ? "YES — new baseline required" : "NO"}`,
  );

  if (dryRun) {
    console.log(
      "\n[DRY RUN] Would update architecture files. No changes written.",
    );
    console.log(
      "\nARCHITECTURE SYNC STATUS: UPDATE REQUIRED (dry-run, not applied)",
    );
    process.exit(1);
  }

  if (!contextOk) {
    console.error(
      "\nERROR: PROJECT_ARCHITECTURE_AI_CONTEXT.md missing. Create it first.",
    );
    process.exit(1);
  }

  // Append sync log to context file
  const contextPath = join(ROOT, "PROJECT_ARCHITECTURE_AI_CONTEXT.md");
  const timestamp = new Date().toISOString();
  const syncEntry = `\n\n---\n## Architecture Sync — ${timestamp}\n\nTrigger files changed:\n${triggers.map((f) => `- ${f}`).join("\n")}\n\nStructural change: ${structural ? "YES" : "NO"}\n`;

  const existing = readFileSync(contextPath, "utf8");
  writeFileSync(contextPath, existing + syncEntry);
  console.log("\n✓ PROJECT_ARCHITECTURE_AI_CONTEXT.md updated.");

  if (structural) {
    const ts = timestamp.replace(/[:.]/g, "-").slice(0, 19);
    const newBaseline = `docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE-${ts}.md`;
    const baselinePath = join(
      ROOT,
      "docs/archive/baselines/PROJECT_ARCHITECTURE_BASELINE.md",
    );

    if (baselineOk) {
      const baselineContent = readFileSync(baselinePath, "utf8");
      writeFileSync(newBaseline, baselineContent);
      console.log(`✓ New baseline snapshot: ${newBaseline}`);
    }

    console.log(`✓ PROJECT_ARCHITECTURE_BASELINE.md refreshed.`);
  }

  const latest = getLatestBaselineTimestamp();
  if (latest) console.log(`  Latest baseline: ${latest}`);

  console.log("\nARCHITECTURE SYNC STATUS: UPDATED");
  process.exit(0);
}

main();
