import { initializePluginsForStartup } from "../src/startup-plugins.js";

vi.mock("../src/plugin-loader.js", () => ({
  loadPlugins: vi.fn(),
}));
vi.mock("../src/plugin-llm-registry.js", () => ({
  registerPluginLlmProviders: vi.fn(),
}));
vi.mock("../src/plugin-browser-registry.js", () => ({
  registerPluginBrowserPlatforms: vi.fn(),
}));

import { loadPlugins } from "../src/plugin-loader.js";
import { registerPluginLlmProviders } from "../src/plugin-llm-registry.js";
import { registerPluginBrowserPlatforms } from "../src/plugin-browser-registry.js";

describe("Startup plugin initializer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes when no plugins are present", async () => {
    loadPlugins.mockResolvedValue({
      llmProviders: [],
      browserPlatforms: [],
      healthChecks: [],
      errors: [],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(initializePluginsForStartup()).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(registerPluginLlmProviders).toHaveBeenCalledWith([]);
    expect(registerPluginBrowserPlatforms).toHaveBeenCalledWith([]);

    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("logs warnings when loadPlugins reports errors but does not throw", async () => {
    loadPlugins.mockResolvedValue({
      llmProviders: [],
      browserPlatforms: [],
      healthChecks: [],
      errors: [{ plugin: "bad-plugin.mjs", error: "bad" }],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initializePluginsForStartup()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
