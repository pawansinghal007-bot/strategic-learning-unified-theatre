/**
 * src/shared/retrieval/format.ts
 *
 * Shared formatting helpers for retrieval results.
 *
 * These formatters are used by both the harness tools and MCP handlers
 * to avoid duplication and keep output consistent.
 */

import type { VectorSearchResult } from "./vector-client.js";
import type { CodeSearchHit } from "./code-search.js";

// ─── vector results ───────────────────────────────────────────────────────────

/**
 * Formats a vector search result array as a numbered list.
 *
 * Returns an empty string for empty arrays — callers decide their own
 * empty-message text.
 */
export function formatVectorResults(results: VectorSearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  return results
    .map(
      (r, i) =>
        `${i + 1}. [score: ${r.score.toFixed(3)}] ${r.source}\n   ${r.text}`,
    )
    .join("\n\n");
}

// ─── code search results ──────────────────────────────────────────────────────

/**
 * Formats a code search hit array as file:line: text.
 *
 * Returns an empty string for empty arrays — callers decide their own
 * empty-message text.
 */
export function formatCodeHits(hits: CodeSearchHit[]): string {
  if (hits.length === 0) {
    return "";
  }

  return hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join("\n");
}
