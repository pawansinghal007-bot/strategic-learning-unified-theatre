#!/usr/bin/env node
/**
 * Tool-call measurement checkpoint.
 *
 * Reports entry counts, source breakdown, and production-only classification
 * distribution from tool-call-measurement-log.json. Does NOT draw conclusions
 * or recommend code changes — it only tells you whether you have enough
 * production volume/diversity to run the full distribution analysis.
 *
 * Usage: npx tsx scripts/measurement-checkpoint.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_PATH = process.env.UNIFIED_AI_DATA_DIR
  ? join(process.env.UNIFIED_AI_DATA_DIR, "tool-call-measurement-log.json")
  : join(homedir(), ".unified-ai-workspace", "tool-call-measurement-log.json");

type Classification =
  | "path-like"
  | "symbol-like"
  | "vector-search"
  | "semantic"
  | "synthesis";

interface Entry {
  toolName: string;
  args: Record<string, string>;
  classification: Classification;
  skippedGatewayAsk: boolean;
  source?: "production" | "dev" | "ci" | "test";
  timestamp: number;
}

// Volume/diversity gate — tune these if they feel too strict or too loose.
// This is a heuristic trigger to remind you to look, not a statistical proof
// that the data is sufficient. Treat "ready" as "worth running the real
// analysis prompt", not "definitely enough".
const MIN_PRODUCTION_ENTRIES = 200;
const MIN_SPAN_DAYS = 5;
const MIN_CLASSES_REPRESENTED = 4; // out of 5 known classes
const MIN_PER_CATEGORY = 40; // 200 / 5 = 40 average floor per category

const CATEGORIES: Classification[] = [
  "path-like",
  "symbol-like",
  "vector-search",
  "semantic",
  "synthesis",
];

function main() {
  console.log(
    `\n=== Tool-Call Measurement Checkpoint — ${new Date().toISOString()} ===`,
  );
  console.log(`Log file: ${LOG_PATH}\n`);

  if (!existsSync(LOG_PATH)) {
    console.log(
      "No log file found yet. Nothing collected — nothing to report.",
    );
    return;
  }

  const raw = JSON.parse(readFileSync(LOG_PATH, "utf-8"));
  const entries: Entry[] = raw.entries ?? [];

  console.log(`Total entries (all sources): ${entries.length}`);

  const bySource: Record<string, Entry[]> = {};
  for (const e of entries) {
    const src = e.source ?? "untagged";
    (bySource[src] ??= []).push(e);
  }

  console.log("\nBy source:");
  for (const [src, list] of Object.entries(bySource)) {
    console.log(`  ${src}: ${list.length}`);
  }

  const prod = bySource["production"] ?? [];

  if (prod.length === 0) {
    console.log("\nNo production entries yet. Keep collecting.\n");
    return;
  }

  const timestamps = prod.map((e) => e.timestamp).sort((a, b) => a - b);
  const start = new Date(timestamps[0]).toISOString();
  const end = new Date(timestamps[timestamps.length - 1]).toISOString();
  const spanDays =
    (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60 * 24);

  console.log(`\nProduction entries: ${prod.length}`);
  console.log(`Date range: ${start} -> ${end} (${spanDays.toFixed(1)} days)`);

  const byClass: Partial<Record<Classification, number>> = {};
  for (const e of prod) {
    byClass[e.classification] = (byClass[e.classification] ?? 0) + 1;
  }

  console.log("\nClassification breakdown (production only):");
  for (const [cls, count] of Object.entries(byClass)) {
    const pct = ((count! / prod.length) * 100).toFixed(1);
    console.log(`  ${cls}: ${count} (${pct}%)`);
  }

  const classesRepresented = Object.keys(byClass).length;
  const ready =
    prod.length >= MIN_PRODUCTION_ENTRIES &&
    spanDays >= MIN_SPAN_DAYS &&
    classesRepresented >= MIN_CLASSES_REPRESENTED;

  console.log(
    "\n--- Readiness gate (volume/diversity only, not a conclusion) ---",
  );
  console.log(
    `  Entries >= ${MIN_PRODUCTION_ENTRIES}: ${prod.length >= MIN_PRODUCTION_ENTRIES ? "yes" : "no"} (${prod.length})`,
  );
  console.log(
    `  Span >= ${MIN_SPAN_DAYS} days: ${spanDays >= MIN_SPAN_DAYS ? "yes" : "no"} (${spanDays.toFixed(1)})`,
  );
  console.log(
    `  Classes represented >= ${MIN_CLASSES_REPRESENTED}/5: ${classesRepresented >= MIN_CLASSES_REPRESENTED ? "yes" : "no"} (${classesRepresented})`,
  );
  console.log(
    `\n=> ${ready ? "Looks sufficient — consider running the full distribution analysis prompt." : "Keep collecting."}\n`,
  );

  // Per-category readiness gate
  const perCategoryState: Record<
    Classification,
    { count: number; state: "sufficient" | "insufficient" | "zero" }
  > = {} as Record<
    Classification,
    { count: number; state: "sufficient" | "insufficient" | "zero" }
  >;

  for (const cat of CATEGORIES) {
    const count = byClass[cat] ?? 0;
    let state: "sufficient" | "insufficient" | "zero";
    if (count >= MIN_PER_CATEGORY) {
      state = "sufficient";
    } else if (count >= 1) {
      state = "insufficient";
    } else {
      state = "zero";
    }
    perCategoryState[cat] = { count, state };
  }

  console.log("\n=== Per-category readiness ===");
  for (const cat of CATEGORIES) {
    const { count, state } = perCategoryState[cat];
    if (state === "sufficient") {
      console.log(`  ${cat.padEnd(13)}: ${state}   (count=${count})`);
    } else if (state === "zero") {
      console.log(
        `  ${cat.padEnd(13)}: ${state}         (count=${count}, need ${MIN_PER_CATEGORY})`,
      );
    } else {
      // insufficient
      const needMore = MIN_PER_CATEGORY - count;
      console.log(
        `  ${cat.padEnd(13)}: ${state} (count=${count}, need ${needMore} more)`,
      );
    }
  }

  console.log(
    `\n  Overall gate: ${ready ? "PASS" : "FAIL"} (from existing aggregate logic — do not change this)`,
  );

  const allSufficient = CATEGORIES.every(
    (cat) => perCategoryState[cat].state === "sufficient",
  );
  const blocking = CATEGORIES.filter(
    (cat) => perCategoryState[cat].state !== "sufficient",
  );
  if (allSufficient) {
    console.log("  Per-category gate: PASS");
  } else {
    console.log(`  Per-category gate: FAIL — blocking: ${blocking.join(", ")}`);
  }
  console.log();
}

main();
