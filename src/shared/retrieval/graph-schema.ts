/**
 * src/shared/retrieval/graph-schema.ts
 *
 * Node and edge types for the structural symbol graph.
 *
 * This module defines the in-memory graph shape produced by the graph
 * builder (Phase 1). No persistence, no DB, no wiring into retrieve —
 * pure TypeScript interfaces.
 */

// ─── node kinds ───────────────────────────────────────────────────────────────

export type NodeKind =
  | "class"
  | "function"
  | "method"
  | "interface"
  | "type"
  | "enum"
  | "variable";

// ─── edge kinds ───────────────────────────────────────────────────────────────

export type EdgeKind = "calls" | "calledBy" | "imports";

// ─── graph node ───────────────────────────────────────────────────────────────

export interface GraphNode {
  /** Stable identifier: `file#symbolName` (e.g. `src/foo.ts#runSubAgent`) */
  id: string;
  /** What kind of declaration this is */
  kind: NodeKind;
  /** Relative file path (forward slashes) */
  file: string;
  /** 1-indexed inclusive line range */
  lineRange: [number, number];
  /** First line of the declaration text, truncated to 200 chars */
  signature?: string;
  /** Parameter names for functions/methods, e.g. `["opts", "callback"]` */
  params?: string[];
}

// ─── graph edge ───────────────────────────────────────────────────────────────

export interface GraphEdge {
  /** Node ID of the caller (source of the edge) */
  from: string;
  /** Node ID of the callee (target of the edge), or null if unresolved */
  to: string | null;
  /** Relationship type */
  kind: EdgeKind;
  /** 1-indexed line where the call/reference occurs (in the `from` file) */
  line?: number;
  /** Whether this edge was resolved deterministically via the type checker */
  resolved: boolean;
  /** If resolved is false, explains why the linker couldn't resolve this call */
  unresolvedReason?: string;
}

// ─── complete graph ───────────────────────────────────────────────────────────

export interface SymbolGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── incremental update types ─────────────────────────────────────────────────

/**
 * SHA256 manifest for a set of source files.
 * Used to detect which files have changed since the last graph build.
 */
export interface GraphManifest {
  /** Map of relative file path -> SHA256 hex digest */
  fileHashes: Map<string, string>;
  /** Number of nodes in the graph when this manifest was created */
  nodeCount: number;
  /** Number of edges in the graph when this manifest was created */
  edgeCount: number;
}

/**
 * Result of an incremental graph update.
 * Contains the updated graph, a diff of what changed, and timing info.
 */
export interface GraphUpdateResult {
  /** The updated SymbolGraph */
  graph: SymbolGraph;
  /** Updated manifest reflecting current file state */
  manifest: GraphManifest;
  /** Files that were re-parsed (changed since last update) */
  changedFiles: string[];
  /** Files that were skipped (unchanged) */
  skippedFiles: string[];
  /** Node IDs that were added or modified */
  changedNodeIds: string[];
  /** Node IDs that were removed */
  removedNodeIds: string[];
  /** Number of edges that were re-computed */
  edgesRecomputed: number;
  /** Whether this was a full rebuild (first run or forced) vs incremental */
  isFullRebuild: boolean;
}

// ─── concept card (Phase 4 — lookup API) ─────────────────────────────────────

/**
 * A "concept card" for a single symbol: signature, params, callers, callees,
 * and file/line location. Used by the lookup API to return a concise,
 * token-budgeted summary of a symbol's role in the codebase.
 */
export interface ConceptCard {
  /** Symbol name (e.g. "formatName", "UserService.findUser") */
  name: string;
  /** Node kind (function, class, method, etc.) */
  kind: NodeKind;
  /** Relative file path */
  file: string;
  /** 1-indexed line of the declaration */
  line: number;
  /** First line of the declaration text, truncated to 200 chars */
  signature?: string;
  /** Parameter names for functions/methods */
  params?: string[];
  /** Node IDs of symbols that call this symbol (callers) */
  callers: string[];
  /** Node IDs of symbols this symbol calls (callees) */
  callees: string[];
  /** Character count of the serialized card (for budget enforcement) */
  charCount: number;
}

/**
 * Maximum character budget for a single ConceptCard.
 * Derived from the enforcePromptBudget DEFAULT_BUDGET_CHARS (6000) in
 * src/llm/gateway.ts — a card must fit within ~25% of the total budget
 * so that system prompt + workspace context + user request still fit.
 */
export const CONCEPT_CARD_MAX_CHARS = 1500;
