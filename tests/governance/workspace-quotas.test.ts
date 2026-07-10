/**
 * tests/governance/workspace-quotas.test.ts
 *
 * Unit tests for src/governance/workspace-quotas.ts
 *
 * Uncovered lines targeted:
 *   142 — setWorkspaceQuotaPolicy: `else if (existingIndex >= 0)` branch —
 *          alertThresholdPct is NOT in the new input but an existing policy
 *          exists → the stored value is inherited.
 *   159 — setWorkspaceQuotaPolicy: `if (existingIndex >= 0)` update path —
 *          overwriting an already-stored policy (all prior tests only create).
 *   202-214 — clearWorkspaceQuotaPolicy: entire function was untested.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock storage — key/value in-memory store, never touches the filesystem.
// ---------------------------------------------------------------------------
const mockDb: Record<string, unknown> = {};

vi.mock("../../src/llm/storage.js", () => ({
  readJsonFile: (file: string, fallback: unknown) =>
    file in mockDb
      ? JSON.parse(JSON.stringify(mockDb[file]))
      : JSON.parse(JSON.stringify(fallback)),
  writeJsonFile: (file: string, value: unknown) => {
    mockDb[file] = JSON.parse(JSON.stringify(value));
  },
}));

// Audit log is a side-effect only — mock it so tests don't depend on its
// internal storage or hash-chain state.
vi.mock("../../src/audit/audit-log.js", () => ({
  appendAuditEvent: vi.fn(),
}));

import {
  setWorkspaceQuotaPolicy,
  getWorkspaceQuotaPolicy,
  listWorkspaceQuotaPolicies,
  clearWorkspaceQuotaPolicy,
  clearWorkspaceQuotaUsage,
  recordWorkspaceQuotaUsage,
  getWorkspaceQuotaUsage,
  evaluateWorkspaceQuotaStatus,
  getWorkspaceQuotaRollup,
  listWorkspaceQuotaNotifications,
  getLatestWorkspaceQuotaNotification,
  shouldRunWorkspaceQuotaDailyReset,
  resetWorkspaceQuotaDaily,
} from "../../src/governance/workspace-quotas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  for (const key of Object.keys(mockDb)) delete mockDb[key];
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setWorkspaceQuotaPolicy — line 142: alertThresholdPct inherited from
//   existing policy when not supplied in update input.
// line 159: existing policy is overwritten in-place (update path).
// ---------------------------------------------------------------------------
describe("setWorkspaceQuotaPolicy", () => {
  it("creates a new policy with all supplied fields", () => {
    const policy = setWorkspaceQuotaPolicy({
      workspaceId: "ws-create",
      dailyLimit: 100,
      weeklyLimit: 500,
      mode: "alert",
      alertThresholdPct: 80,
    });

    expect(policy.workspaceId).toBe("ws-create");
    expect(policy.dailyLimit).toBe(100);
    expect(policy.weeklyLimit).toBe(500);
    expect(policy.mode).toBe("alert");
    expect(policy.alertThresholdPct).toBe(80);
    expect(policy.fallbackProvider).toBeNull();
    expect(policy.createdAt).toBe(policy.updatedAt);
  });

  it("updates an existing policy and preserves createdAt (line 159)", () => {
    // First call — creates the policy.
    const original = setWorkspaceQuotaPolicy({
      workspaceId: "ws-update",
      dailyLimit: 50,
      mode: "alert",
      alertThresholdPct: 75,
    });

    // Second call — updates the policy: this exercises existingIndex >= 0
    // (line 159: store.policies[existingIndex] = next).
    const updated = setWorkspaceQuotaPolicy({
      workspaceId: "ws-update",
      dailyLimit: 200,
      mode: "block",
      alertThresholdPct: 90,
    });

    expect(updated.dailyLimit).toBe(200);
    expect(updated.mode).toBe("block");
    expect(updated.alertThresholdPct).toBe(90);
    // createdAt is preserved from the original record.
    expect(updated.createdAt).toBe(original.createdAt);
    // updatedAt changes.
    expect(updated.updatedAt).toBeGreaterThanOrEqual(original.updatedAt);

    // Only one policy in the store (not duplicated).
    const all = listWorkspaceQuotaPolicies();
    expect(all.filter((p) => p.workspaceId === "ws-update").length).toBe(1);
  });

  it("inherits alertThresholdPct from existing policy when not supplied in update (line 142)", () => {
    // Create with an alertThresholdPct.
    setWorkspaceQuotaPolicy({
      workspaceId: "ws-inherit",
      dailyLimit: 100,
      mode: "alert",
      alertThresholdPct: 70,
    });

    // Update without providing alertThresholdPct → should inherit 70
    // from the stored record. This exercises the `else if (existingIndex >= 0)`
    // branch at line 142.
    const updated = setWorkspaceQuotaPolicy({
      workspaceId: "ws-inherit",
      dailyLimit: 200,
      mode: "fallback",
      // alertThresholdPct intentionally omitted
    });

    expect(updated.alertThresholdPct).toBe(70); // inherited from prior record
    expect(updated.dailyLimit).toBe(200);
  });

  it("sets alertThresholdPct to null for a brand-new policy with no alertThresholdPct", () => {
    const policy = setWorkspaceQuotaPolicy({
      workspaceId: "ws-no-threshold",
      dailyLimit: 10,
      mode: "alert",
      // alertThresholdPct intentionally omitted — new policy, no existing record
    });
    expect(policy.alertThresholdPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearWorkspaceQuotaPolicy — lines 202-214: entire function untested
// ---------------------------------------------------------------------------
describe("clearWorkspaceQuotaPolicy", () => {
  it("removes only the specified workspace policy (lines 202-214)", () => {
    setWorkspaceQuotaPolicy({ workspaceId: "ws-a", dailyLimit: 10, mode: "alert" });
    setWorkspaceQuotaPolicy({ workspaceId: "ws-b", dailyLimit: 20, mode: "alert" });

    const result = clearWorkspaceQuotaPolicy("ws-a", "admin");

    expect(result).toEqual({ ok: true });
    expect(getWorkspaceQuotaPolicy("ws-a")).toBeNull();
    // ws-b must still be present.
    expect(getWorkspaceQuotaPolicy("ws-b")).not.toBeNull();
  });

  it("is a no-op when the workspace has no policy", () => {
    const result = clearWorkspaceQuotaPolicy("ws-nonexistent");
    expect(result).toEqual({ ok: true });
  });

  it("fires the workspaceQuota.clear audit event", async () => {
    const { appendAuditEvent } = await import("../../src/audit/audit-log.js");
    setWorkspaceQuotaPolicy({ workspaceId: "ws-audit", dailyLimit: 5, mode: "alert" });

    clearWorkspaceQuotaPolicy("ws-audit", "operator");

    const auditCalls = vi.mocked(appendAuditEvent).mock.calls;
    const clearCall = auditCalls.find(
      ([e]) => (e as { action: string }).action === "workspaceQuota.clear",
    );
    expect(clearCall).toBeDefined();
    const event = clearCall![0] as { workspaceId: string; actor: { id?: string } };
    expect(event.workspaceId).toBe("ws-audit");
    expect(event.actor.id).toBe("operator");
  });
});

// ---------------------------------------------------------------------------
// clearWorkspaceQuotaUsage
// ---------------------------------------------------------------------------
describe("clearWorkspaceQuotaUsage", () => {
  it("clears usage for a specific workspace only", () => {
    const now = Date.now();
    setWorkspaceQuotaPolicy({ workspaceId: "ws-x", dailyLimit: 100, mode: "alert" });
    setWorkspaceQuotaPolicy({ workspaceId: "ws-y", dailyLimit: 100, mode: "alert" });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-x", timestamp: now });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-y", timestamp: now });

    clearWorkspaceQuotaUsage("ws-x");

    expect(getWorkspaceQuotaUsage("ws-x", now).dayCount).toBe(0);
    expect(getWorkspaceQuotaUsage("ws-y", now).dayCount).toBe(1);
  });

  it("clears all usage when no workspaceId given", () => {
    const now = Date.now();
    setWorkspaceQuotaPolicy({ workspaceId: "ws-x", dailyLimit: 100, mode: "alert" });
    setWorkspaceQuotaPolicy({ workspaceId: "ws-y", dailyLimit: 100, mode: "alert" });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-x", timestamp: now });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-y", timestamp: now });

    clearWorkspaceQuotaUsage();

    expect(getWorkspaceQuotaUsage("ws-x", now).dayCount).toBe(0);
    expect(getWorkspaceQuotaUsage("ws-y", now).dayCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// recordWorkspaceQuotaUsage — threshold and exceeded notification paths
// ---------------------------------------------------------------------------
describe("recordWorkspaceQuotaUsage — notification branches", () => {
  it("fires a threshold notification when usage crosses alertThresholdPct", () => {
    // dailyLimit=10, threshold=80% → fires at count >= ceil(10*0.8)=8
    setWorkspaceQuotaPolicy({
      workspaceId: "ws-thresh",
      dailyLimit: 10,
      mode: "alert",
      alertThresholdPct: 80,
    });
    const now = Date.now();
    for (let i = 0; i < 8; i++) {
      recordWorkspaceQuotaUsage({ workspaceId: "ws-thresh", timestamp: now + i });
    }

    const notifications = listWorkspaceQuotaNotifications("ws-thresh");
    expect(notifications.some((n) => n.type === "threshold")).toBe(true);
  });

  it("fires an exceeded notification when daily limit is crossed", () => {
    setWorkspaceQuotaPolicy({
      workspaceId: "ws-exceed",
      dailyLimit: 3,
      mode: "block",
    });
    const now = Date.now();
    // Record 4 usages — 4th one pushes dayCount > 3
    for (let i = 0; i < 4; i++) {
      recordWorkspaceQuotaUsage({ workspaceId: "ws-exceed", timestamp: now + i });
    }

    const notifications = listWorkspaceQuotaNotifications("ws-exceed");
    expect(notifications.some((n) => n.type === "exceeded")).toBe(true);
  });

  it("does not fire duplicate threshold notifications for the same day", () => {
    setWorkspaceQuotaPolicy({
      workspaceId: "ws-dedup",
      dailyLimit: 10,
      mode: "alert",
      alertThresholdPct: 50,
    });
    const now = Date.now();
    // Push past threshold twice in the same day
    for (let i = 0; i < 8; i++) {
      recordWorkspaceQuotaUsage({ workspaceId: "ws-dedup", timestamp: now + i });
    }

    const thresholdNotifications = listWorkspaceQuotaNotifications("ws-dedup")
      .filter((n) => n.type === "threshold");
    expect(thresholdNotifications.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// evaluateWorkspaceQuotaStatus
// ---------------------------------------------------------------------------
describe("evaluateWorkspaceQuotaStatus", () => {
  it("returns allowed=true, blocked=false when not exceeded", () => {
    setWorkspaceQuotaPolicy({ workspaceId: "ws-ok", dailyLimit: 100, mode: "block" });
    const result = evaluateWorkspaceQuotaStatus("ws-ok");
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.shouldFallback).toBe(false);
  });

  it("blocks when mode=block and daily limit exceeded", () => {
    setWorkspaceQuotaPolicy({ workspaceId: "ws-block", dailyLimit: 2, mode: "block" });
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      recordWorkspaceQuotaUsage({ workspaceId: "ws-block", timestamp: now + i });
    }
    const result = evaluateWorkspaceQuotaStatus("ws-block", now + 3);
    expect(result.blocked).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it("returns shouldFallback=true and fallbackProvider when mode=fallback", () => {
    setWorkspaceQuotaPolicy({
      workspaceId: "ws-fallback",
      dailyLimit: 1,
      mode: "fallback",
      fallbackProvider: "openai",
    });
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      recordWorkspaceQuotaUsage({ workspaceId: "ws-fallback", timestamp: now + i });
    }
    const result = evaluateWorkspaceQuotaStatus("ws-fallback", now + 2);
    expect(result.shouldFallback).toBe(true);
    expect(result.fallbackProvider).toBe("openai");
    expect(result.allowed).toBe(true);
  });

  it("returns shouldAlert=true when mode=alert and exceeded", () => {
    setWorkspaceQuotaPolicy({ workspaceId: "ws-alert", dailyLimit: 1, mode: "alert" });
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      recordWorkspaceQuotaUsage({ workspaceId: "ws-alert", timestamp: now + i });
    }
    const result = evaluateWorkspaceQuotaStatus("ws-alert", now + 2);
    expect(result.shouldAlert).toBe(true);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getWorkspaceQuotaRollup
// ---------------------------------------------------------------------------
describe("getWorkspaceQuotaRollup", () => {
  it("returns an entry for each policy with current usage", () => {
    setWorkspaceQuotaPolicy({ workspaceId: "ws-rollup-a", dailyLimit: 50, mode: "alert" });
    setWorkspaceQuotaPolicy({ workspaceId: "ws-rollup-b", dailyLimit: 100, mode: "block" });
    const now = Date.now();
    recordWorkspaceQuotaUsage({ workspaceId: "ws-rollup-a", timestamp: now });

    const rollup = getWorkspaceQuotaRollup(now);
    const entryA = rollup.find((r) => r.workspaceId === "ws-rollup-a");
    const entryB = rollup.find((r) => r.workspaceId === "ws-rollup-b");

    expect(entryA).toBeDefined();
    expect(entryA!.dayCount).toBe(1);
    expect(entryB!.dayCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// shouldRunWorkspaceQuotaDailyReset / resetWorkspaceQuotaDaily
// ---------------------------------------------------------------------------
describe("shouldRunWorkspaceQuotaDailyReset", () => {
  it("returns true when lastDailyResetAt is null (never reset)", () => {
    expect(shouldRunWorkspaceQuotaDailyReset()).toBe(true);
  });

  it("returns false when already reset today", () => {
    const now = Date.now();
    resetWorkspaceQuotaDaily(now);
    expect(shouldRunWorkspaceQuotaDailyReset(now)).toBe(false);
  });

  it("returns true when last reset was a different day", () => {
    const yesterday = Date.now() - 86_400_000;
    resetWorkspaceQuotaDaily(yesterday);
    expect(shouldRunWorkspaceQuotaDailyReset(Date.now())).toBe(true);
  });
});

describe("resetWorkspaceQuotaDaily", () => {
  it("prunes usage records from previous days and returns prunedCount", () => {
    const yesterday = Date.now() - 86_400_000;
    const now = Date.now();
    setWorkspaceQuotaPolicy({ workspaceId: "ws-reset", dailyLimit: 100, mode: "alert" });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-reset", timestamp: yesterday });
    recordWorkspaceQuotaUsage({ workspaceId: "ws-reset", timestamp: now });

    const result = resetWorkspaceQuotaDaily(now, "scheduler");

    expect(result.ok).toBe(true);
    expect(result.prunedCount).toBe(1); // yesterday's record pruned
    expect(result.resetAt).toBe(now);
  });

  it("adds a dailyReset notification", () => {
    const now = Date.now();
    resetWorkspaceQuotaDaily(now, "manual");
    const latest = getLatestWorkspaceQuotaNotification("__global__");
    expect(latest).not.toBeNull();
    expect(latest!.type).toBe("dailyReset");
    expect(latest!.source).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// getLatestWorkspaceQuotaNotification
// ---------------------------------------------------------------------------
describe("getLatestWorkspaceQuotaNotification", () => {
  it("returns null when there are no notifications", () => {
    expect(getLatestWorkspaceQuotaNotification("ws-none")).toBeNull();
  });
});
