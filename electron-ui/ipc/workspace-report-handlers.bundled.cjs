const __importMetaUrl = require('url').pathToFileURL(__filename).href;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/logging/logger.ts
function write(level, message, context = {}) {
  const payload = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    message,
    ...context
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
var logger;
var init_logger = __esm({
  "src/shared/logging/logger.ts"() {
    logger = {
      info: (message, context) => write("info", message, context),
      warn: (message, context) => write("warn", message, context),
      error: (message, context) => write("error", message, context)
    };
  }
});

// src/llm/storage.ts
function getAppDir() {
  return process.env.UNIFIED_AI_DATA_DIR ?? (0, import_path.join)((0, import_os.homedir)(), ".unified-ai-workspace");
}
function ensureDir(path2) {
  (0, import_fs.mkdirSync)((0, import_path.dirname)(path2), { recursive: true });
}
function getStoragePath(fileName) {
  return (0, import_path.join)(getAppDir(), fileName);
}
function readJsonFile(fileName, fallback) {
  const filePath = getStoragePath(fileName);
  try {
    if (!(0, import_fs.existsSync)(filePath)) {
      return fallback;
    }
    const raw = (0, import_fs.readFileSync)(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    logger.warn("storage.read.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
    return fallback;
  }
}
function writeJsonFile(fileName, value) {
  const filePath = getStoragePath(fileName);
  try {
    ensureDir(filePath);
    (0, import_fs.writeFileSync)(filePath, JSON.stringify(value, null, 2), "utf-8");
  } catch (error) {
    logger.error("storage.write.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
var import_fs, import_path, import_os;
var init_storage = __esm({
  "src/llm/storage.ts"() {
    import_fs = require("fs");
    import_path = require("path");
    import_os = require("os");
    init_logger();
  }
});

// src/audit/audit-log.ts
var audit_log_exports = {};
__export(audit_log_exports, {
  appendAuditEvent: () => appendAuditEvent,
  clearAuditLog: () => clearAuditLog,
  exportAuditLogHtmlReport: () => exportAuditLogHtmlReport,
  exportAuditLogJson: () => exportAuditLogJson,
  getLatestAuditEvent: () => getLatestAuditEvent,
  listAuditEvents: () => listAuditEvents,
  verifyAuditLogIntegrity: () => verifyAuditLogIntegrity
});
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}
function hashObject(value) {
  return (0, import_crypto.createHash)("sha256").update(stableStringify(value), "utf8").digest("hex");
}
function loadAuditStore() {
  const store = readJsonFile(AUDIT_FILE, DEFAULT_AUDIT_STORE);
  return {
    events: Array.isArray(store?.events) ? store.events : []
  };
}
function saveAuditStore(store) {
  writeJsonFile(AUDIT_FILE, store);
  return store;
}
function computeAuditHash(event) {
  return hashObject({
    seq: event.seq,
    action: event.action,
    actor: event.actor,
    targetType: event.targetType,
    workspaceId: event.workspaceId ?? null,
    details: event.details ?? null,
    timestamp: event.timestamp,
    prevHash: event.prevHash
  });
}
function appendAuditEvent(payload) {
  const store = loadAuditStore();
  const previous = store.events.at(-1) ?? null;
  const event = {
    seq: previous ? previous.seq + 1 : 1,
    action: payload.action,
    actor: payload.actor,
    targetType: payload.targetType,
    workspaceId: payload.workspaceId,
    details: payload.details,
    timestamp: Date.now(),
    prevHash: previous?.hash ?? null,
    hash: ""
  };
  event.hash = computeAuditHash(event);
  store.events.push(event);
  saveAuditStore(store);
  return event;
}
function listAuditEvents(limit, filter) {
  const store = loadAuditStore();
  let events = [...store.events];
  if (filter?.workspaceId) {
    events = events.filter((event) => event.workspaceId === filter.workspaceId);
  }
  if (filter?.action) {
    events = events.filter((event) => event.action === filter.action);
  }
  if (filter?.targetType) {
    events = events.filter((event) => event.targetType === filter.targetType);
  }
  if (filter?.startTime) {
    events = events.filter((event) => event.timestamp >= filter.startTime);
  }
  if (filter?.endTime) {
    events = events.filter((event) => event.timestamp <= filter.endTime);
  }
  events.sort((a, b) => b.seq - a.seq);
  return typeof limit === "number" ? events.slice(0, limit) : events;
}
function getLatestAuditEvent() {
  const store = loadAuditStore();
  return store.events.at(-1) ?? null;
}
function clearAuditLog() {
  saveAuditStore({ events: [] });
}
function verifyAuditLogIntegrity(filter) {
  const store = loadAuditStore();
  let events = store.events;
  if (filter?.workspaceId) {
    events = events.filter((e) => e.workspaceId === filter.workspaceId);
  }
  if (filter?.action) {
    events = events.filter((e) => e.action === filter.action);
  }
  if (filter?.targetType) {
    events = events.filter((e) => e.targetType === filter.targetType);
  }
  if (filter?.startTime) {
    events = events.filter((e) => e.timestamp >= filter.startTime);
  }
  if (filter?.endTime) {
    events = events.filter((e) => e.timestamp <= filter.endTime);
  }
  const filteredStore = { events };
  for (let i = 0; i < filteredStore.events.length; i += 1) {
    const current = filteredStore.events[i];
    const expectedPrevHash = i === 0 ? null : filteredStore.events[i - 1].hash;
    if (current.prevHash !== expectedPrevHash) {
      return {
        ok: false,
        reason: "hash_mismatch",
        failedAtSeq: current.seq,
        checked: i,
        expectedHash: expectedPrevHash,
        actualHash: current.prevHash
      };
    }
    const expectedHash = computeAuditHash(current);
    if (current.hash !== expectedHash) {
      return {
        ok: false,
        reason: "hash_mismatch",
        failedAtSeq: current.seq,
        checked: i + 1,
        expectedHash,
        actualHash: current.hash
      };
    }
  }
  return {
    ok: true,
    failedAtSeq: null,
    checked: filteredStore.events.length,
    reason: null,
    expectedHash: null,
    actualHash: null
  };
}
function escapeHtmlAudit(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function toHtmlReport(events, verification) {
  const rows = events.map((event) => {
    return [
      "<tr>",
      `<td>${event.seq}</td>`,
      `<td>${escapeHtmlAudit(new Date(event.timestamp).toISOString())}</td>`,
      `<td>${escapeHtmlAudit(event.action)}</td>`,
      `<td>${escapeHtmlAudit(event.actor?.type ?? "")}</td>`,
      `<td>${escapeHtmlAudit(event.targetType)}</td>`,
      `<td>${escapeHtmlAudit(event.workspaceId ?? "")}</td>`,
      `<td><pre>${escapeHtmlAudit(JSON.stringify(event.details ?? null, null, 2))}</pre></td>`,
      `<td><code>${escapeHtmlAudit(event.prevHash ?? "")}</code></td>`,
      `<td><code>${escapeHtmlAudit(event.hash)}</code></td>`,
      "</tr>"
    ].join("\n");
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Audit Log Report</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
h1, h2 { margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
th { background: #f3f4f6; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.ok { color: #166534; font-weight: 700; }
.fail { color: #b91c1c; font-weight: 700; }
</style>
</head>
<body>
<h1>Audit Log Report</h1>
<p>Generated: ${escapeHtmlAudit((/* @__PURE__ */ new Date()).toISOString())}</p>
<p>Integrity:
<span class="${verification.ok ? "ok" : "fail"}">
${verification.ok ? "PASS" : "FAIL"}
</span>
</p>
<p>Checked: ${verification.checked}</p>
<p>Failed at seq: ${escapeHtmlAudit(String(verification.failedAtSeq ?? ""))}</p>
<p>Reason: ${escapeHtmlAudit(verification.reason ?? "")}</p>
<h2>Events</h2>
<table>
<thead>
<tr><th>Seq</th><th>Timestamp</th><th>Action</th><th>Actor</th><th>Target Type</th><th>Workspace</th><th>Details</th><th>Prev Hash</th><th>Hash</th></tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}
function exportAuditLogJson(filter) {
  const events = listAuditEvents(void 0, filter).slice().reverse();
  const verification = verifyAuditLogIntegrity(filter);
  const suffix = filter?.workspaceId ? `-${filter.workspaceId}` : "";
  const filePath = (0, import_path2.join)(process.cwd(), `audit-log${suffix}.json`);
  (0, import_fs2.writeFileSync)(
    filePath,
    JSON.stringify(
      {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        filter: filter ?? null,
        verification,
        count: events.length,
        events
      },
      null,
      2
    ),
    "utf8"
  );
  return {
    ok: true,
    format: "json",
    filePath,
    count: events.length,
    verification
  };
}
function exportAuditLogHtmlReport(filter) {
  const events = listAuditEvents(void 0, filter).slice().reverse();
  const verification = verifyAuditLogIntegrity(filter);
  const suffix = filter?.workspaceId ? `-${filter.workspaceId}` : "";
  const filePath = (0, import_path2.join)(process.cwd(), `audit-log${suffix}.html`);
  (0, import_fs2.writeFileSync)(filePath, toHtmlReport(events, verification), "utf8");
  return {
    ok: true,
    format: "html",
    filePath,
    count: events.length,
    verification
  };
}
var import_crypto, import_fs2, import_path2, AUDIT_FILE, DEFAULT_AUDIT_STORE;
var init_audit_log = __esm({
  "src/audit/audit-log.ts"() {
    import_crypto = require("crypto");
    import_fs2 = require("fs");
    import_path2 = require("path");
    init_storage();
    AUDIT_FILE = "audit-log.json";
    DEFAULT_AUDIT_STORE = {
      events: []
    };
  }
});

// src/llm/routing-history.ts
var routing_history_exports = {};
__export(routing_history_exports, {
  clearRoutingHistoryForWorkspace: () => clearRoutingHistoryForWorkspace,
  exportWorkspaceAnalyticsCsv: () => exportWorkspaceAnalyticsCsv,
  exportWorkspaceAnalyticsHtmlReport: () => exportWorkspaceAnalyticsHtmlReport,
  exportWorkspaceAnalyticsJson: () => exportWorkspaceAnalyticsJson,
  getGlobalWorkspaceAnalytics: () => getGlobalWorkspaceAnalytics,
  getProviderComparisonAcrossWorkspaces: () => getProviderComparisonAcrossWorkspaces,
  getProviderComparisonChartSvg: () => getProviderComparisonChartSvg,
  getRoutingHistory: () => getRoutingHistory,
  getWorkspaceAnalytics: () => getWorkspaceAnalytics,
  getWorkspaceBucketChartSvg: () => getWorkspaceBucketChartSvg,
  getWorkspaceProviderTrends: () => getWorkspaceProviderTrends,
  getWorkspaceRoutingSummary: () => getWorkspaceRoutingSummary,
  getWorkspaceRoutingTimeline: () => getWorkspaceRoutingTimeline,
  getWorkspaceTimeBuckets: () => getWorkspaceTimeBuckets,
  listRoutingHistoryForWorkspace: () => listRoutingHistoryForWorkspace,
  recordRoutingDecision: () => recordRoutingDecision,
  resetRoutingHistory: () => resetRoutingHistory
});
function loadHistory() {
  return readJsonFile(ROUTING_HISTORY_FILE, []);
}
function saveHistory(records) {
  writeJsonFile(ROUTING_HISTORY_FILE, records.slice(0, MAX_HISTORY));
}
function nextId() {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function round(value) {
  return Number(value.toFixed(2));
}
function toTimelineEntry(item) {
  const title = item.success ? `Routed to ${item.provider}` : `Failed on ${item.provider}`;
  const detailParts = [
    `reason=${item.reason}`,
    item.intent ? `intent=${item.intent}` : null,
    item.fallbackFrom ? `fallbackFrom=${item.fallbackFrom}` : null,
    typeof item.latencyMs === "number" ? `latency=${item.latencyMs}ms` : null,
    item.errorMessage ? `error=${item.errorMessage}` : null
  ].filter(Boolean);
  const ts = item.timestamp ?? item.createdAt;
  return {
    id: item.id,
    timestamp: ts,
    title,
    detail: detailParts.join(" | "),
    severity: item.success ? "info" : item.errorMessage ? "error" : "warning",
    provider: String(item.provider),
    success: item.success,
    workspaceId: item.workspaceId ?? null
  };
}
function matchesFilter(item, filter) {
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
function recordRoutingDecision(input) {
  const snapshot = loadHistory();
  const record = {
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
    timestamp: Date.now(),
    errorMessage: input.errorMessage
  };
  snapshot.unshift(record);
  saveHistory(snapshot);
  logger.info("routing.history.recorded", {
    requestId: record.requestId,
    provider: record.provider,
    success: record.success,
    reason: record.reason
  });
}
function getRoutingHistory(limit = 50) {
  return loadHistory().slice(0, limit);
}
function resetRoutingHistory() {
  saveHistory([]);
  logger.info("routing.history.reset");
}
function listRoutingHistoryForWorkspace(workspaceId, limit = 50, filter) {
  const history = loadHistory();
  return history.filter((item) => item.workspaceId === workspaceId).filter((item) => matchesFilter(item, filter)).slice(0, Math.max(0, limit));
}
function getWorkspaceRoutingSummary(workspaceId, filter) {
  const items = listRoutingHistoryForWorkspace(workspaceId, 100, filter);
  const successCount = items.filter((item) => item.success).length;
  const failureCount = items.filter((item) => !item.success).length;
  const total = items.length;
  const providerCounts = items.reduce((acc, item) => {
    acc[String(item.provider)] = (acc[String(item.provider)] ?? 0) + 1;
    return acc;
  }, {});
  const latencyItems = items.filter(
    (item) => typeof item.latencyMs === "number"
  );
  const avgLatencyMs = latencyItems.length > 0 ? round(
    latencyItems.reduce((sum, item) => sum + item.latencyMs, 0) / latencyItems.length
  ) : 0;
  const successRate = total > 0 ? round(successCount / total * 100) : 0;
  const errorRate = total > 0 ? round(failureCount / total * 100) : 0;
  return {
    workspaceId,
    total,
    successCount,
    failureCount,
    providerCounts,
    latest: items[0] ?? null,
    successRate,
    avgLatencyMs,
    errorRate
  };
}
function clearRoutingHistoryForWorkspace(workspaceId) {
  const store = loadHistory();
  const before = store.length;
  const filtered = store.filter((item) => item.workspaceId !== workspaceId);
  saveHistory(filtered);
  return before !== filtered.length;
}
function getWorkspaceProviderTrends(workspaceId, filter) {
  const items = listRoutingHistoryForWorkspace(workspaceId, 200, filter);
  const byProvider = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = String(item.provider);
    const list = byProvider.get(key) ?? [];
    list.push(item);
    byProvider.set(key, list);
  }
  return Array.from(byProvider.entries()).map(([provider, entries]) => {
    const successCount = entries.filter((item) => item.success).length;
    const failureCount = entries.length - successCount;
    const latencyItems = entries.filter(
      (item) => typeof item.latencyMs === "number"
    );
    const avgLatencyMs = latencyItems.length > 0 ? round(
      latencyItems.reduce((sum, item) => sum + item.latencyMs, 0) / latencyItems.length
    ) : 0;
    return {
      provider,
      count: entries.length,
      successCount,
      failureCount,
      avgLatencyMs
    };
  }).sort((a, b) => b.count - a.count);
}
function getWorkspaceRoutingTimeline(workspaceId, limit = 50, filter) {
  return listRoutingHistoryForWorkspace(workspaceId, limit, filter).map(
    toTimelineEntry
  );
}
function getWorkspaceAnalytics(workspaceId, filter) {
  return {
    summary: getWorkspaceRoutingSummary(workspaceId, filter),
    trends: getWorkspaceProviderTrends(workspaceId, filter),
    timeline: getWorkspaceRoutingTimeline(workspaceId, 25, filter)
  };
}
function formatBucket(timestamp, bucket) {
  const date = new Date(timestamp);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return bucket === "hour" ? `${y}-${m}-${d} ${h}:00` : `${y}-${m}-${d}`;
}
function getWorkspaceTimeBuckets(workspaceId, bucket = "day", filter) {
  const items = listRoutingHistoryForWorkspace(workspaceId, 500, filter);
  const grouped = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = formatBucket(item.timestamp ?? item.createdAt, bucket);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, entries]) => {
    const successCount = entries.filter((e) => e.success).length;
    const failureCount = entries.length - successCount;
    const latencyItems = entries.filter(
      (e) => typeof (e.latencyMs ?? e.latency) === "number"
    );
    const avgLatencyMs = latencyItems.length > 0 ? Number(
      (latencyItems.reduce(
        (sum, e) => sum + (e.latencyMs ?? e.latency ?? 0),
        0
      ) / latencyItems.length).toFixed(2)
    ) : 0;
    return {
      bucket: key,
      total: entries.length,
      successCount,
      failureCount,
      successRate: entries.length > 0 ? Number((successCount / entries.length * 100).toFixed(2)) : 0,
      avgLatencyMs
    };
  });
}
function getGlobalWorkspaceAnalytics(filter) {
  const all = getRoutingHistory(500).filter(
    (item) => matchesFilter(item, filter)
  );
  const grouped = /* @__PURE__ */ new Map();
  for (const item of all) {
    const wid = item.workspaceId ?? "unscoped";
    const list = grouped.get(wid) ?? [];
    list.push(item);
    grouped.set(wid, list);
  }
  return Array.from(grouped.entries()).map(([wid, entries]) => {
    const successCount = entries.filter((e) => e.success).length;
    const failureCount = entries.length - successCount;
    const total = entries.length;
    const latencyItems = entries.filter(
      (e) => typeof (e.latencyMs ?? e.latency) === "number"
    );
    const avgLatencyMs = latencyItems.length > 0 ? Number(
      (latencyItems.reduce(
        (sum, e) => sum + (e.latencyMs ?? e.latency ?? 0),
        0
      ) / latencyItems.length).toFixed(2)
    ) : 0;
    const latest = entries[0] ?? null;
    return {
      workspaceId: wid,
      total,
      successRate: total > 0 ? Number((successCount / total * 100).toFixed(2)) : 0,
      errorRate: total > 0 ? Number((failureCount / total * 100).toFixed(2)) : 0,
      avgLatencyMs,
      latestTimestamp: latest?.timestamp ?? latest?.createdAt ?? null
    };
  }).sort((a, b) => b.total - a.total);
}
function exportWorkspaceAnalyticsJson(workspaceId, filter) {
  return JSON.stringify(
    {
      workspaceId,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      filter: filter ?? null,
      analytics: getWorkspaceAnalytics(workspaceId, filter),
      dailyBuckets: getWorkspaceTimeBuckets(workspaceId, "day", filter),
      hourlyBuckets: getWorkspaceTimeBuckets(workspaceId, "hour", filter)
    },
    null,
    2
  );
}
function exportWorkspaceAnalyticsCsv(workspaceId, filter) {
  const rows = getWorkspaceTimeBuckets(workspaceId, "day", filter);
  const header = [
    "bucket",
    "total",
    "successCount",
    "failureCount",
    "successRate",
    "avgLatencyMs"
  ];
  const body = rows.map(
    (row) => [
      row.bucket,
      row.total,
      row.successCount,
      row.failureCount,
      row.successRate,
      row.avgLatencyMs
    ].join(",")
  );
  return [header.join(","), ...body].join("\n");
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function createLineChartSvg(points, title, stroke = "#0a7") {
  const width = 720;
  const height = 240;
  const pad = 40;
  const chartWidth = width - pad * 2;
  const chartHeight = height - pad * 2;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? pad + chartWidth / 2 : pad + index * chartWidth / (points.length - 1);
    const y = pad + chartHeight - (point.value - 0) / (maxValue - 0) * chartHeight;
    return { ...point, x, y: Number.isFinite(y) ? y : pad + chartHeight };
  });
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const circles = coords.map(
    (c) => `<circle cx="${c.x}" cy="${c.y}" r="4" fill="${stroke}"><title>${escapeHtml(
      `${c.label}: ${c.value}`
    )}</title></circle>`
  ).join("");
  const labels = coords.map(
    (c) => `<text x="${c.x}" y="${height - 10}" font-size="10" text-anchor="middle" fill="#555">${escapeHtml(c.label)}</text>`
  ).join("");
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
function createBarChartSvg(points, title, fill = "#36c") {
  const width = 720;
  const height = 260;
  const pad = 40;
  const chartWidth = width - pad * 2;
  const chartHeight = height - pad * 2;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const barWidth = Math.max(20, chartWidth / Math.max(points.length, 1) - 16);
  const bars = points.map((point, index) => {
    const x = pad + index * (chartWidth / Math.max(points.length, 1)) + 8;
    const h = point.value / maxValue * chartHeight;
    const y = height - pad - h;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fill}"><title>${escapeHtml(`${point.label}: ${point.value}`)}</title></rect>
<text x="${x + barWidth / 2}" y="${height - 10}" font-size="10" text-anchor="middle" fill="#555">${escapeHtml(point.label)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${pad}" y="24" font-size="16" font-weight="bold" fill="#222">${escapeHtml(title)}</text>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/>
  ${bars}
</svg>`.trim();
}
function getProviderComparisonAcrossWorkspaces(filter) {
  const store = loadHistory().filter((item) => matchesFilter(item, filter));
  const normalized = store.map((item) => ({
    ...item,
    timestamp: item.timestamp ?? item.createdAt
  }));
  const grouped = /* @__PURE__ */ new Map();
  for (const item of normalized) {
    const workspaceId = item.workspaceId ?? "unscoped";
    const key = `${workspaceId}::${String(item.provider)}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  return Array.from(grouped.entries()).map(([key, entries]) => {
    const [workspaceId, provider] = key.split("::");
    const successCount = entries.filter((entry) => entry.success).length;
    const latencyItems = entries.filter(
      (entry) => typeof entry.latencyMs === "number"
    );
    const avgLatencyMs = latencyItems.length > 0 ? round(
      latencyItems.reduce((sum, entry) => sum + entry.latencyMs, 0) / latencyItems.length
    ) : 0;
    return {
      workspaceId,
      provider,
      count: entries.length,
      successRate: entries.length > 0 ? round(successCount / entries.length * 100) : 0,
      avgLatencyMs
    };
  }).sort((a, b) => b.count - a.count);
}
function getWorkspaceBucketChartSvg(workspaceId, bucket = "day", filter) {
  const rows = getWorkspaceTimeBuckets(workspaceId, bucket, filter);
  return createLineChartSvg(
    rows.map((row) => ({ label: row.bucket, value: row.total })),
    `Workspace ${workspaceId} ${bucket}ly routing volume`
  );
}
function getProviderComparisonChartSvg(filter) {
  const rows = getProviderComparisonAcrossWorkspaces(filter).slice(0, 12);
  return createBarChartSvg(
    rows.map((row) => ({
      label: `${row.workspaceId}:${row.provider}`,
      value: row.count
    })),
    "Provider comparison across workspaces"
  );
}
function exportWorkspaceAnalyticsHtmlReport(workspaceId, filter) {
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
var ROUTING_HISTORY_FILE, MAX_HISTORY;
var init_routing_history = __esm({
  "src/llm/routing-history.ts"() {
    init_storage();
    init_logger();
    ROUTING_HISTORY_FILE = "routing-history.json";
    MAX_HISTORY = 200;
  }
});

// electron-ui/ipc/workspace-report-handlers.cjs
var { ipcMain, dialog, BrowserWindow } = require("electron");
var { writeFile } = require("node:fs/promises");
var path = require("node:path");
var { appendAuditEvent: appendAuditEvent2 } = (init_audit_log(), __toCommonJS(audit_log_exports));
function registerWorkspaceReportHandlers() {
  ipcMain.handle(
    "workspaceReport:save",
    async (_event, workspaceId, format, filter) => {
      const {
        exportWorkspaceAnalyticsJson: exportWorkspaceAnalyticsJson2,
        exportWorkspaceAnalyticsCsv: exportWorkspaceAnalyticsCsv2,
        exportWorkspaceAnalyticsHtmlReport: exportWorkspaceAnalyticsHtmlReport2
      } = (init_routing_history(), __toCommonJS(routing_history_exports));
      const ext = format === "json" ? "json" : format === "csv" ? "csv" : "html";
      const win = BrowserWindow.getFocusedWindow() ?? null;
      const result = await dialog.showSaveDialog(win, {
        title: "Save workspace analytics report",
        defaultPath: `workspace-${workspaceId}-analytics.${ext}`,
        filters: [
          { name: "HTML", extensions: ["html"] },
          { name: "JSON", extensions: ["json"] },
          { name: "CSV", extensions: ["csv"] }
        ]
      });
      if (result.canceled || !result.filePath) {
        return {
          canceled: true,
          saved: false,
          filePath: null,
          format
        };
      }
      let content;
      if (format === "json") {
        content = exportWorkspaceAnalyticsJson2(
          workspaceId,
          filter ?? void 0
        );
      } else if (format === "csv") {
        content = exportWorkspaceAnalyticsCsv2(workspaceId, filter ?? void 0);
      } else {
        content = exportWorkspaceAnalyticsHtmlReport2(
          workspaceId,
          filter ?? void 0
        );
      }
      await writeFile(result.filePath, content, "utf8");
      const resolvedPath = path.resolve(result.filePath);
      appendAuditEvent2({
        action: "report.save",
        actor: { type: "renderer" },
        targetType: "workspaceReport",
        workspaceId,
        details: {
          format,
          filePath: resolvedPath
        }
      });
      return {
        canceled: false,
        saved: true,
        filePath: resolvedPath,
        format
      };
    }
  );
}
module.exports = { registerWorkspaceReportHandlers };
