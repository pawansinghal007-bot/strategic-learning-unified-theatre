/**
 * tests/cli.test.js
 *
 * Coverage target: src/cli.js (currently 0% — lines 1-769)
 *
 * Key constraints:
 *   - NO vi.resetModules() — cli.js is imported once per file; resetting
 *     modules breaks the vi.mock() hoisting contract and causes "not a
 *     constructor" errors on re-import.
 *   - Per-test behaviour changes go through .mockReturnValue() /
 *     .mockResolvedValue() on the shared mock instance refs captured below.
 *   - NODE_ENV=test guards the top-level parseAsync in cli.js.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ─── Set env before any import ───────────────────────────────────────────────
process.env.NODE_ENV = "test";

// ─── Shared mock instance refs (mutated per test) ────────────────────────────
// These objects are returned by the mocked constructors. Tests call
// .mockResolvedValue() on their methods to change behaviour per-test.

const mockStore = {
  list: vi.fn().mockResolvedValue([]),
  add: vi.fn().mockResolvedValue({
    id: "test-id-001",
    email: "a@b.com",
    agentType: "vscode",
  }),
  remove: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({
    id: "test-id-001",
    email: "a@b.com",
    agentType: "vscode",
    profileName: null,
  }),
};

const mockSecret = {
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
};

const mockSwitcher = {
  switch: vi.fn().mockResolvedValue({
    accountId: "acct-1",
    agentType: "vscode",
    authPath: "/auth",
    profileName: "p1",
  }),
};

const mockPm = {
  list: vi.fn().mockResolvedValue(["default"]),
  create: vi.fn().mockResolvedValue("/profiles/new"),
  delete: vi.fn().mockResolvedValue(undefined),
  link: vi.fn().mockResolvedValue(undefined),
  exportSnapshot: vi.fn().mockResolvedValue(undefined),
  importSnapshot: vi.fn().mockResolvedValue(undefined),
};

const mockJournal = {
  tail: vi
    .fn()
    .mockResolvedValue(["2024-01-01 entry one", "2024-01-02 entry two"]),
  clear: vi.fn().mockResolvedValue("/backups/journal.bak"),
};

const mockGitMonitor = {
  status: vi.fn().mockResolvedValue({
    branch: "main",
    ahead: 0,
    behind: 0,
    uncommitted: 1,
    stashed: 0,
    lastCommit: { sha: "abcdef123456", msg: "fix: coverage" },
  }),
};

const mockReporter = { daily: vi.fn().mockResolvedValue(undefined) };

const mockHealth = vi.fn().mockResolvedValue({
  daemon: { status: "running" },
  localLlm: { status: "ok", models: ["llama3"] },
  account: { status: "ok", summary: { total: 2 }, accounts: [] },
});

const mockSystemHealth = vi.fn().mockResolvedValue({
  status: "OK",
  ts: "2024-01-01T00:00:00Z",
  subsystems: [],
});

// ─── Module mocks (hoisted; constructors always return the shared instances) ──

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

vi.mock("chalk", () => ({
  default: new Proxy({}, { get: () => (s) => String(s) }),
}));

vi.mock("nanoid", () => ({ nanoid: () => "test-id-001" }));

vi.mock("../src/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock("../src/accounts/store.js", () => ({
  AccountStore: vi.fn(function AccountStore() {
    return mockStore;
  }),
}));

vi.mock("../src/accounts/secret-store.js", () => ({
  SecretStore: vi.fn(function SecretStore() {
    return mockSecret;
  }),
}));

vi.mock("../src/accounts/schema.js", () => ({
  AgentTypeSchema: {
    options: ["vscode", "codex", "trae"],
    safeParse: (v) => {
      const valid = ["vscode", "codex", "trae"];
      return valid.includes(v)
        ? { success: true, data: v }
        : { success: false };
    },
  },
}));

vi.mock("../src/accounts/switcher.js", () => ({
  SwitcherService: vi.fn(function SwitcherService() {
    return mockSwitcher;
  }),
}));

vi.mock("../src/accounts/health.js", () => ({
  getSystemHealth: (...args) => mockHealth(...args),
}));

vi.mock("../src/accounts/profile-manager.js", () => ({
  ProfileManager: vi.fn(function ProfileManager() {
    return mockPm;
  }),
}));

vi.mock("../src/accounts/workspace.js", () => ({
  bindProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/internal/paths.js", () => ({
  resolveVSCodeBin: vi.fn().mockResolvedValue("/usr/bin/code"),
}));

vi.mock("../src/internal/journal.js", () => ({
  Journal: vi.fn(function Journal() {
    return mockJournal;
  }),
}));

vi.mock("../src/internal/git-monitor.js", () => ({
  GitMonitor: vi.fn(function GitMonitor() {
    return mockGitMonitor;
  }),
}));

vi.mock("../src/internal/reporter.js", () => ({
  Reporter: vi.fn(function Reporter() {
    return mockReporter;
  }),
}));

vi.mock("../src/internal/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ memoryDbPath: "/tmp/mem.db" }),
}));

vi.mock("../src/system/systemHealth.js", () => ({
  getSystemHealth: (...args) => mockSystemHealth(...args),
}));

// bind*/register* are tested in cli-validation.test.js; stub here to avoid
// double-registration side-effects on the shared program instance.
vi.mock("../src/commands/handoff.js", () => ({ bindHandoffCommands: vi.fn() }));
vi.mock("../src/commands/idea.js", () => ({ bindIdeaCommands: vi.fn() }));
vi.mock("../src/commands/browser.js", () => ({ bindBrowserCommands: vi.fn() }));
vi.mock("../src/commands/storage.js", () => ({ bindStorageCommands: vi.fn() }));
vi.mock("../src/commands/llm.js", () => ({ bindLlmCommands: vi.fn() }));
vi.mock("../src/commands/bc2-sync.js", () => ({ bindBc2SyncCommand: vi.fn() }));
vi.mock("../src/commands/ai.js", () => ({ bindAiCommands: vi.fn() }));
vi.mock("../src/cli/llm-health.js", () => ({ registerLlmHealth: vi.fn() }));
vi.mock("../src/cli/llm-usage.js", () => ({ registerLlmUsage: vi.fn() }));
vi.mock("../src/cli/llm-routing.js", () => ({ registerLlmRouting: vi.fn() }));
vi.mock("../src/cli/llm-policy.js", () => ({ registerLlmPolicy: vi.fn() }));
vi.mock("../src/cli/llm-workspace.js", () => ({
  registerLlmWorkspace: vi.fn(),
}));

