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

  it("silently skips search paths that don't exist or aren't readable (line 42)", async () => {
    const d = await makeTempDir();
    const pluginPath = path.join(d, "good-plugin.mjs");
    const code = `export const PLUGIN_API_VERSION = 1; export function getCapabilities(){ return { llmProviders: [{ kind: 'llm-provider', name: 'ok', models: ['a'] }] }; }`;
    await fs.writeFile(pluginPath, code, "utf8");

    const missingRoot = path.join(d, "does-not-exist");

    // Mix a nonexistent root with a real one: fs.readdir throws on the
    // missing path, hitting the catch/continue branch, while the valid
    // root is still scanned successfully afterward.
    PLUGIN_SEARCH_PATHS = [missingRoot, d];
    const loader = await import("../src/plugin-loader.js");

    const res = await loader.loadPlugins();
    expect(res.errors.length).toBe(0);
    expect(res.llmProviders.length).toBe(1);
  });

  it("falls back to default search paths when config provides none (lines 22-28)", async () => {
    // Empty array makes `cfg.policy.pluginSearchPaths.length` falsy, exercising
    // the ternary's default-paths branch. Those hardcoded paths won't exist on
    // a test machine, so this just confirms no crash and an empty/array result.
    PLUGIN_SEARCH_PATHS = [];
    const loader = await import("../src/plugin-loader.js");

    const paths = await loader.discoverPluginPaths();
    expect(Array.isArray(paths)).toBe(true);
  });

  it("skips directory entries within a search path (line 35)", async () => {
    const d = await makeTempDir();
    await fs.mkdir(path.join(d, "a-subdirectory"));
    await fs.writeFile(
      path.join(d, "real-plugin.mjs"),
      `export const PLUGIN_API_VERSION = 1;`,
      "utf8",
    );

    PLUGIN_SEARCH_PATHS = [d];
    const loader = await import("../src/plugin-loader.js");

    const paths = await loader.discoverPluginPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("real-plugin.mjs");
  });

  it("ignores a plugin that returns no capabilities object (line 6)", async () => {
    const d = await makeTempDir();
    const pluginPath = path.join(d, "no-caps-plugin.mjs");
    const code = `export const PLUGIN_API_VERSION = 1; export function getCapabilities(){ return undefined; }`;
    await fs.writeFile(pluginPath, code, "utf8");

    PLUGIN_SEARCH_PATHS = [d];
    const loader = await import("../src/plugin-loader.js");

    const res = await loader.loadPlugins();
    expect(res.errors.length).toBe(0);
    expect(res.llmProviders).toEqual([]);
    expect(res.browserPlatforms).toEqual([]);
    expect(res.healthChecks).toEqual([]);
  });

  it("ignores a plugin whose capabilities object has no recognized fields (line 7)", async () => {
    const d = await makeTempDir();
    const pluginPath = path.join(d, "empty-caps-plugin.mjs");
    const code = `export const PLUGIN_API_VERSION = 1; export function getCapabilities(){ return {}; }`;
    await fs.writeFile(pluginPath, code, "utf8");

    PLUGIN_SEARCH_PATHS = [d];
    const loader = await import("../src/plugin-loader.js");

    const res = await loader.loadPlugins();
    expect(res.errors.length).toBe(0);
    expect(res.llmProviders).toEqual([]);
    expect(res.browserPlatforms).toEqual([]);
    expect(res.healthChecks).toEqual([]);
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
