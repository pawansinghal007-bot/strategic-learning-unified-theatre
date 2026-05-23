# Strategic Learning Unified Theatre Extension Scaffold

This folder contains a minimal VS Code extension scaffold for the VS Code Rotator project.

## Features

- `strategic-learning-unified-theatre.showKnowledgeGraph` command to run the local CLI export
- `strategic-learning-unified-theatre.openLlmPanel` command to open a lightweight assistant panel

## Installation

1. Open the `vscode-extension` folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run the command `Strategic Learning Unified Theatre: Export Knowledge Graph` or `Strategic Learning Unified Theatre: Open LLM Assistant Panel`.

## Notes

- The scaffold uses the repo root `src/cli.js` command entrypoint.
- The export output is written to `~/.vscode-rotator/knowledge-graph.json` by default.

