# Technical Architecture Discovery

## Electron Window Architecture

- Main application window
  - Created in `electron-ui/main.cjs` via `new BrowserWindow(opts)`.
  - Loads the React/Vite dashboard in development from `VITE_DEV_SERVER_URL` or production from `electron-ui/dist/index.html`.
  - Persists window bounds with `electron-store` under `strategic-learning-unified-theatre-ui` (`electron-ui/main.cjs`).
- Embedded browser pane
  - Implemented as an embedded view attached to the main window rather than a separate BrowserWindow.
  - Uses `WebContentsView` when available, with fallback to `BrowserView` (`electron-ui/browser-pane.cjs`).
  - Captures browser platform sessions in persistent partitions named `persist:platform-${platform}`.
  - Controls attach/detach and navigation from the main process, exposing `browser:switchPlatform`, `browser:navigate`, and `browser:setVisible` IPC handlers.
- Preload scripts
  - `electron-ui/preload.cjs` is the main renderer preload script.
    - Exposes safe APIs via `contextBridge.exposeInMainWorld("rotator", ...)` and other namespaces like `providerTelemetry`, `providerPolicy`, `workspacePolicy`, `audit`, `workspaceQuota`, etc.
    - Uses `ipcRenderer.invoke(...)` for request/response IPC and `ipcRenderer.on(...)` for events.
  - `electron-ui/preload-browser.cjs` is the browser-pane preload script.
    - Runs in the embedded platform webview and uses `ipcRenderer.send('capture:response', payload)` to transmit captured AI responses.
    - Detects browser platform by hostname and uses DOM selectors for ChatGPT, Claude, Gemini, and Perplexity.
- Tray app process
  - A separate Electron tray application lives under `electron-tray/main.js`.
  - It builds a native tray menu, monitors account state, and starts its own `WatcherDaemon`.
  - Uses OS-level tray icons and menu interactions, but does not expose the main dashboard window.

## IPC Architecture (table: Channel | Direction | Payload | Handler File)

