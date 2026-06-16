import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Stable wrapper — the mock factory closes over `store`, so
// reassigning store.db in beforeEach is always seen by the mock.
const store = vi.hoisted(() => ({ db: {} }));

vi.mock("../src/llm/storage.js", () => ({
  readJsonFile: (key, fallback) =>
    key in store.db ? JSON.parse(JSON.stringify(store.db[key])) : fallback,
  writeJsonFile: (key, value) => {
    store.db[key] = JSON.parse(JSON.stringify(value));
  },
}));

describe("Sprint 36 smoke tests — audit log core", () => {
  let appendAuditEvent;
  let listAuditEvents;
  let verifyAuditLogIntegrity;
  let getLatestAuditEvent;
  let clearAuditLog;

  beforeAll(async () => {
    // Force fresh module load after mock is established
    vi.resetModules();
    const module = await import("../src/audit/audit-log.js");
    appendAuditEvent = module.appendAuditEvent;
    listAuditEvents = module.listAuditEvents;
    verifyAuditLogIntegrity = module.verifyAuditLogIntegrity;
    getLatestAuditEvent = module.getLatestAuditEvent;
    clearAuditLog = module.clearAuditLog;
  });

  beforeEach(() => {
    store.db = {};
    clearAuditLog();
  });

  it("appends events with incrementing seq", () => {
    const e1 = appendAuditEvent({
      action: "policy.setRoutingMode",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { mode: "hybrid" },
    });
    const e2 = appendAuditEvent({
      action: "policy.blockProvider",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { provider: "groq" },
    });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
  });

  it("chains hashes correctly", () => {
    const e1 = appendAuditEvent({
      action: "a",
      actor: { type: "system" },
      targetType: "test",
    });
    const e2 = appendAuditEvent({
      action: "b",
      actor: { type: "system" },
      targetType: "test",
    });
    expect(e1.prevHash).toBeNull();
    expect(e2.prevHash).toBe(e1.hash);
  });

  it("verifyAuditLogIntegrity returns ok for intact log", () => {
    appendAuditEvent({
      action: "report.save",
      actor: { type: "renderer" },
      targetType: "workspaceReport",
      workspaceId: "ws-1",
      details: { format: "html" },
    });
    const result = verifyAuditLogIntegrity();
    expect(result.ok).toBe(true);
    expect(result.failedAtSeq).toBeNull();
  });

  it("verifyAuditLogIntegrity detects hash tampering", () => {
    appendAuditEvent({
      action: "policy.applyPreset",
      actor: { type: "renderer" },
      targetType: "providerPolicy",
      details: { preset: "enterprise" },
    });
    // Mutate the stored copy directly to simulate tampering
    store.db["audit-log.json"].events[0].details = { preset: "default" };
    const result = verifyAuditLogIntegrity();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("hash_mismatch");
  });

  it("listAuditEvents filters by workspaceId", () => {
    appendAuditEvent({
      action: "report.save",
      actor: { type: "renderer" },
      targetType: "workspaceReport",
      workspaceId: "ws-a",
      details: { format: "json" },
    });
    appendAuditEvent({
      action: "report.save",
      actor: { type: "renderer" },
      targetType: "workspaceReport",
      workspaceId: "ws-b",
      details: { format: "csv" },
    });
    const rows = listAuditEvents(50, { workspaceId: "ws-a" });
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe("ws-a");
  });

  it("listAuditEvents returns events newest-first", () => {
    appendAuditEvent({
      action: "a",
      actor: { type: "system" },
      targetType: "t",
    });
    appendAuditEvent({
      action: "b",
      actor: { type: "system" },
      targetType: "t",
    });
    appendAuditEvent({
      action: "c",
      actor: { type: "system" },
      targetType: "t",
    });
    const rows = listAuditEvents(10);
    expect(rows[0].action).toBe("c");
    expect(rows[2].action).toBe("a");
  });

  it("getLatestAuditEvent returns most recent", () => {
    appendAuditEvent({
      action: "x",
      actor: { type: "system" },
      targetType: "t",
    });
    appendAuditEvent({
      action: "y",
      actor: { type: "system" },
      targetType: "t",
    });
    const latest = getLatestAuditEvent();
    expect(latest.action).toBe("y");
  });

  it("clearAuditLog removes all events", () => {
    appendAuditEvent({
      action: "x",
      actor: { type: "system" },
      targetType: "t",
    });
    clearAuditLog();
    expect(getLatestAuditEvent()).toBeNull();
  });

  it("verifyAuditLogIntegrity ok for empty log", () => {
    const result = verifyAuditLogIntegrity();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe("Sprint 36 smoke tests — file surface", () => {
  it("audit-log.ts exists in src/audit/", () => {
    expect(existsSync(join(process.cwd(), "src/audit/audit-log.ts"))).toBe(
      true,
    );
  });

  it("audit-handlers.cjs exists", () => {
    expect(
      existsSync(join(process.cwd(), "electron-ui/ipc/audit-handlers.cjs")),
    ).toBe(true);
  });

  it("audit-handlers.cjs registers all 3 channels", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/audit-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("audit:list");
    expect(source).toContain("audit:verify");
    expect(source).toContain("audit:latest");
  });

  it("provider-policy-handlers.cjs writes audit events", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/provider-policy-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("audit-log.js");
    expect(source).toContain("appendAuditEvent");
    expect(source).toContain("policy.setRoutingMode");
    expect(source).toContain("policy.applyPreset");
  });

  it("workspace-report-handlers.cjs writes audit event on save", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-report-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("audit-log.js");
    expect(source).toContain("appendAuditEvent");
    expect(source).toContain("report.save");
  });

  it("main.cjs registers audit handlers", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(source).toContain("registerAuditHandlers");
  });

  it("preload exposes audit namespace", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(source).toContain('exposeInMainWorld("audit"');
    expect(source).toContain("audit:list");
    expect(source).toContain("audit:verify");
    expect(source).toContain("audit:latest");
  });

  it("dashboard includes Audit Trail panel", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(source).toContain("Audit Trail");
    expect(source).toContain("load-audit-events");
    expect(source).toContain("verify-audit-log");
    expect(source).toContain("load-latest-audit");
    expect(source).toContain("window.audit.list");
    expect(source).toContain("window.audit.verify");
  });

  it("dashboard preserves Sprint 35 compatibility strings", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(source).toContain("Workspace Analytics");
    expect(source).toContain("Provider Trends");
    expect(source).toContain("Decision Timeline");
    expect(source).toContain("metric-success-rate");
    expect(source).toContain("metric-error-rate");
    expect(source).toContain("metric-latency");
    expect(source).toContain("workspaceRouting.analytics");
  });

  it("types.d.ts declares audit on Window", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(source).toContain("audit:");
    expect(source).toContain("verify:");
    expect(source).toContain("failedAtSeq:");
  });
});
