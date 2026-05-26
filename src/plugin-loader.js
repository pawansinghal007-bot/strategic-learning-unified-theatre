import fs from "node:fs/promises";
import path from "node:path";
import { assertPluginApiCompatible } from "./plugin-api.js";

async function discoverPluginPaths() {
  const { loadConfig } = await import("./config.js");
  const cfg = await loadConfig();
  console.log(
    "[plugin-loader] loadConfig ->",
    JSON.stringify({ policy: cfg?.policy }, null, 2),
  );
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
      console.log("[plugin-loader] scanning root", root);
      const entries = await fs.readdir(root, { withFileTypes: true });
      console.log("[plugin-loader] entries count", entries.length);
      for (const e of entries) {
        console.log("[plugin-loader] entry", e.name, "isFile", e.isFile());
        if (!e.isFile()) continue;
        if (e.name.endsWith(".js") || e.name.endsWith(".mjs")) {
          results.push(path.resolve(root, e.name));
        }
      }
    } catch (err) {
      console.log("[plugin-loader] scan error for", root, String(err));
      // silently ignore missing or unreadable directories
      continue;
    }
  }
  console.log("[plugin-loader] discovered paths", results);
  return results;
}

export async function loadPlugins() {
  const paths = await discoverPluginPaths();
  const llmProviders = [];
  const browserPlatforms = [];
  const healthChecks = [];
  const errors = [];

  console.log("[plugin-loader] plugin paths", paths);
  for (const filePath of paths) {
    const id = path.basename(filePath);
    console.log("[plugin-loader] processing plugin", id, filePath);
    try {
      console.log("[plugin-loader] reading plugin file", filePath);
      const code = await fs.readFile(filePath, "utf8");
      const mod = await import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
      );
      console.log(
        "[plugin-loader] imported",
        filePath,
        "keys=",
        Object.keys(mod),
      );
      const plugin = mod.default ?? mod;
      console.log(
        "[plugin-loader] using plugin export keys",
        Object.keys(plugin),
      );
      // validate API version against the normalized plugin object
      assertPluginApiCompatible(plugin, id);
      console.log("[plugin-loader] compatible plugin", id);

      if (typeof plugin.getCapabilities === "function") {
        console.log(
          "[plugin-loader] plugin.getCapabilities is function for",
          id,
        );
        const caps = await plugin.getCapabilities();
        console.log("[plugin-loader] capabilities for", id, caps);
        if (caps?.llmProviders && Array.isArray(caps.llmProviders))
          llmProviders.push(...caps.llmProviders);
        else
          console.log(
            "[plugin-loader] llmProviders missing or invalid for",
            id,
            caps?.llmProviders,
          );
        if (caps?.browserPlatforms && Array.isArray(caps.browserPlatforms))
          browserPlatforms.push(...caps.browserPlatforms);
        else
          console.log(
            "[plugin-loader] browserPlatforms missing or invalid for",
            id,
            caps?.browserPlatforms,
          );
        if (caps?.healthChecks && Array.isArray(caps.healthChecks))
          healthChecks.push(...caps.healthChecks);
        else
          console.log(
            "[plugin-loader] healthChecks missing or invalid for",
            id,
            caps?.healthChecks,
          );
      } else {
        console.log(
          "[plugin-loader] getCapabilities is not a function for",
          id,
          typeof plugin.getCapabilities,
        );
      }
    } catch (err) {
      console.log("[plugin-loader] plugin load error", id, err);
      errors.push({ plugin: id, error: String(err) });
      continue;
    }
  }

  return { llmProviders, browserPlatforms, healthChecks, errors };
}

export { discoverPluginPaths };
