/**
 * calls-default.ts — calls the anonymous default export from coverage-gaps.ts
 *
 * When the TS checker resolves `anonFn()` here, it resolves to the
 * FunctionDeclaration that has no .name (the `export default function() {}` in
 * coverage-gaps.ts). This pushes that FunctionDeclaration into nonFuncDecls
 * inside filterOverloadImplementations (line 383 in graph-builder.ts).
 */
import anonFn from "./coverage-gaps.js";

export function callsAnonDefault(): number {
  return anonFn(); // resolves to FunctionDeclaration with no .name → line 383
}
