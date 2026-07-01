# Project Structure

## Root Layout

```
/
├── src/                    # Core application source (ESM .js + .ts mix)
├── renderer/               # React UI source (JSX, built by Vite)
├── electron-ui/            # Electron main process, preload, IPC handlers (CJS)
├── electron-tray/          # Tray app entrypoint
├── vscode-extension/       # VS Code signal collector extension
├── tests/                  # Unit, integration, regression, smoke tests (Vitest)
├── e2e/                    # Playwright end-to-end tests
├── e2e-design/             # E2E design documents and coverage matrices
├── robot/                  # Robot Framework test suites
├── plugins/                # Runtime plugin examples (browser + LLM adapters)
├── scripts/                # Dev tooling: build, sonar, chaos, governance
├── config/                 # Runtime JSON configs (CI, security governance, update)
├── docs/                   # Sprint scopes, checklists, architecture docs
├── sprints/                # Sprint plan/analysis/snapshot markdown files
├── snapshots/              # Point-in-time sprint completion snapshots
├── coverage/               # Coverage output (lcov, json-summary, html)
├── release/                # Electron-builder output (AppImage, NSIS)
├── build/                  # Build assets (icons)
├── memories/               # Agent session memory logs
└── .kiro/steering/         # AI steering rules (this folder)
```

## `src/` — Core Source Modules

```
src/
├── cli.js                  # CLI entrypoint; binds all Commander commands
├── cli/                    # TypeScript CLI command modules (llm-policy, llm-routing, etc.)
├── commands/               # CLI command implementations grouped by feature
├── accounts/               # Account store, switcher, health, profiles, workspace binding, secret-store
├── daemon/                 # Watcher daemon and daemon-runner (background service)
├── llm/                    # LLM gateway, routing, providers, experience-db, prompt-generator,
│                           #   embeddings, inference, training-exporter, knowledge-graph
├── policies/               # Provider policy, policy presets, sensitive-task rules
├── ai-memory/              # AI operational memory: SQLite DB, repositories, schema (memory.sql)
├── knowledge/              # RAG dedup, ingest pipelines (repository, sprint history)
├── mcp/                    # Model Context Protocol server
├── agents/                 # Agent loop and CLI harness
├── security/               # Security overview, drift, risks, secrets scanning
├── audit/                  # Audit log writer and helpers
├── governance/             # Governance config validation
├── storage/                # Storage monitor, VS Code signal ingestion helpers
├── memory/                 # Memory utilities
├── browser-adapters/       # Browser platform adapter interfaces
├── installer/              # Service installer helpers
├── internal/               # Low-level plumbing: config, paths, journal, git-monitor, reporter
├── shared/                 # Cross-process contracts, schemas, errors, IPC types, logging
│   ├── contracts/          # TypeScript provider contracts
│   ├── errors/             # Typed error classes (base, provider, routing, memory, validation)
│   ├── schemas/            # Provider schema definitions
│   ├── ipc/                # IPC type definitions
│   └── logging/            # Shared logging utilities
├── main/                   # Main-process adapters, IPC wiring, updater
├── renderer/               # Renderer-facing type declarations
├── ui/                     # Provider dashboard HTML + types.d.ts
├── system/                 # System-level utilities
├── profile-templates/      # VS Code profile templates
├── coverage/               # Coverage report UI scripts (DOM-only, excluded from coverage)
└── utils/                  # General utility helpers
```

## `electron-ui/` — Desktop Shell

```
electron-ui/
├── main.cjs                # Electron main process (CJS — primary entry point for packaged app)
├── preload.cjs             # Context bridge / preload (CJS)
├── browser-pane.cjs        # Embedded browser pane wrapper
├── ipc/                    # IPC handler modules (CJS):
│   ├── handlers.cjs        # Core IPC handlers
│   ├── provider-telemetry-handlers.cjs
│   ├── provider-policy-handlers.cjs
│   ├── security-overview-handlers.cjs
│   └── capture-handlers.cjs
├── dist/                   # Vite-built renderer assets (HTML + JS bundles)
└── __tests__/              # Electron UI and IPC unit tests
```

