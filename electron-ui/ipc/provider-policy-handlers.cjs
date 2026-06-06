"use strict";

const { ipcMain } = require("electron");
const { appendAuditEvent } = require("../../src/audit/audit-log.js");

const VALID_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];
const VALID_MODES = ["cloud", "hybrid", "local-only"];

function policy() {
  return require("../../src/policies/provider-policy.js");
}

function presets() {
  return require("../../src/policies/policy-presets.js");
}

function registerProviderPolicyHandlers() {
  ipcMain.handle("providerPolicy:get", async () => {
    return policy().getProviderPolicy();
  });

  ipcMain.handle("providerPolicy:listPresets", async () => {
    return presets().listPolicyPresets();
  });

  ipcMain.handle("providerPolicy:applyPreset", async (_event, name) => {
    if (!presets().isPolicyPresetName(name)) {
      throw new Error(`Unknown preset: ${name}`);
    }

    const result = policy().applyPolicyPreset(name);

    appendAuditEvent({
      action: "policy.applyPreset",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { preset: name },
    });

    return result;
  });

  ipcMain.handle("providerPolicy:setMode", async (_event, mode) => {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Unknown routing mode: ${mode}`);
    }

    const result = policy().setRoutingMode(mode);

    appendAuditEvent({
      action: "policy.setRoutingMode",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { mode },
    });

    return result;
  });

  ipcMain.handle("providerPolicy:allow", async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const result = policy().allowProvider(provider);

    appendAuditEvent({
      action: "policy.allowProvider",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { provider },
    });

    return result;
  });

  ipcMain.handle("providerPolicy:block", async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const result = policy().blockProvider(provider);

    appendAuditEvent({
      action: "policy.blockProvider",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { provider },
    });

    return result;
  });

  ipcMain.handle(
    "providerPolicy:setManualProvider",
    async (_event, provider) => {
      if (provider && !VALID_PROVIDERS.includes(provider)) {
        throw new Error(`Unknown provider: ${provider}`);
      }

      const result = policy().setManualProvider(provider ?? null);

      appendAuditEvent({
        action: "policy.setManualProvider",
        actor: { type: "renderer" },
        targetType: "providerPolicy",
        details: {
          provider: provider ?? null,
        },
      });

      return result;
    },
  );

  ipcMain.handle("providerPolicy:reset", async () => {
    const result = policy().resetProviderPolicy();

    appendAuditEvent({
      action: "policy.reset",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
    });

    return result;
  });
}

module.exports = { registerProviderPolicyHandlers };
