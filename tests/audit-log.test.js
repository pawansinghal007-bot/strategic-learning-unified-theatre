import { describe, it, expect, vi, beforeEach } from "vitest";

// Track writeFileSync calls - use vi.hoisted to ensure it's available before mocks
var wfsHolder = vi.hoisted(() => ({ calls: [] }));

// Create mock functions in hoisted scope
var mockWriteFileSync = vi.hoisted(() =>
  vi.fn((...args) => wfsHolder.calls.push(args)),
);
var mockReadJsonFile = vi.hoisted(() => vi.fn());
var mockWriteJsonFile = vi.hoisted(() => vi.fn());

// Mock storage.js (the actual import path from audit-log.ts)
// The import in audit-log.ts is "../llm/storage.js" (relative to src/audit/)
// which resolves to "../src/llm/storage.js" from the test file
vi.mock("../src/llm/storage.js", () => ({
  readJsonFile: mockReadJsonFile,
  writeJsonFile: mockWriteJsonFile,
}));

// Mock node:fs at the module-resolution level, not via require() + spyOn.
// audit-log.ts imports `writeFileSync` from "node:fs" through Vitest's own
// SSR module graph; require("node:fs") in this test file goes through
// Node's native CJS resolver instead, and the two are not guaranteed to be
// the same module instance under Vitest. vi.mock patches the resolved
// graph itself, so it's the only reliable way to intercept the call site
// inside audit-log.ts. We keep every other fs export (existsSync,
// mkdirSync, etc.) real via importOriginal, since audit-log.ts likely
// needs them for directory creation before writing exports.
// audit-log.ts only ever calls writeFileSync(...) from "node:fs" and
// join(...) from "node:path" (confirmed via grep — no existsSync,
// mkdirSync, etc.). Vitest 4.x requires a mock for a Node built-in to
// include a "default" export matching the module's real shape — without
// it, Vitest 4 throws "[vitest] No 'default' export is defined on the
// ... mock" (older Vitest versions silently fell back to the REAL module
// instead of erroring, which is exactly why writeFileSync kept hitting
// the real filesystem in earlier attempts with no visible failure).
vi.mock("node:fs", () => ({
  writeFileSync: mockWriteFileSync,
  default: {
    writeFileSync: mockWriteFileSync,
  },
}));

vi.mock("node:path", () => {
  const mockJoin = (...args) => args[args.length - 1];
  return {
    join: mockJoin,
    default: {
      join: mockJoin,
    },
  };
});

// Import the module after all mocks are defined (vi.mock calls above are
// hoisted by Vitest anyway, but keeping imports last preserves intent).
import { readJsonFile, writeJsonFile } from "../src/llm/storage.js";

import {
  appendAuditEvent,
  listAuditEvents,
  getLatestAuditEvent,
  clearAuditLog,
  verifyAuditLogIntegrity,
  exportAuditLogJson,
  exportAuditLogHtmlReport,
} from "../src/audit/audit-log.js";

// Helper to set up in-memory store
function makeInMemoryStore() {
  let store = { events: [] };
  readJsonFile.mockImplementation((_file, defaultVal) => store ?? defaultVal);
  writeJsonFile.mockImplementation((_file, data) => {
    store = JSON.parse(JSON.stringify(data)); // deep clone to avoid ref issues
  });
  return { getStore: () => store };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset writeFileSync call log
  wfsHolder.calls.length = 0;
  // Each test starts with a fresh empty store
  makeInMemoryStore();
});

// ─── stableStringify array branch (line 34) ──────────────────────────────────