| Channel                  | Direction       | Payload                                                                           | Handler File                                            |
| ------------------------ | --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `accounts:list`          | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:add`           | renderer → main | account object (`{id,email,agentType,authBlob,profileName}`)                      | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:capture`       | renderer → main | capture params (`email`, `agentType`, `profileName`, `timeoutMs`, `launchEditor`) | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:update`        | renderer → main | `id`, patch object                                                                | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:remove`        | renderer → main | `id`                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:listDetails`   | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:info`          | renderer → main | `id`                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `accounts:health`        | renderer → main | `id`                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `switcher:switch`        | renderer → main | `id`                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `daemon:status`          | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `daemon:pause`           | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `daemon:resume`          | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `git:status`             | renderer → main | `repoPath`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `git:watchedRepos`       | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `git:addRepo`            | renderer → main | `repoPath`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `git:removeRepo`         | renderer → main | `repoPath`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `git:pickDir`            | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `journal:tail`           | renderer → main | `n`                                                                               | `electron-ui/ipc/handlers.cjs`                          |
| `journal:rawMd`          | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `config:get`             | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `config:set`             | renderer → main | patch object                                                                      | `electron-ui/ipc/handlers.cjs`                          |
| `llm:status`             | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `llm:setup`              | renderer → main | options object                                                                    | `electron-ui/ipc/handlers.cjs`                          |
| `llm:ask`                | renderer → main | request object                                                                    | `electron-ui/ipc/handlers.cjs`                          |
| `browser:send`           | renderer → main | prompt payload                                                                    | `electron-ui/ipc/handlers.cjs`                          |
| `browser:login`          | renderer → main | login payload                                                                     | `electron-ui/ipc/handlers.cjs`                          |
| `browser:listResponses`  | renderer → main | options                                                                           | `electron-ui/ipc/handlers.cjs`                          |
| `browser:getResponse`    | renderer → main | `filename`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `browser:clearResponses` | renderer → main | options                                                                           | `electron-ui/ipc/handlers.cjs`                          |
| `browser:listPrompts`    | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `browser:addPrompt`      | renderer → main | prompt object                                                                     | `electron-ui/ipc/handlers.cjs`                          |
| `browser:updatePrompt`   | renderer → main | `id`, updates                                                                     | `electron-ui/ipc/handlers.cjs`                          |
| `browser:deletePrompt`   | renderer → main | `id`                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `browser:runPrompt`      | renderer → main | prompt run payload                                                                | `electron-ui/ipc/handlers.cjs`                          |
| `browser:switchPlatform` | renderer → main | `name`                                                                            | `electron-ui/main.cjs`                                  |
| `browser:setVisible`     | renderer → main | `visible`                                                                         | `electron-ui/main.cjs`                                  |
| `browser:navigate`       | renderer → main | `url`                                                                             | `electron-ui/main.cjs`                                  |
| `capture:done`           | main → renderer | payload object                                                                    | `electron-ui/main.cjs` (event send)                     |
| `browser:navigation`     | main → renderer | `{platform,url}`                                                                  | `electron-ui/browser-pane.cjs` / `electron-ui/main.cjs` |
| `robot:runSuite`         | renderer → main | `opts`                                                                            | `electron-ui/ipc/handlers.cjs`                          |
| `robot:tddCheck`         | renderer → main | `opts`                                                                            | `electron-ui/ipc/handlers.cjs`                          |
| `robot:generateSkeleton` | renderer → main | `filePath`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `robot:runFile`          | renderer → main | `filePath`, `opts`                                                                | `electron-ui/ipc/handlers.cjs`                          |
| `robot:listFiles`        | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `robot:readFile`         | renderer → main | `filePath`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `robot:openFile`         | renderer → main | `filePath`                                                                        | `electron-ui/ipc/handlers.cjs`                          |
| `robot:pickSourceFile`   | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `robot:pickRobotFile`    | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `app:version`            | renderer → main | none                                                                              | `electron-ui/ipc/handlers.cjs`                          |
| `app:openUrl`            | renderer → main | `url`                                                                             | `electron-ui/ipc/handlers.cjs`                          |
| `health:get`             | renderer → main | none                                                                              | `electron-ui/main.cjs` / `src/accounts/health.js`       |
| `providerTelemetry:*`    | renderer → main | provider name / limit                                                             | `electron-ui/ipc/provider-telemetry-handlers.cjs`       |
| `providerPolicy:*`       | renderer → main | preset name / provider / mode                                                     | `electron-ui/ipc/provider-policy-handlers.cjs`          |
| `workspacePolicy:*`      | renderer → main | workspaceId / patch                                                               | `electron-ui/ipc/workspace-policy-handlers.cjs`         |
| `workspaceContext:*`     | renderer → main | workspaceId / payload                                                             | `electron-ui/ipc/workspace-policy-handlers.cjs`         |
| `workspaceRouting:*`     | renderer → main | workspaceId / filter / bucket                                                     | `electron-ui/ipc/workspace-routing-handlers.cjs`        |
| `workspaceReport:save`   | renderer → main | `workspaceId`, format, filter                                                     | `electron-ui/ipc/workspace-report-handlers.cjs`         |
| `audit:*`                | renderer → main | limit / filter                                                                    | `electron-ui/ipc/audit-handlers.cjs`                    |
| `workspaceApproval:*`    | renderer → main | workspaceId / status / review data                                                | `electron-ui/ipc/workspace-approval-handlers.cjs`       |
| `workspaceQuota:*`       | renderer → main | workspaceId / payload                                                             | `electron-ui/ipc/workspace-policy-handlers.cjs`         |

## State Persistence Model

- Electron store
  - `electron-ui/main.cjs` uses `electron-store` to persist `windowBounds` for the main dashboard window.
- Encrypted JSON files
  - Account metadata persisted via `src/accounts/store.js` in `~/.vscode-rotator/accounts.enc`.
  - Secret auth blobs persisted via OS keychain `keytar` or encrypted fallback file `~/.vscode-rotator/secrets.enc` in `src/accounts/secret-store.js`.
  - Configuration persisted in `~/.vscode-rotator/config.json` via `src/internal/config.js`.
  - Audit log persisted in JSON via `src/audit/audit-log.ts`.
  - Workspace policy overrides persisted in JSON via `src/policies/workspace-policy.ts`.
  - Local LLM workspace data persisted in `~/.unified-ai-workspace` via `src/llm/storage.ts`.
- SQLite
  - AI memory database stored in SQLite using `better-sqlite3` at `~/.vscode-rotator/ai-memory.db` or `DB_PATH` (`src/ai-memory/memory-db.js`).
- File system / OS files
  - Startup health state stored in `health-state.json` under `app.getPath('userData')` in `electron-ui/main.cjs`.
  - Config overrides loaded from `/etc/strategic-learning-unified-theatre/enterprise-policy.json` or YAML via `src/internal/config.js`.
