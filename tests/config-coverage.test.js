/**
 * config-coverage_test.js
 *
 * Covers all remaining uncovered lines in config.js:
 *
 *   217-221  loadEnterpriseConfigOverride: YAML parse fails → warn + continue
 *   229-233  loadEnterpriseConfigOverride: JSON parse fails → warn + continue
 *   248-258  readConfigFile: unreadable file → strict throws; non-strict warns + null
 *   264      parseUserConfig: raw is null → return DEFAULT_CONFIG early
 *   313      loadConfig: loadEnterpriseConfigOverride throws → outer catch warns
 *   356-369  saveConfig: normal write + rename-conflict fallback (unlink + rename)
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  loadConfig,
  saveConfig,
  configPath,
  DEFAULT_CONFIG,
} from "../src/internal/config.js";

async function makeTempHome() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cfg-cov-"));
  return tmpDir;
}

describe("config.js: remaining coverage", () => {
  let tmpDir;
  let origHome;
  let origStrict;
  let origEnterprise;

  beforeEach(async () => {
    tmpDir = await makeTempHome();
    origHome = process.env.HOME;
    origStrict = process.env.ROTATOR_CONFIG_STRICT;
    origEnterprise = process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG;
    process.env.HOME = tmpDir;
    delete process.env.ROTATOR_CONFIG_STRICT;
    delete process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env.HOME = origHome;
    if (origStrict === undefined) delete process.env.ROTATOR_CONFIG_STRICT;
    else process.env.ROTATOR_CONFIG_STRICT = origStrict;
    if (origEnterprise === undefined)
      delete process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG;
    else process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = origEnterprise;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── lines 217-221: YAML enterprise config parse fails ─────────────────────
  it("warns and continues when YAML enterprise config is malformed (lines 217-221)", async () => {
    const yamlDir = await fs.mkdtemp(path.join(os.tmpdir(), "ent-yaml-bad-"));
    try {
      const yamlFile = path.join(yamlDir, "bad.yaml");
      // Write content that looks like YAML but is structurally invalid for yaml.parse
      // (e.g. duplicate keys that trigger parse error in strict yaml parsers)
      await fs.writeFile(yamlFile, "key: : invalid : yaml ::", "utf8");
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = yamlFile;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Should not throw; bad YAML is skipped, falls through to null
      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(
        warnSpy.mock.calls.some((c) =>
          String(c[0]).includes("Failed to parse YAML"),
        ),
      ).toBe(true);
    } finally {
      await fs.rm(yamlDir, { recursive: true, force: true });
    }
  });

  // ── lines 229-233: JSON enterprise config parse fails ─────────────────────
  it("warns and continues when JSON enterprise config is malformed (lines 229-233)", async () => {
    const entDir = await fs.mkdtemp(path.join(os.tmpdir(), "ent-json-bad-"));
    try {
      const jsonFile = path.join(entDir, "bad.json");
      await fs.writeFile(jsonFile, "{ not valid json !!!", "utf8");
      process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG = jsonFile;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(
        warnSpy.mock.calls.some((c) =>
          String(c[0]).includes("Failed to parse JSON"),
        ),
      ).toBe(true);
    } finally {
      await fs.rm(entDir, { recursive: true, force: true });
    }
  });

  // ── lines 248-255: readConfigFile strict — unreadable file throws ──────────
  // The config file path exists but is not readable (mode 0o000).
  it("throws DomainError in strict mode when config file is unreadable (lines 248-255)", async () => {
    const configDir = path.join(tmpDir, ".vscode-rotator");
    await fs.mkdir(configDir, { recursive: true });
    const cfgFile = path.join(configDir, "config.json");
    await fs.writeFile(cfgFile, '{"watchedRepos":[]}', "utf8");
    await fs.chmod(cfgFile, 0o000); // unreadable

    try {
      await expect(loadConfig()).rejects.toMatchObject({
        code: "ROTATOR_CONFIG_INVALID",
        message: expect.stringContaining("Failed to read config file"),
      });
    } finally {
      await fs.chmod(cfgFile, 0o644); // restore so cleanup works
    }
  });

  // ── lines 257-258: readConfigFile non-strict — warns and returns null ──────
  // null raw → parseUserConfig returns DEFAULT_CONFIG (line 264 also covered)
  it("warns and returns defaults in non-strict mode when config file is unreadable (lines 257-258, 264)", async () => {
    process.env.ROTATOR_CONFIG_STRICT = "0";
    const configDir = path.join(tmpDir, ".vscode-rotator");
    await fs.mkdir(configDir, { recursive: true });
    const cfgFile = path.join(configDir, "config.json");
    await fs.writeFile(cfgFile, '{"watchedRepos":[]}', "utf8");
    await fs.chmod(cfgFile, 0o000);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const config = await loadConfig();
      // readConfigFile returns null → parseUserConfig(null) → line 264 fires
      expect(config.watchedRepos).toEqual([]);
      expect(config.gitPollIntervalMs).toBe(30000);
      expect(
        warnSpy.mock.calls.some((c) =>
          String(c[0]).includes("Failed to read config file"),
        ),
      ).toBe(true);
    } finally {
      await fs.chmod(cfgFile, 0o644);
    }
  });

  // ── line 313: loadEnterpriseConfigOverride throws → outer catch in loadConfig
  // enterpriseConfigCandidates() calls [].filter(Boolean) on an array literal.
  // Code outside all try/catch in loadEnterpriseConfigOverride:
  //   const candidates = enterpriseConfigCandidates();   ← calls filter()
  //   for (const filePath of candidates) { ... }
  // We make Array.prototype.filter throw for one call so enterpriseConfigCandidates
  // throws → propagates out of loadEnterpriseConfigOverride → caught at line 312.
  it("warns when loadEnterpriseConfigOverride throws unexpectedly (line 313)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const origFilter = Array.prototype.filter;
    let filterCallCount = 0;
    Array.prototype.filter = function (...args) {
      filterCallCount++;
      // Throw on the first call to filter() after this spy is set up.
      // enterpriseConfigCandidates calls [env, path1, path2].filter(Boolean).
      if (filterCallCount === 1) {
        throw new Error("simulated filter failure");
      }
      return origFilter.apply(this, args);
    };

    try {
      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(
        warnSpy.mock.calls.some((c) =>
          String(c[0]).includes("Error loading enterprise config"),
        ),
      ).toBe(true);
    } finally {
      Array.prototype.filter = origFilter;
    }
  });

  // ── lines 356-364: saveConfig — normal write path ─────────────────────────
  it("saveConfig writes config atomically via tmp file and rename (lines 356-364)", async () => {
    const config = { ...DEFAULT_CONFIG, gitPollIntervalMs: 45000 };

    // saveConfig uses configPath() which resolves to HOME/.vscode-rotator/config.json
    await saveConfig(config);

    const cfgFile = path.join(tmpDir, ".vscode-rotator", "config.json");
    const written = JSON.parse(await fs.readFile(cfgFile, "utf8"));
    expect(written.gitPollIntervalMs).toBe(45000);
  });

  // ── lines 365-370: saveConfig rename-conflict fallback (unlink + rename) ───
  // Simulate a rename failure (EXDEV: cross-device rename) so the fallback
  // unlink + rename path executes.
  it("saveConfig falls back to unlink+rename when rename throws (lines 365-370)", async () => {
    const config = { ...DEFAULT_CONFIG, gitPollIntervalMs: 99000 };

    // Write an existing config file first
    const configDir = path.join(tmpDir, ".vscode-rotator");
    await fs.mkdir(configDir, { recursive: true });
    const cfgFile = path.join(configDir, "config.json");
    await fs.writeFile(cfgFile, '{"gitPollIntervalMs":1}', "utf8");

    // Make the first rename throw, then succeed on the second call
    let renameCount = 0;
    const origRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (src, dst) => {
      renameCount++;
      if (renameCount === 1)
        throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
      return origRename(src, dst);
    });

    await saveConfig(config);

    // Verify the final file has the new value
    const written = JSON.parse(await fs.readFile(cfgFile, "utf8"));
    expect(written.gitPollIntervalMs).toBe(99000);
  });

  // ── saveConfig with null (next ?? {} path) ─────────────────────────────────
  it("saveConfig writes empty object when called with null/undefined", async () => {
    await saveConfig(null);
    const cfgFile = path.join(tmpDir, ".vscode-rotator", "config.json");
    const written = JSON.parse(await fs.readFile(cfgFile, "utf8"));
    expect(written).toEqual({});
  });
});
