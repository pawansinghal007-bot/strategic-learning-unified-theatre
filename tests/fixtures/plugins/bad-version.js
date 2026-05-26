export const PLUGIN_API_VERSION = 999;

export async function getCapabilities() {
  return {
    llmProviders: [
      {
        name: "bad-llm",
        kind: "llm-provider",
        models: ["legacy-model"],
      },
    ],
  };
}
