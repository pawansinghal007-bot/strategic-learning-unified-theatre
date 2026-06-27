import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSystemHealth } from "../../src/system/systemHealth.js";
import * as storeMod from "../../src/accounts/store.js";
import * as acctHealth from "../../src/accounts/health.js";
import * as llmMod from "../../src/llm/local-llm.js";
import * as daemonMod from "../../src/daemon/daemonStatus.js";
import * as storageMod from "../../src/storage/storageStatus.js";
import { MemoryDb } from "../../src/ai-memory/memory-db.js";
import * as configMod from "../../src/internal/config.js";

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

  it("TEST D - probeAccount throwing marks that account ERROR and surfaces error message", async () => {
    vi.spyOn(storeMod.AccountStore.prototype, "list").mockResolvedValue([
      { id: "acct1", email: "user@example.com", agentType: "vscode" },
    ]);

    vi.spyOn(acctHealth, "probeAccount").mockImplementation(async () => {
      throw new Error("network timeout");
    });

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result.status).toBe("ERROR");
    expect(result.subsystems.accounts.status).toBe("ERROR");

    const acct = result.subsystems.accounts.accounts[0];
    expect(acct.status).toBe("ERROR");
    expect(acct.probe.valid).toBe(false);
    expect(acct.probe.remainingRequests).toBeNull();
    expect(acct.probe.resetAt).toBeNull();
    expect(acct.probe.error).toBe("network timeout");
  });

  it("TEST E - probeAccount resolving with valid:false marks account ERROR without throwing", async () => {
    vi.spyOn(storeMod.AccountStore.prototype, "list").mockResolvedValue([
      { id: "acct1", email: "user@example.com", agentType: "vscode" },
    ]);

    vi.spyOn(acctHealth, "probeAccount").mockImplementation(async () => ({
      valid: false,
      remainingRequests: 0,
      resetAt: "2026-01-01T00:00:00.000Z",
    }));

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result.status).toBe("ERROR");
    const acct = result.subsystems.accounts.accounts[0];
    expect(acct.status).toBe("ERROR");
    // Note: unlike the catch-block path, probe is passed through as-is here.
    expect(acct.probe.valid).toBe(false);
    expect(acct.probe.remainingRequests).toBe(0);
  });

  it("TEST F - LLM unavailable reports DEGRADED, not ERROR", async () => {
    vi.spyOn(llmMod, "getLlmStatus").mockResolvedValue({
      available: false,
      models: [],
      modelPath: null,
    });

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result.subsystems.llm.status).toBe("DEGRADED");
    expect(result.status).toBe("DEGRADED");
  });

  it("TEST G - memory DB query returning unexpected value reports ERROR with reason (no throw)", async () => {
    vi.spyOn(MemoryDb.prototype, "getDb").mockImplementation(function () {
      return {
        prepare: () => ({ get: () => ({ value: 0 }) }),
      };
    });

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result.subsystems.memoryDb.status).toBe("ERROR");
    expect(result.subsystems.memoryDb.reason).toBe(
      "Memory DB returned an unexpected value.",
    );
    expect(result.subsystems.memoryDb.result).toEqual({ value: 0 });
  });

  it("TEST H - deriveSubsystemStatus handles plain string parts, empty arrays, and non-array input", async () => {
    const { deriveSubsystemStatus } =
      await import("../../src/system/systemHealth.js");

    // Plain string parts (not objects with a "status" key)
    expect(deriveSubsystemStatus(["OK", "DEGRADED"])).toBe("DEGRADED");
    expect(deriveSubsystemStatus(["ok", "error"])).toBe("ERROR");

    // Empty array -> OK
    expect(deriveSubsystemStatus([])).toBe("OK");

    // Non-array input -> OK (statuses = [])
    expect(deriveSubsystemStatus(null)).toBe("OK");
    expect(deriveSubsystemStatus(undefined)).toBe("OK");

    // Object without a "status" key falls through to normalizeStatus(part) -> OK
    expect(deriveSubsystemStatus([{ foo: "bar" }])).toBe("OK");

    // Unrecognized status string defaults to OK
    expect(deriveSubsystemStatus(["WEIRD_VALUE"])).toBe("OK");
  });

  it("TEST I - deriveSubsystemStatus treats null/undefined parts as OK", async () => {
    const { deriveSubsystemStatus } =
      await import("../../src/system/systemHealth.js");

    // Hits the `value ?? ""` fallback in normalizeStatus directly.
    expect(deriveSubsystemStatus([null, undefined])).toBe("OK");
  });

  it("TEST J - probeAccount throwing a non-Error value falls back to the raw value as the error string", async () => {
    vi.spyOn(storeMod.AccountStore.prototype, "list").mockResolvedValue([
      { id: "acct1", email: "user@example.com", agentType: "vscode" },
    ]);

    // Throw a plain string (no .message property) so `err?.message ?? err`
    // must fall back to `err` itself.
    vi.spyOn(acctHealth, "probeAccount").mockImplementation(async () => {
      throw "connection refused";
    });

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    const acct = result.subsystems.accounts.accounts[0];
    expect(acct.probe.error).toBe("connection refused");
  });

  it("TEST K - MemoryDb init throwing a non-Error value falls back to the raw value as the reason string", async () => {
    vi.spyOn(MemoryDb.prototype, "init").mockImplementation(async function () {
      throw { code: "EBUSY" };
    });

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    expect(result.subsystems.memoryDb.status).toBe("ERROR");
    expect(result.subsystems.memoryDb.reason).toBe("[object Object]");
  });

  it("TEST L - omitting config falls back to loadConfig()", async () => {
    const fakeConfig = { storageRoot: "/tmp/fake" };
    vi.spyOn(configMod, "loadConfig").mockResolvedValue(fakeConfig);

    const result = await getSystemHealth({ dbPath: undefined });

    expect(configMod.loadConfig).toHaveBeenCalledTimes(1);
    expect(result.config).toEqual(fakeConfig);
  });

  it("TEST M - account missing email/agentType falls back to null", async () => {
    vi.spyOn(storeMod.AccountStore.prototype, "list").mockResolvedValue([
      { id: "acct-no-extras" },
    ]);

    const result = await getSystemHealth({ dbPath: undefined, config: {} });

    const acct = result.subsystems.accounts.accounts[0];
    expect(acct.id).toBe("acct-no-extras");
    expect(acct.email).toBeNull();
    expect(acct.agentType).toBeNull();
  });

  it("TEST C - broken DB path results in non-OK overall status", async () => {
    const result = await getSystemHealth({ dbPath: "broken/path", config: {} });

    expect(result.status).not.toBe("OK");
  });
});
