/**
 * src/shared/retrieval/graph-incremental.ts
 *
 * Incremental graph builder: tracks SHA256 file hashes and only re-parses
 * changed files on update. Re-links only edges touching changed files.
 *
 * Phase 3 of Sprint 110e — avoids full re-parse on every change.
 */

import * as ts from "typescript";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  GraphNode,
  GraphEdge,
  SymbolGraph,
  GraphManifest,
  GraphUpdateResult,
} from "./graph-schema.js";
import { buildGraph } from "./graph-builder.js";

// ─── SHA256 helpers ───────────────────────────────────────────────────────────

/**
 * Computes SHA256 hash of a file's contents.
 */
function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Reads file contents synchronously.
 */
function readFileSync(filePath: string): string {
  const { readFileSync: _readFileSync } = require("node:fs");
  return _readFileSync(filePath, "utf-8");
}

// ─── manifest management ──────────────────────────────────────────────────────

/**
 * Computes a fresh manifest from a list of file paths.
 */
function computeManifest(
  files: string[],
  projectRoot: string,
): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const file of files) {
    const relativePath = path
      .relative(projectRoot, file)
      .split(path.sep)
      .join("/");
    hashes.set(relativePath, hashFile(file));
  }
  return hashes;
}

/**
 * Determines which files have changed since the last manifest.
 */
function detectChanges(
  currentHashes: Map<string, string>,
  previousManifest: GraphManifest | null,
): {
  changed: string[];
  unchanged: string[];
  added: string[];
  removed: string[];
} {
  if (!previousManifest) {
    // First run — all files are "changed"
    return {
      changed: [...currentHashes.keys()],
      unchanged: [],
      added: [...currentHashes.keys()],
      removed: [],
    };
  }

  const changed: string[] = [];
  const unchanged: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Check current files against previous manifest
  for (const [file, hash] of currentHashes) {
    const prevHash = previousManifest.fileHashes.get(file);
    if (prevHash) {
      if (prevHash === hash) {
        unchanged.push(file);
      } else {
        changed.push(file);
      }
    } else {
      added.push(file);
      changed.push(file);
    }
  }

  // Check for removed files
  for (const file of previousManifest.fileHashes.keys()) {
    if (!currentHashes.has(file)) {
      removed.push(file);
    }
  }

  return { changed, unchanged, added, removed };
}

// ─── incremental graph operations ─────────────────────────────────────────────

/**
 * Extracts nodes for a single file from an existing graph.
 */
function getNodesForFile(
  graph: SymbolGraph,
  file: string,
): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (node.file === file) {
      nodes.set(node.id, node);
    }
  }
  return nodes;
}

/**
 * Extracts edges that involve a given file (either as source or target).
 */
function getEdgesForFile(graph: SymbolGraph, file: string): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.from.startsWith(file + "#") || edge.to?.startsWith(file + "#")) {
      edges.push(edge);
    }
  }
  return edges;
}

/**
 * Finds all files that import from or are imported by the given files.
 * This determines which unchanged files need edge re-linking.
 */
function findAffectedFiles(
  changedFiles: string[],
  allFiles: string[],
  projectRoot: string,
): Set<string> {
  const affected = new Set<string>(changedFiles);

  // For each changed file, check which other files have import relationships
  for (const changedFile of changedFiles) {
    const changedFilePath = path.join(projectRoot, changedFile);
    const content = readFileSync(changedFilePath);

    // Check which unchanged files import from the changed file
    for (const otherFile of allFiles) {
      if (affected.has(otherFile)) continue;

      const otherFilePath = path.join(projectRoot, otherFile);
      const otherContent = readFileSync(otherFilePath);

      // Simple heuristic: check if the other file imports from the changed file
      // by looking for import statements that reference the changed file's basename
      const changedBasename = path.basename(changedFile, ".ts");

      if (
        otherContent.includes(changedBasename) ||
        otherContent.includes(`./${changedFile}`) ||
        otherContent.includes(
          `../${path.relative(path.dirname(otherFile), changedFile)}`,
        )
      ) {
        affected.add(otherFile);
      }

      // Also check if the changed file imports from the other file
      if (content.includes(path.basename(otherFile, ".ts"))) {
        affected.add(otherFile);
      }
    }
  }

  return affected;
}

