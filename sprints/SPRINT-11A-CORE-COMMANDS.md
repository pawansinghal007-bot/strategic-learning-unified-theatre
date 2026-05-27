# Sprint 11A: VS Code Extension — Core Commands & Foundation

**Project**: strategic-learning-unified-theatre  
**Sprint Goal**: Implement and stabilize the 6 core extension commands with robust CLI integration  
**Duration**: 1 week  
**Status**: PLANNING  
**Max Tokens**: 150K  

---

## Overview

This sprint focuses on **Phase 1** of the extension roadmap: get the 6 core commands working reliably so they can be used every day without crashing or hanging. No sidebar views yet—just solid command + CLI glue.

### Hero Workflows Served

1. **"Ask smarter"** → Commands: `llmQuickPrompt`, `generateImplementationPrompt`  
2. **"Run AI-assisted sprints"** → Commands: `showActiveHandoff`, `ingestCurrentFiles`, `sendPromptToBrowser`, `findRelatedContext`  

---

## Reference Documents

**Always refer to these before coding:**
- [strategic-learning-unified-theatre-master-instructions.md](../strategic-learning-unified-theatre-master-instructions.md) — Project status (139 tests, all passing)
- [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md) — Command definitions, CLI reference, sample code
- `Solution/vscode-extension/package.json` — Current manifest
- `Solution/vscode-extension/extension.js` — Current scaffold

---

## Acceptance Criteria

✅ All 6 core commands register without errors  
✅ Each command can be invoked from VS Code command palette  
✅ Output channel shows CLI commands and results (no silent failures)  
✅ Error messages are human-readable in toast notifications  
✅ No command hangs for >30 seconds (timeout or user cancel visible)  
✅ Keybindings work: `Ctrl+Shift+L` (quick ask), `Ctrl+Shift+R` (find related)  
✅ Extension can be packaged and installed locally (`F5` dev host mode)  

---

## Implementation Scope

### Commands to Implement (6)

| # | Command ID | Title | Complexity | Est. LOC |
|---|-----------|-------|-----------|---------|
| 1 | `llmQuickPrompt` | Ask Local LLM | LOW | 25 |
| 2 | `generateImplementationPrompt` | Generate Prompt | MED | 30 |
| 3 | `showActiveHandoff` | View Active Sprint | MED | 35 |
| 4 | `ingestCurrentFiles` | Ingest Workspace | MED | 30 |
| 5 | `sendPromptToBrowser` | Send to Browser | MED | 25 |
| 6 | `findRelatedContext` | Find Related Context | LOW | 25 |

### Helper Functions to Implement (1)

- `runCli(args, cwd)` — Execute CLI and return stdout/stderr

### Manifest Updates

- Add 6 commands + keybindings to `package.json`
- Ensure activation events are correct (`onCommand:*`)
- Verify main entry point is `extension.js`

---

## Known Issues & Constraints

- **CLI Path Resolution**: Must handle both absolute path from `__dirname` and relative `../.../src/cli.js`  
- **ESM vs CJS**: CLI is ESM (`src/cli.js`); extension is CJS (`extension.js`). CLI spawned as child process.  
- **Handoff Output Format**: Currently plain text. May need `--json` flag added to CLI `handoff get-active` for structured parsing later.  
- **No Local Model**: If phi3 model not installed, `llmQuickPrompt` and `generateImplementationPrompt` should fail gracefully with helpful message.  
- **Node.js Path**: Extension runs in VS Code's Node.js; CLI also needs Node.js 18+. Verify both available.

---

## Three-Prompt Breakdown

### PROMPT 1: ANALYSIS

**Do this first. Do NOT start coding.**

**Task**: Verify project structure, understand CLI contract, identify blockers.

**Specific questions to answer:**

1. **CLI Path Resolution**  
   - What is the absolute path from `Solution/vscode-extension/extension.js` to `Solution/src/cli.js`?  
   - Test that `path.join(__dirname, '..', 'src', 'cli.js')` resolves correctly in your environment.

2. **CLI Commands Validation**  
   - Run `strategic-learning-unified-theatre handoff get-active` manually and capture output format (plain text? JSON?).  
   - Run `strategic-learning-unified-theatre idea list --export json` and verify it returns valid JSON.  
   - Run `strategic-learning-unified-theatre llm ask "test"` and verify local model availability (may fail if not installed — capture error).  
   - Document exact command signatures and any flags needed.

3. **VS Code API Check**  
   - Verify `@types/vscode@1.80.0` is available (or compatible version).  
   - Check Node.js `child_process` is available in extension host (always is, but confirm).

4. **Path & Working Directory**  
   - Where should CLI commands be executed from? (Currently assumed: `os.homedir()`, where `~/.vscode-rotator/` exists.)  
   - Verify that `~/.vscode-rotator/` directory exists on your system; if not, document creation step.

5. **Timeout & Error Scenarios**  
   - What happens if CLI is not installed (npm link failed)?  
   - What happens if `~/.vscode-rotator/` does not exist?  
   - What is a reasonable timeout for `storage snapshot` on a large repo? (Expected: 5–30 seconds.)

**Deliverable**: A small document (`SPRINT-11A-ANALYSIS.md`) answering all 5 questions. **Do not code yet.**

---

### PROMPT 2: CODING

**Once PROMPT 1 is complete, proceed to code.**

**Task**: Implement all 6 commands + `runCli` helper in `extension.js`. Update `package.json`.

**Steps:**

1. **Implement `runCli(args, cwd)` helper**  
   - Signature: `function runCli(args, cwd = undefined) → Promise<{stdout, stderr}>`  
   - Spawn `node src/cli.js ...args` with correct cwd (default `os.homedir()`)  
   - Capture stdout/stderr  
   - Reject if exit code != 0  
   - Timeout: 30 seconds (configurable; raise error if exceeded)

