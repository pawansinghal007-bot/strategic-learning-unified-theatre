/**
 * tests/governance/workspace-approvals.test.ts
 *
 * Unit tests for src/governance/workspace-approvals.ts
 *
 * Uncovered lines targeted:
 *   65  — createWorkspaceApprovalRequest: eviction slice when
 *         store.approvals.length > MAX_APPROVALS (2000).
 *   113 — resolveWorkspaceApprovalRequest: early `return null` when the
 *         requested approvalId does not exist in the store.
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
  createWorkspaceApprovalRequest,
  resolveWorkspaceApprovalRequest,
  listWorkspaceApprovalRequests,
  getWorkspaceApprovalRequest,
  clearWorkspaceApprovals,
} from "../../src/governance/workspace-approvals.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_INPUT = {
  workspaceId: "ws-test",
  policyChange: { allowedProviders: ["openai"] },
  requestedBy: "admin",
  reason: "policy update",
};

beforeEach(() => {
  // Reset in-memory DB before every test.
  for (const key of Object.keys(mockDb)) delete mockDb[key];
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createWorkspaceApprovalRequest — line 65: MAX_APPROVALS eviction
// ---------------------------------------------------------------------------
describe("createWorkspaceApprovalRequest", () => {
  it("creates a pending record with all expected fields", () => {
    const record = createWorkspaceApprovalRequest(BASE_INPUT);

    expect(record.workspaceId).toBe("ws-test");
    expect(record.status).toBe("pending");
    expect(record.policyChange).toEqual({ allowedProviders: ["openai"] });
    expect(record.requestedBy).toBe("admin");
    expect(record.reason).toBe("policy update");
    expect(record.reviewedBy).toBeNull();
    expect(record.reviewNote).toBeNull();
    expect(typeof record.id).toBe("string");
    expect(record.createdAt).toBe(record.updatedAt);
  });

  it("uses the provided timestamp when given", () => {
    const ts = 1_700_000_000_000;
    const record = createWorkspaceApprovalRequest({ ...BASE_INPUT, timestamp: ts });
    expect(record.createdAt).toBe(ts);
    expect(record.updatedAt).toBe(ts);
  });

  it("evicts oldest entries so the store never exceeds MAX_APPROVALS (line 65)", () => {
    // Pre-fill the store with exactly MAX_APPROVALS (2000) entries.
    const existing = Array.from({ length: 2000 }, (_, i) => ({
      id: `approval-${i + 1}-0`,
      workspaceId: "ws-old",
      status: "pending" as const,
      policyChange: {},
      requestedBy: null,
      reviewedBy: null,
      reason: null,
      reviewNote: null,
      createdAt: i,
      updatedAt: i,
    }));
    mockDb["workspace-approvals.json"] = { approvals: existing };

    // Adding one more triggers the slice (length goes to 2001, then back to 2000).
    const newRecord = createWorkspaceApprovalRequest(BASE_INPUT);

    const stored = mockDb["workspace-approvals.json"] as { approvals: unknown[] };
    expect(stored.approvals.length).toBe(2000);

    // The oldest entry (id approval-1-0) must have been dropped.
    const ids = (stored.approvals as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain("approval-1-0");

    // The newest entry must be the one we just created.
    expect(ids[ids.length - 1]).toBe(newRecord.id);
  });
});

// ---------------------------------------------------------------------------
// resolveWorkspaceApprovalRequest — line 113: return null for unknown id
// ---------------------------------------------------------------------------
describe("resolveWorkspaceApprovalRequest", () => {
  it("returns null when the approval id does not exist (line 113)", () => {
    // Store is empty — any id will miss.
    const result = resolveWorkspaceApprovalRequest(
      "nonexistent-id",
      "approved",
      "reviewer",
      "looks good",
    );
    expect(result).toBeNull();
  });

  it("approves an existing record and updates all fields", () => {
    const created = createWorkspaceApprovalRequest(BASE_INPUT);

    const resolved = resolveWorkspaceApprovalRequest(
      created.id,
      "approved",
      "reviewer-bob",
      "approved after review",
    );

    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("approved");
    expect(resolved!.reviewedBy).toBe("reviewer-bob");
    expect(resolved!.reviewNote).toBe("approved after review");
    expect(resolved!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it("rejects an existing record correctly", () => {
    const created = createWorkspaceApprovalRequest(BASE_INPUT);
    const resolved = resolveWorkspaceApprovalRequest(created.id, "rejected", "reviewer-ann", "not approved");

    expect(resolved!.status).toBe("rejected");
    expect(resolved!.reviewedBy).toBe("reviewer-ann");
  });
});

// ---------------------------------------------------------------------------
// listWorkspaceApprovalRequests — filter paths
// ---------------------------------------------------------------------------
describe("listWorkspaceApprovalRequests", () => {
  it("returns all records in reverse chronological order when no filters given", () => {
    createWorkspaceApprovalRequest({ ...BASE_INPUT, workspaceId: "ws-a" });
    createWorkspaceApprovalRequest({ ...BASE_INPUT, workspaceId: "ws-b" });

    const list = listWorkspaceApprovalRequests();
    expect(list.length).toBe(2);
    // Reversed: ws-b was created last so it should come first.
    expect(list[0].workspaceId).toBe("ws-b");
  });

  it("filters by workspaceId", () => {
    createWorkspaceApprovalRequest({ ...BASE_INPUT, workspaceId: "ws-a" });
    createWorkspaceApprovalRequest({ ...BASE_INPUT, workspaceId: "ws-b" });

    const list = listWorkspaceApprovalRequests("ws-a");
    expect(list.every((r) => r.workspaceId === "ws-a")).toBe(true);
    expect(list.length).toBe(1);
  });

  it("filters by status", () => {
    const created = createWorkspaceApprovalRequest(BASE_INPUT);
    resolveWorkspaceApprovalRequest(created.id, "approved");

    const pending = listWorkspaceApprovalRequests(undefined, "pending");
    expect(pending.length).toBe(0);

    const approved = listWorkspaceApprovalRequests(undefined, "approved");
    expect(approved.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getWorkspaceApprovalRequest
// ---------------------------------------------------------------------------
describe("getWorkspaceApprovalRequest", () => {
  it("returns the record by id", () => {
    const created = createWorkspaceApprovalRequest(BASE_INPUT);
    const found = getWorkspaceApprovalRequest(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("returns null for an unknown id", () => {
    expect(getWorkspaceApprovalRequest("does-not-exist")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearWorkspaceApprovals
// ---------------------------------------------------------------------------
describe("clearWorkspaceApprovals", () => {
  it("returns true and empties the store when records exist", () => {
    createWorkspaceApprovalRequest(BASE_INPUT);
    const hadAny = clearWorkspaceApprovals();
    expect(hadAny).toBe(true);
    expect(listWorkspaceApprovalRequests().length).toBe(0);
  });

  it("returns false when the store is already empty", () => {
    const hadAny = clearWorkspaceApprovals();
    expect(hadAny).toBe(false);
  });
});
