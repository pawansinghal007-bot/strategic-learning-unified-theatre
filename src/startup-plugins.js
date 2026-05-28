import { loadPlugins } from "./plugin-loader.js";
import { registerPluginLlmProviders } from "./plugin-llm-registry.js";
import { registerPluginBrowserPlatforms } from "./plugin-browser-registry.js";

export async function initializePluginsForStartup() {
  try {
    const pluginResult = await loadPlugins();
    if (Array.isArray(pluginResult.errors) && pluginResult.errors.length > 0) {
      console.warn(
        "[plugins] Some plugins failed to load:",
        pluginResult.errors,
      );
    }
    try {
      registerPluginLlmProviders(pluginResult.llmProviders || []);
    } catch (regErr) {
      console.warn(
        "[plugins] registerPluginLlmProviders failed:",
        String(regErr),
      );
    }
    try {
      registerPluginBrowserPlatforms(pluginResult.browserPlatforms || []);
    } catch (regErr) {
      console.warn(
        "[plugins] registerPluginBrowserPlatforms failed:",
        String(regErr),
      );
    }
  } catch (err) {
    console.warn("[plugins] Failed to load plugins (non-fatal):", String(err));
  }
}

export default initializePluginsForStartup;
