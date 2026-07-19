// Fixture: overloads.ts — function overloads and dynamic dispatch cases

import { formatName } from "./utils.js";

// ── Overloaded function ──

export function transform(value: string): string;
export function transform(value: number): string;
export function transform(value: boolean): string;
export function transform(value: string | number | boolean): string {
  if (typeof value === "string") return formatName(value);
  return String(value);
}

// ── Function that calls the overloaded function ──

export function applyTransform(items: string[]): string[] {
  return items.map((item) => transform(item));
}

// ── Dynamic dispatch (unresolvable) ──

export type Handler = (input: string) => string;

export function execute(handler: Handler, input: string): string {
  // This call cannot be resolved statically — handler is a parameter
  return handler(input);
}

// ── Union type call (unresolvable) ──

export function dispatch(kind: "format" | "transform", value: string): string {
  const fn = kind === "format" ? formatName : transform;
  // Dynamic dispatch through variable — cannot resolve at compile time
  return fn(value);
}
