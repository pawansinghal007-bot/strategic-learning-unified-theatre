# Data Stores & Reset Strategy

## File System Locations (table: Store Type | Path | Format)

| Store Type | Path | Format |
| --- | --- | --- |
| Renderer localStorage | None detected | Not used for persistence |
| Account metadata | `$HOME/.vscode-rotator/accounts.enc` | Encrypted JSON blob |
| Secret fallback store | `$HOME/.vscode-rotator/secrets.enc` | Encrypted JSON blob; only used when OS keychain/keytar is unavailable or fails |
| User config | `$HOME/.vscode-rotator/config.json` | JSON |
| Enterprise config override | `$UNIFIED_THEATRE_ENTERPRISE_CONFIG` or `/etc/strategic-learning-unified-theatre/enterprise-policy.{json,yaml}` | JSON or YAML |
| Browser response captures | `$HOME/.vscode-rotator/browser-responses/*.md` | Markdown |
| Browser Playwright storage state | `$HOME/.vscode-rotator/browser-profiles/<platform>/storage-state.json` | Playwright storage-state JSON |
| Browser selector overrides | `$HOME/.vscode-rotator/browser-selectors.json` | JSON |
| Prompt library | `$HOME/.vscode-rotator/prompt-library.json` | JSON |
| Browser send throttle state | `$HOME/.vscode-rotator/platform-last-send.json` | JSON |
| Storage monitor index | `$HOME/.vscode-rotator/storage-index.json` | JSON |
| Storage monitor snapshot | `$HOME/.vscode-rotator/storage-snapshot.json` | JSON |
| Daemon/storage health state override | `$ROTATOR_STATE_DIR/.vscode-rotator/daemon.pid`, `$ROTATOR_STATE_DIR/.vscode-rotator/storage-snapshot.json` | PID text file / JSON |
| Daemon runtime files | `$HOME/.vscode-rotator/daemon.pid`, `$HOME/.vscode-rotator/daemon.log` | PID text file / JSONL-ish log |
| Progress journal | `$HOME/.vscode-rotator/PROGRESS.md` | Markdown |
| Cooldowns | `$HOME/.vscode-rotator/cooldowns.json` | JSON |
| Switch lock | `$HOME/.vscode-rotator/switch.lock` | PID text file |
| Handoff sprints | `$HOME/.vscode-rotator/sprints/*.json` | JSON |
| Ideas | `<git-root-or-cwd>/.vscode-rotator/ideas/*.md` | Markdown with frontmatter |
| AI memory | `$DB_PATH` or `$HOME/.vscode-rotator/ai-memory.db` | SQLite via `better-sqlite3` |
| AI memory sidecars | Same directory as `ai-memory.db` | SQLite WAL/SHM files |
| Experience DB | `$HOME/.vscode-rotator/experience.db` | JSON store despite `.db` suffix |
| Local model files | `$HOME/.vscode-rotator/models/*` | Model files, usually `.gguf` |
| Knowledge graph export | `$HOME/.vscode-rotator/knowledge-graph.json` | JSON |
| AI snapshot pointer | `$HOME/.vscode-rotator/ai-snapshot-current.json` | JSON |
| Provider policy | `$HOME/.unified-ai-workspace/provider-policy.json` | JSON |
| Provider health | `$HOME/.unified-ai-workspace/provider-health.json` | JSON |
| Provider usage | `$HOME/.unified-ai-workspace/provider-usage.json` | JSON |
| Routing history | `$HOME/.unified-ai-workspace/routing-history.json` | JSON |
| Workspace policy overrides | `$HOME/.unified-ai-workspace/workspace-policy-overrides.json` | JSON |
| Audit log | `$HOME/.unified-ai-workspace/audit-log.json` | JSON with hash chain |
| Workspace approvals | `$HOME/.unified-ai-workspace/workspace-approvals.json` | JSON |
| Workspace quotas | `$HOME/.unified-ai-workspace/workspace-quotas.json` | JSON |
| Workspace report exports | `<repo>/audit-log*.json`, `<repo>/audit-log*.html` | JSON / HTML |
| Electron window store | `<Electron userData>/strategic-learning-unified-theatre-ui.*` | Electron Store JSON/config file |
| Electron startup health | `<Electron userData>/health-state.json` | JSON |
| Electron persistent browser partitions | `<Electron userData>/...persist:platform-<platform>...` | Chromium session/cookie/cache files |
| Electron disk cache | `/tmp/strategic-learning-unified-theatre-cache` | Chromium cache files |
| VS Code auth targets | Paths resolved from config or platform defaults such as `$HOME/.codex/auth.json`, `$HOME/.trae/auth.json`, VS Code global storage paths | Provider-specific auth JSON/secret files |
| Robot output | `<repo>/robot-results/` | Robot Framework XML/HTML/log outputs |
| Coverage output | `<repo>/coverage/` | Coverage reports |

