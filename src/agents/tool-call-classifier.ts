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

  // Rule 4: retrieve — mirror the same path-like/symbol-like/semantic split
  // used above, since retrieve() internally routes to the same underlying
  // strategies (file/symbol/code/vector) and returns a deterministic result
  // string. Without this rule, every retrieve call fell through to
  // "synthesis" and always paid for a second gateway.ask(), even when the
  // resolved strategy was an exact file read or symbol lookup.
  if (toolName === "retrieve") {
    return classifyRetrieve(args);
  }

  // Rule 5: synthesis — fallback for everything else
  return "synthesis";
}

// ─── private helpers ──────────────────────────────────────────────────────────

/**
 * Classify a `retrieve` tool call by mirroring the same path-like/symbol-like/
 * semantic split used by the other rules above. Explicit mode override takes
 * precedence, mirroring router.ts's own chooseStrategy() precedence rule.
 */
function classifyRetrieve(
  args: Record<string, string>,
): ToolCallClass {
  const query = args.query ?? "";
  const mode = args.mode ?? "";

  if (mode === "file" || (mode === "" && isRetrievePathLike(query))) {
    return "path-like";
  }
  if (
    mode === "symbol" ||
    mode === "code" ||
    (mode === "" && isSymbolLikeQuery(query))
  ) {
    return "symbol-like";
  }
  return "semantic";
}

/** Is this a plain relative/absolute file path (no wildcards, no spaces)? */
function isPlainPath(value: string): boolean {
  if (!value || value.trim() === "") return false;
  if (value.includes("*") || value.includes("?")) return false;
  if (value.includes(" ")) return false;
  // Allow leading ./ or / or drive letter on Windows (C:/)
  return true;
}

/**
 * Is this query path-like specifically for retrieve()'s auto-detection?
 * Stricter than isPlainPath: requires an actual path separator, OR a
 * recognized common file extension from a closed list. An open-ended
 * "any short suffix" regex was rejected because dotted identifiers like
 * "gateway.ask" or "namespace.ClassName" structurally match the same
 * shape as a file extension and would be misclassified as path-like.
 */
function isRetrievePathLike(value: string): boolean {
  if (!isPlainPath(value)) return false;
  if (value.includes("/") || value.includes("\\")) return true;
  // Set-based extension lookup replaces 29-branch regex (S5843)
  const KNOWN_EXTENSIONS = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md",
    "yml", "yaml", "py", "go", "rs", "java", "c", "cpp",
    "h", "hpp", "css", "scss", "html", "sql", "sh", "txt",
    "toml", "xml", "env",
  ]);
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const ext = value.slice(dotIdx + 1).toLowerCase();
  return KNOWN_EXTENSIONS.has(ext);
}

/** Does this query look like a single identifier or dotted qualified name? */
function isSymbolLikeQuery(query: string): boolean {
  if (!query || query.trim() === "") return false;
  if (query.includes(" ")) return false;
  // Match: identifier, or identifier.identifier, or identifier.identifier.identifier, etc.
  // Each segment must start with letter/underscore, followed by alphanumerics/underscore
  const segment = /^[A-Za-z_]\w*$/;
  const parts = query.split(".");
  if (parts.length === 0) return false;
  return parts.every((p) => segment.test(p));
}
