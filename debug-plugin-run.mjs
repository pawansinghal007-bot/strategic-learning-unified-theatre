import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as loader from "./src/plugin-loader.js";

async function main() {
  const tmpdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "plugin-loader-debug-"),
  );
  const pluginPath = path.join(tmpdir, "good-plugin.mjs");
  const code = `export const PLUGIN_API_VERSION = 1;
export function getCapabilities(){
  return {
    llmProviders: [{ kind: 'llm-provider', name: 'test-llm', models: ['a'] }],
    browserPlatforms: [{ kind: 'browser-platform', name: 'test-browser', url: 'https://x' }],
    healthChecks: [{ kind: 'health-check', name: 'hc', run: async ()=>({ok:true}) }]
  };
}`;
  await fs.writeFile(pluginPath, code, "utf8");

  console.log("pluginPath", pluginPath);
  const mod = await import(pathToFileURL(pluginPath).href);
  console.log("imported module keys", Object.keys(mod));
  console.log("is getCapabilities function?", typeof mod.getCapabilities);
  const caps = await mod.getCapabilities();
  console.log("caps", caps);
  console.log(
    "llmProviders array?",
    Array.isArray(caps.llmProviders),
    caps.llmProviders,
  );
  console.log(
    "browserPlatforms array?",
    Array.isArray(caps.browserPlatforms),
    caps.browserPlatforms,
  );
  console.log(
    "healthChecks array?",
    Array.isArray(caps.healthChecks),
    caps.healthChecks,
  );

  const res = await loader.loadPlugins();
  console.log("loader result", JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
