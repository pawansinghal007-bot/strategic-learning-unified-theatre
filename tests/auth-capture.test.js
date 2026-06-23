import path from "node:path";
import { describe, expect, it, beforeEach, vi } from "vitest";

// vi.hoisted() runs before ALL vi.mock() factories.
// We must create every fn we reference inside a factory here,
// otherwise the hoisted factory runs before const declarations (TDZ error).
const { _stat, _readFile, _mkdir, _watch, _spawn } = vi.hoisted(() => ({
  _stat: vi.fn(),
  _readFile: vi.fn(),
  _mkdir: vi.fn(),
  _watch: vi.fn(),
  _spawn: vi.fn(),
}));

// ─── node:fs/promises ────────────────────────────────────────────────────────
// SUT uses default import: `import fs from "node:fs/promises"`
// Tests use named imports. Both must be the SAME vi.fn() instances.
// Do NOT spread actual — getter bindings on built-in namespaces win over spreads.
vi.mock("node:fs/promises", () => ({
  stat: _stat,
  readFile: _readFile,
  mkdir: _mkdir,
  default: {
    stat: _stat,
    readFile: _readFile,
    mkdir: _mkdir,
  },
}));

// ─── node:fs ─────────────────────────────────────────────────────────────────
// Do NOT spread actual — named export getters on built-in namespace objects
// always resolve to the real binding and silently override whatever we set.
// Return only what the SUT needs.
vi.mock("node:fs", () => ({
  watch: _watch,
  default: { watch: _watch },
}));

// ─── node:child_process ──────────────────────────────────────────────────────
vi.mock("node:child_process", () => ({
  spawn: _spawn,
  default: { spawn: _spawn },
}));

