refer Architecture summary across sprints in folder E:\VS Code Agent\Solution before development 
 sprint 3 — watcher daemon: token/quota monitoring
auto-rotation · health probes · cooldown scheduler
≈145K tokens
estimated token usage
145K / 150K
deliverables
watcher.js
health.js
scheduler.js
scorer.js
daemon CLI cmd
tasks
health probe per agent: cheap API ping returning {valid, remaining, resetAt}
account scorer: prefer active + high remaining quota + recent success rate
cooldown manager: mark account cooldown with TTL, auto-clear on resetAt
watcher loop: poll every N seconds, detect auth errors from log file tailing or exit codes
auto-switch trigger: if active account fails health probe → score → switch to best
CLI commands: daemon start/stop/status; watch (attach to running daemon output)
daemon runs as detached child process, logs to ~/.vscode-rotator/daemon.log (Strategic Learning Unified Theatre runtime)
config file: ~/.vscode-rotator/config.json (Strategic Learning Unified Theatre configuration) with poll interval, thresholds, agent paths
sprint prompt
Continue "strategic-learning-unified-theatre". Sprints 1+2 complete (store, encrypt, switcher, lock, vscode process control).

SPRINT 3 SCOPE — watcher daemon + auto-rotation.

New deliverables:
1. src/health.js
   — probeAccount(account): lightweight validity check
     codex/vscode: attempt to read a local token file and check expiry field
     fallback: parse authBlob for exp claim (JWT) or expires_at field
   — returns {valid: bool, remainingRequests: int|null, resetAt: Date|null, error: string|null}

2. src/scorer.js
   — scoreAccount(account, healthResult): numeric score 0-100
     +50 if valid, +30 if remainingRequests > threshold (default 20), +20 recency bonus decaying over 24h
     −100 if in cooldown, −50 if retired
   — pickBest(accounts, healthMap): returns highest-scored non-cooldown account

3. src/scheduler.js
   — CooldownScheduler: in-memory + persisted cooldown map
     setCooldown(accountId, durationMs)
     clearExpired(): called on each poll tick
     isOnCooldown(accountId): bool

4. src/watcher.js
   — WatcherDaemon: event emitter
     start(pollIntervalMs=30000)
     stop()
     on('switch', handler): fired when auto-switch triggered
     on('cooldown', handler): fired when account marked cooling
     Internal loop: for each active account, run probeAccount → if fail → setCooldown → pickBest → SwitcherService.switch

5. src/daemon-runner.js
   — entry point for detached process; writes PID file; streams JSON events to ~/.vscode-rotator/daemon.log

6. cli: add commands "daemon start | stop | status | watch" + "health" (one-shot probe all accounts)

Write tests for scorer edge cases (all accounts on cooldown → throw with helpful message).


