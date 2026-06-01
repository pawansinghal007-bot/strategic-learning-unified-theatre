import { AccountStore } from "../accounts/store.js";
import { probeAccount } from "../accounts/health.js";
import { getLlmStatus } from "../llm/local-llm.js";
import { MemoryDb } from "../ai-memory/memory-db.js";
import { loadConfig } from "../internal/config.js";
import { getDaemonStatus } from "../daemon/daemonStatus.js";
import { getStorageMonitorStatus } from "../storage/storageStatus.js";

function normalizeStatus(value) {
  const status = String(value ?? "").toUpperCase();
  if (status === "ERROR") return "ERROR";
  if (status === "DEGRADED") return "DEGRADED";
  return "OK";
}

export function deriveSubsystemStatus(parts) {
  const statuses = Array.isArray(parts)
    ? parts.map((part) => {
        if (part && typeof part === "object" && "status" in part) {
          return normalizeStatus(part.status);
        }
        return normalizeStatus(part);
      })
    : [];

  if (statuses.includes("ERROR")) return "ERROR";
  if (statuses.includes("DEGRADED")) return "DEGRADED";
  return "OK";
}

export async function getAccountsHealth() {
  const store = new AccountStore();
  const accounts = await store.list();
  const results = [];

  for (const account of accounts) {
    let probe;
    let status = "OK";
    try {
      probe = await probeAccount(account);
      if (probe?.valid !== true) {
        status = "ERROR";
      }
    } catch (err) {
      status = "ERROR";
      probe = {
        valid: false,
        remainingRequests: null,
        resetAt: null,
        error: String(err?.message ?? err),
      };
    }

    results.push({
      id: account.id,
      email: account.email ?? null,
      agentType: account.agentType ?? null,
      status,
      probe,
    });
  }

  return {
    status: deriveSubsystemStatus(results.map((item) => item.status)),
    accounts: results,
  };
}

export async function getLlmHealth() {
  const raw = await getLlmStatus();
  const status = raw?.available === true ? "OK" : "DEGRADED";

  return {
    status,
    details: raw,
  };
}

export async function getMemoryDbHealth(dbPath) {
  const memoryDb = new MemoryDb({ dbPath });
  try {
    await memoryDb.init();
    const db = memoryDb.getDb();
    const result = db.prepare("SELECT 1 AS value").get();
    const success = result?.value === 1;
    return {
      status: success ? "OK" : "ERROR",
      dbPath: memoryDb.dbPath,
      result,
      reason: success ? null : "Memory DB returned an unexpected value.",
    };
  } catch (err) {
    return {
      status: "ERROR",
      dbPath: memoryDb.dbPath,
      result: null,
      reason: String(err?.message ?? err),
    };
  } finally {
    try {
      memoryDb.close();
    } catch {
      // ignore
    }
  }
}

export async function getSystemHealth({ dbPath, config } = {}) {
  const effectiveConfig = config ?? (await loadConfig());
  const [daemon, storage, accounts, llm, memoryDb] = await Promise.all([
    getDaemonStatus(),
    getStorageMonitorStatus(effectiveConfig),
    getAccountsHealth(),
    getLlmHealth(),
    getMemoryDbHealth(dbPath),
  ]);

  const overallStatus = deriveSubsystemStatus([
    daemon,
    storage,
    accounts,
    llm,
    memoryDb,
  ]);

  return {
    ts: new Date().toISOString(),
    status: overallStatus,
    subsystems: {
      daemon,
      storage,
      accounts,
      llm,
      memoryDb,
    },
    config: effectiveConfig,
  };
}
