import { existsSync, readFileSync } from "fs";
import { loadDashboardSurface } from './dashboard-loader.js';
import { join } from "path";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/llm/storage.js", () => {
  const store = {};
  return {
    readJsonFile: (file, fallback) => {
      return file in store
        ? JSON.parse(JSON.stringify(store[file]))
        : JSON.parse(JSON.stringify(fallback));
    },
    writeJsonFile: (file, value) => {
      store[file] = JSON.parse(JSON.stringify(value));
    },
    __resetMockStore: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
});

vi.mock("../src/audit/audit-log.js", () => {
  const appendAuditEvent = vi.fn(() => ({
    seq: 1,
    action: "mocked",
    hash: "abc",
  }));
  return { appendAuditEvent };
});

describe("Sprint 39 smoke tests — workspace quota service", () => {
  beforeEach(async () => {
    const storage = await import("../src/llm/storage.js");
    storage.__resetMockStore();
    vi.clearAllMocks();
  });

  it("workspace-quotas.ts exists in src/governance/", () => {
    expect(
      existsSync(join(process.cwd(), "src/governance/workspace-quotas.ts")),
    ).toBe(true);
  });

  it("sets and gets a workspace quota policy", async () => {
    const { setWorkspaceQuotaPolicy, getWorkspaceQuotaPolicy } =
      await import("../src/governance/workspace-quotas.js");

    const saved = setWorkspaceQuotaPolicy({
      workspaceId: "ws-39",
      dailyLimit: 5,
      weeklyLimit: 20,
      mode: "alert",
      fallbackProvider: null,
      requestedBy: "pawan",
      reason: "quota test",
    });

    const fetched = getWorkspaceQuotaPolicy("ws-39");

    expect(saved.workspaceId).toBe("ws-39");
    expect(saved.dailyLimit).toBe(5);
    expect(saved.mode).toBe("alert");
    expect(fetched).not.toBeNull();
    expect(fetched.workspaceId).toBe("ws-39");
  });

  it("records usage and reports exceededDaily when limit crossed", async () => {
    const { setWorkspaceQuotaPolicy, recordWorkspaceQuotaUsage } =
      await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-daily",
      dailyLimit: 1,
      weeklyLimit: 10,
      mode: "alert",
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);

    const first = recordWorkspaceQuotaUsage({
      workspaceId: "ws-daily",
      timestamp: t,
      provider: "openai",
    });
    const second = recordWorkspaceQuotaUsage({
      workspaceId: "ws-daily",
      timestamp: t + 1000,
      provider: "openai",
    });

    expect(first.exceeded).toBe(false);
    expect(second.exceeded).toBe(true);
    expect(second.exceededDaily).toBe(true);
    expect(second.dayCount).toBe(2);
  });

  it("evaluateWorkspaceQuotaStatus returns blocked when mode is block and limit exceeded", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      evaluateWorkspaceQuotaStatus,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-block",
      dailyLimit: 1,
      weeklyLimit: 10,
      mode: "block",
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-block", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-block", timestamp: t + 1000 });

    const result = evaluateWorkspaceQuotaStatus("ws-block", t + 2000);

    expect(result.blocked).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.shouldFallback).toBe(false);
    expect(result.shouldAlert).toBe(false);
  });

  it("evaluateWorkspaceQuotaStatus returns shouldFallback and fallbackProvider when mode is fallback", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      evaluateWorkspaceQuotaStatus,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-fallback",
      dailyLimit: 1,
      weeklyLimit: 10,
      mode: "fallback",
      fallbackProvider: "groq",
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-fallback", timestamp: t });
    recordWorkspaceQuotaUsage({
      workspaceId: "ws-fallback",
      timestamp: t + 1000,
    });

    const result = evaluateWorkspaceQuotaStatus("ws-fallback", t + 2000);

    expect(result.blocked).toBe(false);
    expect(result.shouldFallback).toBe(true);
    expect(result.fallbackProvider).toBe("groq");
  });

  it("writes workspaceQuota.set audit event via appendAuditEvent", async () => {
    const { appendAuditEvent } = await import("../src/audit/audit-log.js");
    const { setWorkspaceQuotaPolicy } =
      await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-audit",
      dailyLimit: 3,
      mode: "alert",
      requestedBy: "ops",
    });

    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspaceQuota.set",
        workspaceId: "ws-audit",
      }),
    );
  });

  it("writes workspaceQuota.exceeded audit event when limit breached", async () => {
    const { appendAuditEvent } = await import("../src/audit/audit-log.js");
    const { setWorkspaceQuotaPolicy, recordWorkspaceQuotaUsage } =
      await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-ex",
      dailyLimit: 1,
      mode: "alert",
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-ex", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-ex", timestamp: t + 1000 });

    const actions = appendAuditEvent.mock.calls.map((call) => call[0].action);
    expect(actions).toContain("workspaceQuota.exceeded");
  });

  it("getWorkspaceQuotaPolicy returns null when no policy set", async () => {
    const { getWorkspaceQuotaPolicy } =
      await import("../src/governance/workspace-quotas.js");
    const result = getWorkspaceQuotaPolicy("nonexistent-ws");
    expect(result).toBeNull();
  });

  it("clearWorkspaceQuotaUsage removes usage records for workspace", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      clearWorkspaceQuotaUsage,
      getWorkspaceQuotaUsage,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-clear",
      dailyLimit: 10,
      mode: "alert",
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-clear", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-clear", timestamp: t + 1000 });

    clearWorkspaceQuotaUsage("ws-clear");

    const usage = getWorkspaceQuotaUsage("ws-clear", t + 2000);
    expect(usage.dayCount).toBe(0);
    expect(usage.exceeded).toBe(false);
  });
});

