# Sprint 11A — VS Code Extension: Core Commands & Foundation
## Three AI Agent Prompts

> **Always read `strategic-learning-unified-theatre-master-instructions.md` before starting any prompt.**
> Max tokens per prompt: 150K | Project root: `E:\VS Code Agent\Solution\`
> Current baseline: **139 tests passing**, all green.

---

---

## PROMPT 1 — Analysis: Map the Ground Before You Build

> **Goal**: Verify the project structure, understand the CLI contract, and surface any blockers
> before a single line of extension code is written.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md  (authoritative project state)
  - E:\VS Code Agent\Solution\docs\README.md
  - E:\VS Code Agent\Solution\vscode-extension\package.json  (current manifest)
  - E:\VS Code Agent\Solution\vscode-extension\extension.js  (current scaffold)
  - E:\VS Code Agent\Solution\src\cli.js                     (CLI entry point)
  - E:\VS Code Agent\Solution\src\commands\llm.js            (llm sub-commands)
  - E:\VS Code Agent\Solution\src\commands\browser.js        (browser sub-commands)
  - E:\VS Code Agent\Solution\src\agent-handoff.js           (handoff module)
  - E:\VS Code Agent\Solution\src\idea-store.js              (idea module)

Sprint: Sprint 11A — VS Code Extension Core Commands
Status: 139 tests passing. vscode-extension scaffold exists but has NO commands yet.
Task: ANALYSIS ONLY. Answer the 6 questions below. Write output to
      E:\VS Code Agent\Solution\sprints\SPRINT-11A-ANALYSIS.md.

---

QUESTION 1 — CLI Path Resolution
  a. From `Solution/vscode-extension/extension.js`, resolve the relative path to
     `Solution/src/cli.js` using Node's `path.join(__dirname, '..', 'src', 'cli.js')`.
  b. Print the resolved absolute path. Confirm the file exists at that path.
  c. Identify whether the path works in both Windows (`E:\VS Code Agent\...`) and
     a WSL/Unix context, and note any separator issues to guard against.

QUESTION 2 — CLI Contract Verification
  For each of the following commands, run it manually (or read the source carefully)
  and document: exact invocation, expected stdout format (plain text vs JSON),
  and whether a `--json` flag exists or is needed.

  Commands to verify:
    strategic-learning-unified-theatre handoff get-active
    strategic-learning-unified-theatre idea list --export json
    strategic-learning-unified-theatre llm ask "test prompt"
    strategic-learning-unified-theatre llm related --to "test query"
    strategic-learning-unified-theatre storage snapshot
    strategic-learning-unified-theatre browser send --platform chatgpt --prompt "test"

  For each: capture example output, note exit codes on success and failure.

QUESTION 3 — VS Code Extension Host Environment
  a. Confirm `@types/vscode` version in `vscode-extension/package.json`.
     Is it ≥ 1.80.0?
  b. Confirm `child_process` (specifically `spawn`) is available without restrictions
     in the VS Code extension host (it always is — document the confirmation).
  c. Check whether `vscode-extension/package.json` already has `activationEvents`,
     `contributes.commands`, and `contributes.keybindings` sections — or are they empty/missing?
  d. Confirm the `main` entry point resolves to `extension.js`.

QUESTION 4 — Working Directory & Data Paths
  a. Where should CLI commands be executed from?
     (Currently assumed: `os.homedir()` where `~/.vscode-rotator/` lives.)
  b. Verify `~/.vscode-rotator/` exists on this system. List its top-level contents.
  c. Confirm `~/.vscode-rotator/experience.db` exists (R5 DB must be live for
     `llm related` and `llm ask` to have context).
  d. Note the path separator to use on Windows for spawning `node src/cli.js`.

QUESTION 5 — Failure Mode Inventory
  Document exactly what happens (error text, exit code) in each scenario:
    a. CLI not installed / `npm link` not run — what error does `spawn` receive?
    b. `~/.vscode-rotator/` directory missing — which commands fail and how?
    c. Local LLM model (phi3) not installed — what does `llm ask` return?
    d. Workspace folder not open in VS Code — how should commands that need
       `vscode.workspace.workspaceFolders` behave?
    e. Command takes > 30 s — what timeout/cancel mechanism is planned?

QUESTION 6 — Token Budget Check
  Review the 6 commands scoped for Sprint 11A:
    llmQuickPrompt, generateImplementationPrompt, showActiveHandoff,
    ingestCurrentFiles, sendPromptToBrowser, findRelatedContext
  For each, estimate lines of code (LOC) for the handler in extension.js.
  Confirm total estimated LOC for extension.js stays under 300 lines.
  If any command looks significantly more complex than estimated, flag it.

---

DELIVERABLE
  Write `SPRINT-11A-ANALYSIS.md` in `E:\VS Code Agent\Solution\sprints\` with:
    - Answers to all 6 questions (use headers Q1–Q6)
    - A "Blockers" section listing anything that must be resolved before coding
    - A "Safe to Proceed" verdict (YES / NO / YES WITH CAVEATS)

  Keep the document concise — bullet answers are fine. Target: < 400 lines.

---

⛔ DO NOT START CODING. Analysis and documentation only.
```

