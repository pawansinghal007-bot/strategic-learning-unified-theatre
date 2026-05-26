/**
 * plugin-llm-registry.js
 * Merges plugin LLM providers into built-in MODEL_REGISTRY and OLLAMA_MODEL_REGISTRY.
 * Skips any plugin model key that already exists in built-in registries (no-op override).
 */

import { MODEL_REGISTRY, OLLAMA_MODEL_REGISTRY } from "./local-llm.js";

/**
 * Register plugin LLM providers into the built-in registries.
 *
 * @param {Array<Object>} providers - Array of plugin capability objects with kind === "llm-provider"
 * Each provider should have:
 *   - name: string (provider name)
 *   - kind: string (must be "llm-provider")
 *   - models: Array<string> (model names provided)
 */
export function registerPluginLlmProviders(providers = []) {
  for (const provider of providers) {
    // Skip if not an llm-provider
    if (provider.kind !== "llm-provider") {
      continue;
    }

    // Ensure provider has a name and models array
    if (!provider.name || !Array.isArray(provider.models)) {
      continue;
    }

    for (const modelName of provider.models) {
      const key = `${provider.name}-${modelName}`;

      // Skip if key already exists in either registry (do not override built-ins)
      if (
        MODEL_REGISTRY.hasOwnProperty(key) ||
        OLLAMA_MODEL_REGISTRY.hasOwnProperty(key)
      ) {
        continue;
      }

      // Add new model to MODEL_REGISTRY
      MODEL_REGISTRY[key] = {
        name: key,
        url: null,
        sha256: null,
        pluginProvider: provider.name,
      };
    }
  }
}