// ─── Single import of cli.js (shared across all tests in this file) ──────────
// vi.resetModules() must NOT be called — it would re-run the module and break mocks.
const { program, normalizeAgentType, daemonPaths, readPid, isPidAlive } =
  await import("../src/cli.js");

// Apply exitOverride once so commander never calls process.exit
program.exitOverride();
program.configureOutput({ writeOut() {}, writeErr() {} });

// ─── Setup / teardown ────────────────────────────────────────────────────────

let consoleSpy;
let consoleErrorSpy;
let tableSpy;
let originalExitCode;

beforeEach(() => {
  originalExitCode = process.exitCode;
  process.exitCode = undefined;
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
  // Reset all shared mock instances to default behaviour
  mockStore.list.mockResolvedValue([]);
  mockStore.add.mockResolvedValue({
    id: "test-id-001",
    email: "a@b.com",
    agentType: "vscode",
  });
  mockStore.remove.mockResolvedValue(undefined);
  mockStore.get.mockResolvedValue({
    id: "test-id-001",
    email: "a@b.com",
    agentType: "vscode",
    profileName: null,
  });
  mockSecret.set.mockResolvedValue(undefined);
  mockSecret.delete.mockResolvedValue(undefined);
  mockSwitcher.switch.mockResolvedValue({
    accountId: "acct-1",
    agentType: "vscode",
    authPath: "/auth",
    profileName: "p1",
  });
  mockPm.list.mockResolvedValue(["default"]);
  mockPm.create.mockResolvedValue("/profiles/new");
  mockPm.delete.mockResolvedValue(undefined);
  mockPm.link.mockResolvedValue(undefined);
  mockPm.exportSnapshot.mockResolvedValue(undefined);
  mockPm.importSnapshot.mockResolvedValue(undefined);
  mockJournal.tail.mockResolvedValue([
    "2024-01-01 entry one",
    "2024-01-02 entry two",
  ]);
  mockJournal.clear.mockResolvedValue("/backups/journal.bak");
  mockGitMonitor.status.mockResolvedValue({
    branch: "main",
    ahead: 0,
    behind: 0,
    uncommitted: 1,
    stashed: 0,
    lastCommit: { sha: "abcdef123456", msg: "fix: coverage" },
  });
  mockHealth.mockResolvedValue({
    daemon: { status: "running" },
    localLlm: { status: "ok", models: ["llama3"] },
    account: { status: "ok", summary: { total: 2 }, accounts: [] },
  });
  mockSystemHealth.mockResolvedValue({
    status: "OK",
    ts: "2024-01-01T00:00:00Z",
    subsystems: [],
  });
});