- In-memory state
  - Browser pane view cache in `electron-ui/browser-pane.cjs` (`this.viewCache`).
  - `WatcherDaemon` and `mainLogger` internal runtime state in `electron-ui/main.cjs`.
  - Preload-exposed functions are stateless wrappers around IPC.
- No browser `localStorage` usage detected in repository search, indicating state is not persisted in renderer localStorage.

## External Integrations

- OS secret storage
  - Uses `keytar` for secure secret storage in `src/accounts/secret-store.js`.
  - Falls back to encrypted local file storage if OS keychain is unavailable.
- Electron auto-updater
  - `electron-updater` configured in `electron-ui/main.cjs` with generic `build.publish.url` from `package.json`.
  - Uses `autoUpdater` events and startup health checking in `electron-ui/main.cjs`.
- Embedded AI platform browsing
  - Browser pane loads external URLs for ChatGPT, Claude, Gemini, and Perplexity (`electron-ui/browser-pane.cjs`).
  - `electron-ui/preload-browser.cjs` injects capture logic into those pages.
- Filesystem and app data
  - Reads/writes config, audit logs, accounts, secrets, and profile artifacts under `~/.vscode-rotator` and `~/.unified-ai-workspace`.
  - Uses `shell.openExternal` and `shell.openPath` for file and URL actions (`electron-ui/ipc/handlers.cjs`).
- Git integration
  - `src/internal/git-monitor.js` provides git status and watched repo support via IPC in the dashboard.
- VS Code auth file management
  - Writes auth blobs to provider-specific auth paths resolved by `resolveAuthPath` in `src/accounts/switcher.js`.
  - Closes and relaunches VS Code processes via `src/vscode.js` from the switcher.
- Enterprise policy file overrides
  - Loads `/etc/strategic-learning-unified-theatre/enterprise-policy.{json,yaml}` in `src/internal/config.js`.
- Native OS tray and menu
  - Tray app uses Electron `Tray`, `Menu`, and `nativeImage` in `electron-tray/main.js`.
- Node native modules
  - SQLite via `better-sqlite3`.
  - OS keychain via `keytar`.
  - Electron store via `electron-store`.

## Confidence Log

| Conclusion                                                                                               | Evidence                                                                                                         | Confidence | Assumptions                                                                     |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| Main window is a single BrowserWindow with an embedded browser pane child view.                          | `electron-ui/main.cjs`, `electron-ui/browser-pane.cjs`                                                           | High       | No additional BrowserWindow creation was found in the main app code.            |
| Main preload script is `electron-ui/preload.cjs`; browser pane uses `electron-ui/preload-browser.cjs`.   | `electron-ui/main.cjs`, `electron-ui/browser-pane.cjs`, `electron-ui/preload.cjs`                                | High       | Preload paths are explicitly set in code.                                       |
| IPC uses both plain `ipcMain.handle` handlers and envelope-based contract channels.                      | `electron-ui/main.cjs`, `src/main/ipc/ipcAdapter.ts`, `src/shared/ipc/contract.ts`                               | High       | Contract channels are defined and registered separately from standard handlers. |
| Accounts and secrets are persisted as encrypted JSON, not in renderer localStorage.                      | `src/accounts/store.js`, `src/accounts/secret-store.js`, grep search for localStorage                            | High       | No localStorage usage was found in repository.                                  |
| AI memory is stored in SQLite via `better-sqlite3`.                                                      | `src/ai-memory/memory-db.js`                                                                                     | High       | The file directly imports and initializes SQLite.                               |
| Desktop integrations include Electron auto-update, keytar, shell open, git monitor, and OS policy files. | `electron-ui/main.cjs`, `src/accounts/secret-store.js`, `electron-ui/ipc/handlers.cjs`, `src/internal/config.js` | High       | These integrations are explicit in code.                                        |
| `browser:*` IPC manages embedded AI platform navigation and visibility.                                  | `electron-ui/main.cjs`, `electron-ui/preload.cjs`                                                                | High       | Handlers and preload API are both present.                                      |
| `provider*`, `workspace*`, and `audit*` IPC namespaces are handled by specialized IPC files.             | `electron-ui/preload.cjs`, `electron-ui/ipc/*.cjs`                                                               | Medium     | Exact implementation files are referenced by namespace naming and repo search.  |
| Electron tray app is a separate runtime from the main dashboard app.                                     | `electron-tray/main.js`                                                                                          | Medium     | It is a distinct entrypoint and not loaded from the main dashboard process.     |