---

---

## PROMPT 2 — Coding: Wire the 6 Commands

> **Goal**: Implement all 6 commands and the `runCli` helper in `extension.js`.
> Update `package.json`. Smoke-test every command in VS Code dev host (F5).

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md  (authoritative project state)
  - E:\VS Code Agent\Solution\sprints\SPRINT-11A-ANALYSIS.md  (answers from Prompt 1 — REQUIRED)
  - E:\VS Code Agent\Solution\vscode-extension\extension.js
  - E:\VS Code Agent\Solution\vscode-extension\package.json
  - E:\VS Code Agent\Solution\src\cli.js  (entry point — know the CLI interface)

Sprint: Sprint 11A — VS Code Extension Core Commands
Baseline: 139 tests passing. Do NOT break the existing test suite.
Task: Implement 6 commands + runCli helper. Update package.json.
      Log decisions to E:\VS Code Agent\Solution\sprints\SPRINT-11A-CODING-LOG.md.

---

STEP 1 — Implement `runCli(args, cwd, timeoutMs = 30000)`
  Location: top of extension.js, before any command registration.

  Specification:
    - Signature: async function runCli(args, cwd, timeoutMs = 30000)
    - Spawn: `node <resolved-cli-path> ...args`
      where <resolved-cli-path> = path.join(__dirname, '..', 'src', 'cli.js')
    - Default cwd: os.homedir()
    - Capture stdout and stderr as strings
    - If exit code !== 0: reject with Error containing stderr (or a friendly fallback)
    - If no response within timeoutMs: kill process, reject with "Command timed out after 30s"
    - Log the spawned command to the output channel before execution
    - Return: { stdout: string, stderr: string }

  Guard: if cli.js path does not exist at startup, show a one-time error toast:
    "strategic-learning-unified-theatre CLI not found. Run `npm link` in the Solution folder."
  Do not crash the extension — degrade gracefully.

