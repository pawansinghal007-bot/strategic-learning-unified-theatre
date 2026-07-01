# Tech Stack

## Runtime & Language

- **Node.js** ≥ 18 (ESM by default — `"type": "module"` in root `package.json`)
- **TypeScript** — used for newer modules in `src/shared/`, `src/llm/*.ts`, `src/policies/`, `src/cli/*.ts`, `src/mcp/`, `src/agents/`. Target: `ES2020`, module resolution: `bundler`.
- **JavaScript (ESM/CJS mix)** — legacy and Electron-facing code uses `.js` (ESM) and `.cjs` (CommonJS). Electron main/preload files are CommonJS (`.cjs`).

## Frontend / Renderer

- **React 19** with JSX (`renderer/` directory)
- **Vite 8** — bundles the renderer; output goes to `electron-ui/dist/`
- **Tailwind CSS 3** + PostCSS — styling via `tailwind.config.js` and `postcss.config.cjs`

## Desktop Shell

- **Electron 42** — main process at `electron-ui/main.cjs`, preload at `electron-ui/preload.cjs`
- **electron-builder** — packaging; produces AppImage (Linux) and NSIS (Windows) via `release/`
- **electron-updater** — OTA auto-update with health-check rollback
- **electron-store** — persists app settings

## Data & Storage

- **better-sqlite3** — local SQLite for the experience DB (`experience.db`) and AI memory (`memory.sql`)
- **keytar** — OS keychain for secret storage
- **AES-256-GCM** + `crypto.scryptSync` — encrypted account store at `~/.vscode-rotator/accounts.enc`

## LLM / AI

- **llama** (node bindings) — local GGUF model inference
- **@xenova/transformers** — local embeddings
- **onnxruntime-node** (optional) — ONNX model runtime
- **@zilliz/milvus2-sdk-node** — Milvus vector DB client
- **@modelcontextprotocol/sdk** — MCP server/client

## Schema & Validation

- **Zod 4** — runtime schema validation
- **AJV 8** — JSON schema validation (governance/enterprise policy)

## CLI

- **Commander 14** — CLI framework (`src/cli.js` entrypoint)

## Utilities

- **chokidar 5** — file watching
- **chalk 5** — terminal colours
- **ora 9** — terminal spinners
- **nanoid 5** — ID generation
- **dotenv** — environment variable loading
- **yaml / gray-matter** — YAML/frontmatter parsing

## Testing

- **Vitest 4** — primary unit/integration test runner. Config: `vitest.config.ts` (TypeScript) and `vitest.config.js` (JS). Coverage via **@vitest/coverage-v8**.
- **Playwright 1.60** — e2e and UI tests. Configs: `playwright.config.ts` (e2e), `playwright.human.config.cjs` (human), `playwright.ui.config.cjs` (UI).
- **Robot Framework** — functional/regression suite under `robot/`
- **@testing-library/react** — React component tests
- **jsdom** — DOM environment for unit tests

## Code Quality

- **SonarQube** — static analysis with `sonar-project.properties`. Scripts under `scripts/sonar-*.mjs`.
- Coverage thresholds (TS config): statements 75%, branches 60%, functions 80%, lines 80%.
- Regression tests in `tests/regression/` are **permanent — never delete them**.

## CI / CD

- GitHub Actions: `.github/workflows/test.yml` (every push), `.github/workflows/release.yml` (tags `v*`), `.github/workflows/chaos.yml` (nightly chaos tests at 02:00 UTC).

---

## Common Commands

```bash
# Install
npm install

# Run unit + static tests (uses mock LLM)
npm test

# Coverage report
npm run coverage

# Full CI gate (coverage + verbose)
npm run test:ci

# Integration tests (real LLM, no mock)
npm run test:integration

# E2E / UI tests (builds first)
npm run test:ui
npm run test:human

# Robot Framework tests
npm run test:robot
npm run test:robot:functional

# Chaos resilience tests
npm run test:chaos

# Build renderer UI
npm run ui:build

# Run Electron app (dev mode)
npm run electron:dev

# Build Electron main process bundle
npm run build:electron-main

# Distribute (Linux AppImage)
npm run dist:linux

# Launch CLI
npm start
# or
npx strategic-learning-unified-theatre --help

# Launch tray app
npm run tray

# SonarQube scan + quality gate
npm run test:sonar

# Validate governance config
npm run validate:governance

# Start MCP server
npm run mcp:server
```

## Environment Variables

- `VSCODE_ROTATOR_MOCK_LLM=1` — mock all LLM calls (used in `npm test`)
- `UNIFIED_THEATRE_ENTERPRISE_CONFIG` — path to enterprise policy override file
- `NODE_OPTIONS=--max-old-space-size=8192` — required for coverage runs
