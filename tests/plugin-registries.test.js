/**
 * plugin-registries.test.js
 * Tests for plugin LLM and Browser registries.
 * Validates that plugin capabilities are merged safely without overwriting built-ins.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { registerPluginLlmProviders } from "../src/plugin-llm-registry.js";
import { registerPluginBrowserPlatforms } from "../src/plugin-browser-registry.js";
import { MODEL_REGISTRY, OLLAMA_MODEL_REGISTRY } from "../src/llm/local-llm.js";
import { PLATFORM_URLS } from "../src/browser-pane.js";

describe("Plugin LLM Registry", () => {
  beforeEach(() => {
    // Store original state to reset after each test
    this.originalModelKeys = Object.keys(MODEL_REGISTRY).slice();
    this.originalOllamaKeys = Object.keys(OLLAMA_MODEL_REGISTRY).slice();
  });

  afterEach(() => {
    // Clean up any added keys from the plugin tests
    const currentKeys = Object.keys(MODEL_REGISTRY);
    for (const key of currentKeys) {
      if (!this.originalModelKeys.includes(key)) {
        delete MODEL_REGISTRY[key];
      }
    }
  });

  it("should not overwrite existing model keys", () => {
    // Create a provider that tries to override an existing built-in model
    const providers = [
      {
        kind: "llm-provider",
        name: "malicious-plugin",
        models: ["phi3"], // This should NOT overwrite existing phi3
      },
    ];

    const originalPhiValue = MODEL_REGISTRY["phi3"];
    registerPluginLlmProviders(providers);

    // Verify phi3 key was NOT overwritten
    expect(MODEL_REGISTRY["phi3"]).toEqual(originalPhiValue);
  });

  it("should add new model keys successfully", () => {
    const providers = [
      {
        kind: "llm-provider",
        name: "custom-provider",
        models: ["custom-model-1", "custom-model-2"],
      },
    ];

    registerPluginLlmProviders(providers);

    // Verify new model keys were added
    expect(MODEL_REGISTRY["custom-provider-custom-model-1"]).toBeDefined();
    expect(MODEL_REGISTRY["custom-provider-custom-model-2"]).toBeDefined();

    // Verify structure
    expect(MODEL_REGISTRY["custom-provider-custom-model-1"]).toEqual({
      name: "custom-provider-custom-model-1",
      url: null,
      sha256: null,
      pluginProvider: "custom-provider",
    });
  });

  it("should skip non-llm-provider entries", () => {
    const providers = [
      {
        kind: "browser-platform", // Wrong kind
        name: "wrong-kind-plugin",
        models: ["model1"],
      },
      {
        kind: "llm-provider",
        name: "correct-provider",
        models: ["correct-model"],
      },
    ];

    registerPluginLlmProviders(providers);

    // Verify wrong-kind was skipped
    expect(MODEL_REGISTRY["wrong-kind-plugin-model1"]).toBeUndefined();

    // Verify correct one was added
    expect(MODEL_REGISTRY["correct-provider-correct-model"]).toBeDefined();
  });

  it("should skip entries with missing required fields", () => {
    const providers = [
      {
        kind: "llm-provider",
        // missing name
        models: ["model1"],
      },
      {
        kind: "llm-provider",
        name: "valid-provider",
        // missing models
      },
      {
        kind: "llm-provider",
        name: "valid-provider-2",
        models: [], // empty models array
      },
    ];

    registerPluginLlmProviders(providers);

    // Verify nothing was added from invalid entries
    expect(Object.keys(MODEL_REGISTRY)).not.toContain(undefined);
  });
});

describe("Plugin Browser Registry", () => {
  beforeEach(() => {
    // Store original platform names to reset after each test
    this.originalPlatforms = Object.keys(PLATFORM_URLS).slice();
  });

  afterEach(() => {
    // Clean up any added platforms from the plugin tests
    const currentPlatforms = Object.keys(PLATFORM_URLS);
    for (const platform of currentPlatforms) {
      if (!this.originalPlatforms.includes(platform)) {
        delete PLATFORM_URLS[platform];
      }
    }
  });

  it("should not overwrite built-in platform names", () => {
    const platforms = [
      {
        kind: "browser-platform",
        name: "chatgpt", // Built-in name
        url: "https://attacker.com/fake-gpt",
      },
    ];

    const originalUrl = PLATFORM_URLS["chatgpt"];
    registerPluginBrowserPlatforms(platforms);

    // Verify chatgpt URL was NOT overwritten
    expect(PLATFORM_URLS["chatgpt"]).toBe(originalUrl);
    expect(PLATFORM_URLS["chatgpt"]).toBe("https://chat.openai.com/");
  });

  it("should add new platform names successfully", () => {
    const platforms = [
      {
        kind: "browser-platform",
        name: "myai",
        url: "https://myai.example.com/",
      },
      {
        kind: "browser-platform",
        name: "customgpt",
        url: "https://custom.example.com/",
      },
    ];

    registerPluginBrowserPlatforms(platforms);

    // Verify new platforms were added
    expect(PLATFORM_URLS["myai"]).toBe("https://myai.example.com/");
    expect(PLATFORM_URLS["customgpt"]).toBe("https://custom.example.com/");
  });

  it("should skip non-browser-platform entries", () => {
    const platforms = [
      {
        kind: "llm-provider", // Wrong kind
        name: "wrongkind",
        url: "https://wrong.example.com/",
      },
      {
        kind: "browser-platform",
        name: "correctplatform",
        url: "https://correct.example.com/",
      },
    ];

    registerPluginBrowserPlatforms(platforms);

    // Verify wrong-kind was skipped
    expect(PLATFORM_URLS["wrongkind"]).toBeUndefined();

    // Verify correct one was added
    expect(PLATFORM_URLS["correctplatform"]).toBe(
      "https://correct.example.com/",
    );
  });

  it("should skip entries with missing required fields", () => {
    const platforms = [
      {
        kind: "browser-platform",
        // missing name
        url: "https://missing-name.example.com/",
      },
      {
        kind: "browser-platform",
        name: "missing-url",
        // missing url
      },
      {
        kind: "browser-platform",
        name: "valid-platform",
        url: "https://valid.example.com/",
      },
    ];

    registerPluginBrowserPlatforms(platforms);

    // Verify invalid entries were skipped
    expect(PLATFORM_URLS[undefined]).toBeUndefined();
    expect(PLATFORM_URLS["missing-url"]).toBeUndefined();

    // Verify valid one was added
    expect(PLATFORM_URLS["valid-platform"]).toBe("https://valid.example.com/");
  });
});
