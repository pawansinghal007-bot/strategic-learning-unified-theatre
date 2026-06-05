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

export interface RoutingHistoryFilter {
  startTime?: number;
  endTime?: number;
  provider?: string;
}

function matchesFilter(
  item: RoutingHistoryEntry,
  filter?: RoutingHistoryFilter,
): boolean {
  if (!filter) return true;
  const timestamp = item.timestamp ?? item.createdAt;
  if (typeof filter.startTime === "number" && timestamp < filter.startTime)
    return false;
  if (typeof filter.endTime === "number" && timestamp > filter.endTime)
    return false;
  if (filter.provider && String(item.provider) !== filter.provider)
    return false;
  return true;
}

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
  filter?: RoutingHistoryFilter,
): RoutingHistoryEntry[] {
  const history = loadHistory();
  return history
    .filter((item) => item.workspaceId === workspaceId)
    .filter((item) => matchesFilter(item, filter))
    .slice(0, Math.max(0, limit));
}

export function getWorkspaceRoutingSummary(
  workspaceId: string,
  filter?: RoutingHistoryFilter,
): {
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
  const items = listRoutingHistoryForWorkspace(workspaceId, 100, filter);
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
  filter?: RoutingHistoryFilter,
): WorkspaceProviderTrendPoint[] {
  const items = listRoutingHistoryForWorkspace(workspaceId, 200, filter);
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
  filter?: RoutingHistoryFilter,
): WorkspaceTimelineEntry[] {
  return listRoutingHistoryForWorkspace(workspaceId, limit, filter).map(
    toTimelineEntry,
  );
}

