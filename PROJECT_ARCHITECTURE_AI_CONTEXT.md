=========================================================
PROJECT ARCHITECTURE SUMMARY
=========================================================

This document was last updated: 2026-07-03 (Sprint 106).
It is reconciled from the current source tree. Statements are tagged:
  [CONFIRMED] — docs and code agree
  [INFERRED]  — docs exist, code not re-checked this sprint
  [UNVERIFIED] — neither docs nor code confirmed

**Last verified: Sprint 106**

---

Core Runtime:

- The current architecture is centered on a local-inference harness and agent
  orchestration layer rather than the older Electron UI entrypoint summary.
- The main implementation surfaces are in src/mcp/server.ts,
  src/agents/orchestrator.ts, src/llm/gateway.ts, and src/llm/inference.js.

---

MCP Layer: [CONFIRMED]

- The repo exposes MCP tools through src/mcp/server.ts using the McpServer
  SDK (migrated from the deprecated `Server` + `setRequestHandler` pattern in
  Sprint 99; see Sprint 99 timeline entry for details).
- Tool registration uses Zod-backed input shapes from src/mcp/schemas.ts and
  handler logic in src/mcp/tool-handlers.ts.

**Current MCP tools (5 as of Sprint 106):**
  - "ask-local"       — send a prompt to the local LLM
  - "code-review"     — run a code review on a source file via the local LLM
  - "list-tools"      — list available harness tools and pipeline commands
  - "vector-search"   — semantic search via Qdrant + embeddings (added Sprint 106)
  - "search-code"     — lexical/regex search via ripgrep (added Sprint 106)

Both `vector-search` and `search-code` delegate to the shared retrieval layer
at src/shared/retrieval/ — see the Shared Retrieval Layer section below.

- MCP stdio protocol handshake verified via scripts/verify-mcp-stdio.mjs with
  real JSON-RPC messages exchanged (initialize, tools/list, tools/call).
  Confidence: [CONFIRMED] per Sprint 101 verification + Sprint 106 re-run
  (5-tool smoke test, exit code 0).

---

Agent / Harness Tool-Calling Layer: [CONFIRMED]

**IMPORTANT — this is NOT native OpenAI/Qwen JSON tool-calling:**
The harness agent loop in src/agents/sub-agent.ts uses a custom
text-protocol tool-calling scheme based on `[TOOL:name]` markers in model
output, NOT the native OpenAI/Anthropic/Qwen JSON function-calling format
(`tool_calls` array in the chat completion response). Despite
`LLAMA_ARG_JINJA=1` being set in the Docker Compose file (which enables
Jinja template rendering for the model), the harness does NOT use the
model's native tool-call output format. It parses plain-text `[TOOL:...]`
markers from assistant output and dispatches to registered Tool objects.
This has caused confusion in prior sessions — treat this distinction as
architectural policy, not an implementation detail.

- The agent stack is implemented through src/agents/orchestrator.ts,
  src/agents/pipeline.ts, src/agents/sub-agent.ts, and src/agents/cli.ts.
- Orchestration loads command definitions from the local .claude command set,
  parses pipeline steps, and runs sub-agents with per-step system prompts.
- The CLI entrypoint can invoke orchestrated workflows such as code-review.

**Harness tool registry** (src/agents/tools/registry.ts):
Tools are registered via `tools.set(name, toolImpl)`. Current tools:
  - "read-file"     — read a file from the workspace (src/agents/tools/read-file.ts)
  - "vector-search" — semantic search (src/agents/tools/vector-search.ts, added Sprint 106)
  - "search-code"   — lexical/regex search (src/agents/tools/search-code.ts, added Sprint 106)

**Tool-loop error propagation fix (Sprint 106):**
`executeToolCall` in sub-agent.ts previously silently forwarded empty output
on tool failure (result.success === false). Fixed: failed tool calls now emit
`[TOOL ERROR:name] <message>` so the agent loop can surface the failure
rather than proceeding with an empty tool result.

---

Shared Retrieval Layer (NEW — Sprint 106): [CONFIRMED]

src/shared/retrieval/ is a new first-class architectural module providing a
DRY, shared implementation for retrieval operations used by both the harness
tool surface and the MCP tool surface. Neither surface contains retrieval
logic directly; both delegate to this layer.

  src/shared/retrieval/vector-client.ts
    - `embed(text)` — calls EMBEDDINGS_URL (configurable via env) to get an
      embedding vector.
    - `vectorSearch(query, topK)` — calls embed(), queries Qdrant for nearest
      neighbours, returns VectorSearchResult[].
    - Logs via "retrieval.vector-search" logger namespace.

  src/shared/retrieval/code-search.ts
    - `resolveGlob(dir)` — resolves a directory path with a path-traversal
      guard (rejects paths escaping the repo root).
    - `searchCode(pattern, glob?)` — shells out to `rg --json`, parses match
      lines (skipping summary/malformed lines) into CodeSearchHit[], capped
      at 50 hits.
    - Logs via "retrieval.code-search" logger namespace.

