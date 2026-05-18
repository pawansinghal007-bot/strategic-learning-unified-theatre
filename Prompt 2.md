refer Architecture summary across sprints in folder E:\VS Code Agent\Solution before development 
 sprint 2 — switcher core: auth swap + reload logic
auth.json swap · VS Code kill/restart · extension-host reload
≈140K tokens
estimated token usage
140K / 150K
deliverables
switcher.js
paths.js
vscode.js
lock.js
cli (use cmd)
tasks
resolve active auth file paths per agent: ~/.codex/auth.json, VS Code globalStorage, TRAE config
atomic auth swap: write to temp file → fsync → rename (POSIX atomic replace)
lock file mechanism: ~/.vscode-rotator/switch.lock to prevent concurrent switches
VS Code process detection via pgrep / tasklist; graceful SIGTERM then force-kill fallback
VS Code restart with --profile flag piped to selected account profile
CLI command: use
— performs full switch + restart
dry-run flag: --dry-run prints plan without executing
integration test with mock auth paths
sprint prompt
Continue building "vscode-rotator". Sprint 1 is complete (store, CLI, encrypt).

SPRINT 2 SCOPE — switcher core.

Context from Sprint 1:
• AccountStore at src/store.js, accounts.enc at ~/.vscode-rotator/
• CLI root at src/cli.js using commander
• Account has fields: id, email, agentType, authBlob, status, cooldownUntil

New deliverables:
1. src/paths.js
   — resolveAuthPath(agentType): returns the active auth file path per agent
     vscode  → platform-specific globalStorage/saml.secret or .vscode/argv.json
     codex   → ~/.codex/auth.json
     trae    → ~/.trae/auth.json  (stub path, document as configurable)
     other   → configurable via ~/.vscode-rotator/config.json
   — resolveVSCodeBin(): finds code binary via $PATH, common install dirs, snap, flatpak

2. src/lock.js
   — acquireLock(name): writes PID to ~/.vscode-rotator/.lock; throws if lock exists and process alive
   — releaseLock(name): removes lock file

3. src/vscode.js
   — findProcesses(): returns list of running VS Code PIDs
   — gracefulClose(pid): SIGTERM → wait 3s → SIGKILL
   — launchWithProfile(profileName): spawns code --profile  detached

4. src/switcher.js
   — SwitcherService class:
     switch(accountId, {dryRun}):
       1. acquireLock
       2. load account authBlob from store
       3. write authBlob → temp file → atomic rename to resolveAuthPath
       4. if !dryRun: gracefulClose all VS Code → launchWithProfile
       5. store.update(accountId, {lastUsed: now})
       6. releaseLock

5. cli: add command "use " calling SwitcherService.switch
   Add "--dry-run" flag. Output step-by-step log with ora spinners.

Target platforms: macOS, Linux, Windows (use os.platform() guards).
Write tests for atomic write and lock contention.

