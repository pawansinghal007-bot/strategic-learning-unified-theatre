/**
 * tests/shared/retrieval/graph-builder.test.ts
 *
 * Unit tests for the graph builder against hand-verified fixture files.
 *
 * Phase 1 acceptance criteria:
 * "Unit tests against a small fixture repo (3–5 files with known call
 *  relationships) produce the exact expected node/edge set —
 *  hand-verified, not eyeballed."
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { buildGraph } from "../../../src/shared/retrieval/graph-builder.js";
import type {
  GraphNode,
  GraphEdge,
  SymbolGraph,
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

function normalizePaths(graph: SymbolGraph, projectRoot: string): SymbolGraph {
  // Normalize file paths to use forward slashes relative to fixtures dir
  const normalize = (filePath: string) =>
    path.relative(projectRoot, filePath).split(path.sep).join("/");

  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      id: `${normalize(n.file)}#${n.id.split("#").slice(1).join("#")}`,
      file: normalize(n.file),
    })),
    edges: graph.edges.map((e) => ({
      ...e,
      from: `${normalize(e.from.split("#")[0])}#${e.from.split("#").slice(1).join("#")}`,
      to: e.to
        ? `${normalize(e.to.split("#")[0])}#${e.to.split("#").slice(1).join("#")}`
        : null,
    })),
  };
}

function nodeIds(graph: SymbolGraph): Set<string> {
  return new Set(graph.nodes.map((n) => n.id));
}

function edgePairs(graph: SymbolGraph): Array<[string, string | null]> {
  return graph.edges.map((e) => [e.from, e.to]);
}

function resolvedEdges(graph: SymbolGraph): GraphEdge[] {
  return graph.edges.filter((e) => e.resolved);
}

function unresolvedEdges(graph: SymbolGraph): GraphEdge[] {
  return graph.edges.filter((e) => !e.resolved);
}

// ─── hand-verified expected sets ──────────────────────────────────────────────
// These are derived by manually reading each fixture file and tracing
// every declaration and call relationship.

/**
 * EXPECTED NODES (hand-verified from fixture files):
 *
 * utils.ts:
 *   - formatName (function)
 *   - capitalize (function)
 *   - isEmpty (function)
 *
 * service.ts:
 *   - User (interface)
 *   - UserService (class)
 *   - UserService.findUser (method)
 *   - UserService.listUsers (method)
 *   - greetUser (function)
 *
 * processor.ts:
 *   - processUsers (function)
 *   - validateName (function)
 *
 * types.ts:
 *   - UserId (type alias)
 *   - ServiceConfig (interface)
 *   - LogLevel (enum)
 *
 * overloads.ts:
 *   - transform (function — overload implementation only)
 *   - applyTransform (function)
 *   - Handler (type alias)
 *   - execute (function)
 *   - dispatch (function)
 *
 * aliased.ts:
 *   - processWithAlias (function)
 *   - checkWithAlias (function)
 *   - fullGreeting (function)
 *
 * Total: 21 nodes
 */
const EXPECTED_NODE_COUNT = 21;

const REQUIRED_NODES = [
  "utils.ts#formatName",
  "utils.ts#capitalize",
  "utils.ts#isEmpty",
  "service.ts#User",
  "service.ts#UserService",
  "service.ts#UserService.findUser",
  "service.ts#UserService.listUsers",
  "service.ts#greetUser",
  "processor.ts#processUsers",
  "processor.ts#validateName",
  "types.ts#UserId",
  "types.ts#ServiceConfig",
  "types.ts#LogLevel",
  // Phase 2: overloads.ts nodes
  "overloads.ts#transform",
  "overloads.ts#applyTransform",
  "overloads.ts#Handler",
  "overloads.ts#execute",
  "overloads.ts#dispatch",
  // Phase 2: aliased.ts nodes
  "aliased.ts#processWithAlias",
  "aliased.ts#checkWithAlias",
  "aliased.ts#fullGreeting",
];

