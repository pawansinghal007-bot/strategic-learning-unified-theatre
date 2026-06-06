import { createHash } from "crypto";
import { readJsonFile, writeJsonFile } from "../llm/storage.js";

const AUDIT_FILE = "audit-log.json";

export interface AuditEvent {
  seq: number;
  action: string;
  actor: { type: string; [key: string]: unknown };
  targetType: string;
  workspaceId?: string;
  details?: unknown;
  timestamp: number;
  prevHash: string | null;
  hash: string;
}

interface AuditStore {
  events: AuditEvent[];
}

const DEFAULT_AUDIT_STORE: AuditStore = {
  events: [],
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function hashObject(value: unknown): string {
  return createHash("sha256")
    .update(stableStringify(value), "utf8")
    .digest("hex");
}

function loadAuditStore(): AuditStore {
  const store = readJsonFile<AuditStore>(AUDIT_FILE, DEFAULT_AUDIT_STORE);

  return {
    events: Array.isArray(store?.events) ? store.events : [],
  };
}

function saveAuditStore(store: AuditStore): AuditStore {
  writeJsonFile(AUDIT_FILE, store);
  return store;
}

function computeAuditHash(
  event: Omit<AuditEvent, "hash"> & { hash?: string },
): string {
  return hashObject({
    seq: event.seq,
    action: event.action,
    actor: event.actor,
    targetType: event.targetType,
    workspaceId: event.workspaceId ?? null,
    details: event.details ?? null,
    timestamp: event.timestamp,
    prevHash: event.prevHash,
  });
}

export function appendAuditEvent(payload: {
  action: string;
  actor: { type: string; [key: string]: unknown };
  targetType: string;
  workspaceId?: string;
  details?: unknown;
}): AuditEvent {
  const store = loadAuditStore();

  const previous = store.events.at(-1) ?? null;

  const event: AuditEvent = {
    seq: previous ? previous.seq + 1 : 1,
    action: payload.action,
    actor: payload.actor,
    targetType: payload.targetType,
    workspaceId: payload.workspaceId,
    details: payload.details,
    timestamp: Date.now(),
    prevHash: previous?.hash ?? null,
    hash: "",
  };

  event.hash = computeAuditHash(event);

  store.events.push(event);
  saveAuditStore(store);

  return event;
}

export function listAuditEvents(
  limit?: number,
  filter?: { workspaceId?: string },
): AuditEvent[] {
  const store = loadAuditStore();

  let events = [...store.events];

  if (filter?.workspaceId) {
    events = events.filter((event) => event.workspaceId === filter.workspaceId);
  }

  events.sort((a, b) => b.seq - a.seq);

  return typeof limit === "number" ? events.slice(0, limit) : events;
}

export function getLatestAuditEvent(): AuditEvent | null {
  const store = loadAuditStore();
  return store.events.at(-1) ?? null;
}

export function clearAuditLog(): void {
  saveAuditStore({ events: [] });
}

export function verifyAuditLogIntegrity() {
  const store = loadAuditStore();

  for (let i = 0; i < store.events.length; i += 1) {
    const current = store.events[i];

    const expectedPrevHash = i === 0 ? null : store.events[i - 1].hash;

    if (current.prevHash !== expectedPrevHash) {
      return {
        ok: false,
        reason: "hash_mismatch",
        failedAtSeq: current.seq,
        checked: i,
      };
    }

    const expectedHash = computeAuditHash(current);

    if (current.hash !== expectedHash) {
      return {
        ok: false,
        reason: "hash_mismatch",
        failedAtSeq: current.seq,
        checked: i + 1,
      };
    }
  }

  return {
    ok: true,
    failedAtSeq: null,
    checked: store.events.length,
  };
}

// --- Sprint 38: Audit log export ---

export interface AuditExportResult {
  ok: true;
  format: "json" | "html";
  filePath: string;
  count: number;
  verification: AuditVerificationResult;
}

function escapeHtmlAudit(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toHtmlReport(
  events: AuditEvent[],
  verification: AuditVerificationResult,
): string {
  const rows = events
    .map((event) => {
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
        "</tr>",
      ].join("\n");
    })
    .join("\n");

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
<p>Generated: ${escapeHtmlAudit(new Date().toISOString())}</p>
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

export function exportAuditLogJson(filter?: {
  action?: string;
  workspaceId?: string;
  targetType?: string;
  startTime?: number;
  endTime?: number;
}): AuditExportResult {
  const { writeFileSync } = require("fs");
  const { join } = require("path");

  const events = listAuditEvents(undefined, filter).slice().reverse();
  const verification = verifyAuditLogIntegrity(filter);
  const suffix = filter?.workspaceId ? `-${filter.workspaceId}` : "";
  const filePath = join(process.cwd(), `audit-log${suffix}.json`);

  writeFileSync(
    filePath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        filter: filter ?? null,
        verification,
        count: events.length,
        events,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    ok: true,
    format: "json",
    filePath,
    count: events.length,
    verification,
  };
}

export function exportAuditLogHtmlReport(filter?: {
  action?: string;
  workspaceId?: string;
  targetType?: string;
  startTime?: number;
  endTime?: number;
}): AuditExportResult {
  const { writeFileSync } = require("fs");
  const { join } = require("path");

  const events = listAuditEvents(undefined, filter).slice().reverse();
  const verification = verifyAuditLogIntegrity(filter);
  const suffix = filter?.workspaceId ? `-${filter.workspaceId}` : "";
  const filePath = join(process.cwd(), `audit-log${suffix}.html`);

  writeFileSync(filePath, toHtmlReport(events, verification), "utf8");

  return {
    ok: true,
    format: "html",
    filePath,
    count: events.length,
    verification,
  };
}
