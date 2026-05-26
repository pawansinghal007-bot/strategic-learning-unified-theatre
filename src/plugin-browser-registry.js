/**
 * plugin-browser-registry.js
 * Merges plugin browser platforms into built-in PLATFORM_URLS registry.
 * Skips any plugin platform name that already exists (no-op, do not overwrite built-ins).
 */

import { PLATFORM_URLS } from "./browser-pane.js";

/**
 * Register plugin browser platforms into the built-in PLATFORM_URLS.
 *
 * @param {Array<Object>} platforms - Array of plugin capability objects with kind === "browser-platform"
 * Each platform should have:
 *   - name: string (platform name, e.g., "myai", "customgpt")
 *   - kind: string (must be "browser-platform")
 *   - url: string (the platform URL)
 */
export function registerPluginBrowserPlatforms(platforms = []) {
  for (const platform of platforms) {
    // Skip if not a browser-platform
    if (platform.kind !== "browser-platform") {
      continue;
    }

    // Skip if missing required fields
    if (!platform.name || !platform.url) {
      continue;
    }

    // Skip if platform name already exists in built-in registry (do not override)
    if (PLATFORM_URLS.hasOwnProperty(platform.name)) {
      continue;
    }

    // Add new platform to PLATFORM_URLS
    PLATFORM_URLS[platform.name] = platform.url;
  }
}