describe("stableStringify array branch (line 34)", () => {
  it("hashes an event with array details without throwing", () => {
    const event = appendAuditEvent({
      action: "test.action",
      actor: { type: "user", id: "u1" },
      targetType: "resource",
      details: ["item1", "item2", { nested: true }],
    });
    expect(event.hash).toHaveLength(64);
  });

  it("hashes nested arrays within details", () => {
    const event = appendAuditEvent({
      action: "a",
      actor: { type: "s" },
      targetType: "t",
      details: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(event.hash).toBeTruthy();
  });
});

// ─── appendAuditEvent ────────────────────────────────────────────────────────

describe("appendAuditEvent", () => {
  it("first event has seq=1 and prevHash=null", () => {
    const e = appendAuditEvent({
      action: "login",
      actor: { type: "user" },
      targetType: "session",
    });
    expect(e.seq).toBe(1);
    expect(e.prevHash).toBeNull();
    expect(e.hash).toHaveLength(64);
  });

  it("second event chains off first hash", () => {
    const e1 = appendAuditEvent({
      action: "a",
      actor: { type: "u" },
      targetType: "t",
    });
    const e2 = appendAuditEvent({
      action: "b",
      actor: { type: "u" },
      targetType: "t",
    });
    expect(e2.seq).toBe(2);
    expect(e2.prevHash).toBe(e1.hash);
  });

  it("includes optional workspaceId and details", () => {
    const e = appendAuditEvent({
      action: "create",
      actor: { type: "user", id: "u1" },
      targetType: "workspace",
      workspaceId: "ws-1",
      details: { key: "value" },
    });
    expect(e.workspaceId).toBe("ws-1");
    expect(e.details).toEqual({ key: "value" });
  });
});

// ─── listAuditEvents filters (lines 128, 131, 134, 137) ──────────────────────

describe("listAuditEvents filters", () => {
  beforeEach(() => {
    appendAuditEvent({
      action: "login",
      actor: { type: "user" },
      targetType: "session",
      workspaceId: "ws-1",
    });
    appendAuditEvent({
      action: "logout",
      actor: { type: "user" },
      targetType: "session",
      workspaceId: "ws-2",
    });
    appendAuditEvent({
      action: "login",
      actor: { type: "admin" },
      targetType: "account",
      workspaceId: "ws-1",
    });
  });

  it("filters by action (line 128)", () => {
    const results = listAuditEvents(undefined, { action: "login" });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.action === "login")).toBe(true);
  });

  it("filters by targetType (line 131)", () => {
    const results = listAuditEvents(undefined, { targetType: "account" });
    expect(results).toHaveLength(1);
    expect(results[0].targetType).toBe("account");
  });

  it("filters by startTime — future excludes all (line 134)", () => {
    expect(
      listAuditEvents(undefined, { startTime: Date.now() + 100_000 }),
    ).toHaveLength(0);
  });

  it("filters by startTime — past includes all", () => {
    expect(
      listAuditEvents(undefined, { startTime: Date.now() - 100_000 }),
    ).toHaveLength(3);
  });

  it("filters by endTime — past excludes all (line 137)", () => {
    expect(
      listAuditEvents(undefined, { endTime: Date.now() - 100_000 }),
    ).toHaveLength(0);
  });

  it("filters by endTime — future includes all", () => {
    expect(
      listAuditEvents(undefined, { endTime: Date.now() + 100_000 }),
    ).toHaveLength(3);
  });

  it("filters by workspaceId", () => {
    const results = listAuditEvents(undefined, { workspaceId: "ws-1" });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.workspaceId === "ws-1")).toBe(true);
  });

  it("respects numeric limit", () => {
    expect(listAuditEvents(2)).toHaveLength(2);
  });

  it("returns all when no limit", () => {
    expect(listAuditEvents()).toHaveLength(3);
  });

  it("returns events sorted descending by seq", () => {
    const results = listAuditEvents();
    expect(results[0].seq).toBeGreaterThan(results[1].seq);
  });
});

// ─── getLatestAuditEvent ──────────────────────────────────────────────────────

describe("getLatestAuditEvent", () => {
  it("returns null on empty store", () => {
    expect(getLatestAuditEvent()).toBeNull();
  });

  it("returns last appended event", () => {
    appendAuditEvent({ action: "a", actor: { type: "u" }, targetType: "t" });
    const e2 = appendAuditEvent({
      action: "b",
      actor: { type: "u" },
      targetType: "t",
    });
    expect(getLatestAuditEvent()?.seq).toBe(e2.seq);
  });
});

// ─── clearAuditLog ───────────────────────────────────────────────────────────