export function getWorkspaceAnalytics(
  workspaceId: string,
  filter?: RoutingHistoryFilter,
): {
  summary: ReturnType<typeof getWorkspaceRoutingSummary>;
  trends: WorkspaceProviderTrendPoint[];
  timeline: WorkspaceTimelineEntry[];
} {
  return {
    summary: getWorkspaceRoutingSummary(workspaceId, filter),
    trends: getWorkspaceProviderTrends(workspaceId, filter),
    timeline: getWorkspaceRoutingTimeline(workspaceId, 25, filter),
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

export interface ProviderWorkspaceComparisonPoint {
  workspaceId: string;
  provider: string;
  count: number;
  successRate: number;
  avgLatencyMs: number;
}

function formatBucket(timestamp: number, bucket: "hour" | "day"): string {
  const date = new Date(timestamp);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return bucket === "hour" ? `${y}-${m}-${d} ${h}:00` : `${y}-${m}-${d}`;
}

export function getWorkspaceTimeBuckets(
  workspaceId: string,
  bucket: "hour" | "day" = "day",
  filter?: RoutingHistoryFilter,
): TimeBucketPoint[] {
  const items = listRoutingHistoryForWorkspace(workspaceId, 500, filter);
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
        (e) => typeof (e.latencyMs ?? e.latency) === "number",
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

export function getGlobalWorkspaceAnalytics(
  filter?: RoutingHistoryFilter,
): GlobalWorkspaceAnalyticsPoint[] {
  const all = getRoutingHistory(500).filter((item) =>
    matchesFilter(item, filter),
  );
  const grouped = new Map<string, typeof all>();

  for (const item of all) {
    const wid = (item.workspaceId as string) ?? "unscoped";
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
        (e) => typeof (e.latencyMs ?? e.latency) === "number",
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

export function exportWorkspaceAnalyticsJson(
  workspaceId: string,
  filter?: RoutingHistoryFilter,
): string {
  return JSON.stringify(
    {
      workspaceId,
      exportedAt: new Date().toISOString(),
      filter: filter ?? null,
      analytics: getWorkspaceAnalytics(workspaceId, filter),
      dailyBuckets: getWorkspaceTimeBuckets(workspaceId, "day", filter),
      hourlyBuckets: getWorkspaceTimeBuckets(workspaceId, "hour", filter),
    },
    null,
    2,
  );
}

export function exportWorkspaceAnalyticsCsv(
  workspaceId: string,
  filter?: RoutingHistoryFilter,
): string {
  const rows = getWorkspaceTimeBuckets(workspaceId, "day", filter);
  const header = [
    "bucket",
    "total",
    "successCount",
    "failureCount",
    "successRate",
    "avgLatencyMs",
  ];
  const body = rows.map((row) =>
    [
      row.bucket,
      row.total,
      row.successCount,
      row.failureCount,
      row.successRate,
      row.avgLatencyMs,
    ].join(","),
  );
  return [header.join(","), ...body].join("\n");
}

// --- Sprint 34: SVG charts and HTML report helpers ---

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createLineChartSvg(
  points: Array<{ label: string; value: number }>,
  title: string,
  stroke = "#0a7",
): string {
  const width = 720;
  const height = 240;
  const pad = 40;
  const chartWidth = width - pad * 2;
  const chartHeight = height - pad * 2;
  const maxValue = Math.max(1, ...points.map((p) => p.value));

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? pad + chartWidth / 2
        : pad + (index * chartWidth) / (points.length - 1);
    const y =
      pad + chartHeight - ((point.value - 0) / (maxValue - 0)) * chartHeight;
    return { ...point, x, y: Number.isFinite(y) ? y : pad + chartHeight };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const circles = coords
    .map(
      (c) =>
        `<circle cx="${c.x}" cy="${c.y}" r="4" fill="${stroke}"><title>${escapeHtml(
          `${c.label}: ${c.value}`,
        )}</title></circle>`,
    )
    .join("");
  const labels = coords
    .map(
      (c) =>
        `<text x="${c.x}" y="${height - 10}" font-size="10" text-anchor="middle" fill="#555">${escapeHtml(c.label)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${pad}" y="24" font-size="16" font-weight="bold" fill="#222">${escapeHtml(title)}</text>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>
  <polyline fill="none" stroke="${stroke}" stroke-width="3" points="${polyline}"/>
  ${circles}
  ${labels}
</svg>`.trim();
}

function createBarChartSvg(
  points: Array<{ label: string; value: number }>,
  title: string,
  fill = "#36c",
): string {
  const width = 720;
  const height = 260;
  const pad = 40;
  const chartWidth = width - pad * 2;
  const chartHeight = height - pad * 2;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const barWidth = Math.max(20, chartWidth / Math.max(points.length, 1) - 16);

  const bars = points
    .map((point, index) => {
      const x = pad + index * (chartWidth / Math.max(points.length, 1)) + 8;
      const h = (point.value / maxValue) * chartHeight;
      const y = height - pad - h;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fill}"><title>${escapeHtml(`${point.label}: ${point.value}`)}</title></rect>
<text x="${x + barWidth / 2}" y="${height - 10}" font-size="10" text-anchor="middle" fill="#555">${escapeHtml(point.label)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${pad}" y="24" font-size="16" font-weight="bold" fill="#222">${escapeHtml(title)}</text>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>
  ${bars}
</svg>`.trim();
}

export function getProviderComparisonAcrossWorkspaces(
  filter?: RoutingHistoryFilter,
): ProviderWorkspaceComparisonPoint[] {
  const store = loadHistory().filter((item) => matchesFilter(item, filter));
  const grouped = new Map<string, RoutingHistoryEntry[]>();

  for (const item of store) {
    const workspaceId = item.workspaceId ?? "unscoped";
    const key = `${workspaceId}::${String(item.provider)}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const [workspaceId, provider] = key.split("::");
      const successCount = entries.filter((entry) => entry.success).length;
      const latencyItems = entries.filter(
        (entry) => typeof entry.latencyMs === "number",
      ) as Array<RoutingHistoryEntry & { latencyMs: number }>;
      const avgLatencyMs =
        latencyItems.length > 0
          ? round(
              latencyItems.reduce((sum, entry) => sum + entry.latencyMs, 0) /
                latencyItems.length,
            )
          : 0;
      return {
        workspaceId,
        provider,
        count: entries.length,
        successRate:
          entries.length > 0 ? round((successCount / entries.length) * 100) : 0,
        avgLatencyMs,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function getWorkspaceBucketChartSvg(
  workspaceId: string,
  bucket: "hour" | "day" = "day",
  filter?: RoutingHistoryFilter,
): string {
  const rows = getWorkspaceTimeBuckets(workspaceId, bucket, filter);
  return createLineChartSvg(
    rows.map((row) => ({ label: row.bucket, value: row.total })),
    `Workspace ${workspaceId} ${bucket}ly routing volume`,
  );
}

export function getProviderComparisonChartSvg(
  filter?: RoutingHistoryFilter,
): string {
  const rows = getProviderComparisonAcrossWorkspaces(filter).slice(0, 12);
  return createBarChartSvg(
    rows.map((row) => ({
      label: `${row.workspaceId}:${row.provider}`,
      value: row.count,
    })),
    "Provider comparison across workspaces",
  );
}

export function exportWorkspaceAnalyticsHtmlReport(
  workspaceId: string,
  filter?: RoutingHistoryFilter,
): string {
  const analytics = getWorkspaceAnalytics(workspaceId, filter);
  const bucketSvg = getWorkspaceBucketChartSvg(workspaceId, "day", filter);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Workspace Analytics Report - ${escapeHtml(workspaceId)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
    h1, h2 { margin-bottom: 8px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Workspace Analytics Report</h1>
  <p>Workspace: ${escapeHtml(workspaceId)}</p>
  <div class="card">
    <h2>Summary</h2>
    <pre>${escapeHtml(JSON.stringify(analytics.summary, null, 2))}</pre>
  </div>
  <div class="card">
    <h2>Daily Trend Chart</h2>
    ${bucketSvg}
  </div>
  <div class="card">
    <h2>Provider Trends</h2>
    <pre>${escapeHtml(JSON.stringify(analytics.trends, null, 2))}</pre>
  </div>
  <div class="card">
    <h2>Timeline</h2>
    <pre>${escapeHtml(JSON.stringify(analytics.timeline, null, 2))}</pre>
  </div>
</body>
</html>`;
}
