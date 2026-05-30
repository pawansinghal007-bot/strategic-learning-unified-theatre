export { PLUGIN_API_VERSION } from "../src/plugin-api.js";

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
