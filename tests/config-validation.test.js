/**
 * config-validation.test.js
 * Tests for config schema validation in src/config.js
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadConfig, configPath } from "../src/config.js";
import { DomainError, isDomainError } from "../src/error.js";

/**
 * Helper: create a temporary config directory and override configPath()
 */
async function createTempConfigEnv() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-test-"));
  const configDir = path.join(tmpDir, ".vscode-rotator");
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });
  const configFilePath = path.join(configDir, "config.json");
  return { tmpDir, configDir, configFilePath };
}

/**
 * Helper: override HOME env var for test
 */
function withHomeDir(homeDir, fn) {
  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return fn();
  } finally {
    process.env.HOME = originalHome;
  }
}

describe("Config Validation", () => {
  let env;

  beforeEach(async () => {
    env = await createTempConfigEnv();
    // Override HOME temporarily for configPath()
    process.env.HOME = env.tmpDir;
  });

  afterEach(async () => {
    // Cleanup
    if (process.env.HOME === env.tmpDir) {
      delete process.env.HOME;
    }
    await fs.rm(env.tmpDir, { recursive: true, force: true });
  });

  describe("missing config.json", () => {
    it("returns schema-validated defaults without throwing", async () => {
      // Ensure config file does not exist
      expect(await fs.stat(env.configFilePath).catch(() => null)).toBeNull();

      // Should not throw; should return defaults validated by schema
      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(config.watchedRepos).toEqual([]);
      expect(config.gitPollIntervalMs).toBe(30000);
      expect(config.vscodeLearn).toBeDefined();
      expect(config.vscodeLearn.enabled).toBe(false);
      expect(config.captureSchedule).toBeDefined();
    });
  });

  describe("valid config file", () => {
    it("returns correctly merged config object", async () => {
      const customConfig = {
        watchedRepos: ["/path/to/repo"],
        gitPollIntervalMs: 60000,
        vscodeLearn: {
          enabled: true,
          stagedSignalsDir: "/custom/signals"
        }
      };

      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(customConfig),
        "utf8"
      );

      const config = await loadConfig();
      expect(config.watchedRepos).toEqual(["/path/to/repo"]);
      expect(config.gitPollIntervalMs).toBe(60000);
      expect(config.vscodeLearn.enabled).toBe(true);
      expect(config.vscodeLearn.stagedSignalsDir).toBe("/custom/signals");
      // Verify defaults are still present
      expect(config.vscodeLearn.flushIntervalMs).toBe(30000);
    });

    it("deeply merges vscodeLearn settings", async () => {
      const customConfig = {
        vscodeLearn: {
          enabled: true
          // Other vscodeLearn fields intentionally omitted
        }
      };

      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(customConfig),
        "utf8"
      );

      const config = await loadConfig();
      expect(config.vscodeLearn.enabled).toBe(true);
      expect(config.vscodeLearn.maxSignalAgeDays).toBe(30); // Default
      expect(config.vscodeLearn.allowedExtensions).toHaveLength(10); // Default
    });
  });

  describe("malformed config — strict mode (default)", () => {
    it("rejects invalid JSON with ROTATOR_CONFIG_INVALID", async () => {
      // Write invalid JSON
      await fs.writeFile(env.configFilePath, "{ invalid json }", "utf8");

      // Should throw DomainError in strict mode
      await expect(loadConfig()).rejects.toThrow();
      try {
        await loadConfig();
      } catch (err) {
        expect(isDomainError(err)).toBe(true);
        expect(err.code).toBe("ROTATOR_CONFIG_INVALID");
      }
    });

    it("rejects schema validation failure (type mismatch)", async () => {
      // gitPollIntervalMs as string instead of number
      const badConfig = {
        gitPollIntervalMs: "not a number"
      };

      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(badConfig),
        "utf8"
      );

      // Should throw DomainError in strict mode
      await expect(loadConfig()).rejects.toThrow();
      try {
        await loadConfig();
      } catch (err) {
        expect(isDomainError(err)).toBe(true);
        expect(err.code).toBe("ROTATOR_CONFIG_INVALID");
        expect(err.message).toMatch(/validation|failed/i);
      }
    });

    it("rejects negative gitPollIntervalMs (invalid per schema)", async () => {
      const badConfig = {
        gitPollIntervalMs: -100 // Negative not allowed
      };

      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(badConfig),
        "utf8"
      );

      await expect(loadConfig()).rejects.toThrow();
      try {
        await loadConfig();
      } catch (err) {
        expect(isDomainError(err)).toBe(true);
        expect(err.code).toBe("ROTATOR_CONFIG_INVALID");
      }
    });
  });

  describe("malformed config — fallback mode (ROTATOR_CONFIG_STRICT=0)", () => {
    beforeEach(() => {
      process.env.ROTATOR_CONFIG_STRICT = "0";
    });

    afterEach(() => {
      delete process.env.ROTATOR_CONFIG_STRICT;
    });

    it("logs warning and returns defaults on invalid JSON", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await fs.writeFile(env.configFilePath, "{ invalid json }", "utf8");

      const config = await loadConfig();
      expect(config.watchedRepos).toEqual([]);
      expect(config.gitPollIntervalMs).toBe(30000);
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toMatch(/Invalid JSON|config/);

      consoleWarnSpy.mockRestore();
    });

    it("logs warning and returns defaults on schema validation failure", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const badConfig = { gitPollIntervalMs: "not a number" };
      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(badConfig),
        "utf8"
      );

      const config = await loadConfig();
      expect(config.watchedRepos).toEqual([]);
      expect(config.gitPollIntervalMs).toBe(30000); // Default
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    it("handles empty config object (null merges as default)", async () => {
      await fs.writeFile(env.configFilePath, "{}", "utf8");

      const config = await loadConfig();
      expect(config.watchedRepos).toEqual([]);
      expect(config.gitPollIntervalMs).toBe(30000);
    });

    it("coerces boolean strings in schema", async () => {
      const customConfig = {
        browserResponsesIngest: false
      };

      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(customConfig),
        "utf8"
      );

      const config = await loadConfig();
      expect(config.browserResponsesIngest).toBe(false);
    });

    it("preserves null for nullable fields", async () => {
      const customConfig = {
        enhanceSchedule: null
      };

      await fs.writeFile(
        env.configFilePath,
        JSON.stringify(customConfig),
        "utf8"
      );

      const config = await loadConfig();
      expect(config.enhanceSchedule).toBeNull();
    });
  });
});