## Seed Strategy

- Run E2E tests with a dedicated temporary `HOME`, `DB_PATH`, and `ROTATOR_STATE_DIR`; never point E2E at the developer's real home directory.
- Seed `$HOME/.vscode-rotator/config.json` before the app starts. The minimum stable seed should include:
  - `watchedRepos: []`
  - `storagePaths: []`
  - `browserResponsesIngest: false` unless the test explicitly validates ingestion
  - `captureSchedule.enabled: false`
  - `enhanceSchedule: null`
  - `policy.features.localDbEnabled: true`
  - `policy.features.browserCaptureEnabled: true`
  - `policy.features.llmCommandsEnabled: true`
- Seed `$UNIFIED_THEATRE_ENTERPRISE_CONFIG` as an empty policy object unless a test is specifically validating enterprise overrides.
- Seed `.unified-ai-workspace` JSON stores to their empty shapes when tests assert on provider/routing/audit/workspace state:
  - `provider-health.json`: `{}`
  - `provider-usage.json`: `{}`
  - `routing-history.json`: `[]`
  - `provider-policy.json`: omit unless testing a non-default policy
  - `workspace-policy-overrides.json`: `{ "overrides": [] }`
  - `audit-log.json`: `{ "events": [] }`
  - `workspace-approvals.json`: `{ "approvals": [] }`
  - `workspace-quotas.json`: `{ "policies": [], "usage": [], "notifications": [], "lastDailyResetAt": null }`
- Seed browser state only for tests that require logged-in platform sessions:
  - `$HOME/.vscode-rotator/browser-profiles/<platform>/storage-state.json`
  - `$HOME/.vscode-rotator/browser-selectors.json` for selector overrides
- Seed account data through app APIs or helper code that uses `AccountStore`/`SecretStore`; do not hand-write `accounts.enc` or `secrets.enc`.
- Seed `browser-responses/*.md` only for response-listing, tagging, feedback, and ingestion tests.
- Seed `ai-memory.db` only for AI memory tests; otherwise let `MemoryDb` create a fresh SQLite database at `DB_PATH`.
- Seed `experience.db` only for capture/ingestion feedback tests; otherwise let `ExperienceDb` create an empty JSON state.

## Reset Strategy

- Use a fresh run root for each full E2E run, for example `/tmp/unified-theatre-e2e/<run-id>`.
- Before each test case, prefer creating a new per-test `HOME`, `DB_PATH`, and `ROTATOR_STATE_DIR` under the run root. This avoids carrying over:
  - encrypted account files
  - browser response captures
  - Playwright storage state
  - throttling state in `platform-last-send.json`
  - routing, policy, audit, approval, and quota JSON stores
  - SQLite WAL/SHM files
  - daemon PID/lock files
- If a test suite must reuse one app process, reset by deleting and recreating only the test-owned directories:
  - `$HOME/.vscode-rotator`
  - `$HOME/.unified-ai-workspace`
  - `$ROTATOR_STATE_DIR/.vscode-rotator`
  - the directory containing `$DB_PATH`
  - `/tmp/strategic-learning-unified-theatre-cache`
- Stop or avoid starting detached daemons during reset. If a test starts the daemon, read the test-owned `daemon.pid`, terminate that PID, then remove `daemon.pid`, `daemon.log`, and `switch.lock`.
- Close Electron/Playwright browser contexts before deleting browser profile directories so storage-state writes do not race with cleanup.
- Do not reset OS keychain records by default. For E2E, prefer mocked/fallback secrets or test-only account IDs so keychain cleanup is not required.
- Clean repo-local artifacts between suites when those tests generate them:
  - `robot-results/`
  - `coverage/`
  - `audit-log*.json`
  - `audit-log*.html`

## Teardown Strategy

