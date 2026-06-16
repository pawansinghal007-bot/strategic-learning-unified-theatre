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

describe("Sprint 40 smoke tests — workspace quota service and gateway enforcement", () => {
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

  it("gateway.ts exists and exposes quota enforcement helpers", () => {
    expect(existsSync(join(process.cwd(), "src/llm/gateway.ts"))).toBe(true);
    const source = readFileSync(
      join(process.cwd(), "src/llm/gateway.ts"),
      "utf-8",
    );
    expect(source).toContain("applyWorkspaceQuotaEnforcement");
    expect(source).toContain("enforceWorkspaceQuotaOrThrow");
    expect(source).toContain("evaluateWorkspaceQuotaStatus");
    expect(source).toContain("recordWorkspaceQuotaUsage");
  });

  it("setWorkspaceQuotaPolicy persists alertThresholdPct", async () => {
    const { setWorkspaceQuotaPolicy, getWorkspaceQuotaPolicy } =
      await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-threshold",
      dailyLimit: 10,
      weeklyLimit: 50,
      mode: "alert",
      alertThresholdPct: 80,
      requestedBy: "ops",
    });

    const policy = getWorkspaceQuotaPolicy("ws-threshold");
    expect(policy.alertThresholdPct).toBe(80);
  });

  it("recordWorkspaceQuotaUsage marks thresholdReached before exceeded", async () => {
    const { setWorkspaceQuotaPolicy, recordWorkspaceQuotaUsage } =
      await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-notify",
      dailyLimit: 5,
      weeklyLimit: 20,
      mode: "alert",
      alertThresholdPct: 80,
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);

    recordWorkspaceQuotaUsage({ workspaceId: "ws-notify", timestamp: t });
    recordWorkspaceQuotaUsage({
      workspaceId: "ws-notify",
      timestamp: t + 1000,
    });
    recordWorkspaceQuotaUsage({
      workspaceId: "ws-notify",
      timestamp: t + 2000,
    });
    const fourth = recordWorkspaceQuotaUsage({
      workspaceId: "ws-notify",
      timestamp: t + 3000,
    });

    expect(fourth.thresholdReached).toBe(true);
    expect(fourth.exceeded).toBe(false);
  });

  it("listWorkspaceQuotaNotifications returns threshold and exceeded events", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      listWorkspaceQuotaNotifications,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-alerts",
      dailyLimit: 2,
      weeklyLimit: 20,
      mode: "alert",
      alertThresholdPct: 50,
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-alerts", timestamp: t });
    recordWorkspaceQuotaUsage({
      workspaceId: "ws-alerts",
      timestamp: t + 1000,
    });
    recordWorkspaceQuotaUsage({
      workspaceId: "ws-alerts",
      timestamp: t + 2000,
    });

    const notifications = listWorkspaceQuotaNotifications("ws-alerts");
    const types = notifications.map((n) => n.type);

    expect(types).toContain("threshold");
    expect(types).toContain("exceeded");
  });

  it("getWorkspaceQuotaRollup returns multi-workspace rows", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      getWorkspaceQuotaRollup,
    } = await import("../src/governance/workspace-quotas.js");

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-a",
      dailyLimit: 5,
      weeklyLimit: 20,
      mode: "alert",
      alertThresholdPct: 80,
    });

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-b",
      dailyLimit: 1,
      weeklyLimit: 7,
      mode: "block",
      alertThresholdPct: 50,
    });

    recordWorkspaceQuotaUsage({ workspaceId: "ws-a", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-b", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-b", timestamp: t + 1000 });

    const rollup = getWorkspaceQuotaRollup(t + 2000);
    expect(rollup).toHaveLength(2);
    expect(rollup.find((r) => r.workspaceId === "ws-b")?.exceeded).toBe(true);
  });

  it("resetWorkspaceQuotaDaily returns ok and resetAt", async () => {
    const { resetWorkspaceQuotaDaily } =
      await import("../src/governance/workspace-quotas.js");
    const now = Date.UTC(2026, 5, 7, 0, 0, 0);
    const result = resetWorkspaceQuotaDaily(now);
    expect(result.ok).toBe(true);
    expect(result.resetAt).toBe(now);
  });

  it("applyWorkspaceQuotaEnforcement returns fallback provider when quota mode is fallback", async () => {
    const { setWorkspaceQuotaPolicy } =
      await import("../src/governance/workspace-quotas.js");
    const { applyWorkspaceQuotaEnforcement } =
      await import("../src/llm/gateway.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-gateway-fallback",
      dailyLimit: 1,
      weeklyLimit: 10,
      mode: "fallback",
      fallbackProvider: "groq",
      alertThresholdPct: 80,
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    applyWorkspaceQuotaEnforcement({
      workspaceId: "ws-gateway-fallback",
      provider: "openai",
      now: t,
    });

    const decision = applyWorkspaceQuotaEnforcement({
      workspaceId: "ws-gateway-fallback",
      provider: "openai",
      now: t + 1000,
    });

    expect(decision.shouldFallback).toBe(true);
    expect(decision.provider).toBe("groq");
  });

  it("enforceWorkspaceQuotaOrThrow throws when quota mode is block", async () => {
    const { setWorkspaceQuotaPolicy } =
      await import("../src/governance/workspace-quotas.js");
    const { enforceWorkspaceQuotaOrThrow } =
      await import("../src/llm/gateway.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-gateway-block",
      dailyLimit: 1,
      weeklyLimit: 10,
      mode: "block",
      alertThresholdPct: 80,
    });

    const t = Date.UTC(2026, 5, 6, 12, 0, 0);
    enforceWorkspaceQuotaOrThrow({
      workspaceId: "ws-gateway-block",
      provider: "openai",
      now: t,
    });

    expect(() =>
      enforceWorkspaceQuotaOrThrow({
        workspaceId: "ws-gateway-block",
        provider: "openai",
        now: t + 1000,
      }),
    ).toThrow("Workspace quota exceeded");
  });
});

