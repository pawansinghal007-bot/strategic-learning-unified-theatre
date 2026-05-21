# VSCode Rotator Extension — Detailed Blueprint

**Generated**: May 21, 2026  
**Project Root**: `E:\VS Code Agent\Solution`  
**Extension Location**: `vscode-extension/`

---

## Table of Contents

1. [Current Extension Status](#current-extension-status)
2. [Available CLI Commands by Namespace](#available-cli-commands-by-namespace)
3. [Proposed VS Code Commands (High Priority)](#proposed-vs-code-commands-high-priority)
4. [Sample TypeScript Implementation](#sample-typescript-implementation)
5. [Package.json Manifest Template](#packagejson-manifest-template)
6. [CLI Command Reference](#cli-command-reference)
7. [Next Steps for Implementation](#next-steps-for-implementation)

---

## Current Extension Status

### File Structure

```
Solution/vscode-extension/
├── package.json          (Manifest with activation events & commands)
├── extension.js          (Main activation & command handlers)
└── README.md            (Installation & usage guide)
```

### Current Commands (2 Implemented)

| Command ID | Title | Activation | Action |
|-----------|-------|-----------|--------|
| `vscode-rotator.showKnowledgeGraph` | VSCode Rotator: Export Knowledge Graph | `onCommand` | Exports knowledge graph to `~/.vscode-rotator/knowledge-graph.json` |
| `vscode-rotator.openLlmPanel` | VSCode Rotator: Open LLM Assistant Panel | `onCommand` | Opens webview with basic UI |

### Current Extension Features

- ✅ Spawns CLI via Node.js `child_process`
- ✅ Captures stdout/stderr to output channel
- ✅ Shows basic webview panel
- ✅ Error handling with user notifications

### Tech Stack

- **Language**: CommonJS (Node.js require)
- **VS Code API**: 1.80.0+
- **CLI Entry**: `src/cli.js` (ESM, Commander.js)
- **Config**: Uses `~/.vscode-rotator/` directory

---

## Available CLI Commands by Namespace

The vscode-rotator CLI (`src/cli.js`) exposes **5 major command namespaces**:

### 1. **handoff** — Sprint Manifest & Resume Prompts

**File**: `src/commands/handoff.js`

```bash
vscode-rotator handoff create
  --goal "..."
  --agent [claude|chatgpt|gemini|perplexity|other]
  --model <name>
  --limit <tokens>
  --status [active|paused|complete]

vscode-rotator handoff list
  [--project <name>]

vscode-rotator handoff get-active

vscode-rotator handoff resume <sprint-id>

vscode-rotator handoff update <sprint-id>
  --tokens-used <n>
  --status [paused|complete]

vscode-rotator handoff close <sprint-id>
  --status [paused|complete]

vscode-rotator handoff import-sprints <file>
```

**Key Use Cases**:
- Track AI agent sessions (who, when, token usage)
- Generate resume prompts to avoid context loss
- Save sprint state for multi-session work

---

### 2. **idea** — Project Ideas with YAML Front-matter

**File**: `src/commands/idea.js`

```bash
vscode-rotator idea create
  --title "..."
  --body "..."
  [--tags tag1,tag2]
  [--priority high|medium|low]

vscode-rotator idea list
  [--project <name>]
  [--tags "tag1,tag2"]
  [--export json|csv]

vscode-rotator idea view <idea-id>

vscode-rotator idea done <idea-id>
  [--notes "..."]

vscode-rotator idea link-to-sprint <idea-id> <sprint-id>

vscode-rotator idea export
  --output <path>
  [--format json|csv|yaml]

vscode-rotator idea update <idea-id>
  [--title "..."]
  [--body "..."]
  [--tags "..."]
```

**Key Use Cases**:
- Store implementation ideas as Markdown with metadata
- Link ideas to sprints for context
- Export ideas for LLM ingestion

---

### 3. **browser** — Multi-LLM Browser Bridge

**File**: `src/commands/browser.js`

```bash
vscode-rotator browser send
  --platform [chatgpt|claude|gemini|perplexity]
  --text "..."
  [--title "..."]

vscode-rotator browser capture
  --platform <platform>
  [--thread]
  [--auto-ingest]

vscode-rotator browser compare
  --file1 <path>
  --file2 <path>
  [--output <path>]

vscode-rotator browser list-responses
  [--platform <platform>]
  [--limit 20]

vscode-rotator browser responses tag <filename>
  --quality [good|bad|partial]
  [--notes "..."]

vscode-rotator browser responses list
  [--quality good|bad]
```

**Key Use Cases**:
- Send prompts to online LLMs via Playwright
- Capture responses automatically
- Tag response quality for training
- Compare different prompt outputs

---

### 4. **storage** — Drive & Folder Monitoring

**File**: `src/commands/storage.js`

```bash
vscode-rotator storage monitor
  --path <directory>
  [--watch]
  [--interval <ms>]

vscode-rotator storage snapshot
  --path <directory>
  [--out <filepath>]
  [--recursive]

vscode-rotator storage export
  --path <directory>
  [--format json]
```

**Key Use Cases**:
- Index local files for LLM ingestion
- Track project changes
- Generate incremental snapshots

---

### 5. **llm** — Local LLM & Experience Database

**File**: `src/commands/llm.js`

```bash
vscode-rotator llm setup
  [--model phi3|tinyllama]
  [--model-path <path>]
  [--base-dir <dir>]

vscode-rotator llm ask
  "<question>"
  [--system "<prompt>"]
  [--model-path <path>]

vscode-rotator llm generate-prompt
  --goal "..."
  [--platform claude|chatgpt]
  [--project <name>]

vscode-rotator llm ingest
  [--source <path>]
  [--incremental]

vscode-rotator llm enhance
  --goal "..."
  [--platform <platform>]
  [--auto]
  [--rate <1-5>]

vscode-rotator llm topics
  [--k 5]
  [--output json]

vscode-rotator llm related
  --to "..."
  [--limit 10]

vscode-rotator llm export-knowledge-graph
  --out <path>
  [--format json|graphml]

vscode-rotator llm mistakes list
  [--limit 20]

vscode-rotator llm rubric list
```

**Key Use Cases**:
- Run local LLM inference (no cloud API calls)
- Generate context-aware prompts for online LLMs
- Ingest documents into experience DB
- Find related past sprints/ideas/responses
- Export knowledge graph for visualization

---

## Proposed VS Code Commands (High Priority)

### **Command 1: Quick LLM Prompt**

```
ID: vscode-rotator.llmQuickPrompt
Title: VSCode Rotator: Ask Local LLM
Keybinding: Ctrl+Shift+L
Activation: onCommand
```

**Behavior**:
1. Show input box: "Ask the local LLM:"
2. Run: `vscode-rotator llm ask "<query>"`
3. Show response in output channel
4. Notify user when complete

**Use Case**: Quick inline questions without leaving VS Code

---

### **Command 2: Generate Implementation Prompt**

```
ID: vscode-rotator.generateImplementationPrompt
Title: VSCode Rotator: Generate Implementation Prompt
Activation: onCommand
```

**Behavior**:
1. Show input box: "Implementation goal:"
2. Show quick pick: Select platform (chatgpt, claude, gemini)
3. Run: `vscode-rotator llm generate-prompt --goal "..." --platform <selected>`
4. Copy result to clipboard
5. Show in output channel

**Use Case**: Generate refined prompts based on project context before sending to online LLM

---

### **Command 3: View Active Sprint**

```
ID: vscode-rotator.showActiveHandoff
Title: VSCode Rotator: View Active Sprint
Activation: onCommand + onStartupFinished (optional)
```

**Behavior**:
1. Run: `vscode-rotator handoff get-active`
2. Render in webview panel (two-column layout)
3. Show: Sprint ID, goal, token budget, status, resume prompt
4. Add button to copy resume prompt

**Use Case**: Track current session state without leaving VS Code

---

### **Command 4: Ingest Current Workspace**

```
ID: vscode-rotator.ingestCurrentFiles
Title: VSCode Rotator: Ingest Current Workspace
Activation: onCommand
```

**Behavior**:
1. Detect workspace folder
2. Run: `vscode-rotator storage snapshot --path <workspace>`
3. Run: `vscode-rotator llm ingest`
4. Show progress notification
5. Display doc count + embeddings generated

**Use Case**: Make current project files available as context for future prompts

---

### **Command 5: Send to Browser**

```
ID: vscode-rotator.sendPromptToBrowser
Title: VSCode Rotator: Send Prompt to ChatGPT/Claude
Activation: onCommand
```

**Behavior**:
1. Quick pick platform (chatgpt, claude, gemini, perplexity)
2. Input box: "Paste prompt:"
3. Run: `vscode-rotator browser send --platform <selected> --text "..."`
4. Notify: "Check your browser for the response"

**Use Case**: Send refined prompts to online LLMs without manual copy-paste

---

### **Command 6: Find Related Context**

```
ID: vscode-rotator.findRelatedContext
Title: VSCode Rotator: Find Related Context
Keybinding: Ctrl+Shift+R
Activation: onCommand + onEditorChange (background)
```

**Behavior**:
1. Show input box: "What's your current problem?"
2. Run: `vscode-rotator llm related --to "..."`
3. Display results in sidebar tree view:
   - Related sprints (with dates)
   - Related ideas (with tags)
   - Related LLM responses (with quality)

**Use Case**: Surface past context that might help solve current problem

---

### **Command 7: List Project Ideas**

```
ID: vscode-rotator.listProjectIdeas
Title: VSCode Rotator: List Project Ideas
Activation: onCommand + onStartupFinished
```

**Behavior**:
1. Run: `vscode-rotator idea list --export json`
2. Render tree view (by priority/tags)
3. Allow click to view idea details
4. Show "Mark Done" context menu

**Use Case**: View & manage all project ideas from sidebar

---

### **Command 8: Create New Idea**

```
ID: vscode-rotator.createNewIdea
Title: VSCode Rotator: Create Idea
Activation: onCommand
```

**Behavior**:
1. Input: Title, body (multi-line), tags (comma-separated)
2. Quick pick: Priority (high/medium/low)
3. Run: `vscode-rotator idea create --title "..." --body "..." --tags "..." --priority ...`
4. Auto-open created idea file
5. Refresh ideas tree view

**Use Case**: Quickly capture implementation ideas during development

---

### **Command 9: Export Knowledge Graph**

```
ID: vscode-rotator.showKnowledgeGraph
Title: VSCode Rotator: Export Knowledge Graph
Activation: onCommand + onStartupFinished (optional)
```

**Enhancement from current**:
- Add graph visualization in webview
- Filter by topic/tag
- Show connections between docs/ideas/sprints
- Export as JSON/GraphML for external visualization

**Use Case**: Understand knowledge structure at a glance

---

## Sample TypeScript Implementation

### **Extension Activation Pattern**

```javascript
// extension.js
const vscode = require("vscode");
const cp = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

/**
 * Run a vscode-rotator CLI command and return stdout/stderr
 */
function runCli(args, cwd = undefined) {
  return new Promise((resolve, reject) => {
    const projectRoot = path.join(__dirname, "..");
    const cliPath = path.join(projectRoot, "src", "cli.js");
    
    const proc = cp.spawn(process.execPath, [cliPath, ...args], {
      cwd: cwd || os.homedir(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "", stderr = "";
    
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(`CLI exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}

async function activate(context) {
  const output = vscode.window.createOutputChannel("VSCode Rotator");
  context.subscriptions.push(output);

  // =====================
  // Command 1: Quick Ask
  // =====================
  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-rotator.llmQuickPrompt", async () => {
      const question = await vscode.window.showInputBox({
        prompt: "Ask the local LLM:",
        placeHolder: "Your question...",
        ignoreFocusOut: true
      });

      if (!question) return;

      output.show(true);
      output.appendLine(`\n[${new Date().toISOString()}] Question: ${question}`);

      try {
        const result = await runCli(["llm", "ask", question]);
        output.appendLine(`\nAnswer:\n${result.stdout}`);
        
        vscode.window.showInformationMessage(
          "Local LLM response ready — see Output channel"
        );
      } catch (err) {
        vscode.window.showErrorMessage(`LLM Error: ${err.message}`);
        output.appendLine(`ERROR: ${err.message}`);
      }
    })
  );

  // =====================
  // Command 2: Generate Prompt
  // =====================
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-rotator.generateImplementationPrompt",
      async () => {
        const goal = await vscode.window.showInputBox({
          prompt: "Implementation goal:",
          placeHolder: "e.g., Implement a retry handler for failed requests",
          ignoreFocusOut: true
        });

        if (!goal) return;

        const platform = await vscode.window.showQuickPick(
          ["chatgpt", "claude", "gemini"],
          { placeHolder: "Target LLM platform" }
        );

        if (!platform) return;

        output.show(true);
        output.appendLine(`\n[${new Date().toISOString()}] Goal: ${goal}`);
        output.appendLine(`Platform: ${platform}`);
        output.appendLine("Generating...\n");

        try {
          const result = await runCli([
            "llm",
            "generate-prompt",
            "--goal",
            goal,
            "--platform",
            platform
          ]);

          output.appendLine(result.stdout);

          // Copy to clipboard
          await vscode.env.clipboard.writeText(result.stdout);

          vscode.window.showInformationMessage(
            "✓ Prompt generated and copied to clipboard!"
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Generate Error: ${err.message}`);
        }
      }
    )
  );

  // =====================
  // Command 3: View Active Sprint
  // =====================
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-rotator.showActiveHandoff",
      async () => {
        try {
          const result = await runCli(["handoff", "get-active"]);

          const panel = vscode.window.createWebviewPanel(
            "vscodeRotatorHandoff",
            "Active Sprint",
            vscode.ViewColumn.Two,
            { enableScripts: false, retainContextWhenHidden: true }
          );

          const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Active Sprint</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      line-height: 1.6;
    }
    h2 { margin-bottom: 20px; color: var(--vscode-activityBar-foreground); }
    .section {
      background: var(--vscode-editor-lineHighlightBackground);
      border-left: 3px solid var(--vscode-notebookStatusSuccessIcon-foreground);
      padding: 16px;
      margin-bottom: 16px;
      border-radius: 4px;
    }
    .label { font-weight: 600; color: var(--vscode-symbolIcon-numberForeground); }
    .value {
      font-family: 'Courier New', monospace;
      background: var(--vscode-input-background);
      padding: 8px 12px;
      border-radius: 3px;
      margin-top: 6px;
      word-break: break-all;
      white-space: pre-wrap;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 3px;
      cursor: pointer;
      margin-top: 10px;
      font-size: 13px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <h2>Active Sprint</h2>
  <div class="section">
    <div class="label">Status & Goal:</div>
    <div class="value">${escapeHtml(result.stdout)}</div>
  </div>
  <button onclick="copyToClipboard()">Copy Resume Prompt</button>
  <script>
    function copyToClipboard() {
      const text = document.querySelector('.value').textContent;
      navigator.clipboard.writeText(text);
      alert('Copied!');
    }
  </script>
</body>
</html>
          `;

          panel.webview.html = htmlContent;
        } catch (err) {
          vscode.window.showErrorMessage(`Handoff Error: ${err.message}`);
        }
      }
    )
  );

  // =====================
  // Command 4: Ingest Workspace
  // =====================
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-rotator.ingestCurrentFiles",
      async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showWarningMessage("No workspace folder open");
          return;
        }

        const folderPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Ingesting workspace...",
            cancellable: false
          },
          async (progress) => {
            try {
              output.show(true);
              output.appendLine(
                `\n[${new Date().toISOString()}] Ingesting: ${folderPath}`
              );

              progress.report({ message: "Creating storage snapshot..." });
              await runCli([
                "storage",
                "snapshot",
                "--path",
                folderPath
              ]);

              progress.report({ message: "Ingesting documents into experience DB..." });
              const result = await runCli(["llm", "ingest"]);

              output.appendLine(result.stdout);
              vscode.window.showInformationMessage(
                "✓ Workspace ingested! Check output for details."
              );
            } catch (err) {
              vscode.window.showErrorMessage(`Ingest Error: ${err.message}`);
              output.appendLine(`ERROR: ${err.message}`);
            }
          }
        );
      }
    )
  );

  // =====================
  // Command 5: Send to Browser
  // =====================
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-rotator.sendPromptToBrowser",
      async () => {
        const platforms = ["chatgpt", "claude", "gemini", "perplexity"];
        const platform = await vscode.window.showQuickPick(platforms, {
          placeHolder: "Select LLM platform"
        });

        if (!platform) return;

        const prompt = await vscode.window.showInputBox({
          prompt: `Paste prompt for ${platform}:`,
          placeHolder: "Your prompt...",
          ignoreFocusOut: true
        });

        if (!prompt) return;

        output.show(true);
        output.appendLine(
          `\n[${new Date().toISOString()}] Sending to ${platform}...`
        );

        try {
          await runCli(["browser", "send", "--platform", platform, "--text", prompt]);

          output.appendLine(`Prompt sent! Check your ${platform} browser tab.`);
          vscode.window.showInformationMessage(
            `✓ Prompt sent to ${platform}. Check your browser.`
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Browser Error: ${err.message}`);
        }
      }
    )
  );

  // =====================
  // Command 6: Find Related Context
  // =====================
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-rotator.findRelatedContext",
      async () => {
        const question = await vscode.window.showInputBox({
          prompt: "What's your current problem or question?",
          placeHolder: "e.g., How do I handle async errors?",
          ignoreFocusOut: true
        });

        if (!question) return;

        output.show(true);
        output.appendLine(
          `\n[${new Date().toISOString()}] Finding related context...`
        );
        output.appendLine(`Query: "${question}"\n`);

        try {
          const result = await runCli(["llm", "related", "--to", question]);
          output.appendLine(result.stdout);
          vscode.window.showInformationMessage(
            "✓ Related context loaded — see Output channel"
          );
        } catch (err) {
          vscode.window.showErrorMessage(`Related Error: ${err.message}`);
        }
      }
    )
  );
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function deactivate() {}

module.exports = { activate, deactivate };
```

---

## Package.json Manifest Template

```json
{
  "name": "vscode-rotator-extension",
  "displayName": "VSCode Rotator Assistant",
  "description": "Intelligent local dev assistant: capture LLM responses, ingest project context, generate refined prompts, track sprints.",
  "version": "0.1.0",
  "publisher": "vscode-rotator",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/vscode-rotator.git"
  },
  "engines": {
    "vscode": "^1.80.0",
    "node": ">=18.0.0"
  },
  "main": "extension.js",
  "activationEvents": [
    "onCommand:vscode-rotator.llmQuickPrompt",
    "onCommand:vscode-rotator.generateImplementationPrompt",
    "onCommand:vscode-rotator.showActiveHandoff",
    "onCommand:vscode-rotator.ingestCurrentFiles",
    "onCommand:vscode-rotator.sendPromptToBrowser",
    "onCommand:vscode-rotator.findRelatedContext",
    "onCommand:vscode-rotator.listProjectIdeas",
    "onCommand:vscode-rotator.createNewIdea",
    "onCommand:vscode-rotator.showKnowledgeGraph",
    "onStartupFinished"
  ],
  "contributes": {
    "commands": [
      {
        "command": "vscode-rotator.llmQuickPrompt",
        "title": "VSCode Rotator: Ask Local LLM",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.generateImplementationPrompt",
        "title": "VSCode Rotator: Generate Implementation Prompt",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.showActiveHandoff",
        "title": "VSCode Rotator: View Active Sprint",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.ingestCurrentFiles",
        "title": "VSCode Rotator: Ingest Current Workspace",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.sendPromptToBrowser",
        "title": "VSCode Rotator: Send Prompt to ChatGPT/Claude",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.findRelatedContext",
        "title": "VSCode Rotator: Find Related Context",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.listProjectIdeas",
        "title": "VSCode Rotator: List Project Ideas",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.createNewIdea",
        "title": "VSCode Rotator: Create Idea",
        "category": "VSCode Rotator"
      },
      {
        "command": "vscode-rotator.showKnowledgeGraph",
        "title": "VSCode Rotator: Export Knowledge Graph",
        "category": "VSCode Rotator"
      }
    ],
    "keybindings": [
      {
        "command": "vscode-rotator.llmQuickPrompt",
        "key": "ctrl+shift+l",
        "mac": "cmd+shift+l",
        "when": "editorTextFocus || !editorFocus"
      },
      {
        "command": "vscode-rotator.findRelatedContext",
        "key": "ctrl+shift+r",
        "mac": "cmd+shift+r",
        "when": "editorTextFocus"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "vscode-rotator-sidebar",
          "title": "VSCode Rotator",
          "icon": "$(lightbulb)"
        }
      ]
    },
    "views": {
      "vscode-rotator-sidebar": [
        {
          "id": "vscode-rotator.ideaView",
          "name": "Ideas",
          "type": "tree"
        },
        {
          "id": "vscode-rotator.relatedView",
          "name": "Related Context",
          "type": "tree"
        },
        {
          "id": "vscode-rotator.sprintView",
          "name": "Current Sprint",
          "type": "webview"
        }
      ]
    },
    "menus": {
      "view/title": [
        {
          "command": "vscode-rotator.createNewIdea",
          "when": "view == vscode-rotator.ideaView",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "vscode-rotator.markIdeaDone",
          "when": "viewItem == idea",
          "group": "inline"
        }
      ]
    }
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0"
  }
}
```

---

## CLI Command Reference

### handoff Commands

| Command | Arguments | Example |
|---------|-----------|---------|
| create | `--goal`, `--agent`, `--model`, `--limit`, `--status` | `handoff create --goal "Build auth module" --agent claude` |
| list | `--project` | `handoff list --project myapp` |
| get-active | (none) | `handoff get-active` |
| resume | `<sprint-id>` | `handoff resume abc123def456` |
| update | `<sprint-id>`, `--tokens-used`, `--status` | `handoff update abc123 --tokens-used 5000` |
| close | `<sprint-id>`, `--status` | `handoff close abc123 --status complete` |

### idea Commands

| Command | Arguments | Example |
|---------|-----------|---------|
| create | `--title`, `--body`, `--tags`, `--priority` | `idea create --title "Add retry logic" --priority high` |
| list | `--project`, `--tags`, `--export` | `idea list --export json` |
| view | `<idea-id>` | `idea view idea-001` |
| done | `<idea-id>`, `--notes` | `idea done idea-001 --notes "Merged to main"` |
| link-to-sprint | `<idea-id>`, `<sprint-id>` | `idea link-to-sprint idea-001 abc123` |
| export | `--output`, `--format` | `idea export --output ideas.json --format json` |

### browser Commands

| Command | Arguments | Example |
|---------|-----------|---------|
| send | `--platform`, `--text`, `--title` | `browser send --platform chatgpt --text "What is..."` |
| capture | `--platform`, `--thread`, `--auto-ingest` | `browser capture --platform claude --thread --auto-ingest` |
| compare | `--file1`, `--file2`, `--output` | `browser compare --file1 resp1.md --file2 resp2.md` |
| list-responses | `--platform`, `--limit` | `browser list-responses --limit 10` |
| responses tag | `<filename>`, `--quality`, `--notes` | `browser responses tag resp.md --quality good --notes "..."` |

### storage Commands

| Command | Arguments | Example |
|---------|-----------|---------|
| monitor | `--path`, `--watch`, `--interval` | `storage monitor --path ./src --watch` |
| snapshot | `--path`, `--out`, `--recursive` | `storage snapshot --path ./src --out snap.json` |
| export | `--path`, `--format` | `storage export --path ./docs --format json` |

### llm Commands

| Command | Arguments | Example |
|---------|-----------|---------|
| setup | `--model`, `--model-path`, `--base-dir` | `llm setup --model phi3` |
| ask | `<question>`, `--system`, `--model-path` | `llm ask "How to refactor?" --system "You are a code reviewer"` |
| generate-prompt | `--goal`, `--platform`, `--project` | `llm generate-prompt --goal "Add auth" --platform claude` |
| ingest | `--source`, `--incremental` | `llm ingest --incremental` |
| enhance | `--goal`, `--platform`, `--auto`, `--rate` | `llm enhance --goal "..." --platform chatgpt --auto` |
| topics | `--k`, `--output` | `llm topics --k 5 --output json` |
| related | `--to`, `--limit` | `llm related --to "async error handling" --limit 10` |
| export-knowledge-graph | `--out`, `--format` | `llm export-knowledge-graph --out graph.json` |
| mistakes list | `--limit` | `llm mistakes list --limit 20` |
| rubric list | (none) | `llm rubric list` |

---

## Next Steps for Implementation

### Phase 1: Core Commands (Weeks 1-2)
- [ ] Implement Commands 1-5 in extension.js
- [ ] Test CLI integration (verify child_process calls work)
- [ ] Add output channel logging
- [ ] Create webview for sprint view (Command 3)
- [ ] Verify keybindings (Ctrl+Shift+L, Ctrl+Shift+R)

### Phase 2: Sidebar Views (Weeks 2-3)
- [ ] Create tree view data providers for Ideas
- [ ] Create tree view data providers for Related Context
- [ ] Implement "Create Idea" dialog
- [ ] Implement "Mark Done" context menu

### Phase 3: Status Bar & UI Polish (Week 4)
- [ ] Add status bar item showing active sprint
- [ ] Add settings/configuration UI
- [ ] Create icons/assets for activity bar
- [ ] Add theme support (light/dark)

### Phase 4: Auto-actions & Background Tasks (Week 5)
- [ ] Background: Auto-ingest on file save
- [ ] Background: Auto-update sprint view
- [ ] Auto-complete suggestions in prompts
- [ ] File watcher for idea/response files

### Phase 5: Knowledge Graph Visualization (Week 6)
- [ ] Implement graph rendering in webview
- [ ] Add filtering/search
- [ ] Export to Cytoscape.js compatible format
- [ ] Interactive node click -> show details

---

## Key Integration Points

### CLI Entry Point
```
src/cli.js → Commander.js program
├── commands/handoff.js
├── commands/idea.js
├── commands/browser.js
├── commands/storage.js
└── commands/llm.js
```

### Data Files
```
~/.vscode-rotator/
├── accounts.enc
├── config.json
├── sprints/             (sprint manifests)
├── ideas/               (idea markdown files)
├── experience.db        (SQLite)
├── browser-responses/   (captured responses)
├── knowledge-graph.json (exported)
└── models/              (local GGUF models)
```

### Extension Context
```
Extension runs in: Main thread (VS Code extension host)
CLI runs in: Child process (Node.js)
IPC: stdout/stderr capture via child_process
```

---

## File Locations Summary

| Item | Path |
|------|------|
| Project Root | `E:\VS Code Agent\Solution` |
| Extension Scaffold | `Solution/vscode-extension/` |
| CLI Entry | `Solution/src/cli.js` |
| Command Modules | `Solution/src/commands/` |
| LLM Core | `Solution/src/llm/` |
| Config Directory | `~/.vscode-rotator/` |
| **This Blueprint** | **Solution/VSCODE-EXTENSION-BLUEPRINT.md** |

---

**Generated**: May 21, 2026  
**For**: Claude (AI Assistant)  
**Purpose**: Implement VS Code extension commands that integrate vscode-rotator CLI

