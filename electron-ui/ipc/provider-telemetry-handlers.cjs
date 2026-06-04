'use strict';

const { ipcMain } = require('electron');

const VALID_PROVIDERS = ['groq', 'gemini', 'openai', 'perplexity', 'local'];

function isValidProvider(provider) {
  if (!provider) return true;
  return VALID_PROVIDERS.includes(provider);
}

function registerProviderTelemetryHandlers() {
  // Lazy require to avoid loading at startup before app is ready
  function getStatus() {
    return require('../../src/llm/status.js').getProviderStatus();
  }

  function getUsage() {
    return require('../../src/llm/provider-usage.js').getProviderUsage();
  }

  function resetHealth(provider) {
    return require('../../src/llm/status.js').resetProviderStatus(provider);
  }

  function resetUsage(provider) {
    return require('../../src/llm/provider-usage.js').resetProviderUsage(provider);
  }

  function resetAll(provider) {
    return require('../../src/llm/status.js').resetAllProviderTelemetry(provider);
  }

  ipcMain.handle('providerTelemetry:getStatus', async () => {
    return getStatus();
  });

  ipcMain.handle('providerTelemetry:getUsage', async () => {
    return getUsage();
  });

  ipcMain.handle('providerTelemetry:resetHealth', async (_event, provider) => {
    if (!isValidProvider(provider)) throw new Error(`Unknown provider: ${provider}`);
    resetHealth(provider);
    return { ok: true };
  });

  ipcMain.handle('providerTelemetry:resetUsage', async (_event, provider) => {
    if (!isValidProvider(provider)) throw new Error(`Unknown provider: ${provider}`);
    resetUsage(provider);
    return { ok: true };
  });

  ipcMain.handle('providerTelemetry:resetAll', async (_event, provider) => {
    if (!isValidProvider(provider)) throw new Error(`Unknown provider: ${provider}`);
    resetAll(provider);
    return { ok: true };
  });
}

module.exports = { registerProviderTelemetryHandlers };