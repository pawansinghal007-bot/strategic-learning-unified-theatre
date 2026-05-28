import { PLUGIN_API_VERSION as CORE_PLUGIN_API_VERSION } from "../src/plugin-api.js";

export const PLUGIN_API_VERSION = CORE_PLUGIN_API_VERSION;

export function getCapabilities() {
  return {
    llmProviders: [
      {
        kind: "llm-provider",
        name: "acme-llm",
        models: ["acme-chat-1", "acme-code-1"],
      },
    ],
  };
}
