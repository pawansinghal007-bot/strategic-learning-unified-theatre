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
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}
function hashObject(value) {
  return (0, import_node_crypto.createHash)("sha256").update(stableStringify(value), "utf8").digest("hex");
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
  if (typeof value !== "string" || value === "") {
    return "";
  }
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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
  const filePath = (0, import_node_path2.join)(process.cwd(), `audit-log${suffix}.json`);
  (0, import_node_fs2.writeFileSync)(
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
  const filePath = (0, import_node_path2.join)(process.cwd(), `audit-log${suffix}.html`);
  (0, import_node_fs2.writeFileSync)(filePath, toHtmlReport(events, verification), "utf8");
  return {
    ok: true,
    format: "html",
    filePath,
    count: events.length,
    verification
  };
}
var import_node_crypto, import_node_fs2, import_node_path2, AUDIT_FILE, DEFAULT_AUDIT_STORE;
var init_audit_log = __esm({
  "src/audit/audit-log.ts"() {
    import_node_crypto = require("node:crypto");
    import_node_fs2 = require("node:fs");
    import_node_path2 = require("node:path");
    init_storage();
    AUDIT_FILE = "audit-log.json";
    DEFAULT_AUDIT_STORE = {
      events: []
    };
  }
});

// src/policies/policy-presets.ts
var policy_presets_exports = {};
__export(policy_presets_exports, {
  POLICY_PRESETS: () => POLICY_PRESETS,
  getAllProviders: () => getAllProviders,
  getPolicyPreset: () => getPolicyPreset,
  isPolicyPresetName: () => isPolicyPresetName,
  listPolicyPresets: () => listPolicyPresets
});
function listPolicyPresets() {
  return Object.values(POLICY_PRESETS);
}
function getPolicyPreset(name) {
  const preset = POLICY_PRESETS[name];
  if (!preset) throw new Error(`Unknown policy preset: ${name}`);
  return preset;
}
function isPolicyPresetName(value) {
  return value in POLICY_PRESETS;
}
function getAllProviders() {
  return [...ALL_PROVIDERS];
}
var CLOUD_PROVIDERS, ALL_PROVIDERS, POLICY_PRESETS;
var init_policy_presets = __esm({
  "src/policies/policy-presets.ts"() {
    CLOUD_PROVIDERS = [
      "groq",
      "gemini",
      "openai",
      "perplexity"
    ];
    ALL_PROVIDERS = [
      "groq",
      "gemini",
      "openai",
      "perplexity",
      "local"
    ];
    POLICY_PRESETS = {
      default: {
        name: "default",
        label: "Default",
        description: "Balanced cloud routing with no special restrictions.",
        policy: {
          routingMode: "cloud",
          allowedProviders: [...CLOUD_PROVIDERS],
          blockedProviders: [],
          manualProvider: null
        }
      },
      coding: {
        name: "coding",
        label: "Coding mode",
        description: "Prefer fast coding providers while keeping cloud fallback available.",
        policy: {
          routingMode: "hybrid",
          allowedProviders: ["groq", "openai", "gemini", "local"],
          blockedProviders: ["perplexity"],
          manualProvider: "groq"
        }
      },
      research: {
        name: "research",
        label: "Research mode",
        description: "Prefer research and summarization providers.",
        policy: {
          routingMode: "cloud",
          allowedProviders: ["perplexity", "gemini", "openai"],
          blockedProviders: ["groq", "local"],
          manualProvider: "perplexity"
        }
      },
      private: {
        name: "private",
        label: "Private mode",
        description: "Route only to local for privacy-sensitive tasks.",
        policy: {
          routingMode: "local-only",
          allowedProviders: ["local"],
          blockedProviders: [],
          manualProvider: "local"
        }
      },
      enterprise: {
        name: "enterprise",
        label: "Enterprise mode",
        description: "Conservative approved-provider set with local fallback.",
        policy: {
          routingMode: "hybrid",
          allowedProviders: ["openai", "gemini", "local"],
          blockedProviders: ["groq", "perplexity"],
          manualProvider: null
        }
      }
    };
  }
});

// src/policies/sensitive-task-rules.ts
function requestText(request) {
  const prompt = (request.prompt ?? "").trim();
  const memory = Array.isArray(request.memory) ? request.memory.join(" ") : "";
  return `${prompt}
${memory}`.trim();
}
function detectSensitiveTask(request) {
  const text = requestText(request);
  const reasons = [];
  const detectedTypes = [];
  let forceLocal = false;
  let approvedProvidersOnly = null;
  for (const rule of RULES) {
    const matched = rule.patterns.some((pattern) => pattern.test(text));
    if (!matched) continue;
    reasons.push(rule.reason);
    detectedTypes.push(rule.type);
    if (rule.forceLocal) {
      forceLocal = true;
    }
    if (rule.approvedProvidersOnly) {
      approvedProvidersOnly = approvedProvidersOnly ? approvedProvidersOnly.filter(
        (p) => rule.approvedProvidersOnly.includes(p)
      ) : [...rule.approvedProvidersOnly];
    }
  }
  return {
    matched: reasons.length > 0,
    reasons,
    detectedTypes,
    forceLocal,
    approvedProvidersOnly
  };
}
var RULES;
var init_sensitive_task_rules = __esm({
  "src/policies/sensitive-task-rules.ts"() {
    RULES = [
      {
        type: "pii",
        patterns: [
          /\bpan\b/i,
          /\baadhaar\b/i,
          /\bpassport\b/i,
          /\bssn\b/i,
          /\bsocial security\b/i,
          /\bdate of birth\b/i,
          /\bphone number\b/i,
          /\bhome address\b/i,
          /\bpersonal address\b/i
        ],
        reason: "Detected potential personally identifiable information.",
        forceLocal: true
      },
      {
        type: "credentials",
        patterns: [
          /\bapi key\b/i,
          /\bsecret key\b/i,
          /\bpassword\b/i,
          /\btoken\b/i,
          /\bprivate key\b/i,
          /\bcredential\b/i
        ],
        reason: "Detected secrets or credentials.",
        forceLocal: true
      },
      {
        type: "finance",
        patterns: [
          /\bbank statement\b/i,
          /\baccount number\b/i,
          /\bifsc\b/i,
          /\bcredit card\b/i,
          /\bfinancial report\b/i,
          /\binvoice\b/i,
          /\bbalance sheet\b/i
        ],
        reason: "Detected finance-sensitive content.",
        approvedProvidersOnly: ["openai", "gemini", "local"]
      },
      {
        type: "legal",
        patterns: [
          /\bcontract\b/i,
          /\bnda\b/i,
          /\blegal notice\b/i,
          /\bcompliance\b/i,
          /\bregulatory\b/i
        ],
        reason: "Detected legal or compliance-sensitive content.",
        approvedProvidersOnly: ["openai", "local"]
      },
      {
        type: "security",
        patterns: [
          /\bvulnerability\b/i,
          /\bexploit\b/i,
          /\bpenetration test\b/i,
          /\bsecurity audit\b/i,
          /\bincident\b/i
        ],
        reason: "Detected security-sensitive content.",
        approvedProvidersOnly: ["openai", "local"]
      }
    ];
  }
});

// src/policies/workspace-policy.ts
function loadStore() {
  return readJsonFile(OVERRIDES_FILE, DEFAULT_STORE);
}
function getWorkspacePolicyOverride(workspaceId) {
  const store = loadStore();
  return store.overrides.find((o) => o.workspaceId === workspaceId) ?? null;
}
function resolveWorkspacePolicyState(workspaceId) {
  const global = getProviderPolicy();
  const override = getWorkspacePolicyOverride(workspaceId);
  if (!override) {
    return { source: "global", policy: { ...global } };
  }
  const merged = { ...global };
  for (const [key, value] of Object.entries(override.policy)) {
    if (value !== void 0) {
      merged[key] = value;
    }
  }
  return {
    source: "workspace",
    workspaceId,
    policy: merged
  };
}
var OVERRIDES_FILE, DEFAULT_STORE;
var init_workspace_policy = __esm({
  "src/policies/workspace-policy.ts"() {
    init_storage();
    init_provider_policy();
    OVERRIDES_FILE = "workspace-policy-overrides.json";
    DEFAULT_STORE = { overrides: [] };
  }
});

// src/policies/provider-policy.ts
var provider_policy_exports = {};
__export(provider_policy_exports, {
  allowProvider: () => allowProvider,
  applyPolicyPreset: () => applyPolicyPreset,
  applyPolicyToCandidates: () => applyPolicyToCandidates,
  applyPolicyToCandidatesForWorkspace: () => applyPolicyToCandidatesForWorkspace,
  applyPolicyToCandidatesWithReason: () => applyPolicyToCandidatesWithReason,
  applyPolicyToCandidatesWithReasonForWorkspace: () => applyPolicyToCandidatesWithReasonForWorkspace,
  blockProvider: () => blockProvider,
  dispatch: () => dispatch,
  explainRoutingSelection: () => explainRoutingSelection,
  getProviderPolicy: () => getProviderPolicy,
  getState: () => getState,
  initPolicy: () => initPolicy,
  policyReducer: () => policyReducer,
  resetProviderPolicy: () => resetProviderPolicy,
  selectCandidates: () => selectCandidates,
  selectPolicyExplanation: () => selectPolicyExplanation,
  setManualProvider: () => setManualProvider,
  setRoutingMode: () => setRoutingMode
});
function normalizeProviders(values) {
  return [...new Set(values)].filter((v) => ALL_PROVIDERS2.includes(v));
}
function sanitizePolicy(raw) {
  const routingMode = raw.routingMode ?? "cloud";
  let allowedProviders = normalizeProviders(
    raw.allowedProviders ?? DEFAULT_POLICY.allowedProviders
  );
  let blockedProviders = normalizeProviders(raw.blockedProviders ?? []);
  let manualProvider = raw.manualProvider ?? null;
  if (routingMode === "local-only") {
    allowedProviders = ["local"];
    blockedProviders = [];
    manualProvider = "local";
  }
  if (routingMode === "cloud") {
    if (!allowedProviders.length) {
      allowedProviders = [...DEFAULT_POLICY.allowedProviders];
    }
    if (manualProvider === "local") manualProvider = null;
  }
  if (routingMode === "hybrid" && !allowedProviders.length) {
    allowedProviders = [...ALL_PROVIDERS2];
  }
  if (manualProvider && !allowedProviders.includes(manualProvider)) {
    manualProvider = null;
  }
  const activePreset = raw.activePreset && isPolicyPresetName(raw.activePreset) ? raw.activePreset : "default";
  return {
    routingMode,
    allowedProviders,
    blockedProviders,
    manualProvider,
    activePreset,
    updatedAt: raw.updatedAt ?? Date.now()
  };
}
function getProviderPolicy() {
  if (state) return state;
  const raw = readJsonFile(POLICY_FILE, DEFAULT_POLICY);
  return sanitizePolicy(raw);
}
function saveProviderPolicy(s) {
  const normalized = sanitizePolicy({ ...s, updatedAt: Date.now() });
  writeJsonFile(POLICY_FILE, normalized);
  logger.info("provider.policy.saved", normalized);
  return normalized;
}
function policyReducer(state2, action) {
  const next = { ...state2 };
  switch (action.type) {
    case "SET_ROUTING_MODE":
      next.routingMode = action.mode;
      if (action.mode === "local-only") {
        next.allowedProviders = ["local"];
        next.blockedProviders = [];
        next.manualProvider = "local";
      } else if (action.mode === "cloud") {
        next.allowedProviders = [
          "groq",
          "gemini",
          "openai",
          "perplexity",
          "local"
        ];
        next.blockedProviders = next.blockedProviders.filter(
          (p) => p !== "local"
        );
        if (next.manualProvider === "local") next.manualProvider = null;
      } else if (action.mode === "hybrid") {
        next.allowedProviders = [...ALL_PROVIDERS2];
      }
      break;
    case "ALLOW_PROVIDER":
      if (!next.allowedProviders.includes(action.provider)) {
        next.allowedProviders.push(action.provider);
      }
      next.blockedProviders = next.blockedProviders.filter(
        (p) => p !== action.provider
      );
      break;
    case "BLOCK_PROVIDER":
      next.allowedProviders = next.allowedProviders.filter(
        (p) => p !== action.provider
      );
      if (!next.blockedProviders.includes(action.provider)) {
        next.blockedProviders.push(action.provider);
      }
      if (next.manualProvider === action.provider) {
        next.manualProvider = null;
      }
      break;
    case "SET_MANUAL_PROVIDER":
      next.manualProvider = action.provider;
      break;
    case "APPLY_PRESET":
      next.routingMode = action.preset.policy.routingMode ?? "cloud";
      next.allowedProviders = action.preset.policy.allowedProviders ?? [];
      next.blockedProviders = action.preset.policy.blockedProviders ?? [];
      next.manualProvider = action.preset.policy.manualProvider ?? null;
      next.activePreset = action.preset.name;
      break;
    case "RESET":
      return { ...action.defaultState };
  }
  next.updatedAt = Date.now();
  return sanitizePolicy(next);
}
function selectCandidates(state2, candidates, request) {
  if (state2.routingMode === "local-only") return ["local"];
  let filtered = candidates.filter((p) => state2.allowedProviders.includes(p)).filter((p) => !state2.blockedProviders.includes(p));
  if (state2.routingMode === "cloud") {
    const withoutLocal = filtered.filter((p) => p !== "local");
    if (withoutLocal.length > 0) filtered = withoutLocal;
  }
  if (request) {
    const sensitive = detectSensitiveTask(
      typeof request === "string" ? { prompt: request } : request
    );
    if (sensitive.forceLocal) return ["local"];
    if (sensitive.approvedProvidersOnly?.length) {
      filtered = filtered.filter(
        (p) => sensitive.approvedProvidersOnly.includes(p)
      );
    }
  }
  if (state2.manualProvider && filtered.includes(state2.manualProvider)) {
    filtered = [
      state2.manualProvider,
      ...filtered.filter((p) => p !== state2.manualProvider)
    ];
  }
  return filtered;
}
function selectPolicyExplanation(state2, request) {
  const parts = [`Mode: ${state2.routingMode}`];
  if (state2.activePreset) parts.push(`Preset: ${state2.activePreset}`);
  if (request) {
    const sensitive = detectSensitiveTask(
      typeof request === "string" ? { prompt: request } : request
    );
    if (sensitive.forceLocal) {
      parts.push(`Forced local: ${sensitive.reasons.join(" ")}`);
    }
    if (sensitive.approvedProvidersOnly?.length) {
      parts.push(`Restricted: ${sensitive.approvedProvidersOnly.join(", ")}`);
    }
  }
  if (state2.manualProvider) {
    parts.push(`Manual: ${state2.manualProvider}`);
  }
  return parts.join(" | ");
}
function initPolicy(initial) {
  state = initial ?? getProviderPolicy();
  return state;
}
function dispatch(action) {
  state ??= getProviderPolicy();
  state = policyReducer(state, action);
  saveProviderPolicy(state);
  return state;
}
function getState() {
  state ??= getProviderPolicy();
  return state;
}
function applyPolicyPreset(name) {
  const preset = getPolicyPreset(name);
  state = saveProviderPolicy({
    routingMode: preset.policy.routingMode ?? "cloud",
    allowedProviders: preset.policy.allowedProviders ?? [],
    blockedProviders: preset.policy.blockedProviders ?? [],
    manualProvider: preset.policy.manualProvider ?? null,
    activePreset: name,
    updatedAt: Date.now()
  });
  return state;
}
function resetProviderPolicy() {
  state = sanitizePolicy({ ...DEFAULT_POLICY, updatedAt: Date.now() });
  writeJsonFile(POLICY_FILE, state);
  logger.info("provider.policy.saved", state);
  return state;
}
function setRoutingMode(mode) {
  return dispatch({ type: "SET_ROUTING_MODE", mode });
}
function blockProvider(provider) {
  const providerName = provider;
  if (!ALL_PROVIDERS2.includes(providerName)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return dispatch({ type: "BLOCK_PROVIDER", provider: providerName });
}
function allowProvider(provider) {
  const providerName = provider;
  if (!ALL_PROVIDERS2.includes(providerName)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return dispatch({ type: "ALLOW_PROVIDER", provider: providerName });
}
function setManualProvider(provider) {
  if (provider !== null) {
    const providerName = provider;
    if (!ALL_PROVIDERS2.includes(providerName)) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const current = getState();
    if (current.blockedProviders.includes(providerName)) {
      throw new Error(
        `Cannot set manual provider '${provider}': provider is blocked`
      );
    }
    return dispatch({ type: "SET_MANUAL_PROVIDER", provider: providerName });
  }
  return dispatch({ type: "SET_MANUAL_PROVIDER", provider: null });
}
function applyPolicyToCandidates(candidates, request) {
  const currentState = getState();
  const prompt = typeof request === "string" ? request : request?.prompt;
  const result = selectCandidates(currentState, candidates, prompt);
  Object.defineProperty(result, "candidates", {
    value: [...result],
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(result, "policyReason", {
    value: selectPolicyExplanation(currentState, prompt),
    enumerable: false,
    configurable: true
  });
  return result;
}
function applyPolicyToCandidatesWithReason(candidates, request) {
  const currentState = getState();
  const prompt = typeof request === "string" ? request : request?.prompt;
  return {
    candidates: selectCandidates(currentState, candidates, prompt),
    policyReason: selectPolicyExplanation(currentState, prompt)
  };
}
function applyPolicyToCandidatesForWorkspace(candidates, request) {
  const workspaceId = request?.workspaceId;
  const { policy: policy2 } = resolveWorkspacePolicyState(workspaceId);
  const prompt = typeof request === "string" ? request : request?.prompt;
  return selectCandidates(policy2, candidates, prompt);
}
function applyPolicyToCandidatesWithReasonForWorkspace(candidates, request) {
  const workspaceId = request?.workspaceId;
  const resolved = resolveWorkspacePolicyState(workspaceId);
  const prompt = typeof request === "string" ? request : request?.prompt;
  const selectedCandidates = selectCandidates(
    resolved.policy,
    candidates,
    prompt
  );
  const baseReason = selectPolicyExplanation(resolved.policy, prompt);
  return {
    candidates: selectedCandidates,
    policyReason: resolved.source === "workspace" && workspaceId ? `${baseReason} | Workspace override: ${workspaceId}` : baseReason,
    policySource: resolved.source
  };
}
var POLICY_FILE, ALL_PROVIDERS2, DEFAULT_POLICY, state, explainRoutingSelection;
var init_provider_policy = __esm({
  "src/policies/provider-policy.ts"() {
    init_storage();
    init_logger();
    init_policy_presets();
    init_sensitive_task_rules();
    init_workspace_policy();
    POLICY_FILE = "provider-policy.json";
    ALL_PROVIDERS2 = getAllProviders();
    DEFAULT_POLICY = {
      routingMode: "cloud",
      allowedProviders: ["groq", "gemini", "openai", "perplexity", "local"],
      blockedProviders: [],
      manualProvider: null,
      activePreset: "default",
      updatedAt: Date.now()
    };
    state = null;
    explainRoutingSelection = selectPolicyExplanation;
  }
});

// electron-ui/ipc/provider-policy-handlers.cjs
var { ipcMain } = require("electron");
var { appendAuditEvent: appendAuditEvent2 } = (init_audit_log(), __toCommonJS(audit_log_exports));
var VALID_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];
var VALID_MODES = ["cloud", "hybrid", "local-only"];
function policy() {
  return init_provider_policy(), __toCommonJS(provider_policy_exports);
}
function presets() {
  return init_policy_presets(), __toCommonJS(policy_presets_exports);
}
function registerProviderPolicyHandlers() {
  ipcMain.handle("providerPolicy:get", async () => {
    return policy().getProviderPolicy();
  });
  ipcMain.handle("providerPolicy:listPresets", async () => {
    return presets().listPolicyPresets();
  });
  ipcMain.handle("providerPolicy:applyPreset", async (_event, name) => {
    if (!presets().isPolicyPresetName(name)) {
      throw new Error(`Unknown preset: ${name}`);
    }
    const result = policy().applyPolicyPreset(name);
    appendAuditEvent2({
      action: "policy.applyPreset",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { preset: name }
    });
    return result;
  });
  ipcMain.handle("providerPolicy:setMode", async (_event, mode) => {
    if (!VALID_MODES.includes(mode)) {
      throw new Error(`Unknown routing mode: ${mode}`);
    }
    const result = policy().setRoutingMode(mode);
    appendAuditEvent2({
      action: "policy.setRoutingMode",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { mode }
    });
    return result;
  });
  ipcMain.handle("providerPolicy:allow", async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const result = policy().allowProvider(provider);
    appendAuditEvent2({
      action: "policy.allowProvider",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { provider }
    });
    return result;
  });
  ipcMain.handle("providerPolicy:block", async (_event, provider) => {
    if (!VALID_PROVIDERS.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    const result = policy().blockProvider(provider);
    appendAuditEvent2({
      action: "policy.blockProvider",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { provider }
    });
    return result;
  });
  ipcMain.handle(
    "providerPolicy:setManualProvider",
    async (_event, provider) => {
      if (provider && !VALID_PROVIDERS.includes(provider)) {
        throw new Error(`Unknown provider: ${provider}`);
      }
      const result = policy().setManualProvider(provider ?? null);
      appendAuditEvent2({
        action: "policy.setManualProvider",
        actor: { type: "renderer" },
        targetType: "providerPolicy",
        details: {
          provider: provider ?? null
        }
      });
      return result;
    }
  );
  ipcMain.handle("providerPolicy:reset", async () => {
    const result = policy().resetProviderPolicy();
    appendAuditEvent2({
      action: "policy.reset",
      actor: { type: "renderer" },
      targetType: "providerPolicy"
    });
    return result;
  });
}
module.exports = { registerProviderPolicyHandlers };
