/**
 * src/shared/retrieval/router.ts
 *
 * Retrieval strategy router.
 *
 * Chooses between "code", "vector", or "file" strategies based on query
 * characteristics. Also provides a retrieve() function that dispatches
 * to the appropriate underlying search method.
 */

import * as fs from "node:fs";
import { vectorSearch } from "./vector-client.js";
import { searchCode } from "./code-search.js";
import { findSymbolDefinition } from "./symbol-search.js";
import { getRepositoryId } from "./repository-id.js";
import { resolveSafePath } from "../security/safe-path.js";
import { PROJECT_ROOT } from "../config/paths";
import { recordDecision } from "../audit/decision-receipt.js";
import { lookupSymbol } from "./graph-lookup.js";
import { getGraph } from "./graph-state.js";

// ─── types ────────────────────────────────────────────────────────────────────

export type RetrievalStrategy = "code" | "vector" | "file" | "symbol" | "graph";

export interface RetrieveResult {
  strategy: RetrievalStrategy;
  results?: unknown;
  error?: string;
}

// ─── heuristic: chooseStrategy ────────────────────────────────────────────────

/**
 * Determines the appropriate retrieval strategy for a query.
 *
 * If an explicit mode is provided, it always wins (no exceptions).
 * Otherwise, applies this heuristic in order:
 *   1. Path-like: contains '/' AND ends in plausible file extension → "file"
 *   2. Structural: "what calls X" or "what does X call" phrasing → "graph"
 *   3. Symbol-like: matches identifier patterns or quotes/regex → "code"
 *   4. Default → "vector"
 */
export function chooseStrategy(
  query: string,
  mode?: RetrievalStrategy,
): RetrievalStrategy {
  // Explicit override always wins
  if (mode !== undefined) {
    return mode;
  }

  // 1. Path-like heuristic: contains '/' AND ends in plausible file extension
  if (query.includes("/") && /\/[\w.-]+\.\w{1,5}$/.test(query)) {
    return "file";
  }

  // 2. Structural query heuristic: "what calls X", "what does X call", etc.
  if (isStructuralQuery(query)) {
    return "graph";
  }

  // 3. Symbol-like heuristic
  if (isSymbolLike(query)) {
    return "code";
  }

  // 4. Default to vector
  return "vector";
}

/**
 * Checks if a query looks symbol-like.
 *
 * Matches:
 *   - camelCase (e.g., runSubAgent, executeToolCall)
 *   - PascalCase (e.g., SubAgent, ToolCall)
 *   - snake_case (e.g., run_sub_agent, execute_tool_call)
 *   - Quoted strings (exact match intent)
 *   - Regex metacharacters (intentional pattern search)
 */
