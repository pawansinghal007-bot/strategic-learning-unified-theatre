import { existsSync, readFileSync } from "fs";
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

vi.mock("../src/audit/audit-log.js", () => ({
  appendAuditEvent: vi.fn(() => ({ seq: 1, action: "mocked", hash: "abc" })),
}));

describe("Sprint 41 smoke tests — threshold detection", () => {
  beforeEach(async () => {
    const s = await import("../src/llm/storage.js");
    s.__resetMockStore();
    vi.clearAllMocks();
  });

  it("thresholdReached is true when dayCount >= ceil(dailyLimit * pct/100)", async () => {
    const { setWorkspaceQuotaPolicy, recordWorkspaceQuotaUsage } =
      await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-thr",
      dailyLimit: 4,
      weeklyLimit: 20,
      mode: "alert",
      alertThresholdPct: 50,
    });

    const t = Date.UTC(2026, 5, 8, 10, 0, 0);
    const r1 = recordWorkspaceQuotaUsage({
      workspaceId: "ws-thr",
      timestamp: t,
    });
    expect(r1.thresholdReached).toBe(false);

    const r2 = recordWorkspaceQuotaUsage({
      workspaceId: "ws-thr",
      timestamp: t + 1000,
    });
    expect(r2.thresholdReached).toBe(true);
    expect(r2.thresholdReachedDaily).toBe(true);
  });

  it("threshold notification pushed when threshold crossed", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      getLatestWorkspaceQuotaNotification,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-nthr",
      dailyLimit: 4,
      weeklyLimit: 20,
      mode: "alert",
      alertThresholdPct: 50,
    });

    const t = Date.UTC(2026, 5, 8, 10, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-nthr", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-nthr", timestamp: t + 1000 });

    const notification = getLatestWorkspaceQuotaNotification("ws-nthr");
    expect(notification).not.toBeNull();
    expect(["threshold", "exceeded"]).toContain(notification.type);
    expect(notification.source).toBe("usage");
  });

  it("exceeded notification pushed when limit crossed", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      getLatestWorkspaceQuotaNotification,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-exc",
      dailyLimit: 1,
      weeklyLimit: 10,
      mode: "alert",
      alertThresholdPct: 80,
    });

    const t = Date.UTC(2026, 5, 8, 10, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-exc", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-exc", timestamp: t + 1000 });

    const latest = getLatestWorkspaceQuotaNotification("ws-exc");
    expect(latest.type).toBe("exceeded");
  });
});

describe("Sprint 41 smoke tests — daily reset scheduler", () => {
  beforeEach(async () => {
    const s = await import("../src/llm/storage.js");
    s.__resetMockStore();
    vi.clearAllMocks();
  });

  it("resetWorkspaceQuotaDaily prunes old records and pushes dailyReset notification", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      resetWorkspaceQuotaDaily,
      getLatestWorkspaceQuotaNotification,
      getWorkspaceQuotaUsage,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-dr",
      dailyLimit: 10,
      mode: "alert",
    });

    const yesterday = Date.UTC(2026, 5, 7, 12, 0, 0);
    const today = Date.UTC(2026, 5, 8, 12, 0, 0);

    recordWorkspaceQuotaUsage({ workspaceId: "ws-dr", timestamp: yesterday });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-dr", timestamp: today });

    const result = resetWorkspaceQuotaDaily(today, "scheduler");
    expect(result.ok).toBe(true);
    expect(result.prunedCount).toBe(1);

    const latest = getLatestWorkspaceQuotaNotification();
    expect(latest.type).toBe("dailyReset");
    expect(latest.source).toBe("scheduler");

    const usage = getWorkspaceQuotaUsage("ws-dr", today);
    expect(usage.dayCount).toBe(1);
  });

  it("shouldRunWorkspaceQuotaDailyReset returns false same day and true next day", async () => {
    const { shouldRunWorkspaceQuotaDailyReset, resetWorkspaceQuotaDaily } =
      await import("../src/governance/workspace-quotas.js");

    const t1 = Date.UTC(2026, 5, 8, 1, 0, 0);
    const t2 = Date.UTC(2026, 5, 8, 23, 0, 0);
    const t3 = Date.UTC(2026, 5, 9, 1, 0, 0);

    expect(shouldRunWorkspaceQuotaDailyReset(t1)).toBe(true);
    resetWorkspaceQuotaDaily(t1, "scheduler");
    expect(shouldRunWorkspaceQuotaDailyReset(t2)).toBe(false);
    expect(shouldRunWorkspaceQuotaDailyReset(t3)).toBe(true);
  });

  it("listWorkspaceQuotaNotifications filters by workspaceId", async () => {
    const {
      setWorkspaceQuotaPolicy,
      recordWorkspaceQuotaUsage,
      listWorkspaceQuotaNotifications,
    } = await import("../src/governance/workspace-quotas.js");

    setWorkspaceQuotaPolicy({
      workspaceId: "ws-fa",
      dailyLimit: 1,
      mode: "alert",
      alertThresholdPct: 50,
    });
    setWorkspaceQuotaPolicy({
      workspaceId: "ws-fb",
      dailyLimit: 1,
      mode: "alert",
      alertThresholdPct: 50,
    });

    const t = Date.UTC(2026, 5, 8, 10, 0, 0);
    recordWorkspaceQuotaUsage({ workspaceId: "ws-fa", timestamp: t });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-fa", timestamp: t + 1000 });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-fb", timestamp: t + 2000 });

    const rowsA = listWorkspaceQuotaNotifications("ws-fa");
    const rowsB = listWorkspaceQuotaNotifications("ws-fb");

    expect(rowsA.every((r) => r.workspaceId === "ws-fa")).toBe(true);
    expect(rowsB.every((r) => r.workspaceId === "ws-fb")).toBe(true);
    expect(rowsA.length).toBeGreaterThan(0);
  });
});

