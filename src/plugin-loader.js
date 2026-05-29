import fs from "node:fs/promises";
import path from "node:path";
import { assertPluginApiCompatible } from "./plugin-api.js";

async function discoverPluginPaths() {
  const { loadConfig } = await import("./internal/config.js");
  const cfg = await loadConfig();
  const roots =
    Array.isArray(cfg?.policy?.pluginSearchPaths) &&
    cfg.policy.pluginSearchPaths.length
      ? cfg.policy.pluginSearchPaths
      : [
          path.resolve(process.cwd(), "plugins"),
          "/etc/strategic-learning-unified-theatre/plugins",
        ];

  const results = [];
  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (e.name.endsWith(".js") || e.name.endsWith(".mjs")) {
          results.push(path.resolve(root, e.name));
        }
      }
    } catch {
      // silently ignore missing or unreadable directories
      continue;
    }
  }
  return results;
}

export async function loadPlugins() {
  const paths = await discoverPluginPaths();
  const llmProviders = [];
  const browserPlatforms = [];
  const healthChecks = [];
  const errors = [];
  function applyCapabilities(caps, llmProviders, browserPlatforms, healthChecks) {
    if (!caps) return;
    if (caps.llmProviders && Array.isArray(caps.llmProviders)) {
      llmProviders.push(...caps.llmProviders);
    }
    if (caps.browserPlatforms && Array.isArray(caps.browserPlatforms)) {
      browserPlatforms.push(...caps.browserPlatforms);
    }
    if (caps.healthChecks && Array.isArray(caps.healthChecks)) {
      healthChecks.push(...caps.healthChecks);
    }
  }

  for (const filePath of paths) {
    const id = path.basename(filePath);
    try {
      const code = await fs.readFile(filePath, "utf8");
      const mod = await import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
      );
      const plugin = mod.default ?? mod;
      // validate API version against the normalized plugin object
      assertPluginApiCompatible(plugin, id);
      if (typeof plugin.getCapabilities === "function") {
        const caps = await plugin.getCapabilities();
        applyCapabilities(caps, llmProviders, browserPlatforms, healthChecks);
      }
    } catch (err) {
      errors.push({ plugin: id, error: String(err) });
      continue;
    }
  }

  return { llmProviders, browserPlatforms, healthChecks, errors };
}

export { discoverPluginPaths };
