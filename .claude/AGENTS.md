# Strategic Learning Unified Theatre — Agent Knowledge Base

## Project
- Language: TypeScript, Electron
- Test runner: vitest
- Linter: eslint
- Quality gate: SonarQube at http://localhost:9000
- Local LLM: routed via src/llm/gateway.ts with privacyMode: local-only
- LLM providers available: local, openai, gemini, groq, perplexity
  (only local is active without API keys)

## Paths
- Project root: /home/pawan/vscodeagent/Solution
- Source: src/
- Tests: src/**/*.test.ts (co-located with source files)
- Agent knowledge base: .claude/
- Session logs: logs/agent-session.ndjson
- Scan reports: /home/pawan/qwen-stack/reports/

## Code Standards (summary — see skills/code-standards.md for full detail)
- All exported functions and classes: JSDoc required
- No console.log in src/ — use: import { logger } from '../shared/logging/logger'
- All async functions: try/catch or typed error propagation
- Max function length: 50 lines
- No magic numbers — use named constants
- TypeScript strict mode: no implicit any

## Gateway Rules (IMPORTANT)
- Never call localhost:8080 directly — always use gateway.ask() or gateway.stream()
- Always set constraints.privacyMode = 'local-only' for harness agent requests
- Import: import { gateway } from '../../llm/gateway'

## Available Commands
- code-review: Review a source file against project standards