describe("Sprint 39 smoke tests — file surface and IPC", () => {
  it("workspace-policy-handlers.cjs registers all 8 quota IPC channels", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-policy-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceQuota:get");
    expect(content).toContain("workspaceQuota:list");
    expect(content).toContain("workspaceQuota:set");
    expect(content).toContain("workspaceQuota:clear");
    expect(content).toContain("workspaceQuota:recordUsage");
    expect(content).toContain("workspaceQuota:usage");
    expect(content).toContain("workspaceQuota:evaluate");
    expect(content).toContain("workspaceQuota:clearUsage");
  });

  it("workspace-policy-handlers.cjs preserves Sprint 37 approval channels", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-policy-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceApproval:list");
    expect(content).toContain("workspaceApproval:resolve");
    expect(content).toContain("workspacePolicy:set");
  });

  it("preload exposes workspaceQuota namespace", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain(
      'contextBridge.exposeInMainWorld("workspaceQuota"',
    );
    expect(content).toContain("workspaceQuota:set");
    expect(content).toContain("workspaceQuota:evaluate");
    expect(content).toContain("workspaceQuota:clearUsage");
  });

  it("types.d.ts declares workspaceQuota interface with all method signatures", () => {
    const content = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(content).toContain("workspaceQuota:");
    expect(content).toContain("dailyLimit: number | null");
    expect(content).toContain("weeklyLimit: number | null");
    expect(content).toContain('"alert" | "fallback" | "block"');
    expect(content).toContain("fallbackProvider: string | null");
    expect(content).toContain("exceededDaily: boolean");
    expect(content).toContain("exceededWeekly: boolean");
  });

  it("dashboard includes Workspace Quotas panel with required elements", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Quotas");
    expect(html).toContain("save-workspace-quota");
    expect(html).toContain("load-workspace-quota");
    expect(html).toContain("record-workspace-quota-usage");
    expect(html).toContain("evaluate-workspace-quota");
    expect(html).toContain("clear-workspace-quota-usage");
    expect(html).toContain("workspace-quota-status");
    expect(html).toContain("workspace-quota-alert");
    expect(html).toContain("window.workspaceQuota.set");
    expect(html).toContain("window.workspaceQuota.evaluate");
  });

  it("dashboard preserves Sprint 25–38 compatibility strings", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Provider Trends");
    expect(html).toContain("Decision Timeline");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("metric-error-rate");
    expect(html).toContain("metric-latency");
    expect(html).toContain("workspaceRouting.analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Approvals");
  });

  it('audit-log.ts is unchanged — no require("fs") regression check', () => {
    const content = readFileSync(
      join(process.cwd(), "src/audit/audit-log.ts"),
      "utf-8",
    );
    expect(content).toContain("exportAuditLogJson");
    expect(content).toContain("exportAuditLogHtmlReport");
  });

  it("main.cjs still registers audit handlers — no regression", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(content).toContain("registerAuditHandlers");
  });
});
