# VSCode Rotator Extension Scaffold

This folder contains a minimal VS Code extension scaffold for the VS Code Rotator project.

## Features

- `vscode-rotator.showKnowledgeGraph` command to run the local CLI export
- `vscode-rotator.openLlmPanel` command to open a lightweight assistant panel

## Installation

1. Open the `vscode-extension` folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Run the command `VSCode Rotator: Export Knowledge Graph` or `VSCode Rotator: Open LLM Assistant Panel`.

## Notes

- The scaffold uses the repo root `src/cli.js` command entrypoint.
- The export output is written to `~/.vscode-rotator/knowledge-graph.json` by default.