STEP 2 — Implement 6 command handlers

  For every command, follow this template without exception:
    1. Show input box / quick pick (if user input needed)
    2. If user cancels input: return silently (no error)
    3. outputChannel.appendLine(`[strategic-learning-unified-theatre] Running: node cli.js <args>`)
    4. Call runCli(args, cwd)
    5. On success: vscode.window.showInformationMessage(<concise result>) + log to channel
    6. On error: vscode.window.showErrorMessage(<friendly one-liner>) + log full error to channel
    Rule: NO silent failures. Every path (success, cancel, error) is logged.

  ── Command 1: llmQuickPrompt ──────────────────────────────────────────────
  Keybinding: Ctrl+Shift+L
  Input: showInputBox({ prompt: 'Ask your local LLM anything', placeHolder: 'e.g. What is async/await?' })
  CLI: runCli(['llm', 'ask', userInput])
  Success toast: First 120 chars of stdout + "… (see Output panel)"
  Error toast: "LLM unavailable — is phi3 installed? See Output for details."

  ── Command 2: generateImplementationPrompt ────────────────────────────────
  Input step A: showInputBox({ prompt: 'Implementation goal', placeHolder: 'e.g. Add retry logic to fetchData' })
  Input step B: showQuickPick(['chatgpt', 'claude', 'gemini', 'perplexity'], { placeHolder: 'Target platform' })
  CLI: runCli(['llm', 'generate', '--goal', goal, '--platform', platform])
  Success toast: "Prompt generated — see Output panel"
  On success also: copy stdout to clipboard via vscode.env.clipboard.writeText(stdout)
    then show: "Prompt copied to clipboard ✓"

  ── Command 3: showActiveHandoff ───────────────────────────────────────────
  No user input needed.
  CLI: runCli(['handoff', 'get-active'])
  Success: display stdout in a new untitled document (vscode.workspace.openTextDocument +
           vscode.window.showTextDocument) with language 'markdown'
  If stdout is empty or contains "No active sprint": show info toast "No active sprint found."

  ── Command 4: ingestCurrentFiles ──────────────────────────────────────────
  Prerequisite: check vscode.workspace.workspaceFolders?.[0] — if undefined,
    show error toast "Open a workspace folder first." and return.
  CLI: runCli(['storage', 'snapshot'], workspaceFolders[0].uri.fsPath)
    then: runCli(['llm', 'ingest'])
  Show progress notification during execution:
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
      title: 'Ingesting workspace files…', cancellable: false }, ...)
  Success toast: "Ingestion complete — <n> documents indexed" (parse count from stdout if possible,
    else just "Ingestion complete")

  ── Command 5: sendPromptToBrowser ─────────────────────────────────────────
  Input step A: showQuickPick(['chatgpt', 'claude', 'gemini', 'perplexity'], { placeHolder: 'Platform' })
  Input step B: showInputBox({ prompt: 'Prompt to send', placeHolder: 'e.g. Explain the observer pattern' })
  CLI: runCli(['browser', 'send', '--platform', platform, '--prompt', promptText])
  Success toast: "Prompt sent to <platform> ✓"
  Error toast: "Browser send failed — is the browser bridge running? See Output."

  ── Command 6: findRelatedContext ──────────────────────────────────────────
  Keybinding: Ctrl+Shift+R
  Input: showInputBox({ prompt: 'Find related context', placeHolder: 'e.g. error handling patterns' })
  CLI: runCli(['llm', 'related', '--to', query])
  Success: display stdout in a new untitled document (language 'markdown')
    with title prefix "Related Context:"
  If stdout is empty: show info toast "No related context found for that query."

STEP 3 — Update package.json
  Add to `contributes.commands` (6 entries):
    { "command": "strategic-learning-unified-theatre.llmQuickPrompt",              "title": "Ask Local LLM" }
    { "command": "strategic-learning-unified-theatre.generateImplementationPrompt", "title": "Generate Implementation Prompt" }
    { "command": "strategic-learning-unified-theatre.showActiveHandoff",           "title": "View Active Sprint" }
    { "command": "strategic-learning-unified-theatre.ingestCurrentFiles",          "title": "Ingest Workspace Files" }
    { "command": "strategic-learning-unified-theatre.sendPromptToBrowser",         "title": "Send Prompt to Browser" }
    { "command": "strategic-learning-unified-theatre.findRelatedContext",          "title": "Find Related Context" }

  Add to `contributes.keybindings`:
    { "command": "strategic-learning-unified-theatre.llmQuickPrompt",    "key": "ctrl+shift+l", "mac": "cmd+shift+l" }
    { "command": "strategic-learning-unified-theatre.findRelatedContext", "key": "ctrl+shift+r", "mac": "cmd+shift+r" }

  Add to `activationEvents` (if not already `onStartupFinished`):
    "onStartupFinished"
    (This fires all 6 command registrations on VS Code start — no need for per-command events.)

  Confirm `main` is `"./extension.js"`.

STEP 4 — Smoke Test Checklist (F5 dev host)
  Launch extension host (F5). In Command Palette (Ctrl+Shift+P), test each command:

  [ ] llmQuickPrompt       — input "what is async/await?" → response in Output or friendly error
  [ ] generatePrompt       — input goal + platform → "Prompt copied to clipboard ✓"
  [ ] showActiveHandoff    — opens markdown doc or "No active sprint" toast
  [ ] ingestCurrentFiles   — progress spinner → "Ingestion complete" or workspace error toast
  [ ] sendPromptToBrowser  — pick platform + input prompt → success or bridge error toast
  [ ] findRelatedContext   — input query → opens markdown doc or "No related context" toast
  [ ] Ctrl+Shift+L         — triggers llmQuickPrompt
  [ ] Ctrl+Shift+R         — triggers findRelatedContext

  For each: confirm Output panel shows the CLI command that ran.
  For each: confirm NO silent failures (every outcome — success, cancel, error — is visible).

