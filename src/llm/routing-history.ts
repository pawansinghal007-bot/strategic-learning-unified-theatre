import { readJsonFile, writeJsonFile } from "./storage";
import { logger } from "../shared/logging/logger";

const ROUTING_HISTORY_FILE = "routing-history.json";
const MAX_HISTORY = 200;

type RoutingDecisionInput = {
  request: {
    requestId: string;
    workspaceId?: string;
    intent?: string;
  };
  provider: string;
  model: string;
  success: boolean;
  reason: string;
  fallbackFrom?: string;
  latencyMs?: number;
  errorMessage?: string;
};

type RoutingHistoryRecord = {
  id: string;
  requestId: string;
  workspaceId?: string | null;
  provider: string;
  model: string;
  intent?: string;
  success: boolean;
  reason: string;
  fallbackFrom?: string;
  latencyMs?: number;
  createdAt: number;
  errorMessage?: string;
};

export interface WorkspaceProviderTrendPoint {
  provider: string;
  count: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
}

export interface WorkspaceTimelineEntry {
  id: string;
  timestamp: number;
  title: string;
  detail: string;
  severity: "info" | "warning" | "error";
  provider: string;
  success: boolean;
  workspaceId: string | null;
}

function loadHistory(): RoutingHistoryRecord[] {
  return readJsonFile<RoutingHistoryRecord[]>(ROUTING_HISTORY_FILE, []);
}

function saveHistory(records: RoutingHistoryRecord[]) {
  writeJsonFile(ROUTING_HISTORY_FILE, records.slice(0, MAX_HISTORY));
}

function nextId() {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function toTimelineEntry(item: RoutingHistoryEntry): WorkspaceTimelineEntry {
  const title = item.success
    ? `Routed to ${item.provider}`
    : `Failed on ${item.provider}`;

  const detailParts = [
    `reason=${item.reason}`,
    item.intent ? `intent=${item.intent}` : null,
    item.fallbackFrom ? `fallbackFrom=${item.fallbackFrom}` : null,
    typeof item.latencyMs === "number" ? `latency=${item.latencyMs}ms` : null,
    item.errorMessage ? `error=${item.errorMessage}` : null,
  ].filter(Boolean);

  return {
    id: item.id,
    timestamp: item.createdAt,
    title,
    detail: detailParts.join(" | "),
    severity: item.success ? "info" : item.errorMessage ? "error" : "warning",
    provider: String(item.provider),
    success: item.success,
    workspaceId: item.workspaceId ?? null,
  };
}

export type RoutingHistoryEntry = RoutingHistoryRecord;

export function recordRoutingDecision(input: RoutingDecisionInput) {
  const snapshot = loadHistory();

  const record: RoutingHistoryRecord = {
    id: nextId(),
    requestId: input.request.requestId,
    workspaceId: input.request.workspaceId,
    provider: input.provider,
    model: input.model,
    intent: input.request.intent,
    success: input.success,
    reason: input.reason,
    fallbackFrom: input.fallbackFrom,
    latencyMs: input.latencyMs,
    createdAt: Date.now(),
    errorMessage: input.errorMessage,
  };

  snapshot.unshift(record);
  saveHistory(snapshot);

  logger.info("routing.history.recorded", {
    requestId: record.requestId,
    provider: record.provider,
    success: record.success,
    reason: record.reason,
  });
}

export function getRoutingHistory(limit = 50) {
  return loadHistory().slice(0, limit);
}

export function resetRoutingHistory() {
  saveHistory([]);
  logger.info("routing.history.reset");
}

export function listRoutingHistoryForWorkspace(
  workspaceId: string,
  limit = 50,
): RoutingHistoryEntry[] {
  const history = loadHistory();
  return history
    .filter((item) => item.workspaceId === workspaceId)
    .slice(0, Math.max(0, limit));
}

export function getWorkspaceRoutingSummary(workspaceId: string): {
  workspaceId: string;
  total: number;
  successCount: number;
  failureCount: number;
  providerCounts: Record<string, number>;
  latest: RoutingHistoryEntry | null;
  successRate: number;
  avgLatencyMs: number;
  errorRate: number;
} {
  const items = listRoutingHistoryForWorkspace(workspaceId, 100);
  const successCount = items.filter((item) => item.success).length;
  const failureCount = items.filter((item) => !item.success).length;
  const total = items.length;
  const providerCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[String(item.provider)] = (acc[String(item.provider)] ?? 0) + 1;
    return acc;
  }, {});

  const latencyItems = items.filter(
    (item) => typeof item.latencyMs === "number",
  ) as Array<RoutingHistoryEntry & { latencyMs: number }>;

  const avgLatencyMs =
    latencyItems.length > 0
      ? round(
          latencyItems.reduce((sum, item) => sum + item.latencyMs, 0) /
            latencyItems.length,
        )
      : 0;

  const successRate = total > 0 ? round((successCount / total) * 100) : 0;
  const errorRate = total > 0 ? round((failureCount / total) * 100) : 0;

  return {
    workspaceId,
    total,
    successCount,
    failureCount,
    providerCounts,
    latest: items[0] ?? null,
    successRate,
    avgLatencyMs,
    errorRate,
  };
}

export function clearRoutingHistoryForWorkspace(workspaceId: string): boolean {
  const store = loadHistory();
  const before = store.length;
  const filtered = store.filter((item) => item.workspaceId !== workspaceId);
  saveHistory(filtered);
  return before !== filtered.length;
}

