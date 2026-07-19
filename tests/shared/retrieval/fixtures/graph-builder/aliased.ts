// Fixture: aliased.ts — import aliases and re-exports

import { formatName as fnFormat, isEmpty as fnIsEmpty } from "./utils.js";
import { greetUser as sayHello } from "./service.js";

// ── Import alias resolution ──

export function processWithAlias(name: string): string {
  return fnFormat(name);
}

export function checkWithAlias(value: string): boolean {
  return !fnIsEmpty(value);
}

// ── Chained alias (alias calls another aliased import) ──

export function fullGreeting(name: string): string {
  const formatted = fnFormat(name);
  return sayHello({ id: 0, name: formatted });
}