STEP 5 — Write coding log
  Create `E:\VS Code Agent\Solution\sprints\SPRINT-11A-CODING-LOG.md` with:
    - Date, token count used so far
    - Decisions made (e.g. "Used onStartupFinished instead of per-command activationEvents")
    - Any CLI flags discovered or changed
    - Smoke test results (pass / fail per command)
    - Blockers for Sprint 11A Prompt 3

---

ACCEPTANCE CRITERIA (must all pass before handing off to Prompt 3):
  ✅ All 6 commands appear in Command Palette
  ✅ Ctrl+Shift+L and Ctrl+Shift+R keybindings work
  ✅ Output channel logs every CLI invocation
  ✅ No command hangs without user-visible feedback
  ✅ Error messages are human-readable (no raw stack traces in toasts)
  ✅ extension.js < 350 lines (clean, no dead code)
  ✅ package.json valid JSON (run `node -e "require('./package.json')"` to confirm)

---

⛔ DO NOT WRITE UNIT TESTS OR RUN E2E TESTS YET. Coding and smoke tests only.
```

---

---

## PROMPT 3 — Testing & Docs: Lock It In

> **Goal**: Write unit tests for all 6 commands and `runCli`. Run regression and E2E.
> Update master instructions and close the sprint.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Read BEFORE doing anything:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md  (authoritative — read the FULL file)
  - E:\VS Code Agent\Solution\sprints\SPRINT-11A-ANALYSIS.md
  - E:\VS Code Agent\Solution\sprints\SPRINT-11A-CODING-LOG.md
  - E:\VS Code Agent\Solution\vscode-extension\extension.js  (final version from Prompt 2)
  - E:\VS Code Agent\Solution\vscode-extension\package.json  (final version from Prompt 2)
  - E:\VS Code Agent\Solution\tests\  (see existing test file patterns — use vitest)

Sprint: Sprint 11A — VS Code Extension Core Commands
Baseline: 139 tests passing. Goal: finish at ≥ 159 tests passing (20 new).
Task: Unit tests, E2E smoke, regression, document update, sprint close.

---

STEP 1 — Unit Tests: `tests/extension.test.js`

  Framework: vitest (match all existing test files).
  Mock strategy: use `vi.mock('child_process')` to stub `spawn`.
  Do NOT require a running VS Code instance for unit tests.
  Mock `vscode` module with minimal stubs for:
    window.showInputBox, window.showQuickPick, window.showInformationMessage,
    window.showErrorMessage, window.withProgress, window.createOutputChannel,
    workspace.workspaceFolders, env.clipboard.writeText,
    workspace.openTextDocument, window.showTextDocument

  Write tests for each of the following (target ≥ 20 tests total):

  ── runCli helper (5 tests) ──────────────────────────────────────────────
  1. resolves with { stdout, stderr } on exit code 0
  2. rejects with stderr content on non-zero exit code
  3. rejects with "Command timed out" after timeoutMs elapses (use fake timers)
  4. logs the CLI command to output channel before spawning
  5. uses os.homedir() as default cwd when no cwd is provided

  ── llmQuickPrompt (3 tests) ──────────────────────────────────────────────
  6.  empty / cancelled input → no CLI call made
  7.  success → showInformationMessage called with first 120 chars
  8.  runCli error → showErrorMessage with LLM-specific guidance

  ── generateImplementationPrompt (3 tests) ────────────────────────────────
  9.  cancelled goal input → no CLI call, no platform pick shown
  10. cancelled platform pick → no CLI call
  11. success → clipboard.writeText called with stdout

  ── showActiveHandoff (2 tests) ───────────────────────────────────────────
  12. stdout non-empty → openTextDocument called with markdown content
  13. stdout empty or "No active sprint" → showInformationMessage toast shown

  ── ingestCurrentFiles (3 tests) ──────────────────────────────────────────
  14. no workspace folder open → showErrorMessage "Open a workspace folder first."
  15. snapshot succeeds, ingest succeeds → withProgress wraps both calls
  16. ingest CLI error → showErrorMessage with error detail

  ── sendPromptToBrowser (2 tests) ─────────────────────────────────────────
  17. cancelled platform pick → no CLI call
  18. success → showInformationMessage includes platform name

  ── findRelatedContext (2 tests) ──────────────────────────────────────────
  19. empty stdout → showInformationMessage "No related context found"
  20. success → openTextDocument called with query in title/content

  After writing all tests: run `npm test` and confirm:
    - All new tests pass
    - All 139 pre-existing tests still pass
    - Total passing count ≥ 159

STEP 2 — E2E Smoke Test (Manual, Documented)

  Package the extension:
    cd Solution/vscode-extension
    npx vsce package
    code --install-extension strategic-learning-unified-theatre-*.vsix

  In a real VS Code window (NOT dev host), verify:
  [ ] Extension activates without errors (check Developer Tools console)
  [ ] All 6 commands appear in Command Palette under "strategic-learning-unified-theatre"
  [ ] Ctrl+Shift+L triggers llmQuickPrompt
  [ ] Ctrl+Shift+R triggers findRelatedContext
  [ ] Output channel "strategic-learning-unified-theatre" appears and logs CLI calls
  [ ] At least one command produces a real result end-to-end:
        Suggested: showActiveHandoff (no model or browser needed)
  [ ] At least one error path shows a user-friendly toast (not a raw stack trace)

  Document results in `SPRINT-11A-CODING-LOG.md` under "E2E Results" section.
  If packaging fails, document the blocker and workaround.

STEP 3 — Regression: Full CLI Suite
  From `E:\VS Code Agent\Solution\`:
    npm test

  Confirm: all 139 pre-existing tests pass (no regression from extension changes).
  If any test fails, fix it before proceeding. Document in coding log.

STEP 4 — Update Master Instructions
  File: `E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md`

  4a. Add entry under "What's Changed" (top of that section):
  ```
  ### ✅ Sprint 11A — VS Code Extension Core Commands — COMPLETE (<today's date>)
  - 6 commands implemented: llmQuickPrompt, generateImplementationPrompt,
    showActiveHandoff, ingestCurrentFiles, sendPromptToBrowser, findRelatedContext
  - runCli helper with 30s timeout, stderr propagation, output channel logging
  - Keybindings: Ctrl+Shift+L (Ask LLM), Ctrl+Shift+R (Find Related)
  - Extension packaged and smoke-tested in real VS Code window
  - Test count: <final number> tests passing ✅
  ```

  4b. Update Module Maturity table — change the Electron UI row:
  Before:  | Electron UI | 🟡 IN PROGRESS | Not yet | ... |
  After:   | Electron UI / VS Code Extension | 🟡 IN PROGRESS | <n> pass | Core commands (6) stable. Sidebar views (Sprint 11B) next. |

  4c. Update "Immediate Next Steps" section:
  - Mark Sprint 11A complete (add ✅)
  - Add Sprint 11B as P1: "Sidebar views — Ideas tree, Related Context panel (Sprint 11B)"

  4d. Update the "Last Updated" line at the top of the file:
  `Last Updated: <today's date> — Sprint 11A Complete. <final test count> tests passing.`

