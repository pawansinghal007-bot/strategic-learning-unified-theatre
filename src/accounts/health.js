import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveAuthPath } from "../internal/paths.js";
import { SecretStore } from "./secret-store.js";
import { AccountStore } from "./store.js";
import { loadConfig } from "../internal/config.js";
import { getLocalLlmStatus } from "../llm/local-llm.js";

export const AccountHealthStatus = {
  OK: "ok",
  COOLING_DOWN: "cooling_down",
  EXHAUSTED: "exhausted",
  ERROR: "error",
};

export const DaemonHealthStatus = {
  OK: "ok",
  DEGRADED: "degraded",
  NOT_MONITORING: "not_monitoring",
};

export const LocalLlmHealthStatus = {
  READY: "ready",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable",
};

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function base64UrlDecode(input) {
  const s = input.replaceAll("-", "+").replaceAll("_", "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64").toString("utf8");
}

function parseJwtExp(token) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (typeof payload?.exp === "number") return new Date(payload.exp * 1000);
    return null;
  } catch {
    return null;
  }
}

function parseExpiresAt(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return new Date(n);
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function parseTokenLikeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function deriveHealthFromExpiry(expiry) {
  if (!expiry) {
    return {
      valid: false,
      remainingRequests: null,
      resetAt: null,
      error: "No expiry info",
    };
  }
  const now = Date.now();
  const valid = expiry.getTime() > now;
  return {
    valid,
    remainingRequests: null,
    resetAt: expiry,
    error: valid ? null : "Expired",
  };
}

export async function probeAccount(account, { secretStore } = {}) {
  try {
    const authPathHealth = await probeAccountFromAuthPath(account);
    if (authPathHealth) return authPathHealth;

    const blob = await getAccountBlob(account, secretStore);
    if (!blob) return missingSecretHealth();

    return probeAuthBlob(String(blob));
  } catch (err) {
    return {
      valid: false,
      remainingRequests: null,
      resetAt: null,
      error: String(err?.message ?? err),
    };
  }
}

async function probeAccountFromAuthPath(account) {
  if (!["codex", "vscode", "github"].includes(account.agentType)) {
    return null;
  }

  const authPath = await resolveAuthPath(account.agentType, {
    profileName: account.profileName ?? account.id,
    preferExisting: true,
  });

  if (!(await exists(authPath))) return null;

  const raw = await fs.readFile(authPath, "utf8");
  const json = parseTokenLikeJson(raw);
  return probeTokenJson(json);
}

async function getAccountBlob(account, secretStore) {
  const ss = secretStore ?? new SecretStore();
  const storedBlob = await ss.get(account.id);
  const accountBlob =
    typeof account?.authBlob === "string" && account.authBlob.length > 0
      ? account.authBlob
      : null;

  if (accountBlob && !storedBlob) {
    await ss.set(account.id, accountBlob);
  }

  return accountBlob ?? storedBlob;
}

function missingSecretHealth() {
  return {
    valid: false,
    remainingRequests: null,
    resetAt: null,
    error: "Missing secret",
  };
}

function probeAuthBlob(blob) {
  const jwtExp = parseJwtExp(blob);
  if (jwtExp) return deriveHealthFromExpiry(jwtExp);

  const json = parseTokenLikeJson(blob);
  return probeTokenJson(json) ?? { valid: true, remainingRequests: null, resetAt: null, error: null };
}

function probeTokenJson(json) {
  if (!json) return null;

  const exp = parseExpiresAt(json.expires_at ?? json.expiry ?? json.exp);
  if (!exp) return null;

  const base = deriveHealthFromExpiry(exp);
  const remaining =
    typeof json.remainingRequests === "number"
      ? json.remainingRequests
      : typeof json.remaining === "number"
        ? json.remaining
        : null;
  const resetAt = parseExpiresAt(json.resetAt) ?? base.resetAt;
  return {
    valid: base.valid,
    remainingRequests: remaining,
    resetAt,
    error: base.error,
  };
}

function daemonBaseDir() {
  return path.join(os.homedir(), ".vscode-rotator");
}

function daemonPaths() {
  const baseDir = daemonBaseDir();
  return {
    baseDir,
    pidPath: path.join(baseDir, "daemon.pid"),
    logPath: path.join(baseDir, "daemon.log"),
  };
}

async function readPid(pidPath) {
  try {
    const raw = await fs.readFile(pidPath, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function emptyAccountSummary() {
  return {
    total: 0,
    ok: 0,
    coolingDown: 0,
    exhausted: 0,
    error: 0,
  };
}

function classifyAccount(account, probe) {
  const cooldownUntil =
    account?.cooldownUntil instanceof Date
      ? account.cooldownUntil
      : account?.cooldownUntil
        ? new Date(account.cooldownUntil)
        : null;
  const isCoolingDown =
    account?.status === "cooldown" ||
    (cooldownUntil &&
      Number.isFinite(cooldownUntil.getTime()) &&
      cooldownUntil.getTime() > Date.now());

  if (probe?.valid === false) return AccountHealthStatus.ERROR;
  if (probe?.remainingRequests === 0) return AccountHealthStatus.EXHAUSTED;
  if (isCoolingDown) return AccountHealthStatus.COOLING_DOWN;
  return AccountHealthStatus.OK;
}

function summarizeAccountStatus(accounts) {
  if (
    accounts.some(
      (account) => account.healthStatus === AccountHealthStatus.ERROR,
    )
  ) {
    return AccountHealthStatus.ERROR;
  }
  if (
    accounts.some(
      (account) => account.healthStatus === AccountHealthStatus.EXHAUSTED,
    )
  ) {
    return AccountHealthStatus.EXHAUSTED;
  }
  if (
    accounts.some(
      (account) => account.healthStatus === AccountHealthStatus.COOLING_DOWN,
    )
  ) {
    return AccountHealthStatus.COOLING_DOWN;
  }
  return AccountHealthStatus.OK;
}

export async function computeAccountHealth() {
  const store = new AccountStore();
  const accounts = [];
  const summary = emptyAccountSummary();

  try {
    const list = await store.list();
    for (const account of list) {
      let probe;
      let healthStatus;
      try {
        probe = await probeAccount(account);
        healthStatus = classifyAccount(account, probe);
      } catch (err) {
        probe = {
          valid: false,
          remainingRequests: null,
          resetAt: null,
          error: String(err?.message ?? err),
        };
        healthStatus = AccountHealthStatus.ERROR;
      }

      accounts.push({
        id: account.id,
        email: account.email,
        agentType: account.agentType,
        accountStatus: account.status,
        healthStatus,
        valid: Boolean(probe?.valid),
        remainingRequests: probe?.remainingRequests ?? null,
        resetAt: probe?.resetAt ?? null,
        error: probe?.error ?? null,
      });
    }
  } catch (err) {
    summary.error += 1;
    return {
      status: AccountHealthStatus.ERROR,
      accounts,
      summary: {
        ...summary,
        errorMessage: String(err?.message ?? err),
      },
    };
  }

  for (const account of accounts) {
    summary.total += 1;
    if (account.healthStatus === AccountHealthStatus.OK) summary.ok += 1;
    else if (account.healthStatus === AccountHealthStatus.COOLING_DOWN)
      summary.coolingDown += 1;
    else if (account.healthStatus === AccountHealthStatus.EXHAUSTED)
      summary.exhausted += 1;
    else summary.error += 1;
  }

  return {
    status: summarizeAccountStatus(accounts),
    accounts,
    summary,
  };
}

export async function computeDaemonHealth() {
  const { pidPath, logPath } = daemonPaths();
  const pid = await readPid(pidPath);
  const pidAlive = pid != null && isPidAlive(pid);
  let watchedReposCount = 0;
  let configLoaded = true;

  try {
    const config = await loadConfig();
    watchedReposCount = Array.isArray(config?.watchedRepos)
      ? config.watchedRepos.length
      : 0;
  } catch {
    configLoaded = false;
  }

  const logExists = await exists(logPath);
  const status =
    watchedReposCount === 0
      ? DaemonHealthStatus.NOT_MONITORING
      : pidAlive && configLoaded
        ? DaemonHealthStatus.OK
        : DaemonHealthStatus.DEGRADED;

  return {
    status,
    pid,
    watchedReposCount,
    logPath,
    logExists,
  };
}

function mapLocalLlmStatus(raw) {
  const rawStatus = String(raw?.status ?? "").toLowerCase();
  if (rawStatus === LocalLlmHealthStatus.READY || rawStatus === "ok") {
    return LocalLlmHealthStatus.READY;
  }
  if (rawStatus === LocalLlmHealthStatus.DEGRADED) {
    return LocalLlmHealthStatus.DEGRADED;
  }
  if (
    rawStatus === LocalLlmHealthStatus.UNAVAILABLE ||
    rawStatus === "missing"
  ) {
    return LocalLlmHealthStatus.UNAVAILABLE;
  }
  if (
    raw?.available === true &&
    Array.isArray(raw?.models) &&
    raw.models.length > 0
  ) {
    return LocalLlmHealthStatus.READY;
  }
  if (raw?.ollamaAvailable === true) {
    return LocalLlmHealthStatus.DEGRADED;
  }
  return LocalLlmHealthStatus.UNAVAILABLE;
}

export async function computeLocalLlmHealth() {
  const raw = await getLocalLlmStatus();
  const modelDir =
    raw?.modelDir ?? (raw?.modelPath ? path.dirname(raw.modelPath) : null);
  return {
    status: mapLocalLlmStatus(raw),
    modelDir,
    models: Array.isArray(raw?.models) ? raw.models : [],
  };
}

export async function getSystemHealth() {
  const [account, daemon, localLlm] = await Promise.all([
    computeAccountHealth(),
    computeDaemonHealth(),
    computeLocalLlmHealth(),
  ]);

  return {
    ts: new Date().toISOString(),
    account,
    daemon,
    localLlm,
  };
}
