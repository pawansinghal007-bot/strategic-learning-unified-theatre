/**
 * startup-plugins-coverage_test.js
 *
 * Covers all remaining uncovered lines in startup-plugins.js:
 *
 *   17     registerPluginLlmProviders throws → inner catch → console.warn
 *   25-29  registerPluginBrowserPlatforms throws → inner catch → console.warn
 *   30-31  loadPlugins itself throws → outer catch → console.warn
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
import { initializePluginsForStartup } from "../src/startup-plugins.js";

const okResult = {
  llmProviders: [],
  browserPlatforms: [],
  healthChecks: [],
  errors: [],
};

describe("startup-plugins: remaining catch branches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── line 17: registerPluginLlmProviders throws ────────────────────────────
  it("warns and continues when registerPluginLlmProviders throws (line 17)", async () => {
    loadPlugins.mockResolvedValue(okResult);
    registerPluginLlmProviders.mockImplementation(() => {
      throw new Error("llm-reg failed");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initializePluginsForStartup()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      "[plugins] registerPluginLlmProviders failed:",
      "Error: llm-reg failed",
    );
    // browserPlatforms registration must still have been attempted
    expect(registerPluginBrowserPlatforms).toHaveBeenCalledWith([]);
  });

  // ── lines 25-29: registerPluginBrowserPlatforms throws ───────────────────
  it("warns and continues when registerPluginBrowserPlatforms throws (lines 25-29)", async () => {
    loadPlugins.mockResolvedValue(okResult);
    registerPluginBrowserPlatforms.mockImplementation(() => {
      throw new Error("browser-reg failed");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initializePluginsForStartup()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      "[plugins] registerPluginBrowserPlatforms failed:",
      "Error: browser-reg failed",
    );
  });

  // ── lines 30-31: loadPlugins itself throws → outer catch ─────────────────
  it("warns non-fatally when loadPlugins rejects (lines 30-31)", async () => {
    loadPlugins.mockRejectedValue(new Error("disk unavailable"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initializePluginsForStartup()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      "[plugins] Failed to load plugins (non-fatal):",
      "Error: disk unavailable",
    );
    // Neither registry should have been called
    expect(registerPluginLlmProviders).not.toHaveBeenCalled();
    expect(registerPluginBrowserPlatforms).not.toHaveBeenCalled();
  });
  // ── lines 15, 23: || [] fallback when fields are null/undefined ──────────
  // `pluginResult.llmProviders || []` and `pluginResult.browserPlatforms || []`
  // take the right-hand `[]` branch only when the field is falsy (null/undefined).
  // All other tests pass explicit `[]` arrays (truthy), so these branches are
  // never hit. This test omits both fields from the resolved value.
  it("falls back to [] when llmProviders and browserPlatforms are absent (lines 15, 23)", async () => {
    loadPlugins.mockResolvedValue({
      // llmProviders and browserPlatforms intentionally omitted → undefined → || [] fires
      healthChecks: [],
      errors: [],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(initializePluginsForStartup()).resolves.toBeUndefined();

    // Both registries must have been called with [] (the fallback)
    expect(registerPluginLlmProviders).toHaveBeenCalledWith([]);
    expect(registerPluginBrowserPlatforms).toHaveBeenCalledWith([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