describe("Sprint 41 smoke tests — file surface", () => {
  it("workspace-policy-handlers.cjs registers 3 new channels and broadcast", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-policy-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceQuota:latestNotification");
    expect(content).toContain("workspaceQuota:notifications");
    expect(content).toContain("workspaceQuota:resetDaily");
    expect(content).toContain("broadcastQuotaNotification");
    expect(content).toContain('webContents.send("workspaceQuota:notification"');
  });

  it("workspace-policy-handlers.cjs preserves Sprint 40 channels", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-policy-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceQuota:get");
    expect(content).toContain("workspaceQuota:rollup");
    expect(content).toContain("workspaceApproval:list");
  });

  it("preload exposes Sprint 41 methods on workspaceQuota", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain("latestNotification: (workspaceId)");
    expect(content).toContain("workspaceQuota:latestNotification");
    expect(content).toContain("workspaceQuota:resetDaily");
    expect(content).toContain("onNotification(handler)");
    expect(content).toContain('ipcRenderer.on("workspaceQuota:notification"');
  });

  it("types.d.ts declares alertThresholdPct, thresholdReached, and notification types", () => {
    const content = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(content).toContain("alertThresholdPct: number | null");
    expect(content).toContain("thresholdReached: boolean");
    expect(content).toContain('"threshold" | "exceeded" | "dailyReset"');
    expect(content).toContain('"usage" | "scheduler" | "manual"');
    expect(content).toContain("onNotification:");
  });

  it("dashboard has Sprint 41 live notification elements", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("workspace-quota-live-alert");
    expect(html).toContain("load-workspace-quota-latest-notification");
    expect(html).toContain("reset-workspace-quota-daily");
    expect(html).toContain("window.workspaceQuota.onNotification");
    expect(html).toContain("workspaceQuota:notification");
  });

  it("dashboard preserves Sprint 25–40 compatibility strings", () => {
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
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
    expect(html).toContain("load-workspace-quota-rollup");
  });

  it("main.cjs includes scheduler lifecycle hooks", () => {
    const content = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(content).toContain("runScheduledQuotaReset");
    expect(content).toContain("startQuotaResetScheduler");
    expect(content).toContain("stopQuotaResetScheduler");
    expect(content).toContain("setInterval");
    expect(content).toContain("shouldRunWorkspaceQuotaDailyReset");
  });

  it("audit-log.ts and audit-handlers.cjs unchanged", () => {
    const audit = readFileSync(
      join(process.cwd(), "src/audit/audit-log.ts"),
      "utf-8",
    );
    expect(audit).toContain("exportAuditLogJson");
    const handlers = readFileSync(
      join(process.cwd(), "electron-ui/ipc/audit-handlers.cjs"),
      "utf-8",
    );
    expect(handlers).toContain("audit:exportJson");
  });
});