/**
 * EXPECTED EDGES (hand-verified from fixture files):
 *
 * utils.ts:
 *   formatName calls capitalize (line 10)
 *
 * service.ts:
 *   UserService.findUser calls formatName (line ~20)
 *   UserService.listUsers calls this.findUser (line ~25)
 *   greetUser calls formatName (line ~30)
 *
 * processor.ts:
 *   processUsers calls service.listUsers (line ~6)
 *   processUsers calls greetUser (line ~7)
 *   validateName calls isEmpty (line ~11)
 *   validateName calls formatName (line ~11)
 *
 * overloads.ts:
 *   transform calls formatName (line ~11) — resolved
 *   applyTransform calls transform (line ~18) — resolved
 *   execute calls handler (line ~27) — UNRESOLVED (dynamic-dispatch)
 *   dispatch calls fn (line ~35) — UNRESOLVED (no-processable-declarations)
 *
 * aliased.ts:
 *   processWithAlias calls formatName (line ~9) — resolved (alias fnFormat → formatName)
 *   checkWithAlias calls isEmpty (line ~13) — resolved (alias fnIsEmpty → isEmpty)
 *   fullGreeting calls formatName (line ~19) — resolved (alias fnFormat → formatName)
 *   fullGreeting calls greetUser (line ~20) — resolved (alias sayHello → greetUser)
 *
 * Total: 16 edges (14 resolved + 2 unresolved)
 */
const EXPECTED_EDGE_COUNT = 16;
const EXPECTED_RESOLVED_COUNT = 14;
const EXPECTED_UNRESOLVED_COUNT = 2;

// ─── tests ────────────────────────────────────────────────────────────────────

