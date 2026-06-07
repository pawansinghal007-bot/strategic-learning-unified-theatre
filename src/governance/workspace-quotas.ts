import { readJsonFile, writeJsonFile } from "../llm/storage.js";
import { appendAuditEvent } from "../audit/audit-log.js";

const QUOTA_FILE = "workspace-quotas.json";

export interface WorkspaceQuotaPolicy {
  workspaceId: string;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  mode: "alert" | "fallback" | "block";
  fallbackProvider: string | null;
  alertThresholdPct: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceQuotaUsage {
  workspaceId: string;
  dayCount: number;
  weekCount: number;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  exceededDaily: boolean;
  exceededWeekly: boolean;
  exceeded: boolean;
  thresholdReached: boolean;
  mode: "alert" | "fallback" | "block" | null;
  fallbackProvider: string | null;
}

export interface WorkspaceQuotaEvaluation {
  allowed: boolean;
  shouldFallback: boolean;
  shouldAlert: boolean;
  blocked: boolean;
  fallbackProvider: string | null;
  usage: WorkspaceQuotaUsage;
}

interface QuotaRecord {
  workspaceId: string;
  timestamp: number;
}

interface QuotaNotification {
  workspaceId: string;
  type: "threshold" | "exceeded";
  timestamp: number;
  dayCount: number;
  weekCount: number;
}

function pushQuotaNotification(input: QuotaNotification): void {
  const store = loadStore();
  store.notifications.push(input);
  saveStore(store);
}

interface QuotaStore {
  policies: WorkspaceQuotaPolicy[];
  usage: QuotaRecord[];
  notifications: QuotaNotification[];
  lastDailyResetAt: number | null;
}

function loadStore(): QuotaStore {
  const store = readJsonFile(QUOTA_FILE, {
    policies: [],
    usage: [],
    notifications: [],
    lastDailyResetAt: null,
  });
  return {
    policies: Array.isArray(store?.policies) ? [...store.policies] : [],
    usage: Array.isArray(store?.usage) ? [...store.usage] : [],
    notifications: Array.isArray(store?.notifications)
      ? [...store.notifications]
      : [],
    lastDailyResetAt:
      typeof store?.lastDailyResetAt === "number"
        ? store.lastDailyResetAt
        : null,
  };
}

function saveStore(store: QuotaStore): void {
  writeJsonFile(QUOTA_FILE, store);
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function weekKey(timestamp: number): string {
  const d = new Date(timestamp);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function setWorkspaceQuotaPolicy(input: {
  workspaceId: string;
  dailyLimit?: number | null;
  weeklyLimit?: number | null;
  mode?: "alert" | "fallback" | "block";
  fallbackProvider?: string | null;
  alertThresholdPct?: number | null;
  requestedBy?: string | null;
  reason?: string | null;
}): WorkspaceQuotaPolicy {
  const store = loadStore();
  const now = Date.now();
  const existingIndex = store.policies.findIndex(
    (p) => p.workspaceId === input.workspaceId,
  );

  const next: WorkspaceQuotaPolicy = {
    workspaceId: input.workspaceId,
    dailyLimit: typeof input.dailyLimit === "number" ? input.dailyLimit : null,
    weeklyLimit:
      typeof input.weeklyLimit === "number" ? input.weeklyLimit : null,
    mode: input.mode ?? "alert",
    fallbackProvider: input.fallbackProvider ?? null,
    alertThresholdPct:
      typeof input.alertThresholdPct === "number"
        ? input.alertThresholdPct
        : null,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    store.policies[existingIndex] = next;
  } else {
    store.policies.push(next);
  }

  saveStore(store);

  appendAuditEvent({
    action: "workspaceQuota.set",
    actor: { type: "renderer", id: input.requestedBy ?? undefined },
    targetType: "workspaceQuota",
    workspaceId: input.workspaceId,
    details: {
      dailyLimit: next.dailyLimit,
      weeklyLimit: next.weeklyLimit,
      mode: next.mode,
      fallbackProvider: next.fallbackProvider,
      reason: input.reason ?? null,
    },
  });

  return next;
}

export function getWorkspaceQuotaPolicy(
  workspaceId: string,
): WorkspaceQuotaPolicy | null {
  const store = loadStore();
  return store.policies.find((p) => p.workspaceId === workspaceId) ?? null;
}

export function listWorkspaceQuotaPolicies(): WorkspaceQuotaPolicy[] {
  const store = loadStore();
  return store.policies.sort((a, b) =>
    a.workspaceId.localeCompare(b.workspaceId),
  );
}

export function clearWorkspaceQuotaPolicy(
  workspaceId: string,
  requestedBy?: string | null,
): { ok: true } {
  const store = loadStore();
  store.policies = store.policies.filter((p) => p.workspaceId !== workspaceId);
  saveStore(store);

  appendAuditEvent({
    action: "workspaceQuota.clear",
    actor: { type: "renderer", id: requestedBy ?? undefined },
    targetType: "workspaceQuota",
    workspaceId,
    details: {},
  });

  return { ok: true };
}

export function clearWorkspaceQuotaUsage(workspaceId?: string): { ok: true } {
  const store = loadStore();
  store.usage = workspaceId
    ? store.usage.filter((r) => r.workspaceId !== workspaceId)
    : [];
  saveStore(store);
  return { ok: true };
}

export function getWorkspaceQuotaUsage(
  workspaceId: string,
  now = Date.now(),
): WorkspaceQuotaUsage {
  const store = loadStore();
  const policy = getWorkspaceQuotaPolicy(workspaceId);
  const today = dayKey(now);
  const thisWeek = weekKey(now);

  const records = store.usage.filter((r) => r.workspaceId === workspaceId);
  const dayCount = records.filter((r) => dayKey(r.timestamp) === today).length;
  const weekCount = records.filter(
    (r) => weekKey(r.timestamp) === thisWeek,
  ).length;

  const exceededDaily =
    typeof policy?.dailyLimit === "number"
      ? dayCount > policy.dailyLimit
      : false;
  const exceededWeekly =
    typeof policy?.weeklyLimit === "number"
      ? weekCount > policy.weeklyLimit
      : false;
  const thresholdReached = (() => {
    if (
      !policy ||
      typeof policy.alertThresholdPct !== "number" ||
      policy.alertThresholdPct <= 0
    ) {
      return false;
    }

    const thresholdFactor = policy.alertThresholdPct / 100;
    const dailyThresholdReached =
      typeof policy.dailyLimit === "number" &&
      dayCount >= Math.ceil(policy.dailyLimit * thresholdFactor);
    const weeklyThresholdReached =
      typeof policy.weeklyLimit === "number" &&
      weekCount >= Math.ceil(policy.weeklyLimit * thresholdFactor);

    return dailyThresholdReached || weeklyThresholdReached;
  })();

  return {
    workspaceId,
    dayCount,
    weekCount,
    dailyLimit: policy?.dailyLimit ?? null,
    weeklyLimit: policy?.weeklyLimit ?? null,
    exceededDaily,
    exceededWeekly,
    exceeded: exceededDaily || exceededWeekly,
    thresholdReached,
    mode: policy?.mode ?? null,
    fallbackProvider: policy?.fallbackProvider ?? null,
  };
}

export function recordWorkspaceQuotaUsage(input: {
  workspaceId: string;
  timestamp?: number;
  provider?: string | null;
}): WorkspaceQuotaUsage {
  const store = loadStore();
  const ts = input.timestamp ?? Date.now();
  store.usage.push({ workspaceId: input.workspaceId, timestamp: ts });
  saveStore(store);

  const usage = getWorkspaceQuotaUsage(input.workspaceId, ts);

  appendAuditEvent({
    action: "workspaceQuota.usageRecorded",
    actor: { type: "system" },
    targetType: "workspaceQuota",
    workspaceId: input.workspaceId,
    details: {
      provider: input.provider ?? null,
      dayCount: usage.dayCount,
      weekCount: usage.weekCount,
      exceeded: usage.exceeded,
    },
  });

  if (usage.thresholdReached && !usage.exceeded) {
    pushQuotaNotification({
      workspaceId: input.workspaceId,
      type: "threshold",
      timestamp: ts,
      dayCount: usage.dayCount,
      weekCount: usage.weekCount,
    });
  }

  if (usage.exceeded) {
    pushQuotaNotification({
      workspaceId: input.workspaceId,
      type: "exceeded",
      timestamp: ts,
      dayCount: usage.dayCount,
      weekCount: usage.weekCount,
    });

    appendAuditEvent({
      action: "workspaceQuota.exceeded",
      actor: { type: "system" },
      targetType: "workspaceQuota",
      workspaceId: input.workspaceId,
      details: {
        mode: usage.mode,
        fallbackProvider: usage.fallbackProvider,
        exceededDaily: usage.exceededDaily,
        exceededWeekly: usage.exceededWeekly,
      },
    });
  }

  return usage;
}

export function evaluateWorkspaceQuotaStatus(
  workspaceId: string,
  now = Date.now(),
): WorkspaceQuotaEvaluation {
  const usage = getWorkspaceQuotaUsage(workspaceId, now);
  return {
    allowed: !usage.exceeded || usage.mode !== "block",
    shouldFallback: usage.exceeded && usage.mode === "fallback",
    shouldAlert: usage.exceeded && usage.mode === "alert",
    blocked: usage.exceeded && usage.mode === "block",
    fallbackProvider:
      usage.exceeded && usage.mode === "fallback"
        ? usage.fallbackProvider
        : null,
    usage,
  };
}

export function getWorkspaceQuotaRollup(now = Date.now()): Array<{
  workspaceId: string;
  mode: "alert" | "fallback" | "block";
  fallbackProvider: string | null;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  alertThresholdPct: number | null;
  dayCount: number;
  weekCount: number;
  thresholdReached: boolean;
  exceeded: boolean;
}> {
  return listWorkspaceQuotaPolicies().map((policy) => {
    const usage = getWorkspaceQuotaUsage(policy.workspaceId, now);
    return {
      workspaceId: policy.workspaceId,
      mode: policy.mode,
      fallbackProvider: policy.fallbackProvider,
      dailyLimit: policy.dailyLimit,
      weeklyLimit: policy.weeklyLimit,
      alertThresholdPct: policy.alertThresholdPct,
      dayCount: usage.dayCount,
      weekCount: usage.weekCount,
      thresholdReached: usage.thresholdReached,
      exceeded: usage.exceeded,
    };
  });
}

export function listWorkspaceQuotaNotifications(
  workspaceId?: string,
): QuotaNotification[] {
  const store = loadStore();
  const rows = workspaceId
    ? store.notifications.filter((n) => n.workspaceId === workspaceId)
    : store.notifications;
  return rows.slice().sort((a, b) => b.timestamp - a.timestamp);
}

export function resetWorkspaceQuotaDaily(now = Date.now()): {
  ok: true;
  resetAt: number;
} {
  const store = loadStore();
  const today = dayKey(now);
  store.usage = store.usage.filter(
    (record) => dayKey(record.timestamp) === today,
  );
  store.lastDailyResetAt = now;
  saveStore(store);

  appendAuditEvent({
    action: "workspaceQuota.dailyReset",
    actor: { type: "system" },
    targetType: "workspaceQuota",
    workspaceId: null,
    details: { resetAt: now },
  });

  return { ok: true, resetAt: now };
}
