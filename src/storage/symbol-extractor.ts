import * as ts from "typescript";
import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../shared/config/paths";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  ".venv",
  "dist",
  "build",
  ".cache",
  "dist_electron",
  ".git",
  "coverage",
]);

// Exact relative paths to skip entirely (generated report boilerplate,
// not application code).
const EXCLUDED_RELATIVE_PATHS = new Set(["src/coverage/ts"]);

function isTestFile(fileName: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName);
}

function isDeclarationFile(fileName: string): boolean {
  return fileName.endsWith(".d.ts");
}

/**
 * Recursively walks `src/` under PROJECT_ROOT and returns absolute paths
 * of all source files eligible for symbol extraction.
 */
export function walkSourceFiles(rootDir: string = PROJECT_ROOT): string[] {
  const srcRoot = path.join(rootDir, "src");
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // unreadable directory, skip silently
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relativePath = path
        .relative(rootDir, fullPath)
        .split(path.sep)
        .join("/");

      if (EXCLUDED_RELATIVE_PATHS.has(relativePath)) continue;

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry)) continue;
        walk(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(entry);
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        if (isTestFile(entry)) continue;
        if (isDeclarationFile(entry)) continue;
        results.push(fullPath);
      }
    }
  }

  walk(srcRoot);
  return results;
}

export interface ExtractedSymbol {
  name: string;
  kind: string;
  filePath: string; // relative to PROJECT_ROOT, forward slashes
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  signature?: string;
}

function scriptKindForFile(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1; // 1-indexed
}

function firstLineOfText(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "..." : firstLine;
}

/**
 * Finds a top-level declaration by name in the source file.
 * Returns the node and its kind, or null if not found.
 */
function findTopLevelDeclaration(
  sourceFile: ts.SourceFile,
  name: string,
): { node: ts.Node; kind: string } | null {
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) {
      return { node: stmt, kind: "function" };
    }
    if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) {
      return { node: stmt, kind: "class" };
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          return { node: decl, kind: "variable" };
        }
      }
    }
  }
  return null;
}

/**
 * Extracts top-level function/class/interface/type/enum declarations,
 * plus class methods, from a single source file.
 */
export function extractSymbolsFromFile(
  absoluteFilePath: string,
  projectRoot: string,
): ExtractedSymbol[] {
  const text = readFileSync(absoluteFilePath, "utf-8");
  const sourceFile = ts.createSourceFile(
    absoluteFilePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(absoluteFilePath),
  );

  const relativePath = path
    .relative(projectRoot, absoluteFilePath)
    .split(path.sep)
    .join("/");

  const symbols: ExtractedSymbol[] = [];
  const seenSymbols = new Set<string>();

  function addSymbol(name: string, kind: string, node: ts.Node): void {
    const key = `${node.getStart(sourceFile)}:${node.getEnd()}`;
    if (seenSymbols.has(key)) return;
    seenSymbols.add(key);
    symbols.push({
      name,
      kind,
      filePath: relativePath,
      startLine: lineOf(sourceFile, node.getStart(sourceFile)),
      endLine: lineOf(sourceFile, node.getEnd()),
      signature: firstLineOfText(node.getText(sourceFile)),
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addSymbol(node.name.text, "function", node);
    } else if (ts.isClassDeclaration(node) && node.name) {
      addSymbol(node.name.text, "class", node);
      // class methods
      for (const member of node.members) {
        if (
          ts.isMethodDeclaration(member) &&
          member.name &&
          ts.isIdentifier(member.name)
        ) {
          addSymbol(`${node.name.text}.${member.name.text}`, "method", member);
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      addSymbol(node.name.text, "interface", node);
    } else if (ts.isTypeAliasDeclaration(node)) {
      addSymbol(node.name.text, "type", node);
    } else if (ts.isEnumDeclaration(node)) {
      addSymbol(node.name.text, "enum", node);
    } else if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const varName = decl.name.text;

        if (
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          // export const xTool = { ..., async execute(...) {...} }
          // Record the object itself AND each of its method-shorthand
          // properties, dotted as VarName.methodName.
          addSymbol(varName, "variable", decl);
          for (const prop of decl.initializer.properties) {
            if (
              ts.isMethodDeclaration(prop) &&
              prop.name &&
              ts.isIdentifier(prop.name)
            ) {
              addSymbol(`${varName}.${prop.name.text}`, "method", prop);
            }
          }
        } else {
          addSymbol(varName, "variable", decl);
        }
      }
    } else if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const found = findTopLevelDeclaration(sourceFile, expr.text);
        if (found) {
          addSymbol(expr.text, found.kind, found.node);
        } else {
          // Identifier not declared at top level in this file (e.g.
          // imported and immediately re-exported) — record the export
          // statement itself so the name is still findable.
          addSymbol(expr.text, "default-export", node);
        }
      } else {
        // export default <inline expression> with no separate declared
        // name — fall back to the file's own base name.
        const baseName = path
          .basename(relativePath)
          .replace(/\.(ts|tsx|js|jsx)$/, "");
        addSymbol(baseName, "default-export", node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}
