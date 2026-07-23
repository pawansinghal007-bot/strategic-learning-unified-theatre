/**
 * coverage-gaps.ts — fixture for covering remaining branch gaps in graph-builder.ts
 *
 * Lines targeted:
 *
 *   81  — kindForNode returns null (NodeFromDeclaration guard)
 *  170  — collectDeclarationsToProcess returns [] → "no-resolvable-declarations"
 *  217  — handleMissingSymbol with plain identifier (no PropertyAccess) → "no-symbol-resolved"
 *  383  — filterOverloadImplementations: anonymous FunctionDeclaration (no .name) → nonFuncDecls
 *  398  — filterOverloadImplementations: group with no body → push all
 *  423  — targetNameForDeclaration: ClassDeclaration with name → returns class name
 */

// ── Line 383: anonymous default-exported function (no .name on FunctionDeclaration) ──
// TypeScript's AST for `export default function() {}` produces a FunctionDeclaration
// with name === undefined. filterOverloadImplementations receives this node and
// because fd.name is falsy, pushes it into nonFuncDecls (line 383 branch).
export default function () {
  return 42;
}

// A function that calls the anonymous default export (imported in the next file)
// to force the anonymous function into the resolution chain.
export function triggersAnonymousResolution(): number {
  // This file's own default export is the anonymous function.
  // To call it from within this file would require `import default from './self'`,
  // which is not standard. Instead, another file will import and call it.
  return 0;
}

// ── Line 217: call to a plain identifier that has no symbol ──
// Calling a global that TypeScript can't resolve (e.g. `undeclaredGlobal()`)
// produces an Identifier call expression with no symbol at location.
// handleMissingSymbol is called with an Identifier (not PropertyAccess) → line 217.
export function callsUndeclaredIdentifier(): void {
  // @ts-ignore — intentionally referencing an unknown global to force no-symbol-resolved
  undeclaredGlobalFn(); // identifier with no symbol → line 217
}

// ── Line 423: a call site inside a class constructor resolves to a ClassDeclaration ──
// targetNameForDeclaration receives a ClassDeclaration node and returns decl.name.text.
// This happens when a class is called with `new ClassName()` and the checker resolves
// the target to the ClassDeclaration (not its constructor method).
export class NamedTarget {
  greet(): string {
    return "hello";
  }
}

export function callsNamedTargetConstructor(): NamedTarget {
  return new NamedTarget(); // resolved to NamedTarget ClassDeclaration → line 423
}

// ── Line 437: targetNameForDeclaration falls through all branches → null ──
// An ImportDeclaration node is not a FunctionDecl/MethodDecl/ClassDecl/VariableDecl,
// so targetNameForDeclaration returns null (line 437). In practice this is reached
// when processDeclarationToId encounters an unexpected node kind after filtering.
// We induce it by importing something that re-exports another module — the checker
// may produce an ImportDeclaration as a declaration for an alias.
// The easiest way: export a type (TypeAliasDeclaration) — targetNameForDeclaration
// does NOT have a branch for it, so it falls through to line 437.
export type Placeholder = string;

export function usesPlaceholder(x: Placeholder): Placeholder {
  return x; // call chain that may include type-only nodes
}

// ── Line 170: import specifier with no resolvable exported symbol ──
// When an import specifier references a name that doesn't exist in the module's
// exports, checker.getSymbolAtLocation returns undefined for the module's export,
// so importedDeclarationsToProcess returns [] and collectDeclarationsToProcess
// returns an empty array → "no-resolvable-declarations" (line 170).
// We simulate this via a local call that TypeScript resolves to an import specifier
// whose module doesn't export under that exact name.
// (Achieved by the test creating a source that imports a non-existent re-export.)
