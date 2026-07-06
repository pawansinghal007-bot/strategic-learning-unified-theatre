# Strategic Learning Unified Theatre Architecture Index

This index summarizes the current repository layout after Reorg Sprint 0.5.

## Top-Level Runtime

- `src/cli.js` - Command-line entrypoint and command binder.
- `src/commands/` - CLI command modules grouped by feature surface.
- `src/main/` - Main-process adapters and IPC-facing application glue.
- `src/shared/` - Shared contracts and constants used across process boundaries.
- `src/renderer/` - Renderer-facing shared types used by desktop UI surfaces.

## Accounts

`src/accounts/` owns account persistence, auth metadata, rotation decisions, profiles, and workspace binding.

- `src/accounts/store.js` - Account store and account persistence API.
- `src/accounts/schema.js` - Account validation schemas and agent type definitions.
- `src/accounts/health.js` - Account, daemon, and local LLM health aggregation.
- `src/accounts/switcher.js` - Account switching service and atomic auth-file updates.
- `src/accounts/profile-manager.js` - Profile creation and profile-specific account support.
- `src/accounts/workspace.js` - Workspace-to-profile binding helpers.
- `src/accounts/secret-store.js` - Secret persistence and legacy secret migration.

## Storage

`src/storage/` owns file indexing, storage snapshots, and VS Code signal ingestion helpers.

- `src/storage/storage-monitor.js` - Storage path scanner and storage index snapshot writer.
- `src/storage/vscode-learn-utils.js` - VS Code staged-signal frontmatter and document parsing utilities.
- `vscode-extension/collector.js` - VS Code signal collector used by the extension.

## LLM

`src/llm/` owns local Dev-LLM orchestration, document ingestion, prompt generation, and related knowledge stores.

- `src/llm/local-llm.js` - Local LLM setup, status, document ingestion, mistake import, and prompt helper facade.
- `src/llm/experience-db.js` - SQLite-backed LLM experience store.
- `src/llm/prompt-generator.js` - Prompt context assembly and prompt rendering.
- `src/llm/mistake-tracker.js` - Mistake capture and retrieval helpers.
- `src/llm/document-ingester.js` - Document chunking and ingestion pipeline.
- `src/llm/knowledge-graph.js` - Knowledge graph/report generation.
- `src/llm/training-exporter.js` - Training data export from captured experience.
- `src/llm/embeddings.js` - Embedding encoding, similarity, clustering, and related search helpers.
- `src/llm/inference.js` - Local inference provider selection and runtime integration.

## AI Memory

`src/ai-memory/` owns durable operational memory for sprint state, handoff state, lessons, decisions, baselines, and command history.

- `src/ai-memory/memory-db.js` - AI memory database bootstrap and shared connection.
- `src/ai-memory/memory.sql` - Active AI memory schema.
- `src/ai-memory/repositories/` - Repository classes for sprint state, handoffs, lessons, decisions, test baselines, and commands.
- `src/ai-memory/legacy/` - Archived legacy AI memory SQL snapshots such as `memory.pre-s3.backup.sql`.

## Internal

`src/internal/` owns low-level plumbing helpers that are shared by domains but are not domain logic themselves.

- `src/internal/config.js` - Runtime configuration defaults, validation, loading, and saving.
- `src/internal/paths.js` - Auth-path and VS Code executable resolution.
- `src/internal/journal.js` - Progress journal writer and tail reader.
- `src/internal/git-monitor.js` - Git status parsing and repository monitoring helpers.
- `src/internal/reporter.js` - Journal-backed reporting helpers.

## Daemon

`src/daemon/` owns background service entrypoints and watcher lifecycle code.

- `src/daemon/watcher.js` - Watcher daemon, rotation loop, capture scheduling, and enhance scheduling.
- `src/daemon/daemon-runner.js` - Long-running daemon process entrypoint.

## Electron UI

`electron-ui/` owns the desktop UI shell, preload surface, IPC handlers, and browser-pane integration.

