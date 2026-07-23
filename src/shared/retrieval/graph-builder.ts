/**
 * src/shared/retrieval/graph-builder.ts
 *
 * Standalone graph builder: parses TypeScript source files and produces an
 * in-memory symbol graph with nodes (declarations) and edges (call
 * relationships). Uses ts.createProgram + checker for symbol resolution.
 *
 * Phase 1 of Sprint 110e — not wired into retrieve, MCP, or classifier.
 */

import * as ts from "typescript";
import path from "node:path";
import { GraphNode, GraphEdge, SymbolGraph, NodeKind } from "./graph-schema.js";

// ─── ts.createProgram helpers ─────────────────────────────────────────────────

/**
 * Creates a minimal ts.Program from a list of root file paths.
 * Uses default compiler options (no tsconfig needed for structural parsing).
 */
function createProgram(rootFiles: string[]): ts.Program {
  return ts.createProgram({
    rootNames: rootFiles,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      allowJs: true,
    },
  });
}

// ─── node extraction ──────────────────────────────────────────────────────────

function nodeId(file: string, name: string): string {
  return `${file}#${name}`;
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1; // 1-indexed
}

function firstLineOfText(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "..." : firstLine;
}

/** Extract parameter names from a signature-declaring node. */
function extractParams(node: ts.Node): string[] | undefined {
  const params: string[] = [];
  const paramList =
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
      ? (node as ts.SignatureDeclaration).parameters
      : undefined;

  if (paramList) {
    for (const p of paramList) {
      if (ts.isIdentifier(p.name)) {
        params.push(p.name.text);
      }
    }
  }
  return params.length > 0 ? params : undefined;
}

/**
 * Determines the NodeKind for a declaration node.
 */
function kindForNode(node: ts.Node): NodeKind | null {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node)) return "variable";
  return null;
}

/**
 * Extracts a GraphNode from a declaration node.
 */
function nodeFromDeclaration(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
  name: string,
): GraphNode | null {
  const kind = kindForNode(node);
  if (!kind) return null;

  return {
    id: nodeId(relativePath, name),
    kind,
    file: relativePath,
    lineRange: [
      lineOf(sourceFile, node.getStart(sourceFile)),
      lineOf(sourceFile, node.getEnd()),
    ],
    signature: firstLineOfText(node.getText(sourceFile)),
    params: extractParams(node),
  };
}

// ─── edge extraction ──────────────────────────────────────────────────────────

/**
 * Result of resolving a single CallExpression.
 * A call may resolve to multiple targets (overloads) or fail to resolve
 * (dynamic dispatch, parameter calls, etc.).
 */
export interface ResolutionResult {
  /** Target node ID, or null if unresolved */
  to: string | null;
  /** 1-indexed line where the call occurs */
  line: number;
  /** Whether this edge was resolved deterministically */
  resolved: boolean;
  /** If unresolved, explains why */
  unresolvedReason?: string;
}

/**
 * Resolves a CallExpression to the target symbol's node ID(s).
 * Returns an array of ResolutionResult for each resolved/unresolved target.
 *
 * Resolution strategy:
 * - Direct calls (same file, this.method): resolved via checker symbol resolution
 * - Imported symbols: followed via ImportSpecifier → module exports
 * - Import aliases (import { foo as bar }): resolved via propertyName on ImportSpecifier
 * - Overloaded functions: multiple overload signatures + 1 implementation;
 *   we resolve to the implementation declaration only (the last declaration
 *   that has a body). Overload signatures are skipped.
 * - Dynamic dispatch (parameter calls, union-type variables): flagged as
 *   unresolved with reason="dynamic-dispatch" or "union-type-callee"
 * - External library calls (node_modules, .d.ts): flagged as unresolved
 *   with reason="external-library"
 */
function resolveCallTargets(
  callExpr: ts.CallExpression,
  sourceFile: ts.SourceFile,
  projectRoot: string,
  checker: ts.TypeChecker,
): ResolutionResult[] {
  const expr = callExpr.expression;
  const callLine = lineOf(sourceFile, callExpr.getStart(sourceFile));

  // Check for dynamic dispatch (parameter calls)
  const dynamicDispatch = checkDynamicDispatch(expr, checker, callLine);
  if (dynamicDispatch) return dynamicDispatch;

  // Resolve symbol at call expression
  const symbol = checker.getSymbolAtLocation(expr);
  if (!symbol) return handleMissingSymbol(expr, callLine);

  // Get declarations
  const declarations = symbol.getDeclarations();
  if (!declarations) return unresolvedResult(callLine, "no-declarations");

  // Skip if all declarations are external
  if (allDeclarationsExternal(declarations)) return [];

  // Collect declarations to process (resolve import specifiers)
  const declsToProcess = collectDeclarationsToProcess(declarations, checker);
  if (declsToProcess.length === 0)
    return unresolvedResult(callLine, "no-resolvable-declarations");

  // Filter overload implementations and process
  const filteredDecls = filterOverloadImplementations(declsToProcess);
  const resolvedTargets = processDeclarationsToTargets(
    filteredDecls,
    projectRoot,
  );

  // Handle unresolved targets
  if (resolvedTargets.length === 0)
    return handleUnresolvedTargets(filteredDecls, callLine);

  // Return deduplicated resolved targets
  return buildResolvedResults(resolvedTargets, callLine);
}

