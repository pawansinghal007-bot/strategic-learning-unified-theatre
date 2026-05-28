const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vscode = require("vscode");

let collectorInstance = null;
let collectorDisposable = null;

function activate(context) {
  const output = vscode.window.createOutputChannel("Strategic Learning Unified Theatre");
  context.subscriptions.push(output);

  const projectRoot = path.join(context.extensionPath, "..");
  const cliPath = path.join(projectRoot, "src", "cli.js");
  const outPath = path.join(os.homedir(), ".vscode-rotator", "knowledge-graph.json");

  // Initialize and activate the collector
  initializeCollector(context, projectRoot, output);
  // Start supervisor bootstrap in the background (<500ms impact)
  const bootstrapUrl = pathToFileURL(path.join(projectRoot, "src", "startup-bootstrap.js")).href;
  import(bootstrapUrl).then(({ initializeStartupBootstrap }) => {
    initializeStartupBootstrap({
      log: (msg) => output.appendLine(msg),
      error: (msg) => output.appendLine(msg)
    });
  }).catch(err => output.appendLine('[Supervisor] Bootstrap import failed: ' + String(err.message)));


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
    vscode.commands.registerCommand("strategic-learning-unified-theatre.showKnowledgeGraph", exportKnowledgeGraph)
  );

  async function flushStagedSignals() {
    output.show(true);
    output.appendLine("Flushing staged VS Code learning signals...");

    try {
      if (collectorInstance && typeof collectorInstance.flush === "function") {
        const results = await collectorInstance.flush();
        const ingested = results.filter((row) => !row.skipped).length;
        output.appendLine(`Flushed ${results.length} staged signals, ingested ${ingested}.`);
        vscode.window.showInformationMessage(`Flushed ${results.length} staged signals`);
      } else {
        output.appendLine("Collector not initialized; creating new instance...");
        const configModuleUrl = pathToFileURL(path.join(projectRoot, "src", "internal", "config.js")).href;
        const collectorModuleUrl = pathToFileURL(path.join(context.extensionPath, "collector.js")).href;
        const { loadConfig } = await import(configModuleUrl);
        const { VscodeContextCollector } = await import(collectorModuleUrl);
        const config = await loadConfig();
        const collector = new VscodeContextCollector(output, { ...config, cliPath });
        const collectorDisposable = collector.activate(context);
        const results = await collector.flush();
        collectorDisposable?.dispose?.();
        const ingested = results.filter((row) => !row.skipped).length;
        output.appendLine(`Flushed ${results.length} staged signals, ingested ${ingested}.`);
        vscode.window.showInformationMessage(`Flushed ${results.length} staged signals`);
      }
    } catch (err) {
      output.appendLine(`Error flushing staged signals: ${String(err.message)}`);
      vscode.window.showErrorMessage(`Flush failed: ${String(err.message)}`);
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("strategic-learning-unified-theatre.openLlmPanel", async () => {
      const panel = vscode.window.createWebviewPanel(
        "strategicLearningUnifiedTheatreAssistant",
        "Strategic Learning Unified Theatre Assistant",
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

  context.subscriptions.push(
    vscode.commands.registerCommand("strategic-learning-unified-theatre.ingestStagedSignals", flushStagedSignals)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("strategic-learning-unified-theatre.togglePassiveLearning", async () => {
      output.show(true);
      output.appendLine("Toggling passive learning...");
      const configModuleUrl = pathToFileURL(path.join(projectRoot, "src", "internal", "config.js")).href;
      const { loadConfig, saveConfig } = await import(configModuleUrl);
      const config = await loadConfig();
      const next = {
        ...config,
        vscodeLearn: {
          ...config.vscodeLearn,
          enabled: !Boolean(config.vscodeLearn?.enabled)
        }
      };
      await saveConfig(next);
      const status = next.vscodeLearn.enabled ? "enabled" : "disabled";
      output.appendLine(`[vscode-learn] passive learning ${status}`);
      vscode.window.showInformationMessage(`Passive learning ${status}. Restart extension to apply.`);
    })
  );

  // Register disposable for collector cleanup
  context.subscriptions.push({
    dispose: () => {
      if (collectorDisposable && typeof collectorDisposable.dispose === "function") {
        collectorDisposable.dispose();
      }
      if (collectorInstance && typeof collectorInstance.deactivate === "function") {
        collectorInstance.deactivate();
      }
    }
  });
}

async function initializeCollector(context, projectRoot, output) {
  try {
    const configModuleUrl = pathToFileURL(path.join(projectRoot, "src", "internal", "config.js")).href;
    const collectorModuleUrl = pathToFileURL(path.join(context.extensionPath, "collector.js")).href;

    const { loadConfig } = await import(configModuleUrl);
    const { VscodeContextCollector } = await import(collectorModuleUrl);

    const config = await loadConfig();
    collectorInstance = new VscodeContextCollector(output, { ...config, cliPath });

    // Activate the collector with VS Code event handlers
    collectorDisposable = collectorInstance.activate(context);

    output.appendLine("[vscode-learn] Collector initialized and activated");
  } catch (err) {
    output.appendLine(`[vscode-learn] Failed to initialize collector: ${String(err.message)}`);
  }
}

function deactivate() {
  if (collectorInstance && typeof collectorInstance.deactivate === "function") {
    collectorInstance.deactivate();
  }
  if (collectorDisposable && typeof collectorDisposable.dispose === "function") {
    collectorDisposable.dispose();
  }
}

function getWebviewContent(outPath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Strategic Learning Unified Theatre Assistant</title>
  <style>
    body { font-family: sans-serif; padding: 16px; }
    button { padding: 10px 14px; font-size: 14px; }
    .status { margin-top: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>Strategic Learning Unified Theatre Assistant</h1>
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
