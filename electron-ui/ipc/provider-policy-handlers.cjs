'use strict';

const { ipcMain } = require('electron');

const VALID_PROVIDERS = ['groq', 'gemini', 'openai', 'perplexity', 'local'];
const VALID_MODES = ['cloud', 'hybrid', 'local-only'];

function policy() {
  return require('../../src/policies/provider-policy.js');
}

function presets() {
  return require('../../src/policies/policy-presets.js');
}

function registerProviderPolicyHandlers() {
  ipcMain.handle('providerPolicy:get', async () => {
    return policy().getProviderPolicy();
  });

  ipcMain.handle('providerPolicy:listPresets', async () => {
    return presets().listPolicyPresets();
  });

  ipcMain.handle('providerPolicy:applyPreset', async (_event, name) => {
    if (!presets().isPolicyPresetName(name))
      throw new Error(`Unknown preset: ${name}`);
    return policy().applyPolicyPreset(name);
  });

  ipcMain.handle('providerPolicy:setMode', async (_event, mode) => {
    if (!VALID_MODES.includes(mode))
      throw new Error(`Unknown routing mode: ${mode}`);
    return policy().setRoutingMode(mode);
  });

  ipcMain.handle('providerPolicy:allow', async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider))
      throw new Error(`Unknown provider: ${provider}`);
    return policy().allowProvider(provider);
  });

  ipcMain.handle('providerPolicy:block', async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider))
      throw new Error(`Unknown provider: ${provider}`);
    return policy().blockProvider(provider);
  });

  ipcMain.handle('providerPolicy:setManualProvider', async (_event, provider) => {
    if (provider && !VALID_PROVIDERS.includes(provider))
      throw new Error(`Unknown provider: ${provider}`);
    return policy().setManualProvider(provider ?? null);
  });

  ipcMain.handle('providerPolicy:reset', async () => {
    return policy().resetProviderPolicy();
  });
}

module.exports = { registerProviderPolicyHandlers };
