import { PLUGIN_API_VERSION as CORE_PLUGIN_API_VERSION } from "../src/plugin-api.js";

export const PLUGIN_API_VERSION = CORE_PLUGIN_API_VERSION;

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
