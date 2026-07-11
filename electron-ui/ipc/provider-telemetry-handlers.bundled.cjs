const __importMetaUrl = typeof __filename === 'string' ? require('url').pathToFileURL(__filename).href : globalThis.location?.href;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
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

// src/shared/errors/base.ts
var init_base = __esm({
  "src/shared/errors/base.ts"() {
  }
});

// src/shared/errors/provider.error.ts
var init_provider_error = __esm({
  "src/shared/errors/provider.error.ts"() {
    init_base();
  }
});

// src/shared/errors/routing.error.ts
var init_routing_error = __esm({
  "src/shared/errors/routing.error.ts"() {
    init_base();
  }
});

// src/shared/errors/memory.error.ts
var init_memory_error = __esm({
  "src/shared/errors/memory.error.ts"() {
    init_base();
  }
});

// src/shared/errors/validation.error.ts
var init_validation_error = __esm({
  "src/shared/errors/validation.error.ts"() {
    init_base();
  }
});

// src/shared/errors/provider-map.ts
var init_provider_map = __esm({
  "src/shared/errors/provider-map.ts"() {
    init_provider_error();
  }
});

// src/shared/errors/index.ts
var init_errors = __esm({
  "src/shared/errors/index.ts"() {
    init_base();
    init_provider_error();
    init_routing_error();
    init_memory_error();
    init_validation_error();
    init_provider_map();
  }
});

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
  return process.env.UNIFIED_AI_DATA_DIR ?? (0, import_node_path.join)((0, import_node_os.homedir)(), ".unified-ai-workspace");
}
function ensureDir(path) {
  (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(path), { recursive: true });
}
function getStoragePath(fileName) {
  return (0, import_node_path.join)(getAppDir(), fileName);
}
function readJsonFile(fileName, fallback) {
  const filePath = getStoragePath(fileName);
  try {
    if (!(0, import_node_fs.existsSync)(filePath)) {
      return fallback;
    }
    const raw = (0, import_node_fs.readFileSync)(filePath, "utf-8");
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
    (0, import_node_fs.writeFileSync)(filePath, JSON.stringify(value, null, 2), "utf-8");
  } catch (error) {
    logger.error("storage.write.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
var import_node_fs, import_node_path, import_node_os;
var init_storage = __esm({
  "src/llm/storage.ts"() {
    import_node_fs = require("node:fs");
    import_node_path = require("node:path");
    import_node_os = require("node:os");
    init_logger();
  }
});

// src/llm/provider-health.ts
function loadHealth() {
  return readJsonFile(HEALTH_FILE, {});
}
function saveHealth(state) {
  writeJsonFile(HEALTH_FILE, state);
}
function isProviderAvailable(provider) {
  const snapshot = loadHealth();
  const record = snapshot[provider];
  if (!record) return true;
  const cooldown = COOLDOWN_MS[record.state];
  if (cooldown == null) {
    return record.state === "healthy";
  }
  if (record.recoversAt && Date.now() > record.recoversAt) {
    delete snapshot[provider];
    saveHealth(snapshot);
    logger.info("provider.health.recovered", { provider });
    return true;
  }
  return false;
}
function getProviderHealthSnapshot() {
  const snapshot = loadHealth();
  return Object.values(snapshot).filter(Boolean);
}
function resetProviderHealth(provider) {
  if (!provider) {
    saveHealth({});
    logger.info("provider.health.reset_all");
    return;
  }
  const snapshot = loadHealth();
  delete snapshot[provider];
  saveHealth(snapshot);
  logger.info("provider.health.reset", { provider });
}
var HEALTH_FILE, COOLDOWN_MS;
var init_provider_health = __esm({
  "src/llm/provider-health.ts"() {
    init_errors();
    init_logger();
    init_storage();
    HEALTH_FILE = "provider-health.json";
    COOLDOWN_MS = {
      healthy: null,
      exhausted: 24 * 60 * 60 * 1e3,
      temporarily_down: 5 * 60 * 1e3,
      auth_error: null
    };
  }
});

// src/llm/provider-usage.ts
var provider_usage_exports = {};
__export(provider_usage_exports, {
  getProviderUsage: () => getProviderUsage,
  recordProviderFailure: () => recordProviderFailure,
  recordProviderSuccess: () => recordProviderSuccess,
  resetProviderUsage: () => resetProviderUsage
});
function loadUsage() {
  if (_cache) return _cache;
  _cache = readJsonFile(USAGE_FILE, {});
  return _cache;
}
function saveUsage(state) {
  _cache = state;
  writeJsonFile(USAGE_FILE, state);
}
function defaultResetAt(provider) {
  const now = /* @__PURE__ */ new Date();
  if (provider === "groq" || provider === "gemini") {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.getTime();
  }
  if (provider === "perplexity") {
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );
    return next.getTime();
  }
  return null;
}
function ensureRecord(provider, state) {
  const existing = state[provider];
  if (existing) return existing;
  const created = {
    provider,
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    resetAt: defaultResetAt(provider)
  };
  state[provider] = created;
  return created;
}
function autoResetIfNeeded(provider, state) {
  const rec = ensureRecord(provider, state);
  if (rec.resetAt && Date.now() >= rec.resetAt) {
    state[provider] = {
      provider,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      lastUsedAt: void 0,
      resetAt: defaultResetAt(provider)
    };
    logger.info("provider.usage.auto_reset", { provider });
  }
}
function recordProviderSuccess(provider, response) {
  const snapshot = loadUsage();
  autoResetIfNeeded(provider, snapshot);
  const rec = ensureRecord(provider, snapshot);
  const usage = response?.usage ?? {};
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens ?? 0;
  const totalTokens = usage.totalTokens ?? usage.total_tokens ?? inputTokens + outputTokens;
  const estimatedCostUsd = usage.estimatedCostUsd ?? usage.costUsd ?? 0;
  rec.requestCount += 1;
  rec.successCount += 1;
  rec.inputTokens += inputTokens;
  rec.outputTokens += outputTokens;
  rec.totalTokens += totalTokens;
  rec.estimatedCostUsd += estimatedCostUsd;
  rec.lastUsedAt = Date.now();
  saveUsage(snapshot);
  logger.info("provider.usage.success", {
    provider,
    requestCount: rec.requestCount,
    totalTokens: rec.totalTokens,
    estimatedCostUsd: rec.estimatedCostUsd
  });
}
function recordProviderFailure(provider) {
  const snapshot = loadUsage();
  autoResetIfNeeded(provider, snapshot);
  const rec = ensureRecord(provider, snapshot);
  rec.requestCount += 1;
  rec.failureCount += 1;
  rec.lastUsedAt = Date.now();
  saveUsage(snapshot);
  logger.warn("provider.usage.failure", {
    provider,
    requestCount: rec.requestCount,
    failureCount: rec.failureCount
  });
}
function getProviderUsage() {
  const snapshot = loadUsage();
  for (const provider of KNOWN_PROVIDERS) {
    autoResetIfNeeded(provider, snapshot);
    ensureRecord(provider, snapshot);
  }
  return KNOWN_PROVIDERS.map((provider) => ensureRecord(provider, snapshot));
}
function resetProviderUsage(provider) {
  if (!provider) {
    _cache = {};
    saveUsage({});
    logger.info("provider.usage.reset_all");
    return;
  }
  const snapshot = loadUsage();
  delete snapshot[provider];
  _cache = snapshot;
  saveUsage(snapshot);
  logger.info("provider.usage.reset", { provider });
}
var USAGE_FILE, KNOWN_PROVIDERS, _cache;
var init_provider_usage = __esm({
  "src/llm/provider-usage.ts"() {
    init_logger();
    init_storage();
    USAGE_FILE = "provider-usage.json";
    KNOWN_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];
    _cache = null;
  }
});

// src/llm/status.ts
var status_exports = {};
__export(status_exports, {
  getProviderStatus: () => getProviderStatus,
  resetAllProviderTelemetry: () => resetAllProviderTelemetry,
  resetProviderStatus: () => resetProviderStatus
});
function envKeyForProvider(provider) {
  switch (provider) {
    case "groq":
      return "GROQ_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "perplexity":
      return "PERPLEXITY_API_KEY";
    case "local":
      return null;
    default:
      return null;
  }
}
function hasApiKey(provider) {
  const keyName = envKeyForProvider(provider);
  if (!keyName) return true;
  return Boolean(process.env[keyName]);
}
function recordFor(provider, records) {
  return records.find((r) => r.provider === provider);
}
function getProviderStatus() {
  const healthRecords = getProviderHealthSnapshot();
  const usageRows = getProviderUsage();
  return KNOWN_PROVIDERS2.map((name) => {
    const rec = recordFor(name, healthRecords);
    const usage = usageRows.find((u) => u.provider === name);
    const hasKey = hasApiKey(name);
    const available = hasKey && isProviderAvailable(name);
    let recoversInMinutes = null;
    if (rec?.recoversAt) {
      const diffMs = rec.recoversAt - Date.now();
      recoversInMinutes = diffMs > 0 ? Math.round(diffMs / 6e4) : 0;
    }
    return {
      name,
      hasKey,
      state: rec ? rec.state : "unknown",
      available,
      recoversInMinutes,
      reason: rec?.reason,
      requestCount: usage?.requestCount ?? 0,
      successCount: usage?.successCount ?? 0,
      failureCount: usage?.failureCount ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      estimatedCostUsd: usage?.estimatedCostUsd ?? 0
    };
  });
}
function resetProviderStatus(provider) {
  resetProviderHealth(provider);
}
function resetAllProviderTelemetry(provider) {
  resetProviderHealth(provider);
  resetProviderUsage(provider);
}
var KNOWN_PROVIDERS2;
var init_status = __esm({
  "src/llm/status.ts"() {
    init_provider_health();
    init_provider_usage();
    KNOWN_PROVIDERS2 = ["groq", "gemini", "openai", "perplexity", "local"];
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
  return `route_${Date.now()}_${(0, import_node_crypto.randomBytes)(4).toString("hex")}`;
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
  let severity = "warning";
  if (item.success) {
    severity = "info";
  } else if (item.errorMessage) {
    severity = "error";
  }
  return {
    id: item.id,
    timestamp: ts,
    title,
    detail: detailParts.join(" | "),
    severity,
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
    const titleText = `${point.label}: ${point.value}`;
    const title2 = escapeHtml(titleText);
    const label = escapeHtml(point.label);
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fill}"><title>${title2}</title></rect>
<text x="${x + barWidth / 2}" y="${height - 10}" font-size="10" text-anchor="middle" fill="#555">${label}</text>`;
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
var import_node_crypto, ROUTING_HISTORY_FILE, MAX_HISTORY;
var init_routing_history = __esm({
  "src/llm/routing-history.ts"() {
    import_node_crypto = require("node:crypto");
    init_storage();
    init_logger();
    ROUTING_HISTORY_FILE = "routing-history.json";
    MAX_HISTORY = 200;
  }
});

// electron-ui/ipc/provider-telemetry-handlers.cjs
var { ipcMain } = require("electron");
var VALID_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];
function isValidProvider(provider) {
  if (!provider) return true;
  return VALID_PROVIDERS.includes(provider);
}
function registerProviderTelemetryHandlers() {
  function getStatus() {
    return (init_status(), __toCommonJS(status_exports)).getProviderStatus();
  }
  function getUsage() {
    return (init_provider_usage(), __toCommonJS(provider_usage_exports)).getProviderUsage();
  }
  function resetHealth(provider) {
    return (init_status(), __toCommonJS(status_exports)).resetProviderStatus(provider);
  }
  function resetUsage(provider) {
    return (init_provider_usage(), __toCommonJS(provider_usage_exports)).resetProviderUsage(
      provider
    );
  }
  function resetAll(provider) {
    return (init_status(), __toCommonJS(status_exports)).resetAllProviderTelemetry(
      provider
    );
  }
  ipcMain.handle("providerTelemetry:getStatus", async () => {
    return getStatus();
  });
  ipcMain.handle("providerTelemetry:getUsage", async () => {
    return getUsage();
  });
  ipcMain.handle("providerTelemetry:resetHealth", async (_event, provider) => {
    if (!isValidProvider(provider))
      throw new Error(`Unknown provider: ${provider}`);
    resetHealth(provider);
    return { ok: true };
  });
  ipcMain.handle("providerTelemetry:resetUsage", async (_event, provider) => {
    if (!isValidProvider(provider))
      throw new Error(`Unknown provider: ${provider}`);
    resetUsage(provider);
    return { ok: true };
  });
  ipcMain.handle("providerTelemetry:resetAll", async (_event, provider) => {
    if (!isValidProvider(provider))
      throw new Error(`Unknown provider: ${provider}`);
    resetAll(provider);
    return { ok: true };
  });
  ipcMain.handle(
    "providerTelemetry:getRoutingHistory",
    async (_event, limit) => {
      const { getRoutingHistory: getRoutingHistory2 } = (init_routing_history(), __toCommonJS(routing_history_exports));
      return getRoutingHistory2(limit || 50);
    }
  );
  ipcMain.handle("providerTelemetry:resetRoutingHistory", async () => {
    const { resetRoutingHistory: resetRoutingHistory2 } = (init_routing_history(), __toCommonJS(routing_history_exports));
    resetRoutingHistory2();
    return { ok: true };
  });
}
module.exports = { registerProviderTelemetryHandlers };
