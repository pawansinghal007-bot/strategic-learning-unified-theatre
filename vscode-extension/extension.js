const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

function activate(context) {
  const output = vscode.window.createOutputChannel("VSCode Rotator");
  context.subscriptions.push(output);

  const projectRoot = path.join(context.extensionPath, "..");
  const cliPath = path.join(projectRoot, "src", "cli.js");
  const outPath = path.join(os.homedir(), ".vscode-rotator", "knowledge-graph.json");

  function runNodeCli(scriptPath, args, cwd) {
    return new Promise((resolve, reject) => {
      const proc = cp.spawn(process.execPath, [scriptPath, ...args], {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"]
      });

      proc.stdout.on("data", (chunk) => output.append(chunk.toString()));
      proc.stderr.on("data", (chunk) => output.append(chunk.toString()));

      proc.on("error", (err) => reject(err));
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
    });
  }

  async function exportKnowledgeGraph() {
    output.show(true);
    output.appendLine(`Exporting knowledge graph to ${outPath}`);

    try {
      await runNodeCli(cliPath, ["llm", "export-knowledge-graph", "--out", outPath], projectRoot);
      vscode.window.showInformationMessage(`Knowledge graph exported to ${outPath}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Knowledge graph export failed: ${String(err.message)}`);
      output.appendLine(`Error: ${String(err.message)}`);
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-rotator.showKnowledgeGraph", exportKnowledgeGraph)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-rotator.openLlmPanel", async () => {
      const panel = vscode.window.createWebviewPanel(
        "vscodeRotatorAssistant",
        "VSCode Rotator Assistant",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = getWebviewContent(outPath);
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === "exportGraph") {
          await exportKnowledgeGraph();
        }
      });
    })
  );
}

function deactivate() {}

function getWebviewContent(outPath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VSCode Rotator Assistant</title>
  <style>
    body { font-family: sans-serif; padding: 16px; }
    button { padding: 10px 14px; font-size: 14px; }
    .status { margin-top: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>VSCode Rotator Assistant</h1>
  <p>Export your local knowledge graph or run basic LLM assistant commands from VS Code.</p>
  <button id="export">Export Knowledge Graph</button>
  <div class="status">Default output path: <code>${outPath}</code></div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById("export").addEventListener("click", () => {
      vscode.postMessage({ command: "exportGraph" });
    });
  </script>
</body>
</html>`;
}

module.exports = { activate, deactivate };