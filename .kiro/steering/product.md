# Product: Strategic Learning Unified Theatre

**Strategic Learning Unified Theatre** (`strategic-learning-unified-theatre`) is a cross-platform desktop tool for VS Code account rotation and AI-assisted development workflows. It helps developers manage multiple VS Code accounts, automate workspace switching, and build a local knowledge base from their development experience.

## Core Capabilities

- **Account rotation** — securely store multiple VS Code accounts in the OS keychain and hot-swap between them, writing auth blobs and launching VS Code with the correct profile.
- **Background watcher daemon** — continuously monitors account health, schedules rotations, and captures browser sessions.
- **Local Dev-LLM** — offline experience database (`experience.db`) that ingests sprint history, ideas, and mistakes to generate structured prompts for browser-based LLM agents (ChatGPT, Claude, Gemini, etc.).
- **Browser communicator** — automates multi-LLM browser interactions, screen capture, and response ingestion.
- **AI sprint handoff tracker** — captures sprint state (tasks, blockers, token usage) and generates resume prompts for the next AI agent session.
- **Idea store** — structured Markdown-based idea management linked to sprints.
- **Enterprise policy** — IT-enforced fleet-wide configuration via JSON/YAML policy files (allowed platforms, models, feature flags, rate limits).
- **Plugin system** — extensible browser-platform and LLM-provider adapters loaded from `plugins/`.
- **Electron desktop UI** — tray app with status icons, log viewer, provider dashboard, and embedded browser pane.
- **VS Code extension** — signal collector for ingesting workspace data.
- **MCP server** — Model Context Protocol server at `src/mcp/server.ts` for tool integrations.

## User Personas

- Individual developers using multiple VS Code accounts and LLM browser tools.
- Enterprise teams requiring policy-governed LLM provider routing and audit logging.

## Current State

The project is in active sprint-based development (currently in sprint 97+). Architecture evolves incrementally; `PROJECT_ARCHITECTURE_AI_CONTEXT.md` and `PROJECT_ARCHITECTURE_BASELINE.md` track the latest structural changes.
