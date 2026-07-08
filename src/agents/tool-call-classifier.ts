/**
 * src/agents/tool-call-classifier.ts
 *
 * Pure-function classifier for tool calls, used to determine whether to skip
 * the second gateway.ask() follow-up call for retrieval-first tools.
 *
 * Classification rules (deterministic, no LLM):
 * - "path-like": read-file with plain relative/absolute path (no wildcards)
 * - "symbol-like": search-code with single identifier or dotted qualified name
 * - "semantic": vector-search, or search-code with spaces/natural language
 * - "synthesis": fallback (multi-arg tools, other tools)
 */

// ─── public API ───────────────────────────────────────────────────────────────

export type ToolCallClass =
  | "path-like"
  | "symbol-like"
  | "semantic"
  | "synthesis";

export function classifyToolCall(
  toolName: string,
  args: Record<string, string> | null | undefined,
): ToolCallClass {
  // Handle null/undefined args
  if (!args || typeof args !== "object") {
    return "synthesis";
  }

  // Rule 1: path-like — read-file with plain path
  if (toolName === "read-file") {
    const pathArg = args.path ?? args.filePath ?? args.file;
    if (pathArg && isPlainPath(pathArg)) {
      return "path-like";
    }
    return "synthesis"; // read-file with no path, or non-plain path
  }

  // Rule 2: symbol-like — search-code with single identifier or dotted name
  if (toolName === "search-code") {
    const query = args.query ?? args.pattern ?? "";
    if (isSymbolLikeQuery(query)) {
      return "symbol-like";
    }
    return "semantic"; // search-code with spaces or natural language
  }

  // Rule 3: semantic — vector-search or search-code with natural language
  if (toolName === "vector-search") {
    return "semantic";
  }

  // Rule 4: synthesis — fallback for everything else
  return "synthesis";
}

// ─── private helpers ──────────────────────────────────────────────────────────

/** Is this a plain relative/absolute file path (no wildcards, no spaces)? */
function isPlainPath(value: string): boolean {
  if (!value || value.trim() === "") return false;
  if (value.includes("*") || value.includes("?")) return false;
  if (value.includes(" ")) return false;
  // Allow leading ./ or / or drive letter on Windows (C:/)
  return true;
}

/** Does this query look like a single identifier or dotted qualified name? */
function isSymbolLikeQuery(query: string): boolean {
  if (!query || query.trim() === "") return false;
  if (query.includes(" ")) return false;
  // Match: identifier, or identifier.identifier, or identifier.identifier.identifier, etc.
  // Each segment must start with letter/underscore, followed by alphanumerics/underscore
  const segment = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const parts = query.split(".");
  if (parts.length === 0) return false;
  return parts.every((p) => segment.test(p));
}