describe("clearAuditLog", () => {
  it("empties the event list", () => {
    appendAuditEvent({ action: "x", actor: { type: "u" }, targetType: "t" });
    clearAuditLog();
    expect(listAuditEvents()).toHaveLength(0);
  });
});

// ─── verifyAuditLogIntegrity (lines 177,180,183,186,197) ─────────────────────

describe("verifyAuditLogIntegrity", () => {
  it("passes with no filter on 3 events", () => {
    appendAuditEvent({
      action: "login",
      actor: { type: "user" },
      targetType: "session",
      workspaceId: "ws-1",
    });
    appendAuditEvent({
      action: "logout",
      actor: { type: "user" },
      targetType: "session",
      workspaceId: "ws-2",
    });
    appendAuditEvent({
      action: "login",
      actor: { type: "admin" },
      targetType: "account",
      workspaceId: "ws-1",
    });
    const r = verifyAuditLogIntegrity();
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(3);
  });

  it("filters by action (line 177) — single matching event passes", () => {
    // Single event so filtered subset is a valid standalone chain (prevHash=null for first)
    appendAuditEvent({
      action: "logout",
      actor: { type: "user" },
      targetType: "session",
    });
    const r = verifyAuditLogIntegrity({ action: "logout" });
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
  });

  it("filters by targetType (line 180) — single matching event passes", () => {
    appendAuditEvent({
      action: "create",
      actor: { type: "admin" },
      targetType: "account",
    });
    const r = verifyAuditLogIntegrity({ targetType: "account" });
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
  });

  it("filters by startTime — future excludes all (line 183)", () => {
    appendAuditEvent({ action: "a", actor: { type: "u" }, targetType: "t" });
    const r = verifyAuditLogIntegrity({ startTime: Date.now() + 100_000 });
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(0);
  });

  it("filters by endTime — past excludes all (line 186)", () => {
    appendAuditEvent({ action: "a", actor: { type: "u" }, targetType: "t" });
    const r = verifyAuditLogIntegrity({ endTime: Date.now() - 100_000 });
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(0);
  });

  it("filters by workspaceId — single workspace events pass", () => {
    appendAuditEvent({
      action: "a",
      actor: { type: "u" },
      targetType: "t",
      workspaceId: "ws-1",
    });
    appendAuditEvent({
      action: "b",
      actor: { type: "u" },
      targetType: "t",
      workspaceId: "ws-1",
    });
    appendAuditEvent({
      action: "c",
      actor: { type: "u" },
      targetType: "t",
      workspaceId: "ws-2",
    });
    // ws-1 events are seq 1 and 2 — contiguous, valid chain when filtered
    const r = verifyAuditLogIntegrity({ workspaceId: "ws-1" });
    // Filtered set has events from the chain — prevHash check uses position in filtered array
    // seq1.prevHash=null (i=0 → expectedPrevHash=null ✓), seq2.prevHash=seq1.hash (i=1 ✓)
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
  });

  it("detects prevHash mismatch (line 197)", () => {
    const e1 = appendAuditEvent({
      action: "x",
      actor: { type: "u" },
      targetType: "t",
    });
    const e2 = appendAuditEvent({
      action: "y",
      actor: { type: "u" },
      targetType: "t",
    });
    readJsonFile.mockReturnValue({
      events: [
        e1,
        {
          ...e2,
          prevHash:
            "0000000000000000000000000000000000000000000000000000000000000bad",
        },
      ],
    });
    const r = verifyAuditLogIntegrity();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("hash_mismatch");
    expect(r.failedAtSeq).toBe(e2.seq);
  });

  it("detects own hash tampering", () => {
    const e1 = appendAuditEvent({
      action: "x",
      actor: { type: "u" },
      targetType: "t",
    });
    readJsonFile.mockReturnValue({ events: [{ ...e1, hash: "badhash" }] });
    const r = verifyAuditLogIntegrity();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("hash_mismatch");
  });
});

// ─── exportAuditLogJson ───────────────────────────────────────────────────────

