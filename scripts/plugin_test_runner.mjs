import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

(async function () {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pltest-"));
  const pluginPath = path.join(tmp, "good-plugin.mjs");
  const code = `export const PLUGIN_API_VERSION = 1;
export function getCapabilities(){
  return {
    llmProviders: [{ kind: 'llm-provider', name: 'test-llm', models: ['a'] }],
    browserPlatforms: [{ kind: 'browser-platform', name: 'test-browser', url: 'https://x' }],
    healthChecks: [{ kind: 'health-check', name: 'hc', run: async ()=>({ok:true}) }]
  };
}`;
  await fs.writeFile(pluginPath, code, "utf8");
  const cfgPath = path.join(os.homedir(), ".vscode-rotator", "config.json");
  await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  await fs.writeFile(
    cfgPath,
    JSON.stringify({ policy: { pluginSearchPaths: [tmp] } }),
    "utf8",
  );

  try {
    const loader = await import("../src/plugin-loader.js");
    const res = await loader.loadPlugins();
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    try {
      await fs.unlink(cfgPath);
    } catch {}
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {}
  }
})();
