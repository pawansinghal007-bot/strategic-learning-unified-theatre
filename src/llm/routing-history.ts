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
  severity: 'info' | 'warning' | 'error';
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
    typeof item.latencyMs === 'number' ? `latency=${item.latencyMs}ms` : null,
    item.errorMessage ? `error=${item.errorMessage}` : null,
  ].filter(Boolean);

  return {
    id: item.id,
    timestamp: item.createdAt,
    title,
    detail: detailParts.join(' | '),
    severity: item.success ? 'info' : item.errorMessage ? 'error' : 'warning',
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
    (item) => typeof item.latencyMs === 'number',
  ) as Array<RoutingHistoryEntry & { latencyMs: number }>;

  const avgLatencyMs =
    latencyItems.length > 0
      ? round(latencyItems.reduce((sum, item) => sum + item.latencyMs, 0) / latencyItems.length)
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
        (item) => typeof item.latencyMs === 'number',
      ) as Array<RoutingHistoryEntry & { latencyMs: number }>;
      const avgLatencyMs =
        latencyItems.length > 0
          ? round(latencyItems.reduce((sum, item) => sum + item.latencyMs, 0) / latencyItems.length)
          : 0;
      return { provider, count: entries.length, successCount, failureCount, avgLatencyMs };
    })
    .sort((a, b) => b.count - a.count);
}

export function getWorkspaceRoutingTimeline(
  workspaceId: string,
  limit = 50,
): WorkspaceTimelineEntry[] {
  return listRoutingHistoryForWorkspace(workspaceId, limit).map(toTimelineEntry);
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
