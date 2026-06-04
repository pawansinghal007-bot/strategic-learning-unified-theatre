"use strict";

const { ipcMain } = require("electron");

const VALID_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];
const VALID_MODES = ["cloud", "hybrid", "local-only"];

function getPolicy() {
  return require("../../src/policies/provider-policy.js").getProviderPolicy();
}

function registerProviderPolicyHandlers() {
  ipcMain.handle("providerPolicy:get", async () => {
    return getPolicy();
  });

  ipcMain.handle("providerPolicy:setMode", async (_event, mode) => {
    if (!VALID_MODES.includes(mode))
      throw new Error(`Unknown routing mode: ${mode}`);
    return require("../../src/policies/provider-policy.js").setRoutingMode(
      mode,
    );
  });

  ipcMain.handle("providerPolicy:allow", async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider))
      throw new Error(`Unknown provider: ${provider}`);
    return require("../../src/policies/provider-policy.js").allowProvider(
      provider,
    );
  });

  ipcMain.handle("providerPolicy:block", async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider))
      throw new Error(`Unknown provider: ${provider}`);
    return require("../../src/policies/provider-policy.js").blockProvider(
      provider,
    );
  });

  ipcMain.handle(
    "providerPolicy:setManualProvider",
    async (_event, provider) => {
      if (provider && !VALID_PROVIDERS.includes(provider))
        throw new Error(`Unknown provider: ${provider}`);
      return require("../../src/policies/provider-policy.js").setManualProvider(
        provider ?? null,
      );
    },
  );

  ipcMain.handle("providerPolicy:reset", async () => {
    return require("../../src/policies/provider-policy.js").resetProviderPolicy();
  });
}

module.exports = { registerProviderPolicyHandlers };
