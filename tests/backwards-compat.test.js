import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";

import * as configModule from "../src/internal/config.js";
import { loadConfig, ConfigSchema } from "../src/internal/config.js";
import { registerPluginBrowserPlatforms } from "../src/plugin-browser-registry.js";
import { registerPluginLlmProviders } from "../src/plugin-llm-registry.js";
import { MODEL_REGISTRY } from "../src/llm/local-llm.js";
import { PLATFORM_URLS } from "../src/browser-pane.js";
import { loadPlugins } from "../src/plugin-loader.js";

const fixturesDir = path.resolve(process.cwd(), "tests", "fixtures");

function buildTempConfigPath() {
  // Non-cryptographic randomness — used to create a unique test config filename only. // NOSONAR javascript:S2245
  return path.join(
    os.tmpdir(),
    `backwards-compat-config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe("Backwards compatibility", () => {
  it("Old config without policy block parses successfully", async () => {
    const configFile = buildTempConfigPath();
    const userConfig = {
      watchedRepos: ["/repos/workspace"],
      gitPollIntervalMs: 45000,
      storagePaths: ["./storage"],
      storageIndexMaxAgeDays: 21,
      browserResponsesIngest: false,
      enhanceSchedule: null,
      vscodeLearn: {
        enabled: false,
        stagedSignalsDir: null,
        captureSources: ["diagnostic", "editor"],
        maxSignalAgeDays: 30,
        flushIntervalMs: 30000,
        debounceMs: 600000,
        maxFileSizeBytes: 102400,
        excludePatterns: ["**/test/**"],
        hardExcludePatterns: ["**/.git/**"],
        allowedExtensions: [".js", ".ts"],
      },
      browserPaths: {},
      platformTriggers: {},
      captureSchedule: {
        enabled: true,
        intervalMs: 900000,
      },
    };

    await fs.writeFile(configFile, JSON.stringify(userConfig, null, 2), "utf8");
    const configPathSpy = vi
      .spyOn(configModule, "configPath")
      .mockReturnValue(configFile);

    try {
      const result = await loadConfig();
      expect(result).toBeDefined();
      expect(result.policy).toBeDefined();
      expect(result.policy.features).toBeDefined();
      expect(result.policy.features.localDbEnabled).toBe(true);
    } finally {
      configPathSpy.mockRestore();
      await fs.unlink(configFile).catch(() => {});
    }
  });

  it("Pre-15.8 config fixture parses", async () => {
    const fixturePath = path.join(fixturesDir, "config-pre-15.8.json");
    const raw = await fs.readFile(fixturePath, "utf8");
    const fixture = JSON.parse(raw);

    const result = ConfigSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it("Built-in platforms unchanged when no plugins present", () => {
    const originalPlatformKeys = Object.keys(PLATFORM_URLS).slice();

    registerPluginBrowserPlatforms([]);

    expect(PLATFORM_URLS).toHaveProperty("chatgpt");
    expect(PLATFORM_URLS).toHaveProperty("claude");
    expect(PLATFORM_URLS).toHaveProperty("gemini");
    expect(PLATFORM_URLS).toHaveProperty("perplexity");
    expect(Object.keys(PLATFORM_URLS)).toEqual(originalPlatformKeys);
  });

  it("Built-in LLM models unchanged when no plugins present", () => {
    const originalModelKeys = Object.keys(MODEL_REGISTRY).slice();

    registerPluginLlmProviders([]);

    expect(Object.keys(MODEL_REGISTRY)).toEqual(originalModelKeys);
  });

  it("Plugin with wrong API version does not crash startup and lands in errors", async () => {
    const badPluginDir = path.join(fixturesDir, "plugins");
    const loadConfigSpy = vi
      .spyOn(configModule, "loadConfig")
      .mockResolvedValue({ policy: { pluginSearchPaths: [badPluginDir] } });

    try {
      const pluginResult = await loadPlugins();
      expect(pluginResult).toBeDefined();
      expect(pluginResult.errors).toHaveLength(1);
      expect(pluginResult.errors[0]).toEqual(
        expect.objectContaining({ plugin: "bad-version.js" }),
      );
      expect(pluginResult.llmProviders).toEqual([]);
    } finally {
      loadConfigSpy.mockRestore();
    }
  });
});