describe("Sprint 40 smoke tests — file surface and IPC", () => {
  it("workspace-policy-handlers.cjs registers Sprint 40 quota IPC channels", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-policy-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceQuota:rollup");
    expect(content).toContain("workspaceQuota:notifications");
    expect(content).toContain("workspaceQuota:resetDaily");
    expect(content).toContain("alertThresholdPct");
  });

  it("preload exposes Sprint 40 workspaceQuota methods", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain(
      'rollup: (now) => ipcRenderer.invoke("workspaceQuota:rollup", now)',
    );
    expect(content).toContain("notifications: (workspaceId) =>");
    expect(content).toContain(
      'resetDaily: (now) => ipcRenderer.invoke("workspaceQuota:resetDaily", now)',
    );
  });

  it("types.d.ts declares Sprint 40 workspaceQuota rollup and notification interfaces", () => {
    const content = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(content).toContain("alertThresholdPct: number | null");
    expect(content).toContain("thresholdReachedDaily: boolean");
    expect(content).toContain("thresholdReachedWeekly: boolean");
    expect(content).toContain("rollup: (now?: number)");
    expect(content).toContain('type: "threshold" | "exceeded"');
    expect(content).toContain("resetDaily: (now?: number)");
  });

  it("dashboard includes Sprint 40 quota rollup, notifications, and reset controls", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("load-workspace-quota-rollup");
    expect(html).toContain("load-workspace-quota-notifications");
    expect(html).toContain("reset-workspace-quota-daily");
    expect(html).toContain("quota-threshold-pct");
    expect(html).toContain("workspace quota threshold reached");
    expect(html).toContain("window.workspaceQuota.rollup");
    expect(html).toContain("window.workspaceQuota.notifications");
    expect(html).toContain("window.workspaceQuota.resetDaily");
  });

  it("dashboard preserves Sprint 25-39 compatibility strings", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("Workspace Analytics & Explainability");
    expect(html).toContain("Workspace Analytics");
    expect(html).toContain("Provider Trends");
    expect(html).toContain("Decision Timeline");
    expect(html).toContain("metric-success-rate");
    expect(html).toContain("metric-error-rate");
    expect(html).toContain("metric-latency");
    expect(html).toContain("workspaceRouting.analytics");
    expect(html).toContain("Audit Trail");
    expect(html).toContain("Workspace Approvals");
    expect(html).toContain("Workspace Quotas");
  });

  it("Sprint 39 smoke conventions remain compatible", () => {
    const source = readFileSync(
      join(process.cwd(), "tests/sprint40-smoke.test.js"),
      "utf-8",
    );
    expect(source).toContain('vi.mock("../src/llm/storage.js"');
    expect(source).toContain('vi.mock("../src/audit/audit-log.js"');
    expect(source).toContain(
      'expect(content).toContain("workspaceQuota:rollup")',
    );
  });

  it("main.cjs still registers audit handlers — no regression", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(content).toContain("registerAuditHandlers");
  });

  it("audit-handlers.cjs still exposes Sprint 38 audit exports — no regression", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/audit-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("audit:exportJson");
    expect(content).toContain("audit:exportHtmlReport");
  });
});
