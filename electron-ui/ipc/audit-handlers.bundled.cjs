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
function ensureDir(path) {
  (0, import_fs.mkdirSync)((0, import_path.dirname)(path), { recursive: true });
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

// electron-ui/ipc/audit-handlers.cjs
var { ipcMain } = require("electron");
function registerAuditHandlers() {
  const {
    listAuditEvents: listAuditEvents2,
    verifyAuditLogIntegrity: verifyAuditLogIntegrity2,
    getLatestAuditEvent: getLatestAuditEvent2
  } = (init_audit_log(), __toCommonJS(audit_log_exports));
  ipcMain.handle("audit:list", async (_event, limit, filter) => {
    return listAuditEvents2(limit ?? 50, filter);
  });
  ipcMain.handle("audit:verify", async () => {
    return verifyAuditLogIntegrity2();
  });
  ipcMain.handle("audit:latest", async () => {
    return getLatestAuditEvent2();
  });
  ipcMain.handle("audit:exportJson", async (_event, filter) => {
    const { exportAuditLogJson: exportAuditLogJson2 } = (init_audit_log(), __toCommonJS(audit_log_exports));
    return exportAuditLogJson2(filter || void 0);
  });
  ipcMain.handle("audit:exportHtmlReport", async (_event, filter) => {
    const {
      exportAuditLogHtmlReport: exportAuditLogHtmlReport2
    } = (init_audit_log(), __toCommonJS(audit_log_exports));
    return exportAuditLogHtmlReport2(filter || void 0);
  });
}
module.exports = { registerAuditHandlers };
