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
  const results: ResolutionResult[] = [];
  const expr = callExpr.expression;
  const callLine = lineOf(sourceFile, callExpr.getStart(sourceFile));

  // Check for dynamic dispatch: callee is a plain identifier that refers
  // to a parameter or local variable (not an imported/declared function)
  if (ts.isIdentifier(expr)) {
    const symbol = checker.getSymbolAtLocation(expr);
    if (symbol) {
      const decls = symbol.getDeclarations();
      if (decls && decls.length > 0) {
        // Check if the symbol is a parameter — dynamic dispatch
        const isParameter = decls.some(ts.isParameter);
        if (isParameter) {
          return [
            {
              to: null,
              line: callLine,
              resolved: false,
              unresolvedReason: "dynamic-dispatch",
            },
          ];
        }
      }
    }
  }

  // Get the symbol at the call expression location
  const symbol = checker.getSymbolAtLocation(expr);
  if (!symbol) {
    // No symbol resolved — check if this is an external library call
    // (built-ins, etc.) by checking if the expression is a property access
    // on something that's not a project file.
    if (ts.isPropertyAccessExpression(expr)) {
      return []; // built-in method or external — skip
    }
    return [
      {
        to: null,
        line: callLine,
        resolved: false,
        unresolvedReason: "no-symbol-resolved",
      },
    ];
  }

  const declarations = symbol.getDeclarations();
  if (!declarations) {
    return [
      {
        to: null,
        line: callLine,
        resolved: false,
        unresolvedReason: "no-declarations",
      },
    ];
  }

  // Early exit: if all declarations are in external libraries (.d.ts or node_modules),
  // silently drop the edge — it's outside our project graph.
  const allExternal = declarations.every((decl) => {
    const file = decl.getSourceFile();
    return file?.isDeclarationFile || file?.fileName.includes("node_modules");
  });
  if (allExternal) {
    return [];
  }

  // Collect all declarations to process (resolve import specifiers first)
  const declsToProcess: ts.Node[] = [];

  for (const decl of declarations) {
    if (ts.isImportSpecifier(decl)) {
      // For import specifiers, find the actual exported symbol
      const importedSymbol = getImportedSymbol(decl, checker);
      if (importedSymbol) {
        const importedDecls = importedSymbol.getDeclarations();
        if (importedDecls) {
          for (const d of importedDecls) {
            if (!ts.isImportSpecifier(d)) {
              declsToProcess.push(d);
            }
          }
        }
      }
    } else {
      declsToProcess.push(decl);
    }
  }

  if (declsToProcess.length === 0) {
    return [
      {
        to: null,
        line: callLine,
        resolved: false,
        unresolvedReason: "no-resolvable-declarations",
      },
    ];
  }

  // Handle overloads: if we have multiple function declarations with the
  // same name, pick the implementation (the one with a body) and skip
  // overload signatures.
  const filteredDecls = filterOverloadImplementations(declsToProcess);

  // Process each declaration
  const resolvedTargets: string[] = [];
  for (const decl of filteredDecls) {
    const target = processDeclarationToId(decl, projectRoot);
    if (target) {
      resolvedTargets.push(target);
    }
  }

  if (resolvedTargets.length === 0) {
    // All declarations were in external libraries or otherwise unprocessable.
    // Silently drop external library calls — they're outside our project graph.
    // Only emit unresolved edges for project-internal calls that can't be resolved.
    const firstDecl = filteredDecls[0];
    const declFile = firstDecl?.getSourceFile();
    if (
      declFile?.isDeclarationFile ||
      declFile?.fileName.includes("node_modules")
    ) {
      return []; // external library — skip
    }
    // Project-internal call that couldn't be resolved
    return [
      {
        to: null,
        line: callLine,
        resolved: false,
        unresolvedReason: "no-processable-declarations",
      },
    ];
  }

  // Return resolved targets (deduplicated)
  const uniqueTargets = [...new Set(resolvedTargets)];
  return uniqueTargets.map((to) => ({
    to,
    line: callLine,
    resolved: true,
  }));
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

  // Determine the target symbol name
  let targetName: string | null = null;

  if (ts.isFunctionDeclaration(decl) && decl.name) {
    targetName = decl.name.text;
  } else if (
    ts.isMethodDeclaration(decl) &&
    decl.name &&
    ts.isIdentifier(decl.name)
  ) {
    const classDecl = ts.findAncestor(decl, (n) => ts.isClassDeclaration(n));
    if (classDecl && classDecl.name) {
      targetName = `${classDecl.name.text}.${decl.name.text}`;
    } else {
      targetName = decl.name.text;
    }
  } else if (ts.isClassDeclaration(decl) && decl.name) {
    targetName = decl.name.text;
  } else if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
    // Only include module-scope variables (exported functions/constants).
    // Skip local variables (inside functions) — they're not graph nodes.
    const parentScope = ts.findAncestor(
      decl,
      (n) =>
        ts.isFunctionDeclaration(n) ||
        ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n),
    );
    if (!parentScope) {
      targetName = decl.name.text;
    }
  }

  if (targetName) {
    return nodeId(declRelativePath, targetName);
  }
  return null;
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

    function visitDeclarations(node: ts.Node): void {
      // Function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const n = nodeFromDeclaration(
          node,
          sourceFile,
          relativePath,
          node.name.text,
        );
        if (n) nodes.set(n.id, n);
      }

      // Class declarations + methods
      if (ts.isClassDeclaration(node) && node.name) {
        const n = nodeFromDeclaration(
          node,
          sourceFile,
          relativePath,
          node.name.text,
        );
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

      // Interface declarations
      if (ts.isInterfaceDeclaration(node)) {
        const n = nodeFromDeclaration(
          node,
          sourceFile,
          relativePath,
          node.name.text,
        );
        if (n) nodes.set(n.id, n);
      }

      // Type alias declarations
      if (ts.isTypeAliasDeclaration(node)) {
        const n = nodeFromDeclaration(
          node,
          sourceFile,
          relativePath,
          node.name.text,
        );
        if (n) nodes.set(n.id, n);
      }

      // Enum declarations
      if (ts.isEnumDeclaration(node)) {
        const n = nodeFromDeclaration(
          node,
          sourceFile,
          relativePath,
          node.name.text,
        );
        if (n) nodes.set(n.id, n);
      }

      // Exported variable statements
      if (ts.isVariableStatement(node)) {
        if (
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
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
      }

      ts.forEachChild(node, visitDeclarations);
    }

    visitDeclarations(sourceFile);

    // ── Extract call edges ──

    const callExpressions = collectCallExpressions(sourceFile);
    for (const call of callExpressions) {
      const results = resolveCallTargets(
        call,
        sourceFile,
        projectRoot,
        checker,
      );
      for (const result of results) {
        // Find the calling context (which function/method contains this call)
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

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
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
      if (classDecl && classDecl.name) {
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