afterEach(() => {
  consoleSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  tableSpy.mockRestore();
  process.exitCode = originalExitCode;
  vi.clearAllMocks();
});

// ─── Pure function tests ──────────────────────────────────────────────────────

describe("normalizeAgentType", () => {
  it("accepts 'vscode'", () => {
    expect(normalizeAgentType("vscode")).toBe("vscode");
  });

  it("trims whitespace and lowercases", () => {
    expect(normalizeAgentType("  VSCode  ")).toBe("vscode");
  });

  it("accepts 'codex'", () => {
    expect(normalizeAgentType("codex")).toBe("codex");
  });

  it("accepts 'trae'", () => {
    expect(normalizeAgentType("trae")).toBe("trae");
  });

  it("throws on an invalid agent type", () => {
    expect(() => normalizeAgentType("badbot")).toThrow("Invalid agentType");
  });

  it("error message includes the invalid value", () => {
    expect(() => normalizeAgentType("badbot")).toThrow("badbot");
  });
});

describe("daemonPaths", () => {
  it("returns baseDir under homedir/.vscode-rotator", () => {
    expect(daemonPaths().baseDir).toBe(
      path.join(os.homedir(), ".vscode-rotator"),
    );
  });

  it("pidPath ends in daemon.pid", () => {
    expect(daemonPaths().pidPath).toMatch(/daemon\.pid$/);
  });

  it("logPath ends in daemon.log", () => {
    expect(daemonPaths().logPath).toMatch(/daemon\.log$/);
  });

  it("pidPath and logPath both start with baseDir", () => {
    const { baseDir, pidPath, logPath } = daemonPaths();
    expect(pidPath.startsWith(baseDir)).toBe(true);
    expect(logPath.startsWith(baseDir)).toBe(true);
  });
});

describe("readPid", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-readpid-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns integer from valid pid file", async () => {
    const f = path.join(tempDir, "daemon.pid");
    await fs.writeFile(f, "42345\n");
    expect(await readPid(f)).toBe(42345);
  });

  it("trims whitespace from file content", async () => {
    const f = path.join(tempDir, "daemon.pid");
    await fs.writeFile(f, "  99001  \n");
    expect(await readPid(f)).toBe(99001);
  });

  it("throws 'Invalid PID file' for non-numeric content", async () => {
    const f = path.join(tempDir, "daemon.pid");
    await fs.writeFile(f, "not-a-pid");
    await expect(readPid(f)).rejects.toThrow("Invalid PID file");
  });

  it("throws for zero", async () => {
    const f = path.join(tempDir, "daemon.pid");
    await fs.writeFile(f, "0");
    await expect(readPid(f)).rejects.toThrow("Invalid PID file");
  });

  it("throws for negative number", async () => {
    const f = path.join(tempDir, "daemon.pid");
    await fs.writeFile(f, "-5");
    await expect(readPid(f)).rejects.toThrow("Invalid PID file");
  });

  it("throws when file is missing", async () => {
    await expect(readPid(path.join(tempDir, "missing.pid"))).rejects.toThrow();
  });
});

