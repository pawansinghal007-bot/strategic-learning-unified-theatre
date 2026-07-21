# V6 — VS Code Active Prompt-Driving (Engine 8: Autonomous Coding Loop)

## Commands Run

```bash
# Search for any function that sends prompts/text into VS Code (Copilot chat, terminal input, command palette)
grep -rn "sendPromptToVscode\|sendChatMessage\|chatPanel\|terminal.*send\|terminal.*writeText\|vscode.*terminal\|createTerminal\|vscode.*command.*execute\|executeCommand.*chat" --include="*.js" --include="*.ts"

# Search for VS Code API usage that drives actions (workbench commands, chat, terminal, editor)
grep -rn "executeCommand.*workbench\.\|executeCommand.*chat\|executeCommand.*terminal\|executeCommand.*editor\|executeCommand.*interactive" --include="*.js" --include="*.ts"

# Search for VS Code API patterns (commands.execute, createTerminal, workspace.onDid, languages.on)
grep -rn "vscode\.commands\.execute\|vscode\.window\.createTerminal\|vscode\.window\.terminals\|vscode\.workspace\.onDid\|vscode\.languages\.on" --include="*.js" --include="*.ts"

# Read process lifecycle module
cat src/vscode.js

# Read VS Code extension entry point
cat vscode-extension/extension.js

# Read VS Code signal collector
cat vscode-extension/collector.js
```

## Terminal Output

### Search 1: Prompt-driving patterns (sendPromptToVscode, sendChatMessage, chatPanel, terminal send/writeText, createTerminal, executeCommand chat)

```
Found 4 matches in 2 files for prompt-driving patterns:
- sprints/SPRINT-12-ANALYSIS.md (lines 217, 245, 288): References to `vscode-terminal-error` signal type (documentation only)
- sprints/SPRINT-12-PLAN.md (line 25): Reference to `vscode-terminal-error` signal type (documentation only)
No code files found that send prompts into VS Code.
```

### Search 2: VS Code API executeCommand (workbench, chat, terminal, editor, interactive)

```
Found 0 matches.
No code calls vscode.commands.execute() for workbench/chat/terminal/editor/interactive commands.
```

### Search 3: VS Code API patterns (commands.execute, createTerminal, workspace.onDid, languages.on)

```
Found 4 matches in 2 files:
- sprints/SPRINT-12-ANALYSIS.md (lines 69, 154): Documentation referencing `vscode.workspace.onDidSaveTextDocument` and `vscode.languages.onDidChangeDiagnostics`
- tests/storage/collector.test.js (lines 400-401): Mock assertions checking `mockVscode.workspace.onDidSaveTextDocument` and `mockVscode.languages.onDidChangeDiagnostics`
No production code directly imports `vscode` — the extension receives the API as a parameter.
```

## Code Evidence

### 1. Process Lifecycle (src/vscode.js) — EXISTS

Three exported functions for VS Code process management:

```javascript
// src/vscode.js
export async function findProcesses() {
  // Uses pgrep (Linux) or tasklist (Windows) to find VS Code PIDs
  // Returns array of { pid, name } objects
}

export async function gracefulClose(pid) {
  // SIGTERM then SIGKILL after 3s delay
  // Used for clean process termination
}

export async function launchWithProfile(profileName) {
  // Spawns `code --profile <name>` as a detached process
  // Uses resolveVSCodeBin() from src/internal/paths.js
}
```

**Consumer**: `src/accounts/switcher.js` uses `findProcesses()` + `launchWithProfile()` for account switching.

### 2. Passive Signal Collection (vscode-extension/collector.js) — EXISTS

`VscodeContextCollector` class collects passive VS Code signals:

