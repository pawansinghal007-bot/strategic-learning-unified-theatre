/**
 * tests/shared/retrieval/graph-incremental.test.ts
 *
 * Unit tests for the incremental graph builder (Phase 3).
 *
 * Phase 3 acceptance criteria:
 * - SHA256 per-file manifest; on update, only re-parse changed files and
 *   re-link only the edges touching them.
 * - Changing one file and re-running update touches only that file's
 *   nodes/edges in the diff — verified by inspecting the graph diff output.
 * - Full rebuild and incremental rebuild produce an identical graph
 *   (checksum or deep-equal comparison) — incremental must never drift.
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
  IncrementalGraphBuilder,
  incrementalUpdate,
  graphChecksum,
  hashString,
  computeManifest,
  detectChanges,
  computeGraphDiff,
} from "../../../src/shared/retrieval/graph-incremental.js";
import { buildGraph } from "../../../src/shared/retrieval/graph-builder.js";
import type {
  SymbolGraph,
  GraphManifest,
  GraphUpdateResult,
} from "../../../src/shared/retrieval/graph-schema.js";

// ─── fixture paths ────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, "fixtures/graph-builder");
const FIXTURE_FILES = [
  path.join(FIXTURES_DIR, "utils.ts"),
  path.join(FIXTURES_DIR, "service.ts"),
  path.join(FIXTURES_DIR, "processor.ts"),
  path.join(FIXTURES_DIR, "types.ts"),
  path.join(FIXTURES_DIR, "overloads.ts"),
  path.join(FIXTURES_DIR, "aliased.ts"),
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function writeFixtureFile(relativePath: string, content: string): string {
  const fullPath = path.join(FIXTURES_DIR, relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

function readFixtureFile(relativePath: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, relativePath), "utf-8");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("graph-incremental", () => {
  // ─── SHA256 helpers ─────────────────────────────────────────────────────

  describe("hashString", () => {
    it("produces deterministic SHA256 hash", () => {
      const hash1 = hashString("hello world");
      const hash2 = hashString("hello world");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex digest is 64 chars
    });

    it("produces different hashes for different strings", () => {
      const hash1 = hashString("hello");
      const hash2 = hashString("world");
      expect(hash1).not.toBe(hash2);
    });
  });

  // ─── computeManifest ────────────────────────────────────────────────────

  describe("computeManifest", () => {
    it("computes SHA256 hashes for all files", () => {
      const manifest = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      expect(manifest.size).toBe(FIXTURE_FILES.length);
    });

    it("uses relative paths as keys", () => {
      const manifest = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      for (const key of manifest.keys()) {
        expect(key).not.toContain(FIXTURES_DIR);
        expect(key).toMatch(/\.ts$/);
      }
    });

    it("produces consistent hashes for unchanged files", () => {
      const manifest1 = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      const manifest2 = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      for (const [key, hash] of manifest1) {
        expect(manifest2.get(key)).toBe(hash);
      }
    });
  });

  // ─── detectChanges ──────────────────────────────────────────────────────

  describe("detectChanges", () => {
    let manifest: GraphManifest;

    beforeEach(() => {
      const hashes = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      const graph = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      manifest = {
        fileHashes: hashes,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    });

    it("detects no changes when files are unchanged", () => {
      const currentHashes = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      const result = detectChanges(currentHashes, manifest);
      expect(result.changed).toHaveLength(0);
      expect(result.unchanged).toHaveLength(FIXTURE_FILES.length);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it("detects a changed file after modification", () => {
      const original = readFixtureFile("utils.ts");
      try {
        writeFixtureFile("utils.ts", original + "\n// modified\n");
        const currentHashes = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
        const result = detectChanges(currentHashes, manifest);
        expect(result.changed).toContain("utils.ts");
        expect(result.changed.length).toBe(1);
      } finally {
        writeFixtureFile("utils.ts", original);
      }
    });

    it("detects an added file", () => {
      const newFile = writeFixtureFile("new-file.ts", "export const x = 1;\n");
      try {
        const files = [...FIXTURE_FILES, newFile];
        const currentHashes = computeManifest(files, FIXTURES_DIR);
        const result = detectChanges(currentHashes, manifest);
        expect(result.added).toContain("new-file.ts");
        expect(result.changed).toContain("new-file.ts");
      } finally {
        fs.unlinkSync(newFile);
      }
    });

    it("detects a removed file", () => {
      const files = FIXTURE_FILES.filter((f) => !f.endsWith("aliased.ts"));
      const currentHashes = computeManifest(files, FIXTURES_DIR);
      const result = detectChanges(currentHashes, manifest);
      expect(result.removed).toContain("aliased.ts");
    });

    it("returns all files as changed/added on first run (null manifest)", () => {
      const currentHashes = computeManifest(FIXTURE_FILES, FIXTURES_DIR);
      const result = detectChanges(currentHashes, null);
      expect(result.changed.length).toBe(FIXTURE_FILES.length);
      expect(result.added.length).toBe(FIXTURE_FILES.length);
      expect(result.unchanged).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });
  });

  // ─── computeGraphDiff ───────────────────────────────────────────────────

  describe("computeGraphDiff", () => {
    it("reports no diff for identical graphs", () => {
      const graph = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      const diff = computeGraphDiff(graph, graph);
      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.addedEdges).toBe(0);
      expect(diff.removedEdges).toBe(0);
    });

    it("detects added nodes", () => {
      const graph1 = buildGraph(
        FIXTURE_FILES.filter((f) => !f.endsWith("aliased.ts")),
        FIXTURES_DIR,
      );
      const graph2 = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      const diff = computeGraphDiff(graph1, graph2);
      expect(diff.addedNodes.length).toBeGreaterThan(0);
      expect(diff.addedNodes.some((id) => id.includes("aliased"))).toBe(true);
    });

    it("detects removed nodes", () => {
      const graph1 = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      const graph2 = buildGraph(
        FIXTURE_FILES.filter((f) => !f.endsWith("aliased.ts")),
        FIXTURES_DIR,
      );
      const diff = computeGraphDiff(graph1, graph2);
      expect(diff.removedNodes.length).toBeGreaterThan(0);
      expect(diff.removedNodes.some((id) => id.includes("aliased"))).toBe(true);
    });
  });

  // ─── graphChecksum ──────────────────────────────────────────────────────

  describe("graphChecksum", () => {
    it("produces deterministic checksum for same graph", () => {
      const graph = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      const checksum1 = graphChecksum(graph);
      const checksum2 = graphChecksum(graph);
      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64);
    });

    it("produces different checksums for different graphs", () => {
      const graph1 = buildGraph(
        FIXTURE_FILES.filter((f) => !f.endsWith("aliased.ts")),
        FIXTURES_DIR,
      );
      const graph2 = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      const checksum1 = graphChecksum(graph1);
      const checksum2 = graphChecksum(graph2);
      expect(checksum1).not.toBe(checksum2);
    });

    it("is invariant to node/edge ordering", () => {
      const graph = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
      const shuffled = {
        nodes: [...graph.nodes].sort(() => Math.random() - 0.5),
        edges: [...graph.edges].sort(() => Math.random() - 0.5),
      };
      expect(graphChecksum(graph)).toBe(graphChecksum(shuffled));
    });
  });

  // ─── IncrementalGraphBuilder ────────────────────────────────────────────

  describe("IncrementalGraphBuilder", () => {
    let builder: IncrementalGraphBuilder;

    beforeEach(() => {
      builder = new IncrementalGraphBuilder(FIXTURES_DIR);
    });

    it("first update is a full rebuild", () => {
      const result = builder.update(FIXTURE_FILES);
      expect(result.isFullRebuild).toBe(true);
      expect(result.graph.nodes.length).toBeGreaterThan(0);
      expect(result.graph.edges.length).toBeGreaterThan(0);
    });

    it("second update with no changes is incremental", () => {
      builder.update(FIXTURE_FILES);
      const result = builder.update(FIXTURE_FILES);
      expect(result.isFullRebuild).toBe(false);
      expect(result.changedFiles).toHaveLength(0);
      expect(result.skippedFiles.length).toBe(FIXTURE_FILES.length);
    });

    it("update after file change is incremental", () => {
      const original = readFixtureFile("utils.ts");
      try {
        builder.update(FIXTURE_FILES);
        writeFixtureFile("utils.ts", original + "\n// modified\n");
        const result = builder.update(FIXTURE_FILES);
        expect(result.isFullRebuild).toBe(false);
        expect(result.changedFiles).toContain("utils.ts");
        expect(result.changedFiles.length).toBe(1);
      } finally {
        writeFixtureFile("utils.ts", original);
      }
    });

    it("changed nodes are scoped to the changed file", () => {
      const original = readFixtureFile("utils.ts");
      try {
        builder.update(FIXTURE_FILES);
        writeFixtureFile("utils.ts", original + "\n// modified\n");
        const result = builder.update(FIXTURE_FILES);
        // Changed nodes should only be from utils.ts
        for (const nodeId of result.changedNodeIds) {
          expect(nodeId.startsWith("utils.ts#")).toBe(true);
        }
      } finally {
        writeFixtureFile("utils.ts", original);
      }
    });

    it("edges recomputed only for changed file and affected files", () => {
      const original = readFixtureFile("utils.ts");
      try {
        builder.update(FIXTURE_FILES);
        writeFixtureFile("utils.ts", original + "\n// modified\n");
        const result = builder.update(FIXTURE_FILES);
        // edgesRecomputed should be less than total edges
        expect(result.edgesRecomputed).toBeLessThan(result.graph.edges.length);
      } finally {
        writeFixtureFile("utils.ts", original);
      }
    });

    it("full rebuild and incremental rebuild produce identical graph", () => {
      const original = readFixtureFile("utils.ts");
      try {
        // First update (full rebuild)
        builder.update(FIXTURE_FILES);

        // Modify a file
        writeFixtureFile("utils.ts", original + "\n// modified\n");

        // Incremental update
        const incrementalResult = builder.update(FIXTURE_FILES);
        const incrementalChecksum = graphChecksum(incrementalResult.graph);

        // Full rebuild from scratch
        const freshBuilder = new IncrementalGraphBuilder(FIXTURES_DIR);
        const fullResult = freshBuilder.update(FIXTURE_FILES);
        const fullChecksum = graphChecksum(fullResult.graph);

        // Checksums must match
        expect(incrementalChecksum).toBe(fullChecksum);
      } finally {
        writeFixtureFile("utils.ts", original);
      }
    });

    it("handles added files correctly", () => {
      const newFile = writeFixtureFile("new-file.ts", "export const x = 1;\n");
      try {
        builder.update(FIXTURE_FILES);
        const files = [...FIXTURE_FILES, newFile];
        const result = builder.update(files);
        expect(result.changedFiles).toContain("new-file.ts");
        expect(
          result.graph.nodes.some((n) => n.file.includes("new-file")),
        ).toBe(true);
      } finally {
        fs.unlinkSync(newFile);
      }
    });

    it("reset forces full rebuild on next update", () => {
      builder.update(FIXTURE_FILES);
      builder.reset();
      const result = builder.update(FIXTURE_FILES);
      expect(result.isFullRebuild).toBe(true);
    });

    it("getGraph returns null before first update", () => {
      expect(builder.getGraph()).toBeNull();
    });

    it("getGraph returns graph after update", () => {
      builder.update(FIXTURE_FILES);
      expect(builder.getGraph()).not.toBeNull();
    });

    it("getManifest returns null before first update", () => {
      expect(builder.getManifest()).toBeNull();
    });

    it("getManifest returns manifest after update", () => {
      builder.update(FIXTURE_FILES);
      const manifest = builder.getManifest();
      expect(manifest).not.toBeNull();
      expect(manifest!.fileHashes.size).toBe(FIXTURE_FILES.length);
    });
  });

  // ─── incrementalUpdate (standalone) ─────────────────────────────────────

  describe("incrementalUpdate", () => {
    it("first call is a full rebuild", () => {
      const result = incrementalUpdate(FIXTURE_FILES, FIXTURES_DIR);
      expect(result.isFullRebuild).toBe(true);
    });

    it("second call with previous state is incremental when no changes", () => {
      const first = incrementalUpdate(FIXTURE_FILES, FIXTURES_DIR);
      const second = incrementalUpdate(
        FIXTURE_FILES,
        FIXTURES_DIR,
        first.manifest,
        first.graph,
      );
      expect(second.isFullRebuild).toBe(false);
      expect(second.changedFiles).toHaveLength(0);
    });

    it("equivalence: incremental matches full rebuild after change", () => {
      const original = readFixtureFile("utils.ts");
      try {
        // First full build
        const first = incrementalUpdate(FIXTURE_FILES, FIXTURES_DIR);

        // Modify a file
        writeFixtureFile("utils.ts", original + "\n// modified\n");

        // Incremental update with previous state
        const incremental = incrementalUpdate(
          FIXTURE_FILES,
          FIXTURES_DIR,
          first.manifest,
          first.graph,
        );

        // Full rebuild from scratch
        const full = incrementalUpdate(FIXTURE_FILES, FIXTURES_DIR);

        // Checksums must match
        expect(graphChecksum(incremental.graph)).toBe(
          graphChecksum(full.graph),
        );
      } finally {
        writeFixtureFile("utils.ts", original);
      }
    });
  });

  // ─── Benchmarks ─────────────────────────────────────────────────────────

  describe("benchmarks", () => {
    it("logs full rebuild time", () => {
      const start = Date.now();
      const builder = new IncrementalGraphBuilder(FIXTURES_DIR);
      builder.update(FIXTURE_FILES);
      const elapsed = Date.now() - start;
      console.log(`Full rebuild: ${elapsed}ms`);
      expect(elapsed).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(10000); // Sanity: under 10s
    });

    it("logs incremental time (no changes)", () => {
      const builder = new IncrementalGraphBuilder(FIXTURES_DIR);
      builder.update(FIXTURE_FILES);

      const start = Date.now();
      builder.update(FIXTURE_FILES);
      const elapsed = Date.now() - start;
      console.log(`Incremental (no changes): ${elapsed}ms`);
      expect(elapsed).toBeLessThan(500); // Should be fast
    });
  });
});
