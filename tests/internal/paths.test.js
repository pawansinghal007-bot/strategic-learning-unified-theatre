import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";

// Mock dependencies BEFORE importing the module under test
vi.mock("node:fs/promises", () => ({
  default: {
    stat: vi.fn(),
    lstat: vi.fn(),
  },
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
  },
}));
vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/home/test"),
  },
}));
// Mock using full path to config.js
vi.mock("/home/pawan/vscodeagent/Solution/src/internal/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

import {
  resolveAuthPath,
  resolveBinary,
  sanitizeEnvForSpawn,
  resolveVSCodeBin,
} from "../../src/internal/paths.js";

// Import loadConfig for use in tests
import { loadConfig } from "/home/pawan/vscodeagent/Solution/src/internal/config.js";

describe("internal/paths.js", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveBinary", () => {
    it("returns binary path when found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsp.stat).mockResolvedValue({ isDirectory: () => false });

      const result = await resolveBinary("node");
      expect(result).toBe("/usr/local/bin/node");
    });

    it("returns null when binary not found", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await resolveBinary("nonexistent-binary");
      expect(result).toBeNull();
    });
  });

  describe("sanitizeEnvForSpawn", () => {
    it("sanitizes PATH environment variable", () => {
      const env = {
        PATH: "/usr/bin:/bin:/invalid:/opt/homebrew/bin",
        OTHER_VAR: "value",
      };

      const result = sanitizeEnvForSpawn(env);
      expect(result.PATH).toBeDefined();
      expect(result.OTHER_VAR).toBe("value");
    });
  });

  describe("resolveVSCodeBin", () => {
    it("returns overridden binary path when VSCODE_ROTATOR_CODE_BIN is set", async () => {
      const originalEnv = process.env.VSCODE_ROTATOR_CODE_BIN;
      try {
        process.env.VSCODE_ROTATOR_CODE_BIN = "/custom/path/to/code";
        const result = await resolveVSCodeBin();
        expect(result).toBe("/custom/path/to/code");
      } finally {
        process.env.VSCODE_ROTATOR_CODE_BIN = originalEnv;
      }
    });
  });

  describe("resolveAuthPath", () => {
    it("returns configured auth path when available", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        authPaths: { github: "/custom/auth/path.json" },
      });

      const result = await resolveAuthPath("github");
      expect(result).toBe("/custom/auth/path.json");
    });

    it("throws error for unknown agent type without configuration", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        authPaths: {},
        agents: {},
      });

      await expect(resolveAuthPath("unknown")).rejects.toThrow(
        'No auth path configured for agentType "other". Set ~/.vscode-rotator/config.json',
      );
    });
  });
});
