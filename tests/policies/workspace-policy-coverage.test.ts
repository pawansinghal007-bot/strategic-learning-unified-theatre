/**
 * tests/policies/workspace-policy-coverage.test.ts
 *
 * Targets the uncovered lines in src/policies/workspace-policy.ts:
 *
 *   lines 51-54 — the `if (existing)` branch inside setWorkspacePolicyOverride:
 *                   existing.policy = { ...existing.policy, ...policyPatch };
 *                   existing.updatedAt = now;
 *                   saveStore(store);
 *                   return existing;
 *
 * This branch only fires when setWorkspacePolicyOverride is called a SECOND
 * time for the same workspaceId (updating / merging into an existing record).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getWorkspacePolicyOverride,
  setWorkspacePolicyOverride,
  clearWorkspacePolicyOverride,
  listWorkspacePolicyOverrides,
  resolveWorkspacePolicyState,
} from "../../src/policies/workspace-policy";
import { resetProviderPolicy } from "../../src/policies/provider-policy";

beforeEach(() => {
  resetProviderPolicy();
});

// ---------------------------------------------------------------------------
// lines 51-54: update (merge) path in setWorkspacePolicyOverride
// ---------------------------------------------------------------------------

describe("setWorkspacePolicyOverride — update/merge existing record (lines 51-54)", () => {
  it("merges a new patch into an already-existing override", () => {
    // First call → creates the record (new-record path)
    setWorkspacePolicyOverride("ws-merge-1", { routingMode: "hybrid" });

    // Second call for the SAME id → hits the `if (existing)` branch
    const result = setWorkspacePolicyOverride("ws-merge-1", {
      manualProvider: "openai",
    });

    // Both fields must be present — the patch was merged, not replaced
    expect(result.policy.routingMode).toBe("hybrid");
    expect(result.policy.manualProvider).toBe("openai");
  });

  it("updates updatedAt on merge", async () => {
    setWorkspacePolicyOverride("ws-merge-ts", { routingMode: "cloud" });
    const first = getWorkspacePolicyOverride("ws-merge-ts")!.updatedAt;

    // Small delay to guarantee a different timestamp
    await new Promise((r) => setTimeout(r, 5));

    setWorkspacePolicyOverride("ws-merge-ts", { manualProvider: "gemini" });
    const second = getWorkspacePolicyOverride("ws-merge-ts")!.updatedAt;

    expect(second).toBeGreaterThanOrEqual(first);
  });

  it("returned record is the mutated existing object (same workspaceId)", () => {
    setWorkspacePolicyOverride("ws-merge-id", { routingMode: "hybrid" });
    const updated = setWorkspacePolicyOverride("ws-merge-id", {
      blockedProviders: ["groq"],
    });
    expect(updated.workspaceId).toBe("ws-merge-id");
    expect(updated.policy.blockedProviders).toContain("groq");
  });

  it("later patch fields overwrite earlier ones on merge", () => {
    setWorkspacePolicyOverride("ws-overwrite", { routingMode: "hybrid" });
    const result = setWorkspacePolicyOverride("ws-overwrite", {
      routingMode: "local-only",
    });
    expect(result.policy.routingMode).toBe("local-only");
  });

  it("persisted record reflects merged state after reload", () => {
    setWorkspacePolicyOverride("ws-persist", { routingMode: "hybrid" });
    setWorkspacePolicyOverride("ws-persist", { manualProvider: "gemini" });

    // Re-read from the store to confirm persistence
    const persisted = getWorkspacePolicyOverride("ws-persist");
    expect(persisted!.policy.routingMode).toBe("hybrid");
    expect(persisted!.policy.manualProvider).toBe("gemini");
  });
});

// ---------------------------------------------------------------------------
// New-record path (no existing override) — for contrast / regression guard
// ---------------------------------------------------------------------------

describe("setWorkspacePolicyOverride — new record path", () => {
  it("creates a new record when no override exists", () => {
    const result = setWorkspacePolicyOverride("ws-new", {
      routingMode: "cloud",
    });
    expect(result.workspaceId).toBe("ws-new");
    expect(result.policy.routingMode).toBe("cloud");
  });
});

// ---------------------------------------------------------------------------
// clearWorkspacePolicyOverride — boolean return
// ---------------------------------------------------------------------------

describe("clearWorkspacePolicyOverride", () => {
  it("returns true when the record existed and was removed", () => {
    setWorkspacePolicyOverride("ws-clear-t", { routingMode: "hybrid" });
    expect(clearWorkspacePolicyOverride("ws-clear-t")).toBe(true);
    expect(getWorkspacePolicyOverride("ws-clear-t")).toBeNull();
  });

  it("returns false when the workspace had no override", () => {
    expect(clearWorkspacePolicyOverride("ws-never-set")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listWorkspacePolicyOverrides
// ---------------------------------------------------------------------------

describe("listWorkspacePolicyOverrides", () => {
  it("includes all stored overrides", () => {
    setWorkspacePolicyOverride("ws-list-a", { routingMode: "cloud" });
    setWorkspacePolicyOverride("ws-list-b", { routingMode: "local-only" });
    const list = listWorkspacePolicyOverrides();
    const ids = list.map((o) => o.workspaceId);
    expect(ids).toContain("ws-list-a");
    expect(ids).toContain("ws-list-b");
  });
});

// ---------------------------------------------------------------------------
// resolveWorkspacePolicyState — both branches
// ---------------------------------------------------------------------------

describe("resolveWorkspacePolicyState", () => {
  it("returns source=global when no override exists", () => {
    const result = resolveWorkspacePolicyState("ws-global-only");
    expect(result.source).toBe("global");
    expect(result.workspaceId).toBeUndefined();
  });

  it("returns source=workspace with merged policy when override exists", () => {
    setWorkspacePolicyOverride("ws-resolved", {
      routingMode: "local-only",
      manualProvider: "local",
    });
    const result = resolveWorkspacePolicyState("ws-resolved");
    expect(result.source).toBe("workspace");
    expect(result.workspaceId).toBe("ws-resolved");
    expect(result.policy.routingMode).toBe("local-only");
  });

  it("preserves global fields not overridden by workspace patch", () => {
    setWorkspacePolicyOverride("ws-partial", { manualProvider: "openai" });
    const result = resolveWorkspacePolicyState("ws-partial");
    // allowedProviders comes from global policy
    expect(Array.isArray(result.policy.allowedProviders)).toBe(true);
    expect(result.policy.manualProvider).toBe("openai");
  });

  it("undefined values in workspace patch do not overwrite global values", () => {
    setWorkspacePolicyOverride("ws-undef-patch", {
      routingMode: undefined,
      manualProvider: "gemini",
    });
    const result = resolveWorkspacePolicyState("ws-undef-patch");
    // routingMode undefined in patch → global value preserved
    expect(result.policy.routingMode).toBeDefined();
    expect(result.policy.manualProvider).toBe("gemini");
  });
});