- After a full run, close Electron, Playwright, and any daemon process started by the suite.
- Remove the full E2E run root under `/tmp/unified-theatre-e2e/<run-id>`.
- Remove `/tmp/strategic-learning-unified-theatre-cache` to clear Electron disk cache.
- Remove repo-local reports generated by the run if they are not part of the artifact upload: `robot-results/`, `coverage/`, `audit-log*.json`, and `audit-log*.html`.
- Preserve failure artifacts only when the test runner requests them, such as screenshots, traces, logs, captured responses, and seeded config snapshots.
- Do not delete developer or machine-level config paths such as `/etc/strategic-learning-unified-theatre`, the real `~/.vscode-rotator`, the real `~/.unified-ai-workspace`, or real VS Code auth files.

## Pre-Run Shell Commands

```bash
export E2E_RUN_ID="${E2E_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"
export E2E_ROOT="/tmp/unified-theatre-e2e/${E2E_RUN_ID}"
export HOME="${E2E_ROOT}/home"
export ROTATOR_STATE_DIR="${E2E_ROOT}/state"
export DB_PATH="${E2E_ROOT}/db/ai-memory.db"
export UNIFIED_THEATRE_ENTERPRISE_CONFIG="${E2E_ROOT}/enterprise-policy.json"
export VSCODE_ROTATOR_MOCK_LLM=1
export NODE_OPTIONS="--max-old-space-size=8192"
export NODE_ENV=test
export ROTATOR_LOG_LEVEL=info
export ROTATOR_LOG_SINK=stdout

rm -rf "${E2E_ROOT}"
mkdir -p \
  "${HOME}/.vscode-rotator/browser-responses" \
  "${HOME}/.vscode-rotator/browser-profiles" \
  "${HOME}/.unified-ai-workspace" \
  "${ROTATOR_STATE_DIR}/.vscode-rotator" \
  "$(dirname "${DB_PATH}")"

cat > "${HOME}/.vscode-rotator/config.json" <<'JSON'
{
  "watchedRepos": [],
  "gitPollIntervalMs": 30000,
  "storagePaths": [],
  "storageIndexMaxAgeDays": 30,
  "browserResponsesIngest": false,
  "enhanceSchedule": null,
  "vscodeLearn": {
    "enabled": false,
    "stagedSignalsDir": null,
    "captureSources": ["diagnostic", "editor", "task", "git"],
    "maxSignalAgeDays": 30,
    "flushIntervalMs": 30000,
    "debounceMs": 600000,
    "maxFileSizeBytes": 102400,
    "excludePatterns": ["**/test/**", "**/fixtures/**"],
    "hardExcludePatterns": [
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/*.secret",
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**"
    ],
    "allowedExtensions": [
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".py",
      ".md",
      ".json",
      ".yaml",
      ".yml",
      ".txt"
    ]
  },
  "policy": {
    "apiVersion": "1",
    "pluginSearchPaths": [],
    "features": {
      "localDbEnabled": true,
      "browserCaptureEnabled": true,
      "llmCommandsEnabled": true
    }
  },
  "browserPaths": {},
  "platformTriggers": {},
  "captureSchedule": {
    "enabled": false,
    "intervalMs": 900000
  }
}
JSON

cat > "${UNIFIED_THEATRE_ENTERPRISE_CONFIG}" <<'JSON'
{
  "policy": {
    "apiVersion": "1",
    "pluginSearchPaths": [],
    "features": {
      "localDbEnabled": true,
      "browserCaptureEnabled": true,
      "llmCommandsEnabled": true
    }
  }
}
JSON

printf '{}\n' > "${HOME}/.unified-ai-workspace/provider-health.json"
printf '{}\n' > "${HOME}/.unified-ai-workspace/provider-usage.json"
printf '[]\n' > "${HOME}/.unified-ai-workspace/routing-history.json"
printf '{ "overrides": [] }\n' > "${HOME}/.unified-ai-workspace/workspace-policy-overrides.json"
printf '{ "events": [] }\n' > "${HOME}/.unified-ai-workspace/audit-log.json"
printf '{ "approvals": [] }\n' > "${HOME}/.unified-ai-workspace/workspace-approvals.json"
printf '{ "policies": [], "usage": [], "notifications": [], "lastDailyResetAt": null }\n' > "${HOME}/.unified-ai-workspace/workspace-quotas.json"

rm -rf /tmp/strategic-learning-unified-theatre-cache
mkdir -p /tmp/strategic-learning-unified-theatre-cache
```
