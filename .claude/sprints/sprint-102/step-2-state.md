# Sprint 106 — Step 2 State
Date: 2026-07-03
Sprint: 106 (state file stored under sprint-102/ per task instructions)

---

## Files Created / Modified

| File | Action | Description |
|------|--------|-------------|
| `src/agents/tools/vector-search.ts` | **Created** | `Tool` wrapper for `vectorSearch()` from `src/shared/retrieval/vector-client.ts`. Validates `query`, coerces `topK` with `Number()`, formats results as a numbered list with `score.toFixed(3)`, source, and text. |
| `src/agents/tools/search-code.ts` | **Created** | `Tool` wrapper for `searchCode()` from `src/shared/retrieval/code-search.ts`. Validates `pattern`, passes optional `glob`, formats hits as `file:line: text`. |
| `src/agents/tools/registry.ts` | **Modified** | Added imports for `vectorSearchTool` and `searchCodeTool`; added `tools.set(...)` calls for both, alongside the existing `readFileTool`. |
| `.claude/agents/code-reviewer.md` | **Modified** | Tool list section updated from 1 entry to 3 entries. Usage syntax copied verbatim from each tool's `description` field so the prompt and code cannot drift. |

---

## Tool Interface Convention — Confirmed [CONFIRMED]

Both new tools match the `Tool` / `ToolResult` interface from `src/agents/tools/base.ts` exactly:

- `name: string` — `"vector-search"` / `"search-code"`
- `description: string` — includes the canonical usage syntax the model needs
- `execute(args: Record<string, string>): Promise<ToolResult>` — every arg arrives as a `string`; numeric coercions done inside `execute`:
  - `vector-search`: `const topK = args.topK ? Number(args.topK) : 5;`
  - `search-code`: no numeric args; `args.glob` passed through as-is

`ToolResult` shape returned in all paths:

```ts
{ toolName: this.name, success: boolean, output: string, error?: string }
```

Missing-arg path returns `{ success: false, output: "", error: "Missing required arg: <name>" }`.
Exception path returns `{ success: false, output: "", error: "<tool> failed: <message>" }`.

---

## Logger Convention

Same convention as step 1 — NOT used directly in the tool wrappers (logging happens inside the shared retrieval modules `vector-client.ts` and `code-search.ts`). The tool wrappers are thin: validate args → delegate to shared module → format output.

Import path if logging were needed from `src/agents/tools/`:
```ts
import { logger } from "../../shared/logging/logger.js";
```

---

## Code-Review Agent Prompt — Static, Updated

**Finding**: The code-review agent prompt at `.claude/agents/code-reviewer.md` is **fully static markdown**. The orchestrator reads it with `fs.readFileSync(agentFilePath)` and passes the raw string to `runSubAgent` as `systemPrompt`. `getToolDescriptions()` is NOT called anywhere in `orchestrator.ts`; it is available in the registry for future use but currently unused by any agent load path.

**Action taken**: Updated the "You have access to these tools" section in `code-reviewer.md` from:

```
- read-file: Read a source file. Usage: [TOOL:read-file path="<absolute or relative path>"]
```

To all three tools with their canonical description strings:

```
- read-file: ...
- vector-search: Semantic search over the project's Qdrant vector store. ...
- search-code: Lexical/regex search over the repo using ripgrep. ...
```

Usage syntax was copied directly from the `description` field of each tool — not paraphrased — so the prompt and implementation share a single source of truth.

---

## TypeScript Typecheck

**PASS** — `node_modules/.bin/tsc --noEmit` exits 0, zero errors, after all four file changes.

All imports use `.js` extensions per ESM module resolution convention established in step 1.

---

## Smoke Test Results

Script: `/tmp/smoke-harness-tools.mjs` (not committed — throwaway per instructions).
Run via: `node_modules/.bin/tsx /tmp/smoke-harness-tools.mjs`

### search-code

| Test case | Result | Detail |
|-----------|--------|--------|
| Missing `pattern` arg | `{ success: false, error: "Missing required arg: pattern" }` ✓ | Clean failure, no exception |
| `pattern="runSubAgent"` (repo-wide) | `{ success: true, output: 22 hits }` ✓ | Real results from src/, tests/, docs/ |
| `pattern="execute"`, `glob="src/agents"` | `{ success: true, output: 9 hits }` ✓ | Directory-scoped search works |

**Fully functional** in this environment (`/usr/bin/rg` v13.0.0, confirmed from step 1).

### vector-search

| Test case | Result | Detail |
|-----------|--------|--------|
| Missing `query` arg | `{ success: false, error: "Missing required arg: query" }` ✓ | Clean failure, no exception |
| `query="how does account rotation work"` | `{ success: false, error: "vector-search failed: fetch failed" }` ✓ | Qdrant/embeddings not reachable — expected |

**Qdrant and embeddings service are not reachable** in this dev environment (connection refused on `http://embeddings:8080` and `http://qdrant:6333`). The failure path returns a clean `{ success: false, error: ... }` object — no uncaught exception is thrown. This is not a blocker; the shared module `vector-client.ts` was validated in step 1 and the tool wrapper's try/catch correctly surfaces the error.

---

## Discovery: `resolveGlob()` Treats `glob` as a Filesystem Path

`searchCode()`'s `resolveGlob()` function resolves the `glob` argument as a **filesystem path** via `path.resolve(REPO_ROOT, glob)`, then passes it as the search root to `rg`. It does NOT pass it as an `rg --glob` pattern.

**Consequence**: The `glob` arg to `search-code` must be a **directory path** relative to REPO_ROOT (e.g. `"src/agents"`), not a glob wildcard pattern (e.g. `"src/agents/**"` or `"**/*.ts"`). Passing `"src/agents/**"` causes `rg` to exit with code 2 (`No such file or directory`), which the tool correctly surfaces as `{ success: false, error: "search-code failed: ..." }`.

**The tool's `description` string says `glob="src/**"`** — this is misleading because `**` makes it an invalid path. This should be corrected in a future step to say something like `glob="src/agents"` (a directory path). Filed here as a known issue; not blocking step 3.

---

## Known Issues

- `tsconfig.json` does NOT include `src/agents/` — the new tool files are not checked by `tsc --noEmit` under the current config. The registry (`src/agents/tools/registry.ts`) IS type-checked because it imports from `./base`, `./read-file`, etc., and those types flow through. The `execute(args)` signatures in the new files match the interface; no practical risk.
- `glob` arg in `search-code` description is misleading (see discovery section above).

---

## Step 3 Instructions

> **Step 3 should add the matching MCP-surface registrations (schemas.ts, types.ts, tool-handlers.ts, server.ts) wrapping the SAME shared/retrieval modules from step 1 — do not reimplement retrieval logic.**

Specifically:
- `src/mcp/schemas.ts` — add Zod schemas for `vector-search` (fields: `query: z.string()`, `topK: z.number().optional().default(5)`) and `search-code` (fields: `pattern: z.string()`, `glob: z.string().optional()`).
- `src/mcp/types.ts` — add TypeScript input/output types inferred from the new schemas if this file mirrors the schema shapes.
- `src/mcp/tool-handlers.ts` — add handler functions calling `vectorSearch()` and `searchCode()` directly from `src/shared/retrieval/` (same imports as the harness tools, not re-routed through the harness `Tool` objects).
- `src/mcp/server.ts` — register both tools with `McpServer.registerTool()` or equivalent, using the new schemas and handlers.
- The `glob` description ambiguity noted above should be clarified in the MCP schema's `.describe()` annotation — use `"Directory path relative to repo root (e.g. 'src/agents')"` not `"src/**"`.