## `renderer/` — React UI

```
renderer/
├── main.jsx                # React app bootstrap
├── App.jsx                 # Root component
├── BrowserPanel.jsx        # Embedded browser panel
├── Logs.jsx                # Log viewer
├── TrainingStatus.jsx      # Training/LLM status panel
├── index.html              # HTML shell
├── components/             # Reusable React components
├── screens/                # Screen-level components
└── styles/                 # CSS / Tailwind styles
```

## `tests/` — Test Suite Layout

```
tests/
├── *.test.js               # Cross-domain unit tests (accounts, CLI, browser, plugin, etc.)
├── sprint*.test.js         # Sprint-scoped smoke and guard tests — permanent
├── regression/             # Regression tests — NEVER delete these
├── e2e/                    # Daemon/rotation/capture end-to-end tests
├── llm/                    # LLM domain tests
├── storage/                # Storage monitor tests
├── cli/                    # CLI-specific tests
├── internal/               # Internal module tests
├── knowledge/              # Knowledge/RAG tests
├── system/                 # System-level tests
├── human/                  # Human-tester Playwright specs
├── ui/                     # UI-layer Playwright specs
├── helpers/                # Shared test helpers
└── fixtures/               # Shared test fixtures
```

## Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Root manifest, scripts, dependencies |
| `vite.config.js` | Vite renderer build (root: `renderer/`, out: `electron-ui/dist/`) |
| `vitest.config.ts` | Primary Vitest config with coverage thresholds |
| `vitest.config.js` | JS-only Vitest config (older coverage setup) |
| `vitest.integration.config.js` | Integration test config (real LLM, no mock) |
| `playwright.config.ts` | E2E Playwright config |
| `playwright.human.config.cjs` | Human-tester Playwright config |
| `playwright.ui.config.cjs` | UI-layer Playwright config |
| `tsconfig.json` | TypeScript config (covers `src/shared/` + error modules) |
| `tailwind.config.js` | Tailwind CSS config |
| `postcss.config.cjs` | PostCSS config |
| `sonar-project.properties` | SonarQube project config |
| `config/security-governance.json` | Security governance rules |
| `config/ci-runtime.json` | CI runtime settings |
| `config/update.json` | Auto-update channel configuration |
| `robot.config.json` | Robot Framework config |
| `PROJECT_ARCHITECTURE_AI_CONTEXT.md` | **Authoritative architecture summary** — read this for current IPC wiring, service layers, and entry points |
| `PROJECT_ARCHITECTURE_BASELINE.md` | Latest architecture baseline snapshot |

## Architecture Conventions

- **IPC contract**: All renderer↔main communication uses an envelope format `{ v, op, payload }` through `window.rotator` (never raw `ipcRenderer`). New IPC channels must be registered in `electron-ui/main.cjs` and exposed via `electron-ui/preload.cjs`.
- **File extension rules**: New backend/service modules → `.ts`; Electron main/preload/IPC → `.cjs`; renderer → `.jsx`; CLI bindings → `.ts` in `src/cli/`.
- **Module boundaries**: `src/shared/` is the only code allowed to cross process boundaries. Domain modules should not directly import from each other's internals.
- **Plugin system**: Browser and LLM plugins are loaded from `plugins/` at runtime. Register new adapters via `src/plugin-browser-registry.js` or `src/plugin-llm-registry.js`.
- **Architecture sync**: When adding new files to `electron-ui/ipc/`, `src/llm/`, `src/policies/`, or `src/cli/`, update `PROJECT_ARCHITECTURE_AI_CONTEXT.md`. See `docs/ARCHITECTURE_SYNC_RULES.md` for the full trigger matrix.
- **Data directory**: All runtime data lives under `~/.vscode-rotator/` (accounts store, daemon PID/log, config, sprints, experience DB).
- **Test environment variable**: Always set `VSCODE_ROTATOR_MOCK_LLM=1` for unit tests. Integration tests use `VSCODE_ROTATOR_MOCK_LLM=0`.