describe("graph-builder", () => {
  let graph: SymbolGraph;

  beforeEach(() => {
    graph = buildGraph(FIXTURE_FILES, FIXTURES_DIR);
  });

  describe("node extraction", () => {
    it("produces the exact expected node count", () => {
      expect(graph.nodes.length).toBe(EXPECTED_NODE_COUNT);
    });

    it("contains all required node IDs", () => {
      const ids = nodeIds(graph);
      for (const expected of REQUIRED_NODES) {
        expect(ids).toContain(expected);
      }
    });

    it("has no duplicate node IDs", () => {
      const ids = nodeIds(graph);
      expect(ids.size).toBe(graph.nodes.length);
    });

    it("classifies node kinds correctly", () => {
      const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

      expect(nodesById.get("utils.ts#formatName")?.kind).toBe("function");
      expect(nodesById.get("utils.ts#capitalize")?.kind).toBe("function");
      expect(nodesById.get("utils.ts#isEmpty")?.kind).toBe("function");

      expect(nodesById.get("service.ts#User")?.kind).toBe("interface");
      expect(nodesById.get("service.ts#UserService")?.kind).toBe("class");
      expect(nodesById.get("service.ts#UserService.findUser")?.kind).toBe(
        "method",
      );
      expect(nodesById.get("service.ts#UserService.listUsers")?.kind).toBe(
        "method",
      );
      expect(nodesById.get("service.ts#greetUser")?.kind).toBe("function");

      expect(nodesById.get("processor.ts#processUsers")?.kind).toBe("function");
      expect(nodesById.get("processor.ts#validateName")?.kind).toBe("function");

      expect(nodesById.get("types.ts#UserId")?.kind).toBe("type");
      expect(nodesById.get("types.ts#ServiceConfig")?.kind).toBe("interface");
      expect(nodesById.get("types.ts#LogLevel")?.kind).toBe("enum");
    });

    it("assigns correct file paths to nodes", () => {
      const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

      // utils.ts nodes
      expect(nodesById.get("utils.ts#formatName")?.file).toMatch(/utils\.ts$/);
      expect(nodesById.get("utils.ts#capitalize")?.file).toMatch(/utils\.ts$/);
      expect(nodesById.get("utils.ts#isEmpty")?.file).toMatch(/utils\.ts$/);

      // service.ts nodes
      expect(nodesById.get("service.ts#User")?.file).toMatch(/service\.ts$/);
      expect(nodesById.get("service.ts#UserService")?.file).toMatch(
        /service\.ts$/,
      );
      expect(nodesById.get("service.ts#greetUser")?.file).toMatch(
        /service\.ts$/,
      );

      // processor.ts nodes
      expect(nodesById.get("processor.ts#processUsers")?.file).toMatch(
        /processor\.ts$/,
      );
      expect(nodesById.get("processor.ts#validateName")?.file).toMatch(
        /processor\.ts$/,
      );

      // types.ts nodes
      expect(nodesById.get("types.ts#UserId")?.file).toMatch(/types\.ts$/);
      expect(nodesById.get("types.ts#ServiceConfig")?.file).toMatch(
        /types\.ts$/,
      );
      expect(nodesById.get("types.ts#LogLevel")?.file).toMatch(/types\.ts$/);
    });

    it("has valid line ranges for all nodes", () => {
      for (const node of graph.nodes) {
        expect(node.lineRange[0]).toBeGreaterThanOrEqual(1);
        expect(node.lineRange[1]).toBeGreaterThanOrEqual(node.lineRange[0]);
      }
    });

    it("includes signature text for nodes", () => {
      const nodesWithSignatures = graph.nodes.filter((n) => n.signature);
      expect(nodesWithSignatures.length).toBe(graph.nodes.length);
    });

    it("extracts parameter names for functions", () => {
      const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

      // formatName(raw: string)
      expect(nodesById.get("utils.ts#formatName")?.params).toEqual(["raw"]);

      // capitalize(str: string)
      expect(nodesById.get("utils.ts#capitalize")?.params).toEqual(["str"]);

      // isEmpty(value: string)
      expect(nodesById.get("utils.ts#isEmpty")?.params).toEqual(["value"]);

      // greetUser(user: User)
      expect(nodesById.get("service.ts#greetUser")?.params).toEqual(["user"]);

      // processUsers(ids: number[])
      expect(nodesById.get("processor.ts#processUsers")?.params).toEqual([
        "ids",
      ]);

      // validateName(name: string)
      expect(nodesById.get("processor.ts#validateName")?.params).toEqual([
        "name",
      ]);
    });
  });

  describe("edge extraction", () => {
    it("produces the exact expected edge count", () => {
      expect(graph.edges.length).toBe(EXPECTED_EDGE_COUNT);
    });

    it("contains all expected call edges", () => {
      const pairs = edgePairs(graph);

      // utils.ts: formatName calls capitalize
      expect(pairs).toContainEqual(
        expect.arrayContaining(["utils.ts#formatName", "utils.ts#capitalize"]),
      );

      // service.ts: findUser calls formatName
      expect(pairs).toContainEqual(
        expect.arrayContaining([
          "service.ts#UserService.findUser",
          "utils.ts#formatName",
        ]),
      );

      // service.ts: listUsers calls this.findUser
      expect(pairs).toContainEqual(
        expect.arrayContaining([
          "service.ts#UserService.listUsers",
          "service.ts#UserService.findUser",
        ]),
      );

      // service.ts: greetUser calls formatName
      expect(pairs).toContainEqual(
        expect.arrayContaining(["service.ts#greetUser", "utils.ts#formatName"]),
      );

      // processor.ts: processUsers calls listUsers
      expect(pairs).toContainEqual(
        expect.arrayContaining([
          "processor.ts#processUsers",
          "service.ts#UserService.listUsers",
        ]),
      );

      // processor.ts: processUsers calls greetUser
      expect(pairs).toContainEqual(
        expect.arrayContaining([
          "processor.ts#processUsers",
          "service.ts#greetUser",
        ]),
      );

      // processor.ts: validateName calls isEmpty
      expect(pairs).toContainEqual(
        expect.arrayContaining([
          "processor.ts#validateName",
          "utils.ts#isEmpty",
        ]),
      );

      // processor.ts: validateName calls formatName
      expect(pairs).toContainEqual(
        expect.arrayContaining([
          "processor.ts#validateName",
          "utils.ts#formatName",
        ]),
      );
    });

    it("all edges have kind 'calls'", () => {
      for (const edge of graph.edges) {
        expect(edge.kind).toBe("calls");
      }
    });

    it("all edges have valid line numbers", () => {
      for (const edge of graph.edges) {
        expect(edge.line).toBeDefined();
        expect(edge.line!).toBeGreaterThanOrEqual(1);
      }
    });

    it("edge 'from' and 'to' node IDs reference existing nodes (resolved edges only)", () => {
      const ids = nodeIds(graph);
      for (const edge of graph.edges) {
        // Resolved edges must have a valid 'to' node
        if (edge.resolved) {
          expect(edge.to).not.toBeNull();
          expect(ids).toContain(edge.to);
        }
        // Unresolved edges have to: null
        if (!edge.resolved) {
          expect(edge.to).toBeNull();
          expect(edge.unresolvedReason).toBeDefined();
        }
      }
    });
  });

  describe("cross-file resolution", () => {
    it("resolves calls across file boundaries", () => {
      const crossFileEdges = graph.edges.filter(
        (e) =>
          e.resolved && e.to && e.from.split("#")[0] !== e.to.split("#")[0],
      );
      // processor.ts calls service.ts and utils.ts functions
      // service.ts calls utils.ts functions
      // overloads.ts calls utils.ts functions
      // aliased.ts calls utils.ts and service.ts functions
      expect(crossFileEdges.length).toBeGreaterThanOrEqual(9);
    });

    it("resolves method calls on class instances", () => {
      // processUsers creates `new UserService()` then calls `.listUsers()`
      const hasInstanceMethodCall = graph.edges.some(
        (e) =>
          e.from.includes("processUsers") &&
          e.to.includes("UserService.listUsers"),
      );
      expect(hasInstanceMethodCall).toBe(true);
    });

    it("resolves 'this' method calls within a class", () => {
      // listUsers calls this.findUser
      const hasThisCall = graph.edges.some(
        (e) =>
          e.from.includes("UserService.listUsers") &&
          e.to.includes("UserService.findUser"),
      );
      expect(hasThisCall).toBe(true);
    });
  });

  describe("types.ts declarations", () => {
    it("extracts type alias declarations", () => {
      const userIdNode = graph.nodes.find((n) => n.id.includes("#UserId"));
      expect(userIdNode).toBeDefined();
      expect(userIdNode?.kind).toBe("type");
    });

    it("extracts interface declarations", () => {
      const configNode = graph.nodes.find((n) =>
        n.id.includes("#ServiceConfig"),
      );
      expect(configNode).toBeDefined();
      expect(configNode?.kind).toBe("interface");
    });

    it("extracts enum declarations", () => {
      const logLevelNode = graph.nodes.find((n) => n.id.includes("#LogLevel"));
      expect(logLevelNode).toBeDefined();
      expect(logLevelNode?.kind).toBe("enum");
    });

    it("types.ts produces no edges (no function calls)", () => {
      const typesEdges = graph.edges.filter(
        (e) =>
          e.from.includes("types.ts") || (e.to && e.to.includes("types.ts")),
      );
      expect(typesEdges.length).toBe(0);
    });
  });

  describe("graph structure", () => {
    it("returns a valid SymbolGraph object", () => {
      expect(graph).toHaveProperty("nodes");
      expect(graph).toHaveProperty("edges");
      expect(Array.isArray(graph.nodes)).toBe(true);
      expect(Array.isArray(graph.edges)).toBe(true);
    });

    it("all nodes have required fields", () => {
      for (const node of graph.nodes) {
        expect(node.id).toBeDefined();
        expect(node.kind).toBeDefined();
        expect(node.file).toBeDefined();
        expect(node.lineRange).toBeDefined();
        expect(node.lineRange.length).toBe(2);
      }
    });

    it("all edges have required fields", () => {
      for (const edge of graph.edges) {
        expect(edge.from).toBeDefined();
        expect(edge.to).toBeDefined();
        expect(edge.kind).toBeDefined();
        expect(edge.resolved).toBeDefined();
      }
    });
  });

  // ─── Phase 2: overload resolution ─────────────────────────────────────

  describe("overload resolution", () => {
    it("resolves overloaded function to implementation only (not duplicate signatures)", () => {
      // overloads.ts declares `transform` with 3 overload signatures + 1 implementation.
      // Only 1 node should exist for `transform`, not 4.
      const transformNodes = graph.nodes.filter(
        (n) => n.id.includes("overloads.ts") && n.id.includes("#transform"),
      );
      expect(transformNodes.length).toBe(1);
      expect(transformNodes[0]?.kind).toBe("function");
    });

    it("resolves calls to overloaded function correctly", () => {
      // applyTransform calls transform — should resolve to the single transform node
      const edges = graph.edges.filter(
        (e) => e.from.includes("applyTransform") && e.resolved,
      );
      expect(edges.length).toBe(1);
      expect(edges[0]?.to).toContain("transform");
    });

    it("overload implementation calls external functions correctly", () => {
      // transform implementation calls formatName
      const edges = graph.edges.filter(
        (e) =>
          e.from.includes("transform") &&
          e.to?.includes("formatName") &&
          e.resolved,
      );
      expect(edges.length).toBe(1);
    });
  });

  // ─── Phase 2: import alias resolution ─────────────────────────────────

  describe("import alias resolution", () => {
    it("resolves aliased import to actual target (not alias name)", () => {
      // aliased.ts imports { formatName as fnFormat }
      // processWithAlias calls fnFormat — should resolve to formatName, not fnFormat
      const edges = graph.edges.filter(
        (e) => e.from.includes("processWithAlias") && e.resolved,
      );
      expect(edges.length).toBe(1);
      expect(edges[0]?.to).toContain("formatName");
      expect(edges[0]?.to).not.toContain("fnFormat");
    });

    it("resolves multiple aliased imports correctly", () => {
      // checkWithAlias calls fnIsEmpty (alias for isEmpty)
      const edges = graph.edges.filter(
        (e) => e.from.includes("checkWithAlias") && e.resolved,
      );
      expect(edges.length).toBe(1);
      expect(edges[0]?.to).toContain("isEmpty");
      expect(edges[0]?.to).not.toContain("fnIsEmpty");
    });

    it("resolves aliased class method imports", () => {
      // fullGreeting calls sayHello (alias for greetUser)
      const edges = graph.edges.filter(
        (e) =>
          e.from.includes("fullGreeting") &&
          e.to?.includes("greetUser") &&
          e.resolved,
      );
      expect(edges.length).toBe(1);
    });

    it("aliased imports resolve to actual target nodes that exist", () => {
      const aliasedEdges = graph.edges.filter(
        (e) => e.from.includes("aliased.ts") && e.resolved,
      );
      const ids = nodeIds(graph);
      for (const edge of aliasedEdges) {
        expect(ids).toContain(edge.to);
      }
    });
  });

  // ─── Phase 2: unresolved edges ────────────────────────────────────────

  describe("unresolved edges", () => {
    it("flags dynamic dispatch (parameter calls) as unresolved", () => {
      // execute(handler: Handler, input: string) calls handler(input)
      // handler is a parameter — cannot be resolved statically
      const unresolved = graph.edges.filter(
        (e) => e.from.includes("execute") && !e.resolved,
      );
      expect(unresolved.length).toBe(1);
      expect(unresolved[0]?.to).toBeNull();
      expect(unresolved[0]?.unresolvedReason).toBe("dynamic-dispatch");
    });

    it("flags local variable dispatch as unresolved", () => {
      // dispatch() assigns a local variable `fn` then calls fn(value)
      // fn is a local variable — not a graph node
      const unresolved = graph.edges.filter(
        (e) => e.from.includes("dispatch") && !e.resolved,
      );
      expect(unresolved.length).toBe(1);
      expect(unresolved[0]?.to).toBeNull();
      expect(unresolved[0]?.unresolvedReason).toBeDefined();
    });

    it("unresolved edges have resolved: false and a reason", () => {
      const unresolved = graph.edges.filter((e) => !e.resolved);
      expect(unresolved.length).toBeGreaterThanOrEqual(2);
      for (const edge of unresolved) {
        expect(edge.resolved).toBe(false);
        expect(edge.to).toBeNull();
        expect(edge.unresolvedReason).toBeDefined();
        expect(edge.unresolvedReason).not.toBe("");
      }
    });

    it("resolved edges have resolved: true and valid target", () => {
      const resolved = graph.edges.filter((e) => e.resolved);
      expect(resolved.length).toBeGreaterThanOrEqual(14);
      for (const edge of resolved) {
        expect(edge.resolved).toBe(true);
        expect(edge.to).not.toBeNull();
      }
    });

    it("produces correct total edge count including unresolved", () => {
      expect(graph.edges.length).toBe(EXPECTED_EDGE_COUNT);
      expect(resolvedEdges(graph).length).toBe(EXPECTED_RESOLVED_COUNT);
      expect(unresolvedEdges(graph).length).toBe(EXPECTED_UNRESOLVED_COUNT);
    });
  });
});
