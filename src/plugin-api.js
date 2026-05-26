/**
 * Plugin API contract for Sprint 15.8
 */

/**
 * @typedef {Object} LlmProviderCapability
 * @property {"llm-provider"} kind
 * @property {string} name
 * @property {string[]} models
 */

/**
 * @typedef {Object} BrowserPlatformCapability
 * @property {"browser-platform"} kind
 * @property {string} name
 * @property {string} url
 */

/**
 * @typedef {Object} HealthCheckCapability
 * @property {"health-check"} kind
 * @property {string} name
 * @property {() => Promise<{ok:boolean, details?:string}>} run
 */

/**
 * @typedef {Object} PluginCapabilities
 * @property {LlmProviderCapability[]} [llmProviders]
 * @property {BrowserPlatformCapability[]} [browserPlatforms]
 * @property {HealthCheckCapability[]} [healthChecks]
 */

export const PLUGIN_API_VERSION = 1;

/**
 * Assert that a plugin module is compatible with the host plugin API.
 * @param {any} pluginModule
 * @param {string} pluginId
 */
export function assertPluginApiCompatible(pluginModule, pluginId) {
  const found = pluginModule && pluginModule.PLUGIN_API_VERSION;
  if (found === undefined) {
    throw new Error(
      `Plugin "${pluginId}" missing PLUGIN_API_VERSION (expected ${PLUGIN_API_VERSION})`,
    );
  }
  if (!Number.isInteger(found)) {
    throw new Error(
      `Plugin "${pluginId}" has non-integer PLUGIN_API_VERSION=${found} (expected integer ${PLUGIN_API_VERSION})`,
    );
  }
  if (found !== PLUGIN_API_VERSION) {
    throw new Error(
      `Plugin "${pluginId}" PLUGIN_API_VERSION mismatch: plugin=${found} expected=${PLUGIN_API_VERSION}`,
    );
  }
}