describe("exportAuditLogJson", () => {
  it("returns ok=true with json format and count=1", () => {
    appendAuditEvent({ action: "x", actor: { type: "u" }, targetType: "t" });
    const result = exportAuditLogJson();
    expect(result.ok).toBe(true);
    expect(result.format).toBe("json");
    expect(result.count).toBe(1);
    expect(result.filePath).toContain("audit-log.json");
  });

  it("adds workspaceId suffix to filename", () => {
    appendAuditEvent({
      action: "x",
      actor: { type: "u" },
      targetType: "t",
      workspaceId: "ws-99",
    });
    const result = exportAuditLogJson({ workspaceId: "ws-99" });
    expect(result.filePath).toContain("audit-log-ws-99.json");
  });

  it("calls writeFileSync with valid JSON content", () => {
    appendAuditEvent({ action: "x", actor: { type: "u" }, targetType: "t" });
    exportAuditLogJson();
    expect(wfsHolder.calls.length).toBeGreaterThan(0);
    const content = wfsHolder.calls[0][1];
    expect(() => JSON.parse(content)).not.toThrow();
  });
});

// ─── loadAuditStore — non-array events fallback (line 55) ────────────────────

describe("loadAuditStore non-array events fallback (line 55)", () => {
  it("treats a store whose events is not an array as empty", () => {
    // Return a store where `events` is not an array — exercises the `[]` branch
    readJsonFile.mockReturnValue({ events: null });
    expect(listAuditEvents()).toHaveLength(0);
  });

  it("treats a store whose events is a plain object as empty", () => {
    readJsonFile.mockReturnValue({ events: { notAnArray: true } });
    expect(listAuditEvents()).toHaveLength(0);
  });
});

// ─── exportAuditLogHtmlReport ─────────────────────────────────────────────────

describe("exportAuditLogHtmlReport", () => {
  it("returns ok=true with html format", () => {
    appendAuditEvent({ action: "x", actor: { type: "u" }, targetType: "t" });
    const result = exportAuditLogHtmlReport();
    expect(result.ok).toBe(true);
    expect(result.format).toBe("html");
    expect(result.filePath).toContain("audit-log.html");
  });

  it("adds workspaceId suffix to filename", () => {
    appendAuditEvent({
      action: "x",
      actor: { type: "u" },
      targetType: "t",
      workspaceId: "ws-5",
    });
    const result = exportAuditLogHtmlReport({ workspaceId: "ws-5" });
    expect(result.filePath).toContain("audit-log-ws-5.html");
  });

  it("writes valid HTML with audit table", () => {
    appendAuditEvent({
      action: "login",
      actor: { type: "user", id: "u1" },
      targetType: "session",
      workspaceId: "ws-1",
      details: { ip: "127.0.0.1" },
    });
    exportAuditLogHtmlReport();
    expect(wfsHolder.calls.length).toBeGreaterThan(0);
    const html = wfsHolder.calls[0][1];
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Audit Log Report");
    expect(html).toContain("<table>");
  });

  it("shows FAIL in HTML when integrity check fails", () => {
    const e1 = appendAuditEvent({
      action: "a",
      actor: { type: "u" },
      targetType: "t",
    });
    readJsonFile.mockReturnValue({ events: [{ ...e1, hash: "badhash" }] });
    exportAuditLogHtmlReport();
    const html = wfsHolder.calls[0][1];
    expect(html).toContain("FAIL");
  });

  it("escapes HTML special characters in event fields", () => {
    appendAuditEvent({
      action: "<script>alert(1)</script>",
      actor: { type: "user&admin" },
      targetType: "t",
    });
    exportAuditLogHtmlReport();
    const html = wfsHolder.calls[0][1];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders empty string for actor type when actor has no type (line 264 ?? branch)", () => {
    // Inject a tampered event with actor.type missing to hit the `?? ""` fallback
    const e = appendAuditEvent({
      action: "z",
      actor: { type: "user" },
      targetType: "t",
    });
    // Replace actor to have no type property — exercises `event.actor?.type ?? ""`
    readJsonFile.mockReturnValue({
      events: [{ ...e, actor: { id: "no-type" } }],
    });
    exportAuditLogHtmlReport();
    const html = wfsHolder.calls[0][1];
    // The actor-type cell should be present but empty
    expect(html).toContain("<td></td>");
  });
});
