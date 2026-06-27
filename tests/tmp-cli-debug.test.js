import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NODE_ENV = "test";

const mockStore = {
  list: vi.fn().mockResolvedValue([]),
  add: vi.fn().mockResolvedValue({ id: "x" }),
  remove: vi.fn().mockResolvedValue(undefined),
  get: vi
    .fn()
    .mockResolvedValue({ id: "x", profileName: null, agentType: "vscode" }),
};
const mockSecret = {
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
};
const mockPm = {
  list: vi.fn().mockResolvedValue(["default"]),
  create: vi.fn().mockResolvedValue("/profiles/new"),
  delete: vi.fn().mockResolvedValue(undefined),
  link: vi.fn().mockResolvedValue(undefined),
  exportSnapshot: vi.fn().mockResolvedValue(undefined),
  importSnapshot: vi.fn().mockResolvedValue(undefined),
};

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
vi.mock("nanoid", () => ({ nanoid: () => "x" }));
vi.mock("../src/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
vi.mock("../src/accounts/store.js", () => ({
  AccountStore: vi.fn(function () {
    return mockStore;
  }),
}));
vi.mock("../src/accounts/secret-store.js", () => ({
  SecretStore: vi.fn(function () {
    return mockSecret;
  }),
}));
vi.mock("../src/accounts/schema.js", () => ({
  AgentTypeSchema: {
    options: ["vscode", "codex", "trae"],
    safeParse: (v) => ({
      success: ["vscode", "codex", "trae"].includes(v),
      data: v,
    }),
  },
}));
vi.mock("../src/accounts/switcher.js", () => ({
  SwitcherService: vi.fn(function () {
    return {
      switch: vi.fn().mockResolvedValue({
        accountId: "acct-1",
        agentType: "vscode",
        authPath: "/auth",
        profileName: "p1",
      }),
    };
  }),
}));
vi.mock("../src/accounts/health.js", () => ({
  getSystemHealth: vi.fn().mockResolvedValue({}),
}));
vi.mock("../src/accounts/profile-manager.js", () => ({
  ProfileManager: vi.fn(function () {
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
  Journal: vi.fn(function () {
    return {
      tail: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue("/backups/journal.bak"),
    };
  }),
}));
vi.mock("../src/internal/git-monitor.js", () => ({
  GitMonitor: vi.fn(function () {
    return { status: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock("../src/internal/reporter.js", () => ({
  Reporter: vi.fn(function () {
    return { daily: vi.fn().mockResolvedValue(undefined) };
  }),
}));
vi.mock("../src/internal/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ memoryDbPath: "/tmp/mem.db" }),
}));
vi.mock("../src/system/systemHealth.js", () => ({
  getSystemHealth: vi
    .fn()
    .mockResolvedValue({ status: "OK", ts: "", subsystems: [] }),
}));
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

const { program } = await import("../src/cli.js");
program.exitOverride();
program.configureOutput({ writeOut() {}, writeErr() {} });

describe("tmp cli debug", () => {
  it("can parse remove", async () => {
    const names = program.commands.map((c) => c.name());
    console.log(names);
    await program.parseAsync(["node", "cli", "remove", "abc-123"]);
    console.log("secret calls", mockSecret.delete.mock.calls);
    console.log("store calls", mockStore.remove.mock.calls);
    expect(mockSecret.delete).toHaveBeenCalledWith("abc-123");
  });
});