- `electron-ui/main.cjs` - Electron main process and application window lifecycle.
- `electron-ui/ipc/` - Main-process IPC handler modules.
- `electron-ui/dist/` - Built renderer assets and HTML shell.
- `electron-ui/browser-pane.cjs` - Browser pane wrapper used by capture flows.
- `electron-ui/__tests__/` - Electron UI and IPC tests.

## Electron Tray

`electron-tray/` owns the tray application entrypoint and tray-specific assets.

- `electron-tray/main.js` - Tray process entrypoint and daemon status controls.
- `electron-tray/assets/` - Tray icon assets.

## Renderer

`src/renderer/` owns renderer-facing shared types that are consumed by UI surfaces.

- `src/renderer/types/` - Type declarations for Electron preload and renderer APIs.

## Tests

`tests/` owns unit, integration, regression, and e2e coverage. Domain-specific tests live under matching subfolders where practical.

- `tests/storage/` - Storage monitor and VS Code collector tests.
- `tests/llm/` - LLM domain tests including local LLM, embeddings, Ollama inference, and related search.
- `tests/e2e/` - End-to-end daemon, rotation, capture, and scheduling tests.
- `tests/regression/` - Regression tests for previously fixed behavior.
- `tests/fixtures/` - Shared test fixtures.
- Root-level `tests/*.test.js` - Cross-domain, CLI, account, config, browser, plugin, and infrastructure tests.

## Cross-Reference Notes

- Account health now imports internal path/config helpers from `src/internal/`.
- Daemon consumers should import `WatcherDaemon` from `src/daemon/watcher.js`.
- CLI daemon startup resolves `src/daemon/daemon-runner.js`.
- Local LLM consumers should import from `src/llm/local-llm.js`.
- Storage consumers should import storage indexing from `src/storage/storage-monitor.js`.
- AI memory schema references should use `src/ai-memory/memory.sql`; pre-S3 schema snapshots belong under `src/ai-memory/legacy/`.

## Shared Retrieval Layer (NEW — Sprint 106, expanded Sprint 107)

`src/shared/retrieval/` owns shared retrieval logic used by both the harness tool surface and MCP tool surface.

- `src/shared/retrieval/vector-client.ts` - Vector search via Qdrant + embeddings (added Sprint 106).
- `src/shared/retrieval/code-search.ts` - Lexical/regex search via ripgrep (added Sprint 106).
- `src/shared/retrieval/router.ts` - Heuristic-based retrieval strategy selection (added Sprint 107).
- `src/shared/retrieval/format.ts` - Unified retrieval result format (added Sprint 107).

**Relationship to tool surfaces:**

- Harness surface (`src/agents/tools/`):
  - `vector-search.ts` → `vector-client.ts`
  - `search-code.ts` → `code-search.ts`
  - `retrieve.ts` → `router.ts` (added Sprint 107)

- MCP surface (`src/mcp/`):
  - `handleVectorSearch()` → `vector-client.ts`
  - `handleSearchCode()` → `code-search.ts`
  - `handleRetrieve()` → `router.ts` (added Sprint 107)

The retrieval strategy router (`router.ts`) heuristically selects between code-search and vector-search:

- Path-like queries (contains '/' AND ends in file extension) → code-search
- Symbol-like queries (contains '/' OR camelCase/PascalCase) → vector-search
- Default → code-search"}

## Governance / Audit (NEW — Sprint 108)

- `docs/tool-mandates.md` — Single source of truth for tool boundaries, authority levels, and external effect assessments. Documents known asymmetries (e.g., read-file is harness-only with no MCP mandate) and security fixes applied this sprint (path-traversal guard, subprocess flag-injection fix, PROJECT_ROOT/REPO_ROOT unification).
- `src/shared/audit/decision-receipt.ts` — Decision receipt logger for audit trail of retrieval strategy choices. Captures strategy selection point with alternatives considered, caller identity (currently "unknown-mcp-client" placeholder), timestamp, and decision metadata. Wired to the retrieve() router only (not MCP surface, not error paths yet — future sprint).
"}
