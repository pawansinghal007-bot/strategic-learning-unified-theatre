# Startup & Environment

## Application Startup (commands, flags, modes)

- CLI package entry point: `src/cli.js`.
  - `npm start` runs `node ./src/cli.js`.
  - Installed binary name is `strategic-learning-unified-theatre`.
  - Uses Commander subcommands for account, daemon, browser, LLM, policy, workspace, storage, and reporting workflows.
- Electron dashboard entry point: `electron-ui/main.cjs`.
  - `npm run electron:dev` runs `npm run ui:build` and then `NODE_ENV=development electron ./electron-ui/main.cjs`.
  - Production packaged Electron metadata points to `electron-ui/main.cjs`.
  - The dashboard creates one main `BrowserWindow` and attaches an embedded browser pane via `BrowserPane`.
  - If `VITE_DEV_SERVER_URL` is set, the window loads that URL and opens DevTools. Otherwise it loads `electron-ui/dist/index.html`.
  - `NODE_ENV=development` loosens renderer CSP `connect-src` to allow localhost HTTP/WebSocket connections.
- Vite renderer commands:
  - `npm run ui:dev` runs `vite`.
  - `npm run ui:build` runs `vite build`.
- Tray app entry point: `electron-tray/main.js`.
  - `npm run tray` runs `electron ./electron-tray/main.js`.
  - This is a separate tray runtime, not the main dashboard window.
- Daemon startup:
  - `strategic-learning-unified-theatre daemon start` spawns `src/daemon/daemon-runner.js` as a detached Node process.
  - The Electron dashboard also starts a `WatcherDaemon` during `app.whenReady()`.
- Test commands:
  - `npm test` runs `VSCODE_ROTATOR_MOCK_LLM=1 NODE_OPTIONS=--max-old-space-size=8192 vitest run`.
  - `npm run test:integration` runs `VSCODE_ROTATOR_MOCK_LLM=0 NODE_OPTIONS=--max-old-space-size=8192 vitest -c vitest.integration.config.js run`.
  - `npm run test:ci` runs `vitest run --coverage --reporter=verbose`.
  - `npm run test:serial` runs `node run-tests.cjs`; `TEST_RUNNER_BIN` may select an allowlisted runner.
  - `npm run test:robot` runs `robot --outputdir robot-results robot/`.
  - Chaos tests run `node ./scripts/chaos/run-chaos.js --scenario <kill-daemon|corrupt-config|burst-load>`.
- Test runner modes:
  - Default Vitest config uses `jsdom`, 10s timeout, and includes `tests`, `src`, `electron-ui`, `renderer`, and `e2e` test patterns.
  - Integration Vitest config uses `jsdom`, 60s timeout, and currently includes `tests/llm/ollama-inference.test.js`.
  - `process.env.VITEST`, `VITEST_WORKER_ID`, or `NODE_ENV=test` are treated by some modules as test mode guards for path isolation or Electron browser-pane behavior.

## Required Environment Variables (table: Variable | Purpose | Example Value)