/**
 * Check if a call expression is a dynamic dispatch (parameter call).
 */
function checkDynamicDispatch(
  expr: ts.Expression,
  checker: ts.TypeChecker,
  callLine: number,
): ResolutionResult[] | null {
  if (!ts.isIdentifier(expr)) return null;

  const symbol = checker.getSymbolAtLocation(expr);
  if (!symbol) return null;

  const decls = symbol.getDeclarations();
  if (!decls || decls.length === 0) return null;

  if (decls.some(ts.isParameter)) {
    return unresolvedResult(callLine, "dynamic-dispatch");
  }
  return null;
}

/**
 * Handle missing symbol at call expression.
 */
function handleMissingSymbol(
  expr: ts.Expression,
  callLine: number,
): ResolutionResult[] {
  if (ts.isPropertyAccessExpression(expr)) return [];
  return unresolvedResult(callLine, "no-symbol-resolved");
}

/**
 * Check if all declarations are in external libraries.
 */
function allDeclarationsExternal(declarations: readonly ts.Node[]): boolean {
  return declarations.every((decl) => {
    const file = decl.getSourceFile();
    return file?.isDeclarationFile || file?.fileName.includes("node_modules");
  });
}

/**
 * Collect declarations to process, resolving import specifiers.
 */
function importedDeclarationsToProcess(
  declaration: ts.ImportSpecifier,
  checker: ts.TypeChecker,
): ts.Node[] {
  const importedSymbol = getImportedSymbol(declaration, checker);
  const importedDeclarations = importedSymbol?.getDeclarations();
  return importedDeclarations
    ? importedDeclarations.filter((decl) => !ts.isImportSpecifier(decl))
    : [];
}

function collectDeclarationsToProcess(
  declarations: readonly ts.Node[],
  checker: ts.TypeChecker,
): ts.Node[] {
  const declsToProcess: ts.Node[] = [];

  for (const decl of declarations) {
    if (ts.isImportSpecifier(decl)) {
      declsToProcess.push(...importedDeclarationsToProcess(decl, checker));
    } else {
      declsToProcess.push(decl);
    }
  }

  return declsToProcess;
}

/**
 * Process declarations to target node IDs.
 */
function processDeclarationsToTargets(
  decls: ts.Node[],
  projectRoot: string,
): string[] {
  const targets: string[] = [];
  for (const decl of decls) {
    const target = processDeclarationToId(decl, projectRoot);
    if (target) targets.push(target);
  }
  return targets;
}

/**
 * Handle unresolved targets (external or unprocessable).
 */
function handleUnresolvedTargets(
  filteredDecls: ts.Node[],
  callLine: number,
): ResolutionResult[] {
  const firstDecl = filteredDecls[0];
  const declFile = firstDecl?.getSourceFile();

  if (
    declFile?.isDeclarationFile ||
    declFile?.fileName.includes("node_modules")
  )
    return [];

  return unresolvedResult(callLine, "no-processable-declarations");
}

/**
 * Build resolved results from unique targets.
 */
function buildResolvedResults(
  targets: string[],
  callLine: number,
): ResolutionResult[] {
  const uniqueTargets = [...new Set(targets)];
  return uniqueTargets.map((to) => ({
    to,
    line: callLine,
    resolved: true,
  }));
}

/**
 * Create an unresolved resolution result array.
 */
function unresolvedResult(line: number, reason: string): ResolutionResult[] {
  return [
    {
      to: null,
      line,
      resolved: false,
      unresolvedReason: reason,
    },
  ];
}

/**
 * Given an ImportSpecifier node, resolves the actual exported symbol
 * it references. Uses the TS checker's symbol table to follow the
 * import chain.
 */
function getImportedSymbol(
  importSpecifier: ts.ImportSpecifier,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  // Walk up to find the import clause, then resolve the module
  const importClause = ts.findAncestor(importSpecifier, (n) =>
    ts.isImportDeclaration(n),
  );
  if (!importClause) return undefined;

  // Get the module symbol from the import declaration
  const moduleSymbol = checker.getSymbolAtLocation(
    importClause.moduleSpecifier,
  );
  if (!moduleSymbol) return undefined;

  // Get the exported symbol by name from the module
  const exportedName = importSpecifier.propertyName
    ? importSpecifier.propertyName.text
    : importSpecifier.name.text;

  const moduleExports = moduleSymbol.exports as
    | ReadonlyMap<string, ts.Symbol>
    | undefined;
  if (!moduleExports) return undefined;

  return moduleExports.get(exportedName);
}