2. **Implement all 6 command handlers**  
   - Use the sample code from [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md) as base
   - For each command:
     - Show input boxes/quick picks as needed  
     - Log command to output channel *before* executing  
     - Call `runCli()`  
     - On success: show info message + log result  
     - On error: show error toast + log full error  
     - All output goes to output channel, user-facing errors are concise  
   - Key rule: **No silent failures. Every error path is visible.**

3. **Update `package.json`**  
   - Add 6 commands to `contributes.commands`  
   - Add keybindings (Ctrl+Shift+L, Ctrl+Shift+R, and context-aware)  
   - Ensure `activationEvents` includes all 6 command IDs + `onStartupFinished`

4. **Smoke Test Each Command**  
   - In VS Code (`F5` launch extension dev host):  
     - `llmQuickPrompt`: Input "what is async/await?" → See response (or error) in output channel  
     - `generateImplementationPrompt`: Input goal "Add retry logic" → Select platform → See prompt  
     - `showActiveHandoff`: See sprint info (or "No active sprint" message)  
     - `ingestCurrentFiles`: Trigger on workspace → See progress + result  
     - `sendPromptToBrowser`: Input platform, prompt → See confirmation  
     - `findRelatedContext`: Input query → See related items (or none)  
   - Verify no crashes, hangs, or silent failures  

**Deliverable**: Updated `extension.js` + `package.json` files, passing all smoke tests. **Do not write tests yet.**

---

### PROMPT 3: TESTING & DOCUMENTATION UPDATE

**After PROMPT 2 code is stable, add tests and update docs.**

**Task**: Add unit tests for `runCli` and each command. Update sprint docs.

**Steps:**

1. **Unit Tests** (`tests/extension.test.js`)  
   - Mock `child_process.spawn` using `sinon` or `jest` mock  
   - Test `runCli()` with success, timeout, and error scenarios  
   - Test each command's input handling (e.g., "empty input → cancel")  
   - Test error paths (e.g., CLI returns non-zero, network failure)  
   - **Coverage target**: 80%+ for happy path + error paths  

2. **E2E Smoke Test** (manual, documented)  
   - Install extension locally (`vsce package` + `code --install-extension`)  
   - Verify all 6 commands work in real VS Code (not just dev host)  
   - Document any environment setup needed (e.g., `npm link strategic-learning-unified-theatre`)  

3. **Regression Test Against CLI**  
   - Run `npm test` on main project (`Solution/`)  
   - Verify 139 tests still pass (no CLI breaks)  

4. **Update Master Instructions**  
   - Add entry under "What's Changed" section: "Sprint 11A: Core extension commands (6) implemented and tested."  
   - Update module maturity table: Electron UI → "🟡 IN PROGRESS (core commands stable, sidebar views next)"  

5. **Close Sprint & Document Blockers**  
   - If any command failed to work, document blocker + workaround  
   - Record any CLI changes needed for future sprints (e.g., `--json` output format)  
   - Create handoff prompt for next sprint

**Deliverable**: `tests/extension.test.js` with 20+ tests, all passing. Updated `strategic-learning-unified-theatre-master-instructions.md`. Ready for Sprint 11B.

---

## Files to Modify

```
Solution/
├── vscode-extension/
│   ├── extension.js          [MODIFY: add 6 commands + runCli]
│   ├── package.json          [MODIFY: add commands, keybindings, activation events]
│   └── README.md             [OPTIONAL: add CLI setup instructions]
├── tests/
│   └── extension.test.js     [CREATE: unit + integration tests]
└── sprints/
    ├── SPRINT-11A-CORE-COMMANDS.md     [THIS FILE]
    ├── SPRINT-11A-ANALYSIS.md          [OUTPUT: answer 5 questions]
    └── SPRINT-11A-CODING-LOG.md        [OUTPUT: changes made, decisions]
```

---

## Success Metrics

| Metric | Target | Pass/Fail |
|--------|--------|-----------|
| All 6 commands register & appear in command palette | ✅ 6/6 | — |
| No command crashes or hangs | ✅ Pass all smoke tests | — |
| Keybindings work (Ctrl+Shift+L, Ctrl+Shift+R) | ✅ Verified | — |
| Output channel shows all CLI calls + results | ✅ Always | — |
| Error messages are user-friendly (not stack traces) | ✅ All errors | — |
| Extension tests cover happy path + error paths | ✅ 80%+ coverage | — |
| CLI `npm test` still passes (no regression) | ✅ 139/139 tests | — |
| Extension can be packaged & installed | ✅ vsce package works | — |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| CLI path resolution fails | MEDIUM | Test in PROMPT 1; add debug command if needed |
| Local LLM not available | HIGH | Graceful error msg "Model not installed. Run `llm setup`" |
| Workspace folder not open | MEDIUM | Check `vscode.workspace.workspaceFolders?.[0]` before use |
| Timeout on large repos | LOW | Cap snapshot at 30s; let user cancel |
| CLI output format changes | LOW | Keep CLI contract stable; add `--json` flag if needed |

---

## Links & References

- **Blueprint**: [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md)
- **Master Instructions**: [strategic-learning-unified-theatre-master-instructions.md](../strategic-learning-unified-theatre-master-instructions.md)  
- **CLI Source**: `Solution/src/cli.js` (entry point)  
- **Command Implementations**: `Solution/src/commands/*.js` (what the CLI calls)  

---

## Next Steps

After Sprint 11A closes:
- **Sprint 11B**: Sidebar views (Ideas tree, Related Context)  
- **Sprint 11C**: Sprint integration + lightweight automation  

---

*Sprint Document Generated: May 21, 2026*  
*To start: Run PROMPT 1 (Analysis) first — do NOT code yet.*