| Variable | Purpose | Example Value |
| --- | --- | --- |
| `VSCODE_ROTATOR_MOCK_LLM` | Required by scripted Vitest runs to control heavy/native LLM work. Use `1` for normal unit tests; use `0` for the current Ollama integration test script. | `1` |
| `NODE_OPTIONS` | Required by `npm test` and `npm run test:integration` scripts to raise the Node heap for Vitest workers. | `--max-old-space-size=8192` |
| `HOME` | Required for isolated app/e2e test runs that touch persisted state; redirects `.vscode-rotator` files, browser selector overrides, accounts, secrets, logs, and memory DB defaults into a temp home. | `/tmp/unified-theatre-e2e-home` |
| `DB_PATH` | Required only when a test must force the AI memory SQLite file to a specific path instead of the default under `HOME` or the Vitest temp path. | `/tmp/unified-theatre-e2e/ai-memory.db` |
| `VSCODE_ROTATOR_LLM_PROVIDER` | Required only for real local LLM integration when provider selection must be deterministic. Supported values are `ollama` and `node-llama-cpp`. | `ollama` |
| `VSCODE_ROTATOR_OLLAMA_BIN` | Required only when real Ollama integration cannot find `ollama` on `PATH`. `OLLAMA_PATH` is also accepted as a fallback. | `/usr/local/bin/ollama` |
| `VSCODE_ROTATOR_OLLAMA_MODEL` | Required only when real Ollama integration should use a model other than the default `phi3:mini`. | `phi3:mini` |
| `VITE_DEV_SERVER_URL` | Required only for Electron tests that load a live Vite dev server instead of built `electron-ui/dist/index.html`. Also switches the app into Electron dev-load mode. | `http://localhost:5173` |
| `NODE_ENV` | Required only when a test needs development CSP behavior or explicit test-mode behavior. `development` allows localhost renderer connections; `test` activates selected test guards. | `test` |
| `ROTATOR_STATE_DIR` | Required only for tests that need daemon/storage health files isolated from the current working directory. | `/tmp/unified-theatre-state` |
| `TEST_RUNNER_BIN` | Required only for `npm run test:serial` when overriding the default `npx` runner. Must be one of `npm`, `pnpm`, `yarn`, `node`, `npx`, or `vitest`. | `vitest` |
| `ROTATOR_LOG_LEVEL` | Required only when test diagnostics need deterministic log verbosity. Defaults to `info`. | `debug` |
| `ROTATOR_LOG_SINK` | Required only when tests need logs written to file instead of stdout. Defaults to stdout; `file` writes under the real OS home path used by the logger. | `stdout` |
| `ROTATOR_LOG_STACKS` | Required only when tests need stack traces included in structured error logs. | `1` |
| `UNIFIED_THEATRE_ENTERPRISE_CONFIG` | Required only for tests that exercise enterprise policy/config overrides without writing to `/etc/strategic-learning-unified-theatre`. | `/tmp/e2e-enterprise-policy.json` |
| `ROTATOR_CONFIG_STRICT` | Required only when tests need non-strict config behavior. By default, missing/invalid config paths are strict when read directly. | `0` |
| `BRAVE_PATH` | Required only for browser-capture tests that launch Brave and cannot rely on configured `browserPaths.brave`. | `/usr/bin/brave-browser` |
| `FIREFOX_PATH` | Required only for browser-capture tests that launch Firefox and cannot rely on configured `browserPaths.firefox`. | `/usr/bin/firefox` |
| `VSCODE_ROTATOR_CODE_BIN` | Required only for tests that exercise VS Code launch/switch behavior without using the system `code` binary lookup. | `/tmp/fake-code` |
| `OPENAI_API_KEY` | Required only for tests or manual runs that expect OpenAI provider availability to be true. | `sk-test` |
| `GROQ_API_KEY` | Required only for tests or manual runs that expect Groq provider availability to be true. | `gsk-test` |
| `GEMINI_API_KEY` | Required only for tests or manual runs that expect Gemini provider availability to be true. | `test-gemini-key` |
| `PERPLEXITY_API_KEY` | Required only for tests or manual runs that expect Perplexity provider availability to be true. | `pplx-test` |

## Feature Flags & Config Switches

- User config path: `$HOME/.vscode-rotator/config.json`.
- Enterprise override path order:
  - `UNIFIED_THEATRE_ENTERPRISE_CONFIG`
  - `/etc/strategic-learning-unified-theatre/enterprise-policy.json`
  - `/etc/strategic-learning-unified-theatre/enterprise-policy.yaml`
- `policy.features.localDbEnabled`
  - Defaults to `true`.
  - When `false`, local DB/experience DB paths guarded by `assertFeatureEnabled(..., "localDbEnabled")` are blocked.
- `policy.features.browserCaptureEnabled`
  - Defaults to `true`.
  - When `false`, browser capture commands guarded by `assertFeatureEnabled(..., "browserCaptureEnabled")` are blocked.
- `policy.features.llmCommandsEnabled`
  - Defaults to `true`.
  - When `false`, LLM setup/ask commands guarded by `assertFeatureEnabled(..., "llmCommandsEnabled")` are blocked.
- `browserResponsesIngest`
  - Defaults to `true`.
  - When `false`, captured browser response files are not ingested after capture.
- `enhanceSchedule`
  - Defaults to `null`.
  - Tests use `enhanceSchedule.enabled`, `intervalMs`, `goals`, and `platform` to control daemon enhancement scheduling.
- `captureSchedule`
  - Defaults to `{ enabled: false, intervalMs: 900000 }`.
  - Controls scheduled capture behavior in the watcher daemon.
- `vscodeLearn.enabled`
  - Defaults to `false`.
  - Enables VS Code signal collection; `stagedSignalsDir`, `captureSources`, `flushIntervalMs`, `debounceMs`, `maxFileSizeBytes`, and include/exclude patterns affect test fixtures and collection timing.
- `browserPaths`
  - Optional config map for browser executables, including `brave` and `firefox`; env vars can override these at launch time.
- `platformTriggers`
  - Optional domain-to-platform mapping used by browser integration.
- Browser selector override file:
  - `$HOME/.vscode-rotator/browser-selectors.json`.
  - Relevant for e2e mitigation of brittle ChatGPT, Claude, Gemini, and Perplexity DOM selectors.