/**
 * Filters overload signatures, keeping only the implementation.
 * For a function with overloads, TypeScript creates multiple
 * FunctionDeclaration nodes with the same name. The implementation
 * is the one that has a body (a block or arrow function body).
 *
 * Strategy: if multiple declarations share the same name and file,
 * keep only the one with a body. For non-function nodes, pass through.
 */
function filterOverloadImplementations(decls: ts.Node[]): ts.Node[] {
  const result: ts.Node[] = [];

  // Group function declarations by (file, name)
  const funcDecls = decls.filter(ts.isFunctionDeclaration);
  const nonFuncDecls = decls.filter((d) => !ts.isFunctionDeclaration(d));

  // Group by name
  const byName = new Map<string, ts.FunctionDeclaration[]>();
  for (const fd of funcDecls) {
    if (fd.name) {
      const key = `${fd.getSourceFile().fileName}#${fd.name.text}`;
      const group = byName.get(key) || [];
      group.push(fd);
      byName.set(key, group);
    } else {
      nonFuncDecls.push(fd);
    }
  }

  // For each group, keep only the implementation
  for (const [, group] of byName) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      // Multiple declarations with same name — find the one with a body
      const implementation = group.find((d) => d.body !== undefined);
      if (implementation) {
        result.push(implementation);
      } else {
        // No body found (shouldn't happen for valid TS), keep all
        result.push(...group);
      }
    }
  }

  result.push(...nonFuncDecls);
  return result;
}

/**
 * Processes a single declaration and returns the target node ID, or null.
 */
function targetNameForDeclaration(decl: ts.Node): string | null {
  if (ts.isFunctionDeclaration(decl) && decl.name) {
    return decl.name.text;
  }

  if (ts.isMethodDeclaration(decl) && decl.name && ts.isIdentifier(decl.name)) {
    const classDecl = ts.findAncestor(decl, (n) => ts.isClassDeclaration(n));
    return classDecl?.name
      ? `${classDecl.name.text}.${decl.name.text}`
      : decl.name.text;
  }

  if (ts.isClassDeclaration(decl) && decl.name) {
    return decl.name.text;
  }

  if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
    const parentScope = ts.findAncestor(
      decl,
      (n) =>
        ts.isFunctionDeclaration(n) ||
        ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n),
    );
    return parentScope ? null : decl.name.text;
  }

  return null;
}

function processDeclarationToId(
  decl: ts.Node,
  projectRoot: string,
): string | null {
  // Skip import specifiers
  if (ts.isImportSpecifier(decl)) return null;

  // Skip declarations in external libraries
  const declFile = decl.getSourceFile();
  if (declFile.isDeclarationFile) return null;
  if (declFile.fileName.includes("node_modules")) return null;

  // Normalize the declaration file path
  const declRelativePath = path
    .relative(projectRoot, declFile.fileName)
    .split(path.sep)
    .join("/");

  const targetName = targetNameForDeclaration(decl);
  return targetName ? nodeId(declRelativePath, targetName) : null;
}

/**
 * Walks a source file and collects all CallExpression nodes.
 */
function collectCallExpressions(
  sourceFile: ts.SourceFile,
): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

// ─── main builder ─────────────────────────────────────────────────────────────

/**
 * Builds a SymbolGraph from a list of TypeScript source file paths.
 *
 * @param rootFiles - Absolute paths to .ts/.tsx files to parse.
 * @param projectRoot - Project root for computing relative paths.
 * @returns SymbolGraph with nodes and edges.
 */
