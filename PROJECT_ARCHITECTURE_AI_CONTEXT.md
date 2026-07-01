=========================================================
PROJECT ARCHITECTURE SUMMARY
=========================================================

This document was reconciled from the current source tree on 2026-07-01.
Some statements below are [INFERRED] from implementation patterns because the
repo does not encode full historical intent in code comments or docs.

Core Runtime:
- The current architecture is centered on a local-inference harness and agent
  orchestration layer rather than the older Electron UI entrypoint summary.
- The main implementation surfaces are in src/mcp/server.ts,
  src/agents/orchestrator.ts, src/llm/gateway.ts, and src/llm/inference.js.

MCP Layer:
- The repo now exposes MCP tools through src/mcp/server.ts using the McpServer
  SDK.
- Tool registration uses Zod-backed input shapes from src/mcp/schemas.ts and
  handler logic in src/mcp/tool-handlers.ts.
- The current tools are "ask-local", "code-review", and "list-tools".
- This is a new architectural concern relative to the older document and is
  explicitly marked as [INFERRED] in places where the intended long-term MCP
  surface is not fully spelled out in the code.

Agent / Orchestration Layer:
- The agent stack is implemented through src/agents/orchestrator.ts,
  src/agents/pipeline.ts, src/agents/sub-agent.ts, and src/agents/cli.ts.
- Orchestration loads command definitions from the local .claude command set,
  parses pipeline steps, and runs sub-agents with per-step system prompts.
- The CLI entrypoint can invoke orchestrated workflows such as code-review.

LLM Layer:
- Request routing is handled by src/llm/gateway.ts.
- Local inference is implemented in src/llm/inference.js and supports local
  providers such as Ollama and node-llama-cpp.
- Retrieval support is implemented via src/llm/qdrant-client.ts.
- Standing Rules require a Qdrant-only vector-store policy; Milvus is banned.
  This should be treated as architectural policy rather than implementation detail.

Security Overview Layer:
- The repo includes a dedicated security overview subsystem under
  src/security/security-overview/index.ts.
- It provides schema, baseline, suppression, drift, triage, and auto-scan
  helpers for security findings and risk review.

Testing:
- Vitest is the active test runner.
- Current task-state evidence from the repo inventory indicates 299 test files
  and 4943 tests, with coverage reported by Vitest v8.

Rules:
- Qdrant is the only supported vector store; Milvus is not permitted.
- PostgreSQL is the only supported relational store.
- Guard files must be preserved and respected.
- The preload entrypoint is extend-only.
- The Window interface is the canonical integration surface.
- IPC modules should stay lazy-require based unless a change explicitly requires otherwise.
- `.cjs` imports should retain explicit extensions where required.
- Playwright Electron launches should use electron.launch().

=========================================================
CURRENT ARCHITECTURE SNAPSHOT (2026-07-01)
=========================================================

**What changed relative to the older summary:**
- The architecture now centers on MCP tool exposure, agent orchestration, and
  local LLM routing rather than the old Electron-specific summary.
- The MCP layer is now first-class and uses the McpServer SDK with Zod input
  schemas and tool handlers.
- The agent layer parses markdown pipelines and runs sub-agents with reusable
  prompts and tool-calling behavior.
- The LLM layer has explicit local-provider support plus a Qdrant-backed
  retrieval path.
- The security overview subsystem is now a distinct architectural component.

**Architecture impact summary:**
- MCP migration: [INFERRED] the migration from the older server concept to the
  current McpServer + Zod-schema pattern is now reflected in source, but the
  longer-term integration story is not fully encoded in documentation.
- Qdrant-only policy: [CONFIRMED] by the current implementation and current
  standing rules context.
- Security workflow: [CONFIRMED] by the dedicated modules under
  src/security/security-overview/index.ts.

**Source evidence used for this refresh:**
- src/mcp/server.ts
- src/mcp/schemas.ts
- src/mcp/tool-handlers.ts
- src/agents/orchestrator.ts
- src/agents/pipeline.ts
- src/agents/sub-agent.ts
- src/agents/cli.ts
- src/llm/gateway.ts
- src/llm/inference.js
- src/llm/qdrant-client.ts
- src/security/security-overview/index.ts
