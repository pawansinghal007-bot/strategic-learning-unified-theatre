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