**The two tool surfaces and their relationship to this layer:**

  Harness surface (text-protocol `[TOOL:...]` dispatch):
    src/agents/tools/vector-search.ts  →  src/shared/retrieval/vector-client.ts
    src/agents/tools/search-code.ts    →  src/shared/retrieval/code-search.ts

  MCP surface (McpServer.registerTool() / JSON-RPC):
    src/mcp/tool-handlers.ts handleVectorSearch()  →  src/shared/retrieval/vector-client.ts
    src/mcp/tool-handlers.ts handleSearchCode()    →  src/shared/retrieval/code-search.ts

Both surfaces share the same underlying retrieval logic. Adding a new
retrieval capability means implementing it once in src/shared/retrieval/,
then wiring thin wrappers on each surface.

---

LLM Layer: [CONFIRMED]

- Request routing is handled by src/llm/gateway.ts.
- Local inference is implemented in src/llm/inference.js and supports local
  providers such as Ollama and node-llama-cpp.
- Retrieval support is implemented via src/llm/qdrant-client.ts (existing
  low-level Qdrant client) and the higher-level src/shared/retrieval/ layer
  (Sprint 106).
- Standing Rules require a Qdrant-only vector-store policy; Milvus is banned.
  This should be treated as architectural policy rather than implementation
  detail.

---

Security Overview Layer: [INFERRED]

- The repo includes a dedicated security overview subsystem under
  src/security/security-overview/index.ts.
- It provides schema, baseline, suppression, drift, triage, and auto-scan
  helpers for security findings and risk review.

---

Testing: [CONFIRMED]

- Vitest is the active test runner.
- As of Sprint 106: 301 test files / 5,002 tests.
- Coverage (v8): 94.97% statements / 92.56% branches / 93.17% functions /
  95.13% lines — all above the vitest.config.ts thresholds (75/60/80/80).
- vitest.test-ci.config.ts excludes sprint91/sprint92 guard tests from the
  main test:ci run; they require a prior coverage generation pass and are
  run separately via coverage:guarded.

---

Rules:

- Qdrant is the only supported vector store; Milvus is not permitted.
- PostgreSQL is the only supported relational store.
- Guard files must be preserved and respected.
- The preload entrypoint is extend-only.
- The Window interface is the canonical integration surface.
- IPC modules should stay lazy-require based unless a change explicitly
  requires otherwise.
- `.cjs` imports should retain explicit extensions where required.
- Playwright Electron launches should use electron.launch().

---

=========================================================
CURRENT ARCHITECTURE SNAPSHOT (2026-07-03 — Sprint 106)
=========================================================

**What changed relative to the prior summary (Sprint 101):**

1. Shared Retrieval Layer added (src/shared/retrieval/) — new first-class
   module, see dedicated section above. This is the most significant
   structural addition since Sprint 99's MCP migration.

2. Both tool surfaces (harness text-protocol and MCP JSON-RPC) now expose
   vector-search and search-code, both backed by the shared retrieval layer.
   Tool inventory expanded from 1 harness / 3 MCP to 3 harness / 5 MCP.

3. Harness tool-loop error propagation fixed — [TOOL ERROR:name] now emitted
   on tool failure instead of silent empty-output forwarding.

4. Text-protocol vs. JSON tool-calling clarification added explicitly to this
   document to prevent recurring confusion about LLAMA_ARG_JINJA=1.

**Architecture impact summary:**

- Shared retrieval layer: [CONFIRMED] — src/shared/retrieval/ exists and is
  tested at 100% statement coverage (vector-client.ts) / 97.56% statements
  (code-search.ts).
- MCP tool count: [CONFIRMED] — smoke test confirms 5 tools returned by
  tools/list.
- Harness tool count: [CONFIRMED] — registry.ts registers 3 tools.
- Qdrant-only policy: [CONFIRMED] by current implementation and Standing Rules.
- Text-protocol harness: [CONFIRMED] — sub-agent.ts parses [TOOL:...] markers;
  no JSON function-call parsing present in the harness loop.

**Source evidence used for this refresh:**

- src/shared/retrieval/vector-client.ts (new Sprint 106)
- src/shared/retrieval/code-search.ts (new Sprint 106)
- src/agents/tools/vector-search.ts (new Sprint 106)
- src/agents/tools/search-code.ts (new Sprint 106)
- src/agents/tools/registry.ts (modified Sprint 106)
- src/agents/sub-agent.ts (modified Sprint 106)
- src/mcp/server.ts (modified Sprint 106)
- src/mcp/tool-handlers.ts (modified Sprint 106)
- src/mcp/schemas.ts (modified Sprint 106)
- src/mcp/types.ts (modified Sprint 106)
- src/agents/orchestrator.ts
- src/agents/pipeline.ts
- src/agents/cli.ts
- src/llm/gateway.ts
- src/llm/inference.js
- src/llm/qdrant-client.ts
- src/security/security-overview/index.ts
- scripts/verify-mcp-stdio.mjs (Sprint 101 + Sprint 106 smoke re-run)