// ─── graph diff ───────────────────────────────────────────────────────────────

/**
 * Computes the diff between two graphs.
 */
function computeGraphDiff(
  oldGraph: SymbolGraph,
  newGraph: SymbolGraph,
): {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: string[];
  addedEdges: number;
  removedEdges: number;
  modifiedEdges: number;
} {
  const oldNodeIds = new Set(oldGraph.nodes.map((n) => n.id));
  const newNodeIds = new Set(newGraph.nodes.map((n) => n.id));

  const addedNodes = [...newNodeIds].filter((id) => !oldNodeIds.has(id));
  const removedNodes = [...oldNodeIds].filter((id) => !newNodeIds.has(id));
  const commonNodes = [...newNodeIds].filter((id) => oldNodeIds.has(id));

  // Check for modified nodes (same ID, different content)
  const oldNodeMap = new Map(oldGraph.nodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newGraph.nodes.map((n) => [n.id, n]));

  const modifiedNodes: string[] = [];
  for (const id of commonNodes) {
    const oldNode = oldNodeMap.get(id)!;
    const newNode = newNodeMap.get(id)!;
    if (
      oldNode.lineRange[0] !== newNode.lineRange[0] ||
      oldNode.lineRange[1] !== newNode.lineRange[1] ||
      oldNode.signature !== newNode.signature
    ) {
      modifiedNodes.push(id);
    }
  }

  // Edge diff (simplified: compare counts for now)
  const oldEdgeKey = (e: GraphEdge) => `${e.from}->${e.to}@${e.line}`;
  const oldEdgeKeys = new Set(oldGraph.edges.map(oldEdgeKey));
  const newEdgeKeys = new Set(newGraph.edges.map(oldEdgeKey));

  const addedEdges = [...newEdgeKeys].filter((k) => !oldEdgeKeys.has(k)).length;
  const removedEdges = [...oldEdgeKeys].filter(
    (k) => !newEdgeKeys.has(k),
  ).length;
  const modifiedEdges = 0; // Edge modification is tracked as remove+add

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    modifiedEdges,
  };
}

// ─── main incremental builder ─────────────────────────────────────────────────

/**
 * Incremental graph builder state.
 */
export class IncrementalGraphBuilder {
  private manifest: GraphManifest | null = null;
  private graph: SymbolGraph | null = null;
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Builds or updates the graph incrementally.
   *
   * @param rootFiles - Absolute paths to .ts/.tsx files to include.
   * @returns GraphUpdateResult with the updated graph and diff info.
   */
  update(rootFiles: string[]): GraphUpdateResult {
    // Compute current file hashes
    const currentHashes = computeManifest(rootFiles, this.projectRoot);

    // Detect changes
    const { changed, unchanged, removed } = detectChanges(
      currentHashes,
      this.manifest,
    );

    // Determine if this is a full rebuild
    const isFullRebuild =
      !this.manifest ||
      changed.length === rootFiles.length ||
      removed.length > 0;

    let resultGraph: SymbolGraph;
    let changedNodeIds: string[];
    let removedNodeIds: string[];
    let edgesRecomputed: number;

    if (isFullRebuild) {
      const rebuildResult = this.performFullRebuild(rootFiles);
      resultGraph = rebuildResult.graph;
      changedNodeIds = rebuildResult.changedNodeIds;
      removedNodeIds = rebuildResult.removedNodeIds;
      edgesRecomputed = rebuildResult.edgesRecomputed;
    } else {
      const incrementalResult = this.performIncrementalUpdate(
        changed,
        rootFiles,
      );
      resultGraph = incrementalResult.graph;
      changedNodeIds = incrementalResult.changedNodeIds;
      removedNodeIds = incrementalResult.removedNodeIds;
      edgesRecomputed = incrementalResult.edgesRecomputed;
    }

    // Update state
    this.graph = resultGraph;
    this.manifest = {
      fileHashes: currentHashes,
      nodeCount: resultGraph.nodes.length,
      edgeCount: resultGraph.edges.length,
    };

    return {
      graph: resultGraph,
      manifest: this.manifest,
      changedFiles: changed,
      skippedFiles: unchanged,
      changedNodeIds,
      removedNodeIds,
      edgesRecomputed,
      isFullRebuild,
    };
  }

