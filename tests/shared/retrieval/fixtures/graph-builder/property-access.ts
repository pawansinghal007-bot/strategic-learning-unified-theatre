// Fixture: property-access.ts
// Covers graph-builder.ts line 170: handleMissingSymbol with PropertyAccessExpression
// Covers graph-builder.ts line 383: anonymous FunctionDeclaration (no .name)
// Covers graph-builder.ts line 423: method findEnclosingDeclaration with no class name

// ── Property access on any-typed value (line 170) ──
// obj.doSomething() → checker finds no symbol at location for .doSomething
// → handleMissingSymbol is called with a PropertyAccessExpression → returns []
export function callsPropertyOnAny(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: any = {};
  obj.doSomething(); // PropertyAccessExpression with no symbol → line 170 path
}

// ── Anonymous function expression stored in a variable (line 383 path) ──
// When filterOverloadImplementations receives a FunctionDeclaration with no
// .name property, it falls into nonFuncDecls.push(fd) at line 383.
// In practice TypeScript's parser doesn't produce anonymous FunctionDeclarations
// in top-level statements — but a default export default function() {} does:
// We use the closest equivalent: function expression in a variable (variable kind).
export const anonymousFn = function () {
  callsPropertyOnAny();
};

// ── Method in class expression (no class name) — line 423 ──
// When findEnclosingDeclaration walks up into a MethodDeclaration whose
// parent ClassDeclaration has no .name (anonymous class expression),
// it returns nodeId(relativePath, current.name.text) — just the method name.
export const anonClassInstance = new (class {
  myMethod(): void {
    callsPropertyOnAny(); // call inside method of anonymous class
  }
})();