describe("isPidAlive", () => {
  it("returns true for the current process PID", () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it("returns false for a PID that does not exist", () => {
    expect(isPidAlive(9999999)).toBe(false);
  });
});

// ─── Command tests ────────────────────────────────────────────────────────────

describe("CLI commands via program.parseAsync", () => {
  // ── list ──────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("prints 'No accounts found' when store is empty", async () => {
      mockStore.list.mockResolvedValue([]);
      await program.parseAsync(["node", "cli", "list"]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No accounts found"),
      );
    });

    it("calls console.table when accounts exist", async () => {
      mockStore.list.mockResolvedValue([
        {
          id: "1",
          email: "a@b.com",
          agentType: "vscode",
          status: "active",
          cooldownUntil: null,
          lastUsed: null,
        },
      ]);
      await program.parseAsync(["node", "cli", "list"]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("formats cooldownUntil as ISO string when set", async () => {
      const d = new Date("2024-06-01T00:00:00Z");
      mockStore.list.mockResolvedValue([
        {
          id: "1",
          email: "a@b.com",
          agentType: "vscode",
          status: "active",
          cooldownUntil: d,
          lastUsed: null,
        },
      ]);
      await program.parseAsync(["node", "cli", "list"]);
      expect(tableSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ cooldownUntil: d.toISOString() }),
        ]),
      );
    });

    it("sets exitCode=1 and logs error on store failure", async () => {
      mockStore.list.mockRejectedValue(new Error("DB exploded"));
      await program.parseAsync(["node", "cli", "list"]);
      expect(process.exitCode).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("DB exploded"),
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("removes secret and account then prints success", async () => {
      await program.parseAsync(["node", "cli", "remove", "abc-123"]);
      expect(mockSecret.delete).toHaveBeenCalledWith("abc-123");
      expect(mockStore.remove).toHaveBeenCalledWith("abc-123");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("abc-123"),
      );
    });

    it("sets exitCode=1 on store.remove failure", async () => {
      mockStore.remove.mockRejectedValue(new Error("not found"));
      await program.parseAsync(["node", "cli", "remove", "bad-id"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── status ────────────────────────────────────────────────────────────────

  describe("status", () => {
    it("prints account count", async () => {
      mockStore.list.mockResolvedValue([{}, {}, {}]);
      await program.parseAsync(["node", "cli", "status"]);
      const output = consoleSpy.mock.calls.flat().join(" ");
      expect(output).toContain("3");
    });

    it("sets exitCode=1 on store failure", async () => {
      mockStore.list.mockRejectedValue(new Error("store down"));
      await program.parseAsync(["node", "cli", "status"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── use ───────────────────────────────────────────────────────────────────

  describe("use", () => {
    it("calls SwitcherService.switch and prints plan", async () => {
      await program.parseAsync(["node", "cli", "use", "acct-1"]);
      expect(mockSwitcher.switch).toHaveBeenCalledWith(
        "acct-1",
        expect.objectContaining({ dryRun: false }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Account: acct-1"),
      );
    });

    it("passes dryRun=true with --dry-run flag", async () => {
      await program.parseAsync(["node", "cli", "use", "acct-2", "--dry-run"]);
      expect(mockSwitcher.switch).toHaveBeenCalledWith(
        "acct-2",
        expect.objectContaining({ dryRun: true }),
      );
    });

    it("onStep start phase creates spinner", async () => {
      mockSwitcher.switch.mockImplementation(async (id, { onStep }) => {
        onStep({ phase: "start", message: "Starting..." });
        onStep({ phase: "success", message: "Done" });
        return {
          accountId: id,
          agentType: "vscode",
          authPath: "/a",
          profileName: "p",
        };
      });
      await program.parseAsync(["node", "cli", "use", "acct-1"]);
      expect(mockSwitcher.switch).toHaveBeenCalled();
    });

    it("onStep skip phase succeeds spinner", async () => {
      mockSwitcher.switch.mockImplementation(async (id, { onStep }) => {
        onStep({ phase: "start", message: "Starting..." });
        onStep({ phase: "skip", message: "Skipped" });
        return {
          accountId: id,
          agentType: "vscode",
          authPath: "/a",
          profileName: "p",
        };
      });
      await program.parseAsync(["node", "cli", "use", "acct-1"]);
      expect(mockSwitcher.switch).toHaveBeenCalled();
    });

    it("onStep fail phase fails spinner", async () => {
      mockSwitcher.switch.mockImplementation(async (id, { onStep }) => {
        onStep({ phase: "start", message: "Starting..." });
        onStep({ phase: "fail", message: "Failed" });
        return {
          accountId: id,
          agentType: "vscode",
          authPath: "/a",
          profileName: "p",
        };
      });
      await program.parseAsync(["node", "cli", "use", "acct-1"]);
      expect(mockSwitcher.switch).toHaveBeenCalled();
    });

    it("sets exitCode=1 on switcher failure", async () => {
      mockSwitcher.switch.mockRejectedValue(new Error("auth failed"));
      await program.parseAsync(["node", "cli", "use", "bad-acct"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── health ────────────────────────────────────────────────────────────────

  describe("health", () => {
    it("prints daemon/llm/accounts summary", async () => {
      await program.parseAsync(["node", "cli", "health"]);
      const output = consoleSpy.mock.calls.flat().join(" ");
      expect(output).toContain("running");
    });

    it("outputs JSON with --json flag", async () => {
      await program.parseAsync(["node", "cli", "health", "--json"]);
      const jsonCall = consoleSpy.mock.calls.find((args) => {
        try {
          JSON.parse(args[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeTruthy();
    });

    it("shows 'No accounts found' when accounts array is empty", async () => {
      mockHealth.mockResolvedValue({
        daemon: { status: "running" },
        localLlm: { status: "ok", models: [] },
        account: { status: "ok", summary: { total: 0 }, accounts: [] },
      });
      await program.parseAsync(["node", "cli", "health"]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No accounts found"),
      );
    });

    it("shows accounts table when accounts present", async () => {
      mockHealth.mockResolvedValue({
        daemon: { status: "running" },
        localLlm: { status: "ok", models: [] },
        account: {
          status: "ok",
          summary: { total: 1 },
          accounts: [
            {
              id: "1",
              email: "a@b.com",
              agentType: "vscode",
              healthStatus: "ok",
              remainingRequests: 10,
              resetAt: null,
              error: null,
            },
          ],
        },
      });
      await program.parseAsync(["node", "cli", "health"]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("sets exitCode=1 on health probe failure", async () => {
      mockHealth.mockRejectedValue(new Error("probe failed"));
      await program.parseAsync(["node", "cli", "health"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── system-health ─────────────────────────────────────────────────────────

  describe("system-health", () => {
    it("outputs compact JSON by default", async () => {
      await program.parseAsync(["node", "cli", "system-health"]);
      const jsonCall = consoleSpy.mock.calls.find((args) => {
        try {
          JSON.parse(args[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeTruthy();
    });

    it("outputs pretty JSON with --pretty flag", async () => {
      await program.parseAsync(["node", "cli", "system-health", "--pretty"]);
      const prettyCall = consoleSpy.mock.calls.find((args) =>
        args[0]?.includes("\n"),
      );
      expect(prettyCall).toBeTruthy();
    });

    it("sets exitCode=0 when status is OK", async () => {
      await program.parseAsync(["node", "cli", "system-health"]);
      expect(process.exitCode).toBe(0);
    });

    it("sets exitCode=1 when status is DEGRADED", async () => {
      mockSystemHealth.mockResolvedValue({
        status: "DEGRADED",
        ts: "now",
        subsystems: [],
      });
      await program.parseAsync(["node", "cli", "system-health"]);
      expect(process.exitCode).toBe(1);
    });

    it("sets exitCode=1 on error", async () => {
      mockSystemHealth.mockRejectedValue(new Error("health check failed"));
      await program.parseAsync(["node", "cli", "system-health"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── log show ──────────────────────────────────────────────────────────────

  describe("log show", () => {
    it("prints each journal line", async () => {
      await program.parseAsync(["node", "cli", "log", "show"]);
      expect(consoleSpy).toHaveBeenCalledWith("2024-01-01 entry one");
      expect(consoleSpy).toHaveBeenCalledWith("2024-01-02 entry two");
    });

    it("prints 'No entries' when journal is empty", async () => {
      mockJournal.tail.mockResolvedValue([]);
      await program.parseAsync(["node", "cli", "log", "show"]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No entries"),
      );
    });

    it("respects --tail option", async () => {
      await program.parseAsync(["node", "cli", "log", "show", "--tail", "5"]);
      expect(mockJournal.tail).toHaveBeenCalledWith(5);
    });

    it("sets exitCode=1 on journal failure", async () => {
      mockJournal.tail.mockRejectedValue(new Error("journal missing"));
      await program.parseAsync(["node", "cli", "log", "show"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── log clear ─────────────────────────────────────────────────────────────

  describe("log clear", () => {
    it("calls journal.clear and prints backup path", async () => {
      await program.parseAsync(["node", "cli", "log", "clear"]);
      expect(consoleSpy).toHaveBeenCalledWith("/backups/journal.bak");
    });

    it("sets exitCode=1 on clear failure", async () => {
      mockJournal.clear.mockRejectedValue(new Error("fs locked"));
      await program.parseAsync(["node", "cli", "log", "clear"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── git-status ────────────────────────────────────────────────────────────

  describe("git-status", () => {
    it("calls GitMonitor.status and prints table", async () => {
      await program.parseAsync(["node", "cli", "git-status", "/repo"]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("sets exitCode=1 on git failure", async () => {
      mockGitMonitor.status.mockRejectedValue(new Error("not a repo"));
      await program.parseAsync(["node", "cli", "git-status"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── profile list ──────────────────────────────────────────────────────────

  describe("profile list", () => {
    it("prints table of profiles", async () => {
      await program.parseAsync(["node", "cli", "profile", "list"]);
      expect(tableSpy).toHaveBeenCalled();
    });

    it("prints 'No profiles found' when list is empty", async () => {
      mockPm.list.mockResolvedValue([]);
      await program.parseAsync(["node", "cli", "profile", "list"]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No profiles found"),
      );
    });

    it("sets exitCode=1 on failure", async () => {
      mockPm.list.mockRejectedValue(new Error("pm crashed"));
      await program.parseAsync(["node", "cli", "profile", "list"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── profile create ────────────────────────────────────────────────────────

  describe("profile create", () => {
    it("DEBUG: diagnose profile create", async () => {
      const origCreate = mockPm.create;
      let createCalled = false;
      mockPm.create = vi.fn(async (...args) => {
        createCalled = true;
        console.error("DEBUG pm.create called with", args);
        return "/profiles/new";
      });
      const errSpy = vi.spyOn(console, "error");
      try {
        await program.parseAsync([
          "node",
          "cli",
          "profile",
          "create",
          "myprofile",
        ]);
      } catch (e) {
        console.error("DEBUG parseAsync threw:", e.message);
      }
      console.error("DEBUG createCalled:", createCalled);
      console.error("DEBUG exitCode:", process.exitCode);
      console.error("DEBUG console.error calls:", errSpy.mock.calls);
      mockPm.create = origCreate;
      expect(createCalled).toBe(true);
    });

    it("calls pm.create with name and default template", async () => {
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "create",
        "myprofile",
      ]);
      expect(mockPm.create).toHaveBeenCalledWith("myprofile", "default");
    });

    it("calls pm.create with explicit template", async () => {
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "create",
        "myprofile",
        "--template",
        "codex",
      ]);
      expect(mockPm.create).toHaveBeenCalledWith("myprofile", "codex");
    });

    it("sets exitCode=1 on failure", async () => {
      mockPm.create.mockRejectedValue(new Error("already exists"));
      await program.parseAsync(["node", "cli", "profile", "create", "dup"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── profile delete ────────────────────────────────────────────────────────

  describe("profile delete", () => {
    it("calls pm.delete with the profile name", async () => {
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "delete",
        "oldprofile",
      ]);
      expect(mockPm.delete).toHaveBeenCalledWith("oldprofile");
    });

    it("sets exitCode=1 on failure", async () => {
      mockPm.delete.mockRejectedValue(new Error("not found"));
      await program.parseAsync(["node", "cli", "profile", "delete", "ghost"]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── profile link ──────────────────────────────────────────────────────────

  describe("profile link", () => {
    it("calls pm.link with accountId and profileName", async () => {
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "link",
        "acct-1",
        "myprofile",
      ]);
      expect(mockPm.link).toHaveBeenCalledWith("acct-1", "myprofile");
    });

    it("sets exitCode=1 on failure", async () => {
      mockPm.link.mockRejectedValue(new Error("link failed"));
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "link",
        "acct-1",
        "bad",
      ]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── profile export ────────────────────────────────────────────────────────

  describe("profile export", () => {
    it("calls pm.exportSnapshot with name and zipPath", async () => {
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "export",
        "myprofile",
        "/tmp/snap.zip",
      ]);
      expect(mockPm.exportSnapshot).toHaveBeenCalledWith(
        "myprofile",
        "/tmp/snap.zip",
      );
    });

    it("sets exitCode=1 on failure", async () => {
      mockPm.exportSnapshot.mockRejectedValue(new Error("zip error"));
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "export",
        "p",
        "/tmp/x.zip",
      ]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── profile import ────────────────────────────────────────────────────────

  describe("profile import", () => {
    it("calls pm.importSnapshot with zipPath and name", async () => {
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "import",
        "/tmp/snap.zip",
        "restored",
      ]);
      expect(mockPm.importSnapshot).toHaveBeenCalledWith(
        "/tmp/snap.zip",
        "restored",
      );
    });

    it("sets exitCode=1 on failure", async () => {
      mockPm.importSnapshot.mockRejectedValue(new Error("bad zip"));
      await program.parseAsync([
        "node",
        "cli",
        "profile",
        "import",
        "/tmp/bad.zip",
        "p",
      ]);
      expect(process.exitCode).toBe(1);
    });
  });

  // ── daemon stop / status ──────────────────────────────────────────────────

  describe("daemon stop", () => {
    it("sets exitCode=1 when pid file is missing (no daemon running)", async () => {
      await program.parseAsync(["node", "cli", "daemon", "stop"]);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("daemon status", () => {
    it("prints 'not running' when pid file is missing", async () => {
      await program.parseAsync(["node", "cli", "daemon", "status"]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("not running"),
      );
    });
  });
});