export function getWorkspaceProviderTrends(
  workspaceId: string,
): WorkspaceProviderTrendPoint[] {
  const items = listRoutingHistoryForWorkspace(workspaceId, 200);
  const byProvider = new Map<string, RoutingHistoryEntry[]>();

  for (const item of items) {
    const key = String(item.provider);
    const list = byProvider.get(key) ?? [];
    list.push(item);
    byProvider.set(key, list);
  }

  return Array.from(byProvider.entries())
    .map(([provider, entries]) => {
      const successCount = entries.filter((item) => item.success).length;
      const failureCount = entries.length - successCount;
      const latencyItems = entries.filter(
        (item) => typeof item.latencyMs === "number",
      ) as Array<RoutingHistoryEntry & { latencyMs: number }>;
      const avgLatencyMs =
        latencyItems.length > 0
          ? round(
              latencyItems.reduce((sum, item) => sum + item.latencyMs, 0) /
                latencyItems.length,
            )
          : 0;
      return {
        provider,
        count: entries.length,
        successCount,
        failureCount,
        avgLatencyMs,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function getWorkspaceRoutingTimeline(
  workspaceId: string,
  limit = 50,
): WorkspaceTimelineEntry[] {
  return listRoutingHistoryForWorkspace(workspaceId, limit).map(
    toTimelineEntry,
  );
}

export function getWorkspaceAnalytics(workspaceId: string): {
  summary: ReturnType<typeof getWorkspaceRoutingSummary>;
  trends: WorkspaceProviderTrendPoint[];
  timeline: WorkspaceTimelineEntry[];
} {
  return {
    summary: getWorkspaceRoutingSummary(workspaceId),
    trends: getWorkspaceProviderTrends(workspaceId),
    timeline: getWorkspaceRoutingTimeline(workspaceId, 25),
  };
}

// --- Sprint 33: Time buckets and global analytics ---

export interface TimeBucketPoint {
  bucket: string;
  total: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
}

export interface GlobalWorkspaceAnalyticsPoint {
  workspaceId: string;
  total: number;
  successRate: number;
  errorRate: number;
  avgLatencyMs: number;
  latestTimestamp: number | null;
}

function formatBucket(timestamp: number, bucket: 'hour' | 'day'): string {
  const date = new Date(timestamp);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return bucket === 'hour' ? `${y}-${m}-${d} ${h}:00` : `${y}-${m}-${d}`;
}

export function getWorkspaceTimeBuckets(
  workspaceId: string,
  bucket: 'hour' | 'day' = 'day',
): TimeBucketPoint[] {
  const items = listRoutingHistoryForWorkspace(workspaceId, 500);
  const grouped = new Map<string, typeof items>();

  for (const item of items) {
    const key = formatBucket(item.timestamp ?? item.createdAt, bucket);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => {
      const successCount = entries.filter((e) => e.success).length;
      const failureCount = entries.length - successCount;
      const latencyItems = entries.filter(
        (e) => typeof (e.latencyMs ?? e.latency) === 'number'
      );
      const avgLatencyMs =
        latencyItems.length > 0
          ? Number(
              (
                latencyItems.reduce(
                  (sum, e) => sum + (e.latencyMs ?? e.latency ?? 0),
                  0,
                ) / latencyItems.length
              ).toFixed(2),
            )
          : 0;

      return {
        bucket: key,
        total: entries.length,
        successCount,
        failureCount,
        successRate:
          entries.length > 0
            ? Number(((successCount / entries.length) * 100).toFixed(2))
            : 0,
        avgLatencyMs,
      };
    });
}

export function getGlobalWorkspaceAnalytics(): GlobalWorkspaceAnalyticsPoint[] {
  const all = getRoutingHistory(500);
  const grouped = new Map<string, typeof all>();

  for (const item of all) {
    const wid = (item.workspaceId as string) ?? 'unscoped';
    const list = grouped.get(wid) ?? [];
    list.push(item);
    grouped.set(wid, list);
  }

  return Array.from(grouped.entries())
    .map(([wid, entries]) => {
      const successCount = entries.filter((e) => e.success).length;
      const failureCount = entries.length - successCount;
      const total = entries.length;
      const latencyItems = entries.filter(
        (e) => typeof (e.latencyMs ?? e.latency) === 'number'
      );
      const avgLatencyMs =
        latencyItems.length > 0
          ? Number(
              (
                latencyItems.reduce(
                  (sum, e) => sum + (e.latencyMs ?? e.latency ?? 0),
                  0,
                ) / latencyItems.length
              ).toFixed(2),
            )
          : 0;

      const latest = entries[0] ?? null;

      return {
        workspaceId: wid,
        total,
        successRate:
          total > 0 ? Number(((successCount / total) * 100).toFixed(2)) : 0,
        errorRate:
          total > 0 ? Number(((failureCount / total) * 100).toFixed(2)) : 0,
        avgLatencyMs,
        latestTimestamp: latest?.timestamp ?? latest?.createdAt ?? null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function exportWorkspaceAnalyticsJson(workspaceId: string): string {
  return JSON.stringify(
    {
      workspaceId,
      exportedAt: new Date().toISOString(),
      analytics: getWorkspaceAnalytics(workspaceId),
      dailyBuckets: getWorkspaceTimeBuckets(workspaceId, 'day'),
      hourlyBuckets: getWorkspaceTimeBuckets(workspaceId, 'hour'),
    },
    null,
    2,
  );
}

export function exportWorkspaceAnalyticsCsv(workspaceId: string): string {
  const rows = getWorkspaceTimeBuckets(workspaceId, 'day');
  const header = ['bucket', 'total', 'successCount', 'failureCount', 'successRate', 'avgLatencyMs'];
  const body = rows.map((row) =>
    [row.bucket, row.total, row.successCount, row.failureCount, row.successRate, row.avgLatencyMs].join(',')
  );
  return [header.join(','), ...body].join('\n');
}
