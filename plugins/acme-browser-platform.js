export { PLUGIN_API_VERSION } from "../src/plugin-api.js";

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
