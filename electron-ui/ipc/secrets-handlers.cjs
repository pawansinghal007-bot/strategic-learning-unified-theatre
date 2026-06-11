"use strict";

const { ipcMain } = require("electron");

function secrets() {
  return require("../../src/security/secrets/index.js");
}

function registerSecretsHandlers() {
  ipcMain.handle("secrets:scan", async (_event, options) => {
    const { runSecretsScan } = secrets();
    return await runSecretsScan({
      repoPath: options?.repoPath,
      baselinePath: options?.baselinePath ?? null,
      suppressionsPath: options?.suppressionsPath ?? null,
      configPath: options?.configPath ?? null,
      redact: options?.redact !== false,
    });
  });
}

module.exports = { registerSecretsHandlers };