// ─── internal/paths.js ───────────────────────────────────────────────────────
vi.mock("../src/internal/paths.js", () => ({
  resolveAuthPath: vi.fn(),
  resolveVSCodeBin: vi.fn(),
  sanitizeEnvForSpawn: vi.fn((env) => env),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
import { stat, readFile, mkdir } from "node:fs/promises";
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import {
  resolveAuthPath,
  resolveVSCodeBin,
  sanitizeEnvForSpawn,
} from "../src/internal/paths.js";
import { captureAuthBlob } from "../src/auth-capture.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTH_PATH =
  "/home/user/.config/Code/User/globalStorage/github.copilot/auth.json";
const AUTH_DIR = path.dirname(AUTH_PATH);
const TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-token";
const OLD_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.old-token";
const VSCODE_BIN = "/usr/bin/code";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeWatcher() {
  return { close: vi.fn() };
}

function makeSpawnChild() {
  const child = { unref: vi.fn() };
  spawn.mockReturnValue(child);
  return child;
}

function setupHappyPath() {
  resolveAuthPath.mockResolvedValue(AUTH_PATH);
  resolveVSCodeBin.mockResolvedValue(VSCODE_BIN);
  sanitizeEnvForSpawn.mockImplementation((env) => env);
  mkdir.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupHappyPath();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("captureAuthBlob()", () => {
  // ── resolveAuthPath forwarding ────────────────────────────────────────────
  describe("resolveAuthPath options", () => {
    it("always calls resolveAuthPath with preferExisting:true", async () => {
      stat.mockResolvedValue({});
      readFile.mockResolvedValue(TOKEN);

      await captureAuthBlob("github");

      expect(resolveAuthPath).toHaveBeenCalledWith("github", {
        preferExisting: true,
        profileName: null,
      });
    });

    it("forwards profileName to resolveAuthPath", async () => {
      stat.mockResolvedValue({});
      readFile.mockResolvedValue(TOKEN);

      await captureAuthBlob("github", { profileName: "work" });

      expect(resolveAuthPath).toHaveBeenCalledWith("github", {
        preferExisting: true,
        profileName: "work",
      });
    });
  });

  // ── File already exists, no editor launch ────────────────────────────────
  describe("when auth file exists and launchEditor is false (default)", () => {
    it("returns existing token immediately without starting a watcher", async () => {
      stat.mockResolvedValue({});
      readFile.mockResolvedValue(`  ${TOKEN}\n`);

      const result = await captureAuthBlob("github");

      expect(result).toBe(TOKEN);
      expect(watch).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });

    it("trims whitespace from the stored token", async () => {
      stat.mockResolvedValue({});
      readFile.mockResolvedValue(`\n\t  ${TOKEN}  \t\n`);

      expect(await captureAuthBlob("github")).toBe(TOKEN);
    });

    it("does not spawn VS Code", async () => {
      stat.mockResolvedValue({});
      readFile.mockResolvedValue(TOKEN);

      await captureAuthBlob("github");

      expect(spawn).not.toHaveBeenCalled();
    });
  });

  // ── File missing, no editor launch — waits ───────────────────────────────
  describe("when auth file does not exist and launchEditor is false", () => {
    it("waits for file to appear via watcher event, then returns token", async () => {
      stat.mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      const watcher = makeWatcher();
      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return watcher;
      });

      const result = await captureAuthBlob("github", { timeoutMs: 5000 });

      expect(result).toBe(TOKEN);
      expect(watch).toHaveBeenCalledWith(AUTH_DIR, expect.any(Function));
      expect(watcher.close).toHaveBeenCalled();
    });

    it("creates the parent directory before starting the watcher", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));

      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return makeWatcher();
      });

      await captureAuthBlob("github", { timeoutMs: 5000 });

      expect(mkdir).toHaveBeenCalledWith(AUTH_DIR, { recursive: true });
    });

    it("resolves via polling when watcher fires for a different filename", async () => {
      vi.useFakeTimers();
      stat.mockRejectedValue(new Error("ENOENT"));

      watch.mockImplementation((_dir, cb) => {
        // Fire for a different file — should be ignored by the watcher handler
        vi.advanceTimersByTime(10);
        cb("rename", "something-else.json");
        return makeWatcher();
      });

      let callCount = 0;
      readFile.mockImplementation(() =>
        Promise.resolve(++callCount >= 2 ? TOKEN : ""),
      );

      const promise = captureAuthBlob("github", { timeoutMs: 5000 });
      // Advance past the 1500ms poll interval
      await vi.advanceTimersByTimeAsync(1600);

      expect(await promise).toBe(TOKEN);
      vi.useRealTimers();
    });

    it("ignores watcher events where filename is null", async () => {
      vi.useFakeTimers();
      stat.mockRejectedValue(new Error("ENOENT"));

      let watchCb;
      watch.mockImplementation((_dir, cb) => {
        watchCb = cb;
        return makeWatcher();
      });

      let callCount = 0;
      readFile.mockImplementation(() =>
        Promise.resolve(++callCount >= 3 ? TOKEN : ""),
      );

      const promise = captureAuthBlob("github", { timeoutMs: 5000 });

      // Tick enough for watch() to be called and watchCb to be assigned
      await vi.advanceTimersByTimeAsync(0);
      expect(() => watchCb("rename", null)).not.toThrow();

      // Advance past two poll intervals so readFile is called enough times
      await vi.advanceTimersByTimeAsync(3200);

      expect(await promise).toBe(TOKEN);
      vi.useRealTimers();
    });

    it("rejects with a timeout error when no auth blob appears in time", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));
      readFile.mockResolvedValue("");
      watch.mockReturnValue(makeWatcher());

      await expect(
        captureAuthBlob("github", { timeoutMs: 60 }),
      ).rejects.toThrow("Timed out waiting for auth blob change.");
    });

    it("closes the watcher on timeout", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));
      readFile.mockResolvedValue("");

      const watcher = makeWatcher();
      watch.mockReturnValue(watcher);

      await captureAuthBlob("github", { timeoutMs: 60 }).catch(() => {});

      expect(watcher.close).toHaveBeenCalled();
    });

    it("swallows readFile errors during watch events and keeps waiting", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));

      let watchCb;
      watch.mockImplementation((_dir, cb) => {
        watchCb = cb;
        return makeWatcher();
      });

      let callCount = 0;
      readFile.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("EPERM"));
        return Promise.resolve(TOKEN);
      });

      const promise = captureAuthBlob("github", { timeoutMs: 5000 });

      await new Promise((r) => setTimeout(r, 20));
      watchCb("rename", path.basename(AUTH_PATH)); // 1st: EPERM — swallowed
      await new Promise((r) => setTimeout(r, 20));
      watchCb("rename", path.basename(AUTH_PATH)); // 2nd: TOKEN — resolves

      expect(await promise).toBe(TOKEN);
    });
  });

  // ── launchEditor: true ────────────────────────────────────────────────────
  describe("when launchEditor is true", () => {
    it("spawns VS Code before waiting for the auth blob", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));
      const child = makeSpawnChild();

      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return makeWatcher();
      });

      await captureAuthBlob("github", { launchEditor: true, timeoutMs: 5000 });

      expect(spawn).toHaveBeenCalledWith(
        VSCODE_BIN,
        [],
        expect.objectContaining({ detached: true, stdio: "ignore" }),
      );
      expect(child.unref).toHaveBeenCalled();
    });

    it("passes --profile flag when profileName is provided", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));
      makeSpawnChild();

      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return makeWatcher();
      });

      await captureAuthBlob("github", {
        launchEditor: true,
        profileName: "work",
        timeoutMs: 5000,
      });

      expect(spawn).toHaveBeenCalledWith(
        VSCODE_BIN,
        ["--profile", "work"],
        expect.any(Object),
      );
    });

    it("sanitizes the environment before spawning", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));
      makeSpawnChild();
      const safeEnv = { PATH: "/usr/bin", HOME: "/home/user" };
      sanitizeEnvForSpawn.mockReturnValue(safeEnv);

      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return makeWatcher();
      });

      await captureAuthBlob("github", { launchEditor: true, timeoutMs: 5000 });

      expect(sanitizeEnvForSpawn).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(
        VSCODE_BIN,
        expect.any(Array),
        expect.objectContaining({ env: safeEnv }),
      );
    });

    it("waits for the token to CHANGE when an old token already existed", async () => {
      stat.mockResolvedValue({});
      let readCount = 0;
      readFile.mockImplementation(() =>
        Promise.resolve(++readCount === 1 ? OLD_TOKEN : TOKEN),
      );

      makeSpawnChild();
      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => cb("change", path.basename(AUTH_PATH)), 10);
        return makeWatcher();
      });

      const result = await captureAuthBlob("github", {
        launchEditor: true,
        timeoutMs: 5000,
      });

      expect(result).toBe(TOKEN);
      expect(result).not.toBe(OLD_TOKEN);
    });

    it("wraps .cmd binaries in cmd.exe /c on win32", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const cmdBin =
        "C:\\Users\\user\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd";
      resolveVSCodeBin.mockResolvedValue(cmdBin);
      stat.mockRejectedValue(new Error("ENOENT"));
      makeSpawnChild();

      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return makeWatcher();
      });

      await captureAuthBlob("github", { launchEditor: true, timeoutMs: 5000 });

      expect(spawn).toHaveBeenCalledWith(
        "cmd.exe",
        ["/c", cmdBin],
        expect.any(Object),
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    it("does NOT wrap non-.cmd binaries via cmd.exe on win32", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const exeBin = "C:\\Program Files\\Microsoft VS Code\\bin\\code.exe";
      resolveVSCodeBin.mockResolvedValue(exeBin);
      stat.mockRejectedValue(new Error("ENOENT"));
      makeSpawnChild();

      watch.mockImplementation((_dir, cb) => {
        setTimeout(() => {
          readFile.mockResolvedValue(TOKEN);
          cb("rename", path.basename(AUTH_PATH));
        }, 10);
        return makeWatcher();
      });

      await captureAuthBlob("github", { launchEditor: true, timeoutMs: 5000 });

      expect(spawn).toHaveBeenCalledWith(exeBin, [], expect.any(Object));

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    });

    it("propagates timeout even when editor was launched", async () => {
      stat.mockRejectedValue(new Error("ENOENT"));
      readFile.mockResolvedValue("");
      makeSpawnChild();
      watch.mockReturnValue(makeWatcher());

      await expect(
        captureAuthBlob("github", { launchEditor: true, timeoutMs: 60 }),
      ).rejects.toThrow("Timed out waiting for auth blob change.");
    });
  });

  // ── agentType forwarding ──────────────────────────────────────────────────
  describe("agentType is forwarded correctly", () => {
    it.each(["github", "vscode", "codex", "trae"])(
      "passes agentType=%s through to resolveAuthPath",
      async (agentType) => {
        stat.mockResolvedValue({});
        readFile.mockResolvedValue(TOKEN);

        await captureAuthBlob(agentType);

        expect(resolveAuthPath).toHaveBeenCalledWith(
          agentType,
          expect.any(Object),
        );
      },
    );
  });
});
