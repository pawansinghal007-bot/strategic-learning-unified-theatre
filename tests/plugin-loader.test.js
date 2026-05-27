import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function makeTempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "plugin-loader-test-"));
}

// Use a mutable variable for the mocked config so the hoisted vi.mock factory
// can reference it safely before tests run.
let PLUGIN_SEARCH_PATHS = [];
vi.mock("../src/internal/config.js", () => ({
  loadConfig: async () => ({
    policy: { pluginSearchPaths: PLUGIN_SEARCH_PATHS },
  }),
}));

describe("plugin-loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty capabilities for directory with no .js files", async () => {
    const d = await makeTempDir();
    await fs.writeFile(path.join(d, "readme.txt"), "no plugins here");

    PLUGIN_SEARCH_PATHS = [d];
    const loader = await import("../src/plugin-loader.js");

    const res = await loader.loadPlugins();
    expect(res.llmProviders).toEqual([]);
    expect(res.browserPlatforms).toEqual([]);
    expect(res.healthChecks).toEqual([]);
    expect(res.errors.length).toBe(0);
  });

  it("places wrong API version plugin into errors", async () => {
    const d = await makeTempDir();
    const pluginPath = path.join(d, "bad-plugin.mjs");
    const code = `export const PLUGIN_API_VERSION = 2; export function getCapabilities(){ return { llmProviders: [] }; }`;
    await fs.writeFile(pluginPath, code, "utf8");

    PLUGIN_SEARCH_PATHS = [d];
    const loader = await import("../src/plugin-loader.js");

    const res = await loader.loadPlugins();
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0].plugin).toBe("bad-plugin.mjs");
  });

  it("collects capabilities from a valid plugin", async () => {
    const d = await makeTempDir();
    const pluginPath = path.join(d, "good-plugin.mjs");
    const code = `export const PLUGIN_API_VERSION = 1;
export function getCapabilities(){
  return {
    llmProviders: [{ kind: 'llm-provider', name: 'test-llm', models: ['a'] }],
    browserPlatforms: [{ kind: 'browser-platform', name: 'test-browser', url: 'https://x' }],
    healthChecks: [{ kind: 'health-check', name: 'hc', run: async ()=>({ok:true}) }]
  };
}`;
    await fs.writeFile(pluginPath, code, "utf8");

    PLUGIN_SEARCH_PATHS = [d];
    const loader = await import("../src/plugin-loader.js");

    const res = await loader.loadPlugins();
    expect(res.llmProviders.length).toBe(1);
    expect(res.browserPlatforms.length).toBe(1);
    expect(res.healthChecks.length).toBe(1);
    expect(res.errors.length).toBe(0);
  });
});
