/**
 * config-policy.test.js
 * Tests for policy schema, enterprise config loading, and policy validation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  loadConfig,
  assertFeatureEnabled,
  DEFAULT_CONFIG,
} from "../src/internal/config.js";

describe("Config Policy Schema", () => {
  it("parses config without policy block and returns policy with defaults", async () => {
    // Temporarily set HOME to a temp directory with no config
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "config-test-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      // No config file exists, should use defaults
      const config = await loadConfig();

      expect(config.policy).toBeDefined();
      expect(config.policy.apiVersion).toBe("1");
      expect(config.policy.features).toBeDefined();
      expect(config.policy.features.localDbEnabled).toBe(true);
      expect(config.policy.features.browserCaptureEnabled).toBe(true);
      expect(config.policy.features.llmCommandsEnabled).toBe(true);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  it("throws with 'Startup aborted' when policy has invalid type", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "config-invalid-"),
    );
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      // Create a config with invalid policy (allowedPlatforms should be array, not string)
      const configDir = path.join(tempHome, ".vscode-rotator");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.json");

      const invalidConfig = {
        ...DEFAULT_CONFIG,
        policy: {
          ...DEFAULT_CONFIG.policy,
          allowedPlatforms: "not-an-array", // Invalid: should be array
        },
      };

      await fs.writeFile(configPath, JSON.stringify(invalidConfig), "utf8");

      // Should throw with "Startup aborted" in message
      await expect(loadConfig()).rejects.toThrow("Startup aborted");
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});

describe("Feature Policy Enforcement", () => {
  it("assertFeatureEnabled throws when feature is false", () => {
    const config = {
      policy: {
        features: {
          localDbEnabled: false,
          browserCaptureEnabled: true,
        },
      },
    };

    expect(() => assertFeatureEnabled(config, "localDbEnabled")).toThrow(
      'Feature "localDbEnabled" is disabled by policy.',
    );
  });

  it("assertFeatureEnabled does not throw when feature is true", () => {
    const config = {
      policy: {
        features: {
          localDbEnabled: true,
          browserCaptureEnabled: true,
        },
      },
    };

    expect(() => assertFeatureEnabled(config, "localDbEnabled")).not.toThrow();
  });

  it("assertFeatureEnabled does not throw when feature is undefined", () => {
    const config = {
      policy: {
        features: {
          localDbEnabled: true,
        },
      },
    };

    expect(() => assertFeatureEnabled(config, "unknownFeature")).not.toThrow();
  });

  it("assertFeatureEnabled includes context in error message", () => {
    const config = {
      policy: {
        features: {
          localDbEnabled: false,
        },
      },
    };

    expect(() =>
      assertFeatureEnabled(config, "localDbEnabled", "startup"),
    ).toThrow('Feature "localDbEnabled" is disabled by policy (startup).');
  });

  it("assertFeatureEnabled handles missing policy gracefully", () => {
    const config = {}; // No policy at all

    expect(() => assertFeatureEnabled(config, "localDbEnabled")).not.toThrow();
  });
});

describe("Enterprise Config Override", () => {
  it("enterprise override takes precedence over user config", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "config-enterprise-"),
    );
    const tempEnterprise = await fs.mkdtemp(
      path.join(os.tmpdir(), "enterprise-"),
    );
    const originalHome = process.env.HOME;
    const originalEnv = process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG;

    try {
      process.env.HOME = tempHome;
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = path.join(
        tempEnterprise,
        "policy.json",
      );

      // Create user config with one setting
      const configDir = path.join(tempHome, ".vscode-rotator");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.json");

      const userConfig = {
        ...DEFAULT_CONFIG,
        policy: {
          ...DEFAULT_CONFIG.policy,
          apiVersion: "1",
          features: {
            localDbEnabled: true,
            browserCaptureEnabled: true,
            llmCommandsEnabled: true,
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(userConfig), "utf8");

      // Create enterprise override that disables a feature
      const enterpriseConfig = {
        policy: {
          features: {
            localDbEnabled: false, // Enterprise override
          },
        },
      };

      await fs.writeFile(
        path.join(tempEnterprise, "policy.json"),
        JSON.stringify(enterpriseConfig),
        "utf8",
      );

      // Load config
      const config = await loadConfig();

      // Enterprise override should take precedence
      expect(config.policy.features.localDbEnabled).toBe(false);
      // Other settings from user config should remain
      expect(config.policy.features.browserCaptureEnabled).toBe(true);
    } finally {
      process.env.HOME = originalHome;
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = originalEnv;
      await fs.rm(tempHome, { recursive: true, force: true });
      await fs.rm(tempEnterprise, { recursive: true, force: true });
    }
  });

  it("loads YAML enterprise config when present", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "config-yaml-"));
    const tempEnterprise = await fs.mkdtemp(
      path.join(os.tmpdir(), "enterprise-yaml-"),
    );
    const originalHome = process.env.HOME;
    const originalEnv = process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG;

    try {
      process.env.HOME = tempHome;
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = path.join(
        tempEnterprise,
        "policy.yaml",
      );

      // Create user config
      const configDir = path.join(tempHome, ".vscode-rotator");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.json");

      const userConfig = {
        ...DEFAULT_CONFIG,
        policy: {
          ...DEFAULT_CONFIG.policy,
          features: {
            localDbEnabled: true,
            browserCaptureEnabled: true,
            llmCommandsEnabled: true,
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(userConfig), "utf8");

      // Create YAML enterprise override
      const yamlContent = `
policy:
  features:
    llmCommandsEnabled: false
`;
      await fs.writeFile(
        path.join(tempEnterprise, "policy.yaml"),
        yamlContent,
        "utf8",
      );

      // Load config
      const config = await loadConfig();

      // YAML enterprise override should be applied
      expect(config.policy.features.llmCommandsEnabled).toBe(false);
      expect(config.policy.features.localDbEnabled).toBe(true);
    } finally {
      process.env.HOME = originalHome;
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = originalEnv;
      await fs.rm(tempHome, { recursive: true, force: true });
      await fs.rm(tempEnterprise, { recursive: true, force: true });
    }
  });

  it("gracefully handles missing enterprise config", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "config-no-ent-"));
    const originalHome = process.env.HOME;
    const originalEnv = process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG;

    try {
      process.env.HOME = tempHome;
      // Point to non-existent enterprise config
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG =
        "/nonexistent/path/policy.json";

      // Create user config
      const configDir = path.join(tempHome, ".vscode-rotator");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.json");

      const userConfig = {
        ...DEFAULT_CONFIG,
        policy: {
          ...DEFAULT_CONFIG.policy,
          features: {
            localDbEnabled: true,
          },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(userConfig), "utf8");

      // Should not throw; should fall back to user config
      const config = await loadConfig();

      expect(config.policy.features.localDbEnabled).toBe(true);
    } finally {
      process.env.HOME = originalHome;
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = originalEnv;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});

describe("Policy Schema Validation", () => {
  it("validates allowedPlatforms as optional array", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "config-platforms-"),
    );
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = tempHome;

      const configDir = path.join(tempHome, ".vscode-rotator");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.json");

      const validConfig = {
        ...DEFAULT_CONFIG,
        policy: {
          ...DEFAULT_CONFIG.policy,
          allowedPlatforms: ["chatgpt", "claude"],
        },
      };

      await fs.writeFile(configPath, JSON.stringify(validConfig), "utf8");

      const config = await loadConfig();
      expect(config.policy.allowedPlatforms).toEqual(["chatgpt", "claude"]);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  it("validates watchRepos structure with branch default", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "config-repos-"));
    const originalHome = process.env.HOME;

    try {
      process.env.HOME = tempHome;

      const configDir = path.join(tempHome, ".vscode-rotator");
      await fs.mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.json");

      const validConfig = {
        ...DEFAULT_CONFIG,
        policy: {
          ...DEFAULT_CONFIG.policy,
          watchRepos: [
            { path: "/repo1", branch: "main" },
            { path: "/repo2" }, // branch should default to "main"
          ],
        },
      };

      await fs.writeFile(configPath, JSON.stringify(validConfig), "utf8");

      const config = await loadConfig();
      expect(config.policy.watchRepos).toBeDefined();
      expect(config.policy.watchRepos.length).toBe(2);
      expect(config.policy.watchRepos[1].branch).toBe("main");
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});
