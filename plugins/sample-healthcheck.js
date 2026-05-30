export { PLUGIN_API_VERSION } from "../src/plugin-api.js";

export function getCapabilities() {
  return {
    healthChecks: [
      {
        kind: "health-check",
        name: "sample-config-health",
        async run() {
          return { ok: true, details: "Sample health check OK" };
        },
      },
    ],
  };
}
