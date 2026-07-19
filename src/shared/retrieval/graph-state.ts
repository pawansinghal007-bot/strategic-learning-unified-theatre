/**
 * src/shared/retrieval/graph-state.ts
 *
 * Lazy graph cache for the structural symbol graph.
 *
 * Builds the SymbolGraph on first access and caches it for subsequent
 * lookups. This avoids re-parsing the entire codebase on every query.
 *
 * Phase 5 of Sprint 110e — integration point between graph-lookup and router.
 */

import { buildGraph } from "./graph-builder.js";
import { SymbolGraph } from "./graph-schema.js";
import { PROJECT_ROOT } from "../config/paths";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── lazy cache ───────────────────────────────────────────────────────────────

let cachedGraph: SymbolGraph | null = null;
let cachedFileHash: string | null = null;

/**
 * Computes a simple hash of all TypeScript/JavaScript files in the project.
 * Used to detect when the graph needs to be rebuilt.
 */
function computeFileHash(): string {
  const files = collectSourceFiles(PROJECT_ROOT);
  return files.sort().join("\n");
}

/**
 * Collects all .ts/.tsx/.js/.jsx files under src/ (excluding node_modules, tests, etc).
 */
function collectSourceFiles(root: string): string[] {
  const result: string[] = [];
  const srcDir = path.join(root, "src");

  if (!fs.existsSync(srcDir)) return result;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, test directories, build outputs
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "build" ||
          entry.name === ".next"
        ) {
          continue;
        }
        walk(fullPath);
      } else if (
        entry.isFile() &&
        /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)
      ) {
        const relativePath = path.relative(root, fullPath);
        result.push(relativePath);
      }
    }
  }

  walk(srcDir);
  return result;
}

/**
 * Gets the cached SymbolGraph, building it lazily on first access.
 *
 * @param forceRebuild - If true, clears the cache and rebuilds
 * @returns The SymbolGraph for the current project
 */
export function getGraph(forceRebuild?: boolean): SymbolGraph {
  if (forceRebuild) {
    cachedGraph = null;
    cachedFileHash = null;
  }

  // Return cached graph if file set hasn't changed
  if (cachedGraph !== null) {
    const currentHash = computeFileHash();
    if (currentHash === cachedFileHash) {
      return cachedGraph;
    }
    // Files changed — rebuild
  }

  // Build graph from all source files
  const rootFiles = collectSourceFiles(PROJECT_ROOT);
  cachedGraph = buildGraph(rootFiles, PROJECT_ROOT);
  cachedFileHash = computeFileHash();

  return cachedGraph;
}

/**
 * Clears the cached graph. Useful for testing or when files change externally.
 */
export function clearGraphCache(): void {
  cachedGraph = null;
  cachedFileHash = null;
}

/**
 * Checks if the graph cache is populated.
 */
export function hasGraphCache(): boolean {
  return cachedGraph !== null;
}
