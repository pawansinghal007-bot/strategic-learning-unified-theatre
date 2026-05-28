import { PLUGIN_API_VERSION as CORE_PLUGIN_API_VERSION } from "../src/plugin-api.js";

export const PLUGIN_API_VERSION = CORE_PLUGIN_API_VERSION;

export function getCapabilities() {
  return {
    browserPlatforms: [
      {
        kind: "browser-platform",
        name: "acme-search",
        url: "https://search.example.com",
      },
    ],
  };
}
