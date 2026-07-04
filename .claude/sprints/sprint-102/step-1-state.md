# Sprint 106 — Step 1 State
Date: 2026-07-03
Sprint: 106 (state file stored under sprint-102/ per task instructions)

---

## Files Created / Modified

| File | Action | Description |
|------|--------|-------------|
| `src/shared/retrieval/vector-client.ts` | **Created** | Shared vector-search layer: `embed()` calls EMBEDDINGS_URL, `vectorSearch()` queries Qdrant, maps results to `VectorSearchResult[]`, logs via `retrieval.vector-search` |
| `src/shared/retrieval/code-search.ts` | **Created** | Shared code-search layer: `resolveGlob()` with path-traversal guard, `searchCode()` shells out to `rg --json`, parses match lines into `CodeSearchHit[]`, logs via `retrieval.code-search` |
| `src/agents/sub-agent.ts` | **Modified** | Fixed `executeToolCall` to emit `[TOOL ERROR:name]` on `result.success === false` instead of silently forwarding `result.output` (which was `""` on failure) |

---

## Logger Convention

**Import path** (relative from `src/shared/retrieval/`):
```ts
import { logger } from "../logging/logger.js";
```
Note: `.js` extension required for ESM module resolution (TypeScript `"moduleResolution": "bundler"` with `"module": "ESNext"`).

**Call signature** — matches existing usage across the codebase:
```ts
logger.info("event.name", { key: value, ... });
logger.warn("event.name", { key: value, ... });
logger.error("event.name", { key: value, ... });
```
Single named export `logger` with three methods (`info`, `warn`, `error`), each taking `(message: string, context?: unknown)`. The `message` field is used as the structured log event name (e.g. `"retrieval.vector-search"`).

---

## REPO_ROOT / Project-Root Convention

- `orchestrator.ts` uses `path.resolve(process.cwd(), ".claude")` as `CLAUDE_DIR` — base is `process.cwd()`.
- `read-file.ts` uses `process.env.PROJECT_ROOT ?? path.resolve(process.cwd())` as `PROJECT_ROOT`.
- **`code-search.ts` follows the same env-var pattern:**
  ```ts
  const REPO_ROOT = path.resolve(process.env.REPO_ROOT ?? process.cwd());
  ```
  This is consistent with `read-file.ts`'s `PROJECT_ROOT` pattern and `orchestrator.ts`'s `process.cwd()` base. No hardcoded path.

---

## ripgrep Availability

**CONFIRMED available** — `/usr/bin/rg` v13.0.0 present in runtime PATH.

No Dockerfile changes needed. `searchCode()` can shell out to `rg` without further setup.

---

## TypeScript Typecheck Result

**PASS** — `node_modules/.bin/tsc --noEmit` exits 0, zero errors.

One type error was encountered and fixed during this step:

> `src/shared/retrieval/code-search.ts:108`: `TS2367` — comparison `execErr.code === 1` was unintentional because `NodeJS.ErrnoException.code` is `string | undefined`, not `number`.

**Fix applied**: Normalised via `String(execErr.code ?? "") === "1"` before comparison, and stored as `const exitCode` for reuse in the error message.

---

## Test Results

Ran:
- `tests/agents/sub-agent.test.ts` (12 tests)
- `tests/agents/tools/read-file.test.ts` (9 tests)
- `tests/agents/registry.test.ts` (11 tests)

**Result: 32/32 passed — no failures, no updates required.**

No existing test asserted the literal `[TOOL RESULT:...]` or `[TOOL ERROR:...]` string formats, so the `executeToolCall` fix required zero test changes. The sub-agent tests mock `tool.execute` and assert on `result.success` / `result.output` at the `runSubAgent` boundary, not on the intermediate prompt string.

---

## Known Issues / Notes

- `tsconfig.json` `include` covers `src/shared/**/*` which picks up the new `src/shared/retrieval/` files automatically — no tsconfig change was needed.
- `tsconfig.json` does NOT include `src/agents/` — TypeScript types for agent files (e.g. `sub-agent.ts`) are not checked by `tsc --noEmit` under the current config. The fix to `sub-agent.ts` is JavaScript-safe; no type issues were introduced there.
- No `typecheck` script exists in `package.json`. Typecheck is invoked directly as `node_modules/.bin/tsc --noEmit`.

---

## Step 2 Instructions

> **Step 2 should now build `src/agents/tools/vector-search.ts` and `src/agents/tools/search-code.ts` wrapping these shared modules, and register them in `src/agents/tools/registry.ts`.**

Specifically:
- `src/agents/tools/vector-search.ts` — thin `Tool` wrapper calling `vectorSearch()` from `src/shared/retrieval/vector-client.ts`. Parse `query` and optional `topK` from tool args.
- `src/agents/tools/search-code.ts` — thin `Tool` wrapper calling `searchCode()` from `src/shared/retrieval/code-search.ts`. Parse `pattern` and optional `glob` from tool args.
- `src/agents/tools/registry.ts` — import and `registerTool()` both new tools alongside the existing `readFileTool`.
- Both tools should also be registered on the MCP surface in `src/mcp/server.ts` using the existing `McpServer.registerTool()` + Zod schema pattern from `src/mcp/schemas.ts`.
