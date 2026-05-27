import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSystemHealth } from "../../src/system/systemHealth.js";
import * as storeMod from "../../src/accounts/store.js";
import * as acctHealth from "../../src/accounts/health.js";
import * as llmMod from "../../src/llm/local-llm.js";
import * as daemonMod from "../../src/daemon/daemonStatus.js";
import * as storageMod from "../../src/storage/storageStatus.js";
import { MemoryDb } from "../../src/ai-memory/memory-db.js";

describe("systemHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Default AccountStore.list -> empty
    vi.spyOn(storeMod.AccountStore.prototype, "list").mockResolvedValue([]);

    // Default probeAccount
    vi.spyOn(acctHealth, "probeAccount").mockImplementation(async () => ({
      valid: true,
      remainingRequests: 100,
    }));

    // Default LLM
    vi.spyOn(llmMod, "getLlmStatus").mockResolvedValue({
      available: true,
      models: ["model1"],
      modelPath: "/models",
    });

    // Default daemon
    vi.spyOn(daemonMod, "getDaemonStatus").mockResolvedValue({
      status: "OK",
      running: true,
      pid: 12345,
    });

    // Default storage
    vi.spyOn(storageMod, "getStorageMonitorStatus").mockResolvedValue({
      status: "OK",
      lastSnapshotAt: new Date().toISOString(),
    });

    // MemoryDb init/getDb behavior
    vi.spyOn(MemoryDb.prototype, "init").mockImplementation(async function () {
      if (this.dbPath && String(this.dbPath).includes("broken"))
        throw new Error("DB init failure");
      return this;
    });
    vi.spyOn(MemoryDb.prototype, "getDb").mockImplementation(function () {
      return {
        prepare: () => ({ get: () => ({ value: 1 }) }),
      };
    });
    vi.spyOn(MemoryDb.prototype, "close").mockImplementation(function () {
      /* noop */
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TEST A - happy path returns OK with all subsystems", async () => {
    // Make AccountStore.list return one account
    vi.spyOn(storeMod.AccountStore.prototype, "list").mockResolvedValue([
      { id: "acct1", email: "user@example.com", agentType: "vscode" },
    ]);

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result).toBeTruthy();
    expect(result.status).toBe("OK");
    expect(result.subsystems).toBeTruthy();
    const subs = result.subsystems;
    expect(subs).toHaveProperty("daemon");
    expect(subs).toHaveProperty("storage");
    expect(subs).toHaveProperty("accounts");
    expect(subs).toHaveProperty("llm");
    expect(subs).toHaveProperty("memoryDb");
  });

  it("TEST B - failing daemon causes overall ERROR", async () => {
    vi.spyOn(daemonMod, "getDaemonStatus").mockResolvedValue({
      status: "ERROR",
      running: false,
      pid: null,
      reason: "Process not running",
    });

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result.status).toBe("ERROR");
    expect(result.subsystems.daemon.status).toBe("ERROR");
  });

  it("TEST C - broken DB path results in non-OK overall status", async () => {
    const result = await getSystemHealth({ dbPath: "broken/path", config: {} });

    expect(result.status).not.toBe("OK");
  });
});
