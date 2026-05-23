refer Architecture summary across sprints in folder E:\VS Code Agent\Solution before development. refer to E:\VS Code Agent\Solution\README.md for existing developmet progress
sprint 6 — hardening: GUI tray, SecretStorage, e2e tests
system-tray UI · OS secret storage · full integration tests
≈148K tokens
estimated token usage
148K / 150K
deliverables
tray.js (electron)
secret-store.js
e2e tests
installer script
README final
tasks
migrate authBlob storage from AES file to OS keychain via keytar (macOS Keychain, Windows DPAPI, libsecret)
Electron tray app: icon, context menu showing active account + switch options
tray menu items: active account (greyed), separator, switch to... submenu, daemon status, open log, quit
tray icon color reflects daemon state: green=ok, amber=cooldown, red=all accounts exhausted
e2e test suite: mock VS Code processes, simulate token expiry, assert account rotation fires
installer: npm link + launchd (macOS) / systemd (Linux) / Task Scheduler (Windows) service registration
security audit: review file permissions, lock file cleanup on crash, no plaintext secrets in logs
final README: architecture diagram, quickstart, FAQ, troubleshooting section
sprint prompt
Continue "strategic-learning-unified-theatre". Sprints 1–5 complete. This is the final hardening sprint.

SPRINT 6 SCOPE — GUI tray, OS secret storage, e2e tests, installer.

New deliverables:
1. src/secret-store.js
   — SecretStore class replacing file-based authBlob storage
     set(accountId, blob): keytar.setPassword('strategic-learning-unified-theatre', accountId, blob)
     get(accountId): keytar.getPassword('strategic-learning-unified-theatre', accountId)
     delete(accountId): keytar.deletePassword(...)
   — Migration helper: migrateLegacy(): reads existing accounts.enc, moves each authBlob to keytar, wipes field from file
   — Dependency: keytar@^7 (native module; document node-gyp prerequisites)

2. electron-tray/main.js
   — Electron app (main process only, no renderer window)
     Creates Tray with icon at electron-tray/assets/icon-{ok,warn,error}.png (16x16 template images)
     Builds context menu dynamically from AccountStore + WatcherDaemon state
     Menu items: "Active: {email}" (disabled), separator, "Switch to ▸" submenu, separator, "Daemon: {status}", "Open log", "Quit"
     Subscribes to WatcherDaemon events; updates tray icon on state change
   — package.json: separate "electron" entry point; add electron@^30 devDep

3. tests/e2e/rotation.test.js
   — vitest e2e: mock all child_process calls; simulate health probe returning {valid:false}; assert SwitcherService.switch called with next best account ID within one poll cycle
   — Test all-cooldown scenario: assert error event emitted and daemon logs GIT_WARN

4. scripts/install.js
   — detect platform, write launchd plist / systemd unit / Windows Task Scheduler XML
   — npm run install-service: registers daemon as background service auto-starting on login

5. Audit pass:
   — Grep all console.log / log lines: redact any field named authBlob, token, password, secret
   — Ensure lock files are cleaned in process 'exit' and 'uncaughtException' handlers
   — chmod 700 on ~/.vscode-rotator directory itself

6. docs/README.md — full final document: architecture overview, install steps, CLI reference, tray guide, troubleshooting, FAQ

Deliver all files with no placeholders. The tool must be installable via "npm install -g" after this sprint.

Testing Status
PS E:\VS Code Agent\Solution> npm install

added 67 packages, and audited 68 packages in 53s

31 packages are looking for funding
  run `npm fund` for details

5 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
PS E:\VS Code Agent\Solution> npm test

> strategic-learning-unified-theatre@0.1.0 test
> vitest run


 RUN  v2.1.9 E:/VS Code Agent/Solution

 ❯ tests/store.test.js (4) 20269ms
   ✓ encrypt/decrypt (2) 8416ms
   ❯ AccountStore (2) 11852ms
     × adds, lists, and removes accounts with persistence 5859ms
     ✓ updates an account by id 5992ms
 ✓ tests/lock.test.js (2)
 ✓ tests/switcher.test.js (2) 4180ms
 ✓ tests/scorer.test.js (3)
 ✓ tests/workspace.test.js (2)
 ✓ tests/git-monitor.test.js (2)
 ❯ tests/e2e/rotation.test.js (1) 6148ms
   ❯ e2e rotation (1) 6147ms
     × switches to the next best account when current fails health probe 6145ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/store.test.js > AccountStore > adds, lists, and removes accounts with persistence
 FAIL  tests/e2e/rotation.test.js > e2e rotation > switches to the next best account when current fails health probe
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 Test Files  2 failed | 5 passed (7)
      Tests  2 failed | 14 passed (16)
   Start at  02:57:27
   Duration  22.17s (transform 417ms, setup 0ms, collect 1.87s, tests 30.74s, environment 5ms, prepare 4.35s)