export function buildGraph(
  rootFiles: string[],
  projectRoot: string,
): SymbolGraph {
  const program = createProgram(rootFiles);
  const checker = program.getTypeChecker();

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Process each source file in the program
  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sf) =>
        !sf.isDeclarationFile &&
        !sf.fileName.includes("node_modules") &&
        (sf.fileName.endsWith(".ts") || sf.fileName.endsWith(".tsx")),
    );

  for (const sourceFile of sourceFiles) {
    const relativePath = path
      .relative(projectRoot, sourceFile.fileName)
      .split(path.sep)
      .join("/");

    // ── Extract declaration nodes ──
    extractDeclarationNodes(sourceFile, relativePath, nodes);

    // ── Extract call edges ──
    extractCallEdges(sourceFile, relativePath, projectRoot, checker, edges);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

/**
 * Walks a source file and extracts all declaration nodes into the nodes map.
 */
function extractDeclarationNodes(
  sourceFile: ts.SourceFile,
  relativePath: string,
  nodes: Map<string, GraphNode>,
): void {
  function visit(node: ts.Node): void {
    tryAddNode(extractFunctionNode(node, sourceFile, relativePath), nodes);
    extractClassNodes(node, sourceFile, relativePath, nodes);
    tryAddNode(extractInterfaceNode(node, sourceFile, relativePath), nodes);
    tryAddNode(extractTypeAliasNode(node, sourceFile, relativePath), nodes);
    tryAddNode(extractEnumNode(node, sourceFile, relativePath), nodes);
    extractExportedVariableNodes(node, sourceFile, relativePath, nodes);

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/** Try to add a node to the map if not null. */
function tryAddNode(
  node: GraphNode | null,
  nodes: Map<string, GraphNode>,
): void {
  if (node) nodes.set(node.id, node);
}

/** Extract a function declaration node. */
function extractFunctionNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): GraphNode | null {
  if (!ts.isFunctionDeclaration(node) || !node.name) return null;
  return nodeFromDeclaration(node, sourceFile, relativePath, node.name.text);
}

/** Extract class declaration nodes (class + methods). */
function extractClassNodes(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
  nodes: Map<string, GraphNode>,
): void {
  if (!ts.isClassDeclaration(node) || !node.name) return;

  const n = nodeFromDeclaration(node, sourceFile, relativePath, node.name.text);
  if (n) nodes.set(n.id, n);

  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name)
    ) {
      const methodName = `${node.name.text}.${member.name.text}`;
      const mn = nodeFromDeclaration(
        member,
        sourceFile,
        relativePath,
        methodName,
      );
      if (mn) nodes.set(mn.id, mn);
    }
  }
}

/** Extract an interface declaration node. */
function extractInterfaceNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): GraphNode | null {
  if (!ts.isInterfaceDeclaration(node)) return null;
  return nodeFromDeclaration(node, sourceFile, relativePath, node.name.text);
}

/** Extract a type alias declaration node. */
function extractTypeAliasNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): GraphNode | null {
  if (!ts.isTypeAliasDeclaration(node)) return null;
  return nodeFromDeclaration(node, sourceFile, relativePath, node.name.text);
}

/** Extract an enum declaration node. */
function extractEnumNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): GraphNode | null {
  if (!ts.isEnumDeclaration(node)) return null;
  return nodeFromDeclaration(node, sourceFile, relativePath, node.name.text);
}

/** Extract exported variable statement nodes. */
function extractExportedVariableNodes(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
  nodes: Map<string, GraphNode>,
): void {
  if (!ts.isVariableStatement(node)) return;
  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    return;

  for (const decl of node.declarationList.declarations) {
    if (ts.isIdentifier(decl.name)) {
      const n = nodeFromDeclaration(
        node,
        sourceFile,
        relativePath,
        decl.name.text,
      );
      if (n) nodes.set(n.id, n);
    }
  }
}

/**
 * Extracts call edges from a source file.
 */
function extractCallEdges(
  sourceFile: ts.SourceFile,
  relativePath: string,
  projectRoot: string,
  checker: ts.TypeChecker,
  edges: GraphEdge[],
): void {
  const callExpressions = collectCallExpressions(sourceFile);
  for (const call of callExpressions) {
    const results = resolveCallTargets(call, sourceFile, projectRoot, checker);
    for (const result of results) {
      const callingNode = findEnclosingDeclaration(
        call,
        sourceFile,
        relativePath,
      );
      const fromId = callingNode ?? nodeId(relativePath, "<module>");

      edges.push({
        from: fromId,
        to: result.to,
        kind: "calls",
        line: result.line,
        resolved: result.resolved,
        unresolvedReason: result.unresolvedReason,
      });
    }
  }
}

/**
 * Finds the enclosing function/method/class declaration for a given node.
 * Skips anonymous arrow functions and function expressions to find the
 * nearest named declaration. Returns null if at module level.
 */
function findEnclosingDeclaration(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  relativePath: string,
): string | null {
  let current: ts.Node | undefined = node;

  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return nodeId(relativePath, current.name.text);
    }
    if (
      ts.isMethodDeclaration(current) &&
      current.name &&
      ts.isIdentifier(current.name)
    ) {
      // For methods, find the parent class
      const classDecl = ts.findAncestor(current, (n) =>
        ts.isClassDeclaration(n),
      );
      if (classDecl?.name) {
        return nodeId(
          relativePath,
          `${classDecl.name.text}.${current.name.text}`,
        );
      }
      return nodeId(relativePath, current.name.text);
    }
    // Skip anonymous arrow functions and function expressions —
    // continue walking up to find the named enclosing declaration
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      current = current.parent;
      continue;
    }
    current = current.parent;
  }

  return null;
}