  /**
   * Performs a full graph rebuild.
   */
  private performFullRebuild(rootFiles: string[]): {
    graph: SymbolGraph;
    changedNodeIds: string[];
    removedNodeIds: string[];
    edgesRecomputed: number;
  } {
    const resultGraph = buildGraph(rootFiles, this.projectRoot);

    let changedNodeIds: string[];
    let removedNodeIds: string[];

    if (this.graph) {
      const diff = computeGraphDiff(this.graph, resultGraph);
      changedNodeIds = [...diff.addedNodes, ...diff.modifiedNodes];
      removedNodeIds = diff.removedNodes;
    } else {
      changedNodeIds = resultGraph.nodes.map((n) => n.id);
      removedNodeIds = [];
    }

    return {
      graph: resultGraph,
      changedNodeIds,
      removedNodeIds,
      edgesRecomputed: resultGraph.edges.length,
    };
  }

  /**
   * Performs an incremental graph update for changed files only.
   */
  private performIncrementalUpdate(
    changed: string[],
    rootFiles: string[],
  ): {
    graph: SymbolGraph;
    changedNodeIds: string[];
    removedNodeIds: string[];
    edgesRecomputed: number;
  } {
    const changedFiles = changed.map((f) => path.join(this.projectRoot, f));

    // Find files affected by changes (import relationships)
    const affectedFiles = findAffectedFiles(
      changed,
      rootFiles.map((f) =>
        path.relative(this.projectRoot, f).split(path.sep).join("/"),
      ),
      this.projectRoot,
    );

    // Build a new graph for changed files only
    const changedGraph = buildGraph(changedFiles, this.projectRoot);

    // Merge with existing graph
    const merged = this.mergeChangedGraph(changed, changedGraph, affectedFiles);

    return {
      graph: merged.graph,
      changedNodeIds: changedGraph.nodes.map((n) => n.id),
      removedNodeIds: [],
      edgesRecomputed: changedGraph.edges.length,
    };
  }

  /**
   * Merges the changed graph into the existing graph.
   */
  private mergeChangedGraph(
    changed: string[],
    changedGraph: SymbolGraph,
    affectedFiles: Set<string>,
  ): { graph: SymbolGraph } {
    const oldNodes = new Map(this.graph!.nodes.map((n) => [n.id, n]));
    const oldEdges = new Map(
      this.graph!.edges.map((e, i) => [`${e.from}->${e.to}@${e.line}`, e]),
    );

    this.removeChangedNodes(changed, oldNodes);
    this.addNewNodes(changedGraph, oldNodes);
    this.removeChangedEdges(changed, oldEdges);
    this.addNewEdges(changedGraph, oldEdges);
    this.relinkAffectedEdges(changed, affectedFiles, oldEdges);

    return {
      graph: {
        nodes: [...oldNodes.values()],
        edges: [...oldEdges.values()],
      },
    };
  }

  private removeChangedNodes(
    changed: string[],
    oldNodes: Map<string, GraphNode>,
  ): void {
    for (const file of changed) {
      for (const nodeId of oldNodes.keys()) {
        if (nodeId.startsWith(file + "#")) {
          oldNodes.delete(nodeId);
        }
      }
    }
  }

  private addNewNodes(
    changedGraph: SymbolGraph,
    oldNodes: Map<string, GraphNode>,
  ): void {
    for (const node of changedGraph.nodes) {
      oldNodes.set(node.id, node);
    }
  }

