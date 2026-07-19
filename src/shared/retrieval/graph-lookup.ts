/**
 * src/shared/retrieval/graph-lookup.ts
 *
 * Exact-symbol lookup API: given a symbol name, returns a ConceptCard with
 * signature, params, callers, callees, and file/line location.
 *
 * Phase 4 of Sprint 110e — in-process query function, no subprocess, no MCP.
 */

import {
  SymbolGraph,
  ConceptCard,
  CONCEPT_CARD_MAX_CHARS,
} from "./graph-schema.js";

// ─── name matching helpers ────────────────────────────────────────────────────

/**
 * Normalizes a symbol name for matching:
 * - "UserService.findUser" → matches method nodes
 * - "formatName" → matches function/variable nodes
 * - "src/foo.ts#formatName" → exact node ID match
 */
function parseSymbolQuery(name: string): {
  fileId?: string;
  symbolName: string;
} {
  // Check if the query is a full node ID (file#symbol)
  const hashIndex = name.indexOf("#");
  if (hashIndex > 0) {
    const fileId = name.slice(0, hashIndex);
    const symbolName = name.slice(hashIndex + 1);
    return { fileId, symbolName };
  }

  // Check if the query is a qualified name (Class.method)
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    return { symbolName: name };
  }

  // Plain symbol name
  return { symbolName: name };
}

/**
 * Checks if a node matches the given query.
 */
function nodeMatches(
  node: any,
  query: { fileId?: string; symbolName: string },
): boolean {
  // If fileId is specified, match exact node ID
  if (query.fileId) {
    return node.id === `${query.fileId}#${query.symbolName}`;
  }

  // For qualified names (Class.method), match the full symbol name in the node ID
  if (query.symbolName.includes(".")) {
    return node.id.endsWith(`#${query.symbolName}`);
  }

  // Plain name: match any node whose symbol name part matches
  const nodeSymbolName = node.id.split("#").pop() || "";
  return nodeSymbolName === query.symbolName;
}

// ─── card construction ────────────────────────────────────────────────────────

/**
 * Constructs a ConceptCard from a GraphNode and the full graph.
 * Returns null if the card would exceed the character budget.
 */
function buildCard(node: any, graph: SymbolGraph): ConceptCard | null {
  // Extract callers (edges where this node is the target)
  const callers: string[] = [];
  for (const edge of graph.edges) {
    if (edge.to === node.id && edge.kind === "calls") {
      callers.push(edge.from);
    }
  }

  // Extract callees (edges where this node is the source)
  const callees: string[] = [];
  for (const edge of graph.edges) {
    if (edge.from === node.id && edge.kind === "calls" && edge.to) {
      callees.push(edge.to);
    }
  }

  // Deduplicate
  const uniqueCallers = [...new Set(callers)];
  const uniqueCallees = [...new Set(callees)];

  // Extract symbol name from node ID
  const symbolName = node.id.split("#").pop() || node.id;

  // Build the card without charCount first, then measure
  const cardWithoutCount: Omit<ConceptCard, "charCount"> = {
    name: symbolName,
    kind: node.kind,
    file: node.file,
    line: node.lineRange[0],
    signature: node.signature,
    params: node.params,
    callers: uniqueCallers,
    callees: uniqueCallees,
  };

  // Compute character count of the serialized card content (excluding charCount field)
  const serialized = JSON.stringify(cardWithoutCount, null, 2);
  const charCount = serialized.length;

  const card: ConceptCard = {
    ...cardWithoutCount,
    charCount,
  };

  // Enforce budget: if the card exceeds the max, truncate callers/callees
  if (card.charCount > CONCEPT_CARD_MAX_CHARS) {
    // Aggressively truncate: remove callers/callees first, then signature
    const truncated: Omit<ConceptCard, "charCount"> = {
      name: card.name,
      kind: card.kind,
      file: card.file,
      line: card.line,
      signature: undefined,
      params: card.params,
      callers: [],
      callees: [],
    };
    const truncatedSerialized = JSON.stringify(truncated, null, 2);

    // Final safety check: if still over budget, return null
    if (truncatedSerialized.length > CONCEPT_CARD_MAX_CHARS) {
      return null;
    }

    return { ...truncated, charCount: truncatedSerialized.length };
  }

  return card;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Looks up a symbol by name in the graph and returns a ConceptCard.
 *
 * @param name - Symbol name to look up (e.g. "formatName", "UserService.findUser", "src/foo.ts#formatName")
 * @param graph - The SymbolGraph to search
 * @returns ConceptCard if found, null if not found or if the card exceeds the budget
 *
 * Note: Returns null cleanly for unresolved symbols — never throws.
 */
export function lookupSymbol(
  name: string,
  graph: SymbolGraph,
): ConceptCard | null {
  // Type guard: return null for non-string inputs
  if (typeof name !== "string" || !name.trim()) {
    return null;
  }

  const query = parseSymbolQuery(name.trim());

  // Search for matching nodes
  const matchingNodes: any[] = [];
  for (const node of graph.nodes) {
    if (nodeMatches(node, query)) {
      matchingNodes.push(node);
    }
  }

  // If no matches, return null (clean fallback for classifier)
  if (matchingNodes.length === 0) {
    return null;
  }

  // If multiple matches (e.g. same function name in different files),
  // prefer the first match (or could return an array in a future version)
  // For now, return the first match's card
  const card = buildCard(matchingNodes[0], graph);
  return card;
}

/**
 * Looks up all symbols matching a name (for symbols defined in multiple files).
 *
 * @param name - Symbol name to look up
 * @param graph - The SymbolGraph to search
 * @returns Array of ConceptCards (may be empty, never throws)
 */
export function lookupAllSymbols(
  name: string,
  graph: SymbolGraph,
): ConceptCard[] {
  if (!name || !name.trim()) {
    return [];
  }

  const query = parseSymbolQuery(name.trim());
  const matchingNodes: any[] = [];

  for (const node of graph.nodes) {
    if (nodeMatches(node, query)) {
      matchingNodes.push(node);
    }
  }

  const cards: ConceptCard[] = [];
  for (const node of matchingNodes) {
    const card = buildCard(node, graph);
    if (card) {
      cards.push(card);
    }
  }

  return cards;
}

/**
 * Measures the character count of a ConceptCard without modifying it.
 * Returns the charCount field value (card content size, excluding charCount field).
 * Useful for budget enforcement before sending to the LLM.
 */
export function measureCardSize(card: ConceptCard): number {
  return card.charCount;
}

/**
 * Checks if a ConceptCard fits within the budget.
 */
export function fitsInBudget(card: ConceptCard, maxChars?: number): boolean {
  const budget = maxChars ?? CONCEPT_CARD_MAX_CHARS;
  return card.charCount <= budget;
}

/**
 * Truncates a ConceptCard to fit within the budget.
 * Returns a new card (does not modify the original).
 */
export function truncateCard(
  card: ConceptCard,
  maxChars?: number,
): ConceptCard {
  const budget = maxChars ?? CONCEPT_CARD_MAX_CHARS;
  if (card.charCount <= budget) {
    return { ...card };
  }

  // Aggressively truncate: remove callers/callees and signature
  const truncatedWithoutCount: Omit<ConceptCard, "charCount"> = {
    name: card.name,
    kind: card.kind,
    file: card.file,
    line: card.line,
    signature: undefined,
    params: card.params,
    callers: [],
    callees: [],
  };

  const truncatedSerialized = JSON.stringify(truncatedWithoutCount, null, 2);
  const truncated: ConceptCard = {
    ...truncatedWithoutCount,
    charCount: truncatedSerialized.length,
  };

  return truncated;
}
