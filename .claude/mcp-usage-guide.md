# MCP Local LLM Tools — Usage Guide

## The Problem This Solves

Claude and Codex monthly quota exhausts in 3-4 days because Copilot
chat and Claude API calls are used for tasks the local Qwen3-Coder
handles equally well. This MCP server routes those tasks locally.

## Zero-token tasks (always use local tools)

- Explaining what code does
- Code review and standards check
- Drafting unit tests
- Summarizing a file or module
- Refactoring suggestions within a single file
- Debugging a specific error with full context
- Answering questions about THIS codebase

## Use Claude/Codex for (paid, use sparingly)

- Multi-file architecture decisions spanning > 5 files
- Generating net-new features with no existing pattern to follow
- Tasks requiring web search or external knowledge
- Cases where you tried local and quality wasn't good enough

## How to Use — Fastest Paths

### Keybindings (fastest — no typing needed)

Ctrl+Shift+L → Opens agent chat pre-filled with "#ask-local "
Type your question, Enter. Zero Claude tokens.
Ctrl+Shift+R → Opens agent chat with "#code-review" for current file.
One keypress = full local review of whatever file is open.

### Snippets in Copilot chat (type prefix + Tab)

al + Tab → #ask-local prompt=""
cr + Tab → #code-review filePath=""
lt + Tab → local test draft template
le + Tab → local explain template

### Manual invocation in Copilot agent chat (Ctrl+Shift+I)

#ask-local prompt="What does the gateway singleton pattern do?"
#code-review filePath="src/llm/gateway.ts"
#list-tools

### Natural language (Copilot picks the tool automatically)

"Review this file without using Claude" → routes to #code-review
"Explain this locally" → routes to #ask-local
"Write a test for this, use local model" → routes to #ask-local

## Prerequisites

Docker LLM must be running:
cd /home/pawan/qwen-stack && docker compose up -d llm
Verify: curl http://localhost:8080/health

## Troubleshooting

- Ctrl+Shift+L does nothing: Ctrl+K Ctrl+S → check "ctrl+shift+l" binding
- "Tool not found": Ctrl+Shift+P → "MCP: List Servers" → check server status
- "LLM not reachable": docker compose up -d llm in qwen-stack dir
- "Empty response": check logs/agent-session.ndjson for error entries
- Server logs: View → Output → "unified-theatre-local-llm" dropdown
