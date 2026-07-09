/**
 * Tests for src/storage/symbol-extractor.ts
 *
 * Strategy:
 *  - walkSourceFiles: use real temp directories on disk. The function only
 *    reads the filesystem — creating real temp trees is simpler and more
 *    reliable than trying to mock ESM named imports.
 *  - extractSymbolsFromFile: write TypeScript source strings into a temp dir
 *    and confirm every symbol kind is extracted with correct metadata.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

import { walkSourceFiles, extractSymbolsFromFile } from "../../src/storage/symbol-extractor";

// ---------------------------------------------------------------------------
// Helpers — real temp FS trees
// ---------------------------------------------------------------------------

/** Create a temporary directory tree and return the root path. */
function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sym-walk-test-"));
}

/** Ensure a directory (and parents) exist, then write a file. */
function touch(root: string, relPath: string, content = ""): string {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
  return full;
}

/** Create a directory (and parents). */
function mkdir(root: string, relPath: string): string {
  const full = path.join(root, relPath);
  fs.mkdirSync(full, { recursive: true });
  return full;
}

// ---------------------------------------------------------------------------
// walkSourceFiles
// ---------------------------------------------------------------------------

describe("walkSourceFiles", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = makeTempRoot();
    // All walk tests need a src/ directory to exist
    mkdir(tmpRoot, "src");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns an empty array when src/ directory does not exist", () => {
    // Remove the src dir we just created
    fs.rmSync(path.join(tmpRoot, "src"), { recursive: true });
    const result = walkSourceFiles(tmpRoot);
    expect(result).toEqual([]);
  });

  it("returns a .ts file inside src/", () => {
    touch(tmpRoot, "src/app.ts");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toContain(path.join(tmpRoot, "src/app.ts"));
  });

  it("returns .tsx, .js, and .jsx files", () => {
    touch(tmpRoot, "src/comp.tsx");
    touch(tmpRoot, "src/util.js");
    touch(tmpRoot, "src/widget.jsx");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toContain(path.join(tmpRoot, "src/comp.tsx"));
    expect(result).toContain(path.join(tmpRoot, "src/util.js"));
    expect(result).toContain(path.join(tmpRoot, "src/widget.jsx"));
  });

  it("excludes files with unknown extensions (.json, .md, .css)", () => {
    touch(tmpRoot, "src/config.json");
    touch(tmpRoot, "src/readme.md");
    touch(tmpRoot, "src/styles.css");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toHaveLength(0);
  });

  it("excludes test files (.test.ts, .spec.ts, .test.js, .spec.jsx)", () => {
    touch(tmpRoot, "src/app.test.ts");
    touch(tmpRoot, "src/util.spec.ts");
    touch(tmpRoot, "src/comp.test.js");
    touch(tmpRoot, "src/widget.spec.jsx");
    touch(tmpRoot, "src/real.ts");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("real.ts");
  });

  it("excludes declaration files (.d.ts)", () => {
    touch(tmpRoot, "src/types.d.ts");
    touch(tmpRoot, "src/index.ts");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("index.ts");
  });

  it("skips excluded directory names (node_modules, dist, .git, coverage, etc.)", () => {
    const excluded = ["node_modules", ".venv", "dist", "build", ".cache", "dist_electron", ".git", "coverage"];
    for (const name of excluded) {
      touch(tmpRoot, `src/${name}/secret.ts`);
    }
    const result = walkSourceFiles(tmpRoot);
    expect(result).toHaveLength(0);
  });

  it("recurses into non-excluded subdirectories", () => {
    touch(tmpRoot, "src/utils/helper.ts");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toContain(path.join(tmpRoot, "src/utils/helper.ts"));
  });

  it("skips the excluded relative path src/coverage/ts", () => {
    touch(tmpRoot, "src/coverage/ts/report.ts");
    const result = walkSourceFiles(tmpRoot);
    expect(result).toHaveLength(0);
  });

  it("uses PROJECT_ROOT as default when called with no argument", () => {
    // Should not throw regardless of whether PROJECT_ROOT has a src/ dir
    expect(() => walkSourceFiles()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// extractSymbolsFromFile — uses real TypeScript source written to a temp dir
// ---------------------------------------------------------------------------

describe("extractSymbolsFromFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sym-ext-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSource(filename: string, content: string): string {
    const full = path.join(tmpDir, filename);
    fs.writeFileSync(full, content, "utf-8");
    return full;
  }

  it("returns an empty array for an empty source file", () => {
    const file = writeSource("empty.ts", "");
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols).toEqual([]);
  });

  it("extracts a top-level function declaration", () => {
    const file = writeSource("funcs.ts", `
export function greet(name: string): string {
  return \`Hello, \${name}\`;
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const fn = symbols.find((s) => s.name === "greet");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
    expect(fn!.startLine).toBeGreaterThan(0);
    expect(fn!.endLine).toBeGreaterThanOrEqual(fn!.startLine);
    expect(fn!.filePath).toBe("funcs.ts");
  });

  it("extracts a class and its methods", () => {
    const file = writeSource("service.ts", `
export class UserService {
  getUser(id: string) {
    return { id };
  }
  deleteUser(id: string) {
    return true;
  }
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const cls = symbols.find((s) => s.kind === "class" && s.name === "UserService");
    expect(cls).toBeDefined();

    const getUser = symbols.find((s) => s.name === "UserService.getUser");
    expect(getUser).toBeDefined();
    expect(getUser!.kind).toBe("method");

    const deleteUser = symbols.find((s) => s.name === "UserService.deleteUser");
    expect(deleteUser).toBeDefined();
    expect(deleteUser!.kind).toBe("method");
  });

  it("extracts an interface declaration", () => {
    const file = writeSource("types.ts", `
export interface Config {
  host: string;
  port: number;
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const iface = symbols.find((s) => s.name === "Config");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
  });

  it("extracts a type alias", () => {
    const file = writeSource("types2.ts", `
export type UserId = string;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const typeAlias = symbols.find((s) => s.name === "UserId");
    expect(typeAlias).toBeDefined();
    expect(typeAlias!.kind).toBe("type");
  });

  it("extracts an enum declaration", () => {
    const file = writeSource("enums.ts", `
export enum Status {
  Active = "active",
  Inactive = "inactive",
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const en = symbols.find((s) => s.name === "Status");
    expect(en).toBeDefined();
    expect(en!.kind).toBe("enum");
  });

  it("extracts an exported variable declaration", () => {
    const file = writeSource("vars.ts", `
export const MAX_RETRIES = 3;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const v = symbols.find((s) => s.name === "MAX_RETRIES");
    expect(v).toBeDefined();
    expect(v!.kind).toBe("variable");
  });

  it("does NOT extract non-exported variable declarations", () => {
    const file = writeSource("private-vars.ts", `
const internalCounter = 0;
let mutableState = false;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols.find((s) => s.name === "internalCounter")).toBeUndefined();
    expect(symbols.find((s) => s.name === "mutableState")).toBeUndefined();
  });

  it("extracts an exported object literal variable AND its method-shorthand properties", () => {
    const file = writeSource("tool.ts", `
export const myTool = {
  name: "myTool",
  async execute(input: string) {
    return input;
  },
};
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const obj = symbols.find((s) => s.name === "myTool" && s.kind === "variable");
    expect(obj).toBeDefined();

    const method = symbols.find((s) => s.name === "myTool.execute" && s.kind === "method");
    expect(method).toBeDefined();
  });

  it("produces correct relative filePath using forward slashes", () => {
    const subDir = path.join(tmpDir, "sub");
    fs.mkdirSync(subDir);
    const file = path.join(subDir, "mod.ts");
    fs.writeFileSync(file, "export function foo() {}", "utf-8");

    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols[0].filePath).toBe("sub/mod.ts");
    expect(symbols[0].filePath).not.toContain("\\");
  });

  it("sets startLine and endLine as 1-indexed integers", () => {
    const file = writeSource("lines.ts", `
// line 1 comment
export function alpha() {}
export function beta() {}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    for (const sym of symbols) {
      expect(sym.startLine).toBeGreaterThanOrEqual(1);
      expect(sym.endLine).toBeGreaterThanOrEqual(sym.startLine);
    }
  });

  it("truncates long signatures to 200 characters with '...'", () => {
    const longParam = "a".repeat(210);
    const file = writeSource("long-sig.ts", `export function longSig(${longParam}: string) {}`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const fn = symbols.find((s) => s.name === "longSig");
    expect(fn).toBeDefined();
    expect(fn!.signature!.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(fn!.signature).toMatch(/\.\.\.$/);
  });

  it("handles short signatures without truncation", () => {
    const file = writeSource("short-sig.ts", `export function hello() {}`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const fn = symbols.find((s) => s.name === "hello");
    expect(fn!.signature).toContain("function hello");
    expect(fn!.signature).not.toMatch(/\.\.\.$/);
  });

  it("extracts symbols from a .tsx file using TSX script kind", () => {
    const file = writeSource("component.tsx", `
export function MyComponent() {
  return null;
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols.find((s) => s.name === "MyComponent")).toBeDefined();
  });

  it("extracts symbols from a .jsx file using JSX script kind", () => {
    const file = writeSource("widget.jsx", `
export function Widget() {
  return null;
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols.find((s) => s.name === "Widget")).toBeDefined();
  });

  it("extracts symbols from a plain .js file", () => {
    const file = writeSource("helper.js", `
export function add(a, b) {
  return a + b;
}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols.find((s) => s.name === "add")).toBeDefined();
  });

  it("handles a class with no methods gracefully", () => {
    const file = writeSource("bare-class.ts", `
export class Empty {}
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe("class");
    expect(symbols[0].name).toBe("Empty");
  });

  it("handles multiple exported declarations in one file", () => {
    const file = writeSource("multi.ts", `
export function one() {}
export function two() {}
export interface IFoo { x: number; }
export type Bar = string;
export enum Dir { Up, Down }
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const names = symbols.map((s) => s.name);
    expect(names).toContain("one");
    expect(names).toContain("two");
    expect(names).toContain("IFoo");
    expect(names).toContain("Bar");
    expect(names).toContain("Dir");
  });

  it("does not extract function expressions inside non-exported variable statements", () => {
    const file = writeSource("unexported-fn-expr.ts", `
const helper = function() { return 1; };
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    expect(symbols).toHaveLength(0);
  });

  it("handles exported variable with non-object initializer (arrow function)", () => {
    const file = writeSource("arrow.ts", `
export const transform = (x: number) => x * 2;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const v = symbols.find((s) => s.name === "transform");
    expect(v).toBeDefined();
    expect(v!.kind).toBe("variable");
  });

  it("extracts export default of a named identifier that is declared in the same file", () => {
    const file = writeSource("default-named.ts", `
function doWork() {}
export default doWork;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    // When the identifier is declared in this file, the extractor resolves it
    // and records the symbol with the declaration's kind (not "default-export").
    const fn = symbols.find((s) => s.name === "doWork" && s.kind === "function");
    expect(fn).toBeDefined();
  });

  it("extracts export default of an identifier not declared in the file (re-export)", () => {
    const file = writeSource("default-reexport.ts", `
import { something } from "./other";
export default something;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const def = symbols.find((s) => s.kind === "default-export");
    expect(def).toBeDefined();
    expect(def!.name).toBe("something");
  });

  it("extracts export default of an inline expression using the file basename", () => {
    const file = writeSource("default-inline.ts", `
export default { value: 42 };
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const def = symbols.find((s) => s.kind === "default-export");
    expect(def).toBeDefined();
    expect(def!.name).toBe("default-inline");
  });

  it("findTopLevelDeclaration covers class top-level declaration", () => {
    // export default of a class name declared in the same file — resolves to
    // the class kind, not "default-export"
    const file = writeSource("default-class.ts", `
class Processor {}
export default Processor;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    const cls = symbols.find((s) => s.name === "Processor" && s.kind === "class");
    expect(cls).toBeDefined();
  });

  it("findTopLevelDeclaration covers variable top-level declaration", () => {
    const file = writeSource("default-var.ts", `
const handler = () => {};
export default handler;
`);
    const symbols = extractSymbolsFromFile(file, tmpDir);
    // handler is a const — found as variable kind
    const v = symbols.find((s) => s.name === "handler" && s.kind === "variable");
    expect(v).toBeDefined();
  });
});