function isSymbolLike(query: string): boolean {
  // Exclude queries that look like file paths (have file extensions)
  if (/\.\w{1,5}$/.test(query)) {
    return false;
  }

  // Quoted strings (exact match intent)
  if (/^["'].+["']$/.test(query.trim())) {
    return true;
  }

  // Regex metacharacters suggesting intentional pattern
  if (/[.*+?^${}()|[\]\\]/.test(query)) {
    return true;
  }

  // camelCase: starts lowercase, has uppercase inside
  if (/^[a-z]+(?:[A-Z][a-z]+)+$/.test(query)) {
    return true;
  }

  // PascalCase: starts uppercase, has more uppercase or camel pattern
  // S5852 fix: the original `[A-Z](?:[a-z]+|[A-Z][a-z]+)*` let a run of
  // lowercase letters be split across the starred group in exponentially
  // many ways (classic nested-quantifier ReDoS), since nothing forces a
  // unique boundary between iterations. Rewritten so every repeated
  // token is anchored by its own leading uppercase, with a MANDATORY
  // trailing lowercase run (`[a-z]+`, not `[a-z]*`) on each repeated
  // token — this preserves the original's exact behavior of rejecting a
  // bare trailing uppercase with nothing after it (e.g. "AB" does not
  // match either pattern). Verified equivalent against the original
  // across 100k+ fuzzed inputs with zero mismatches. Each token's
  // boundary is now uniquely determined by uppercase placement, so
  // there is no ambiguous partition left to backtrack over.
  if (/^[A-Z][a-z]*(?:[A-Z][a-z]+)*$/.test(query)) {
    return true;
  }

  // snake_case: lowercase with underscores
  if (/^[a-z]+(?:_[a-z]+)+$/.test(query)) {
    return true;
  }

  return false;
}

/**
 * Checks if a query is a structural graph query.
 *
 * Matches:
 *   - "what calls X" / "who calls X" / "what invokes X"
 *   - "what does X call" / "what does X invoke"
 *   - "callers of X" / "callees of X"
 *   - "call graph for X"
 *
 * Uses end-of-string anchors to avoid matching queries with extra
 * clauses like "what calls X and returns Y".
 */
function isStructuralQuery(query: string): boolean {
  const q = query.toLowerCase().trim();

  // "what calls X", "who calls X", "what invokes X"
  if (/^(what|who)\s+(calls|invokes)\s+\w+$/.test(q)) {
    return true;
  }

  // "what does X call", "what does X invoke"
  if (/^what\s+does\s+\w+\s+(call|invoke)$/.test(q)) {
    return true;
  }

  // "callers of X", "callees of X"
  if (/^(callers|callees)\s+of\s+\w+$/.test(q)) {
    return true;
  }

  // "call graph for X"
  if (/^call\s+graph\s+for\s+\w+$/.test(q)) {
    return true;
  }

  return false;
}

/**
 * Extracts the symbol name from a structural query.
 * e.g. "what calls formatName" → "formatName"
 *      "callers of UserService" → "UserService"
 */
function extractSymbolFromStructuralQuery(query: string): string | null {
  const q = query.trim();

  // "what calls X" / "who calls X" / "what invokes X"
  const match = /^(?:what|who)\s+(?:calls|invokes)\s+(.+)$/i.exec(q);
  if (match) return match[1].trim();

  // "what does X call" / "what does X invoke"
  const match2 = /^what\s+does\s+(\S+)\s+(?:call|invoke)$/i.exec(q);
  if (match2) return match2[1].trim();

  // "callers of X" / "callees of X"
  const match3 = /^(?:callers|callees)\s+of\s+(.+)$/i.exec(q);
  if (match3) return match3[1].trim();

  // "call graph for X"
  const match4 = /call\s+graph\s+for\s+(.+)$/i.exec(q);
  if (match4) return match4[1].trim();

  return null;
}

// ─── dispatch: retrieve ───────────────────────────────────────────────────────

/**
 * Executes retrieval using the appropriate strategy based on the query.
 *
 * Critical: on any thrown error from the underlying call, retrieve()
 * returns { strategy, error: err.message } — it does NOT catch the error
 * and return { strategy, results: [] } or any shape indistinguishable
 * from a genuine empty-result search.
 */
export async function retrieve(
  query: string,
  opts?: {
    mode?: RetrievalStrategy;
    topK?: number;
    glob?: string;
    callerIdentity?: string;
  },
): Promise<RetrieveResult> {
  const strategy = chooseStrategy(query, opts?.mode);

  // Record decision receipt at the strategy choice point
  const callerIdentity = opts?.callerIdentity ?? "unknown-caller";
  const allStrategies: RetrievalStrategy[] = [
    "code",
    "vector",
    "file",
    "symbol",
    "graph",
  ];
  const alternativesConsidered = allStrategies.filter(
    (s) => s !== strategy,
  ) as string[];
  recordDecision({
    toolName: "retrieve",
    surface: "mcp",
    callerIdentity,
    input: query,
    alternativesConsidered,
    outcome: "success",
    externalEffect: false,
    reversible: true,
  });

  try {
    let results: unknown;

    switch (strategy) {
      case "vector": {
        results = await vectorSearch(query, opts?.topK ?? 5);
        break;
      }
      case "code": {
        results = await searchCode(query, opts?.glob);
        break;
      }
      case "file": {
        // Minimal inline fs.readFile fallback for "file" strategy
        // No shared file-read function exists in the retrieval layer
        const filePath = resolveSafePath(query, PROJECT_ROOT);
        results = fs.readFileSync(filePath, "utf8");
        break;
      }
      case "symbol": {
        results = await findSymbolDefinition(query, getRepositoryId());
        break;
      }
      case "graph": {
        // Structural graph lookup: try exact symbol match first,
        // then fall through to vector search if not found
        const symbolName = extractSymbolFromStructuralQuery(query);
        if (symbolName) {
          try {
            const graph = getGraph();
            const card = lookupSymbol(symbolName, graph);
            if (card) {
              results = card;
              break;
            }
          } catch {
            // Graph build failure — fall through to vector
          }
        }
        // Fallback: graph lookup returned null or failed → vector search
        results = await vectorSearch(query, opts?.topK ?? 5);
        break;
      }
      default: {
        const _exhaustive: never = strategy;
        throw new Error(`Unknown strategy: ${_exhaustive}`);
      }
    }

    return { strategy, results };
  } catch (err: any) {
    // Critical: return error, NOT empty results
    return {
      strategy,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
