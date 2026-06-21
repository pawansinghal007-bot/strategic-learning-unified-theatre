import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizePathEntries,
  sanitizeEnvForSpawn,
} from "../src/internal/paths.js";

function setPlatform(platform) {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("PATH sanitization before spawn/exec", () => {
  const originalPlatform = process.platform;
  let statSyncSpy;

  beforeEach(() => {
    setPlatform("linux");
    // Default: every directory looks like a normal, non-world-writable dir
    statSyncSpy = vi.spyOn(fs, "statSync").mockImplementation(() => ({
      isDirectory: () => true,
      mode: 0o755,
    }));
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_ALLOW_PATH;
  });

  it("keeps known platform binary directories (allow-list) even without a statSync check bypass", () => {
    const pathEnv = "/usr/bin:/bin:/usr/local/bin";
    const result = sanitizePathEntries(pathEnv, ":");

    expect(result).toContain(path.resolve("/usr/bin"));
    expect(result).toContain(path.resolve("/bin"));
    expect(result).toContain(path.resolve("/usr/local/bin"));
  });

  it("drops world-writable directories that are not on the allow-list", () => {
    statSyncSpy.mockImplementation((p) => {
      if (p === path.resolve("/tmp/evil")) {
        return { isDirectory: () => true, mode: 0o777 }; // world-writable
      }
      return { isDirectory: () => true, mode: 0o755 };
    });

    const pathEnv = "/usr/bin:/tmp/evil";
    const result = sanitizePathEntries(pathEnv, ":");

    expect(result).toContain(path.resolve("/usr/bin"));
    expect(result).not.toContain(path.resolve("/tmp/evil"));
  });

  it("drops entries that are not directories", () => {
    statSyncSpy.mockImplementation((p) => {
      if (p === path.resolve("/usr/local/not-a-dir")) {
        return { isDirectory: () => false, mode: 0o755 };
      }
      return { isDirectory: () => true, mode: 0o755 };
    });

    const pathEnv = "/usr/bin:/usr/local/not-a-dir";
    const result = sanitizePathEntries(pathEnv, ":");

    expect(result).not.toContain(path.resolve("/usr/local/not-a-dir"));
  });

  it("drops entries whose stat() throws (missing / inaccessible directories)", () => {
    statSyncSpy.mockImplementation((p) => {
      if (p === path.resolve("/does/not/exist")) {
        throw new Error("ENOENT");
      }
      return { isDirectory: () => true, mode: 0o755 };
    });

    const pathEnv = "/usr/bin:/does/not/exist";
    const result = sanitizePathEntries(pathEnv, ":");

    expect(result).toContain(path.resolve("/usr/bin"));
    expect(result).not.toContain(path.resolve("/does/not/exist"));
  });

  it("resolves relative PATH entries to absolute paths before evaluating safety", () => {
    const pathEnv = "./relative-dir";
    const result = sanitizePathEntries(pathEnv, ":");

    for (const entry of result) {
      expect(path.isAbsolute(entry)).toBe(true);
    }
  });

  it("falls back to the allowed root directories when every entry is filtered out", () => {
    statSyncSpy.mockImplementation(() => ({
      isDirectory: () => true,
      mode: 0o777, // everything looks world-writable
    }));

    const pathEnv = "/tmp/evil1:/tmp/evil2";
    const result = sanitizePathEntries(pathEnv, ":");

    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(path.resolve("/usr/bin"));
  });

  it("respects VSCODE_ROTATOR_ALLOW_PATH as additional allow-listed directories", () => {
    process.env.VSCODE_ROTATOR_ALLOW_PATH = "/opt/custom-tools";
    statSyncSpy.mockImplementation((p) => {
      if (p === path.resolve("/opt/custom-tools")) {
        return { isDirectory: () => true, mode: 0o777 }; // world-writable, but explicitly allow-listed
      }
      return { isDirectory: () => true, mode: 0o755 };
    });

    const pathEnv = "/opt/custom-tools";
    const result = sanitizePathEntries(pathEnv, ":");

    expect(result).toContain(path.resolve("/opt/custom-tools"));
  });

  it("treats empty or missing PATH as an empty entry list, then falls back to allow-list", () => {
    const result = sanitizePathEntries("", ":");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(path.resolve("/usr/bin"));
  });

  it("sanitizeEnvForSpawn replaces PATH but preserves all other env vars", () => {
    const fakeEnv = {
      PATH: "/usr/bin:/tmp/evil",
      HOME: "/home/test-user",
      CUSTOM_VAR: "keep-me",
    };
    statSyncSpy.mockImplementation((p) => {
      if (p === path.resolve("/tmp/evil")) {
        return { isDirectory: () => true, mode: 0o777 };
      }
      return { isDirectory: () => true, mode: 0o755 };
    });

    const result = sanitizeEnvForSpawn(fakeEnv);

    expect(result.HOME).toBe("/home/test-user");
    expect(result.CUSTOM_VAR).toBe("keep-me");
    expect(result.PATH).not.toContain(path.resolve("/tmp/evil"));
    expect(result.PATH).toContain(path.resolve("/usr/bin"));
  });

  it("sanitizeEnvForSpawn defaults to process.env when no env is provided", () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "/usr/bin";

    const result = sanitizeEnvForSpawn();
    expect(result.PATH).toContain(path.resolve("/usr/bin"));

    process.env.PATH = originalPath;
  });

  it("uses semicolon as the PATH separator on win32", () => {
    setPlatform("win32");
    statSyncSpy.mockImplementation(() => ({
      isDirectory: () => true,
      mode: 0o755,
    }));

    const windir = process.env.WINDIR || String.raw`C:\Windows`;
    const system32 = path.join(windir, "System32");
    const pathEnv = `${system32};C:\\some\\evil\\dir`;

    const result = sanitizePathEntries(pathEnv, ";");
    expect(result).toContain(path.resolve(system32));
  });
});