```javascript
// vscode-extension/collector.js
export class VscodeContextCollector {
  constructor(outputChannel, config = {}) {
    // Configures stagedSignalsDir, buffer, debounce, exclude patterns
  }

  // Event handlers (passive collection only):
  async _onFileSave(doc, vscodeApi) {
    // Listens to vscode.workspace.onDidSaveTextDocument
    // Stages signal_type: "vscode-edit" with file preview (first 60 lines)
  }

  async _onDiagnosticsChange(event, vscodeApi) {
    // Listens to vscode.languages.onDidChangeDiagnostics
    // Stages signal_type: "vscode-diagnostic" for errors
    // Detects recurring diagnostics -> "vscode-diagnostic-recurring"
  }

  async _onTaskEnd(event) {
    // Listens to vscode.tasks.onDidEndTaskProcess
    // Stages signal_type: "vscode-task-error" for non-zero exit codes
  }

  async _onGitStateChange(repo) {
    // Listens to vscode.git extension API or polls via git CLI
    // Stages signal_type: "vscode-git" for new commits
  }

  // Activation:
  activate(contextOrVscode) {
    // Registers onDidSaveTextDocument, onDidChangeDiagnostics, onDidEndTaskProcess
    // Sets up git listeners (extension API or polling)
    // Starts periodic flush interval
  }

  // Staging and flushing:
  async stageSignal(signal) {
    // Validates, debounces, and buffers signals
  }

  async flush() {
    // Writes buffered signals to stagedSignalsDir as .md files
    // Optionally runs CLI: `llm ingest-staged`
    // Calls ingestStagedSignals() for document ingestion
  }

  async ingestStagedSignals() {
    // Reads staged .md files, splits into documents
    // Uses DocumentIngester to ingest each signal
    // Recurring diagnostics -> MistakeTracker.addMistake()
  }

  deactivate() {
    // Clears flush interval, performs final flush
  }
}
```

### 3. Extension Entry Point (vscode-extension/extension.js) — EXISTS

```javascript
// vscode-extension/extension.js
function activate(context) {
  // Creates output channel
  // Initializes VscodeContextCollector via initializeCollector()
  // Registers commands:
  //   - strategic-learning-unified-theatre.openLlmPanel
  //   - strategic-learning-unified-theatre.showKnowledgeGraph
  //   - strategic-learning-unified-theatre.ingestStagedSignals
  //   - strategic-learning-unified-theatre.togglePassiveLearning
}

async function initializeCollector(context, projectRoot, output) {
  // Loads config, creates VscodeContextCollector, calls collector.activate()
  // Passive signal collection only — no prompt sending
}

async function exportKnowledgeGraph() {
  // Runs CLI command: `llm export-knowledge-graph`
}

async function flushStagedSignals() {
  // Calls collector.flush() to flush staged signals
}
```

### 4. Active Prompt-Driving — NOT FOUND

**No code exists that performs any of the following:**

- Sending a prompt/text into VS Code's Copilot chat panel (`vscode.commands.execute` with chat-related command IDs)
- Writing text into VS Code's integrated terminal (`vscode.window.createTerminal()` + `terminal.sendText()`)
- Driving the command palette (`vscode.commands.execute` with editor/workbench commands)
- Capturing terminal/process output from VS Code for feedback loops
- Any autonomous loop that reads a task, sends a prompt to VS Code, captures output, and iterates

## Verdict

**Missing**

## Notes

- **Process lifecycle exists**: `src/vscode.js` provides `findProcesses()`, `gracefulClose()`, and `launchWithProfile()` — used by `src/accounts/switcher.js` for account switching. This is process management, not prompt-driving.
- **Passive signal collection exists**: `vscode-extension/collector.js` (VscodeContextCollector) listens to VS Code events (file saves, diagnostics, task errors, git commits) and stages them as signals for later ingestion. This is purely passive — it collects data FROM VS Code, never sends commands TO VS Code.
- **No active prompt-driving**: No code sends prompts into VS Code's Copilot chat panel, terminal input, or command palette. No code captures terminal output from VS Code for feedback loops. No autonomous coding loop exists.
- **Engine 8 (Autonomous Coding Loop) is not built**: The infrastructure for passive observation exists, but the active control loop — the ability to drive VS Code by sending prompts and capturing responses — is not implemented.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing.**

Confirmed only process lifecycle (`findProcesses` / `launchWithProfile` in `src/vscode.js`, used by account switcher) and passive collection (`initializeCollector` / `vscode-extension/collector.js`). No code sends prompts into Copilot chat, terminal input, or command palette, and no terminal-output capture loop for autonomous coding. Section headers use Title Case but cover the required content. No material corrections to the verdict.