  private removeChangedEdges(
    changed: string[],
    oldEdges: Map<string, GraphEdge>,
  ): void {
    for (const [key, edge] of oldEdges) {
      const fromChanged = changed.some((f) => edge.from.startsWith(f + "#"));
      const toFile = edge.to ?? null;
      const toChanged =
        toFile !== null && changed.some((f) => toFile.startsWith(f + "#"));
      if (fromChanged || toChanged) {
        oldEdges.delete(key);
      }
    }
  }

  private addNewEdges(
    changedGraph: SymbolGraph,
    oldEdges: Map<string, GraphEdge>,
  ): void {
    for (const edge of changedGraph.edges) {
      const key = `${edge.from}->${edge.to}@${edge.line}`;
      oldEdges.set(key, edge);
    }
  }

  private relinkAffectedEdges(
    changed: string[],
    affectedFiles: Set<string>,
    oldEdges: Map<string, GraphEdge>,
  ): void {
    if (affectedFiles.size <= changed.length) return;

    const affectedUnchanged = [...affectedFiles].filter(
      (f) => !changed.includes(f),
    );
    const affectedUnchangedPaths = affectedUnchanged.map((f) =>
      path.join(this.projectRoot, f),
    );
    const changedFiles = changed.map((f) => path.join(this.projectRoot, f));

    const allFilesForChecker = [...changedFiles, ...affectedUnchangedPaths];
    const reLinkedGraph = buildGraph(allFilesForChecker, this.projectRoot);

    for (const edge of reLinkedGraph.edges) {
      const fromAffected = affectedFiles.has(edge.from.split("#")[0]);
      const toAffected = edge.to?.split("#")[0]
        ? affectedFiles.has(edge.to.split("#")[0])
        : false;
      if (fromAffected || toAffected) {
        const key = `${edge.from}->${edge.to}@${edge.line}`;
        oldEdges.set(key, edge);
      }
    }
  }

  /**
   * Returns the current graph, or null if no update has been performed yet.
   */
  getGraph(): SymbolGraph | null {
    return this.graph;
  }

  /**
   * Returns the current manifest, or null if no update has been performed yet.
   */
  getManifest(): GraphManifest | null {
    return this.manifest;
  }

  /**
   * Resets the builder state (forces full rebuild on next update).
   */
  reset(): void {
    this.manifest = null;
    this.graph = null;
  }
}

// ─── standalone functions for testing ─────────────────────────────────────────

/**
 * Performs a one-shot incremental update (creates builder, updates, returns result).
 * Useful for testing without maintaining builder state.
 */
export function incrementalUpdate(
  rootFiles: string[],
  projectRoot: string,
  previousManifest: GraphManifest | null = null,
  previousGraph: SymbolGraph | null = null,
): GraphUpdateResult {
  const builder = new IncrementalGraphBuilder(projectRoot);

  // Restore previous state if available
  if (previousManifest && previousGraph) {
    // Use Object.assign to set private properties (only for testing)
    (builder as any).manifest = previousManifest;
    (builder as any).graph = previousGraph;
  }

  return builder.update(rootFiles);
}

/**
 * Computes SHA256 hash of a string (useful for graph checksums).
 */
export function hashString(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

/**
 * Computes a checksum of a SymbolGraph for comparison.
 */
export function graphChecksum(graph: SymbolGraph): string {
  const normalized = JSON.stringify({
    nodes: graph.nodes
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        file: n.file,
        lineRange: n.lineRange,
        signature: n.signature,
        params: n.params,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges
      .map((e) => ({
        from: e.from,
        to: e.to,
        kind: e.kind,
        line: e.line,
        resolved: e.resolved,
        unresolvedReason: e.unresolvedReason,
      }))
      .sort((a, b) => {
        if (a.from !== b.from) return a.from.localeCompare(b.from);
        if (a.line !== b.line) return (a.line || 0) - (b.line || 0);
        return (a.to || "").localeCompare(b.to || "");
      }),
  });
  return hashString(normalized);
}

export { computeManifest, detectChanges, computeGraphDiff };