STEP 5 — Close Sprint & Handoff
  5a. Update sprint token usage:
    strategic-learning-unified-theatre handoff update <sprint-id> --tokens-used <n>

  5b. Close the sprint:
    strategic-learning-unified-theatre handoff close <sprint-id> --status complete

  5c. Generate resume prompt for Sprint 11B:
    strategic-learning-unified-theatre handoff resume <sprint-id>
    Copy the resumePrompt output and paste it at the top of the Sprint 11B prompt document.

  5d. Append to `SPRINT-11A-CODING-LOG.md`:
    - Final test count
    - Any CLI changes needed for future sprints (e.g. "--json flag on handoff get-active")
    - Known limitations or deferred items
    - Sprint 11B recommended scope (sidebar views: Ideas tree, Related Context)

---

FINAL ACCEPTANCE GATE (all must be true before declaring Sprint 11A complete):
  ✅ ≥ 20 new unit tests in tests/extension.test.js — all passing
  ✅ Pre-existing 139 tests still passing (zero regression)
  ✅ Extension packaged with `vsce package` without errors
  ✅ All 6 commands verified in real VS Code window
  ✅ strategic-learning-unified-theatre-master-instructions.md updated
  ✅ Sprint closed in handoff tracker
  ✅ Resume prompt for Sprint 11B captured
```

---

*Sprint 11A Prompts Generated: 2026-05-21*
*Next Sprint: 11B — Sidebar Views (Ideas Tree + Related Context Panel)*

