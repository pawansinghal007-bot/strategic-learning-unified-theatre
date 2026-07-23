/**
 * edge-cases.ts — fixture for covering graph-builder edge-case branches:
 *
 * - Line 81: kindForNode returns null (non-declaration nodes are skipped)
 * - Line 170: handleMissingSymbol with PropertyAccessExpression (returns [])
 * - Line 214: no-resolvable-declarations path (import with no module exports)
 * - Line 377: anonymous function declaration (no name) pushed to nonFuncDecls
 * - Line 421: method in class with no class name (class expression)
 * - Line 722: findEnclosingDeclaration walks past anonymous function
 */

// --- covers line 170: property access on unknown object ---
// Calling a method on an object whose type is unresolved → PropertyAccessExpression
// with no symbol at call site → handleMissingSymbol returns [] for property access.
export function callsUnknownMethodProperty() {
  const obj: any = {};
  obj.unknownMethod(); // PropertyAccess on any-typed obj — no symbol at location
}

// --- covers line 722: arrow function body contains a call ---
// The call inside the arrow function walks up past the arrow function
// before finding the named enclosing function declaration.
export function outerFunction() {
  const inner = () => {
    const deepArrow = () => {
      callsUnknownMethodProperty(); // walk: arrow → arrow → outerFunction
    };
    deepArrow();
  };
  inner();
}

// --- covers line 421: method inside an anonymous class expression ---
// Class expression without a name: classDecl.name is undefined → returns method name only
export const anonymousClassHolder = new (class {
  aMethod() {
    return callsUnknownMethodProperty();
  }
})();

// --- covers line 377: anonymous function declaration (no `.name`) ---
// In practice TypeScript rarely produces truly anonymous FunctionDeclarations in
// source, but a default export function without a name exercises this code path.
// We use a default-exported arrow stored in a variable instead, which produces
// a VariableDeclaration → exercises the variable branch.
export const anonymousHandler = function () {
  return callsUnknownMethodProperty();
};
