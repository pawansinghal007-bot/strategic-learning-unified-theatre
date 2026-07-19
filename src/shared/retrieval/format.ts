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
import type { SymbolSearchResult } from "./symbol-search.js";
import type { ConceptCard } from "./graph-schema.js";

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

// ─── symbol search results ────────────────────────────────────────────────────

/**
 * Formats symbol search results as name (kind) at file:line.
 *
 * Returns an empty string for empty arrays — callers decide their own
 * empty-message text. Matches the convention used by formatCodeHits
 * and formatVectorResults.
 */
export function formatSymbolResults(results: SymbolSearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  return results
    .map(
      (r) =>
        `${r.name} (${r.kind}) at ${r.filePath}:${r.startLine}-${r.endLine}`,
    )
    .join("\n");
}

// ─── concept card (structural graph) ─────────────────────────────────────────

/**
 * Formats a ConceptCard from the structural symbol graph as a concise
 * summary: signature, callers, and callees.
 *
 * Returns an empty string if the card is null — callers decide their own
 * empty-message text.
 */
export function formatConceptCard(card: ConceptCard | null): string {
  if (!card) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`${card.name} (${card.kind}) at ${card.file}:${card.line}`);

  if (card.signature) {
    lines.push(`  ${card.signature}`);
  }

  if (card.callers.length > 0) {
    lines.push(`  callers: ${card.callers.join(", ")}`);
  }

  if (card.callees.length > 0) {
    lines.push(`  callees: ${card.callees.join(", ")}`);
  }

  return lines.join("\n");
}
