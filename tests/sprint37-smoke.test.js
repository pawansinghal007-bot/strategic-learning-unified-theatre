import { existsSync, readFileSync } from "fs";
import { loadDashboardSurface } from './dashboard-loader.js';
import { join } from "path";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

const db = {};
const appendAuditEventMock = vi.fn();

vi.mock("../src/llm/storage.js", () => ({
  readJsonFile: (file, fallback) => db[file] ?? fallback,
  writeJsonFile: (file, value) => {
    db[file] = value;
  },
}));

vi.mock("../src/audit/audit-log.js", () => ({
  appendAuditEvent: appendAuditEventMock,
}));

describe("Sprint 37 smoke tests — workspace approvals core", () => {
  let createWorkspaceApprovalRequest;
  let listWorkspaceApprovalRequests;
  let getWorkspaceApprovalRequest;
  let resolveWorkspaceApprovalRequest;
  let clearWorkspaceApprovals;

  beforeAll(async () => {
    const module = await import("../src/governance/workspace-approvals.js");
    createWorkspaceApprovalRequest = module.createWorkspaceApprovalRequest;
    listWorkspaceApprovalRequests = module.listWorkspaceApprovalRequests;
    getWorkspaceApprovalRequest = module.getWorkspaceApprovalRequest;
    resolveWorkspaceApprovalRequest = module.resolveWorkspaceApprovalRequest;
    clearWorkspaceApprovals = module.clearWorkspaceApprovals;
  });

  beforeEach(() => {
    Object.keys(db).forEach((k) => delete db[k]);
    appendAuditEventMock.mockClear();
  });

  it("creates pending approval and writes audit event", () => {
    const record = createWorkspaceApprovalRequest({
      workspaceId: "ws-1",
      policyChange: { routingMode: "local-only" },
      requestedBy: "pawan",
      reason: "Sensitive routing lockdown",
    });

    expect(record.workspaceId).toBe("ws-1");
    expect(record.status).toBe("pending");
    expect(record.requestedBy).toBe("pawan");
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspaceApproval.requested",
        workspaceId: "ws-1",
      }),
    );
  });

  it("lists approvals filtered by workspaceId", () => {
    createWorkspaceApprovalRequest({
      workspaceId: "ws-a",
      policyChange: { manualProvider: "openai" },
    });
    createWorkspaceApprovalRequest({
      workspaceId: "ws-b",
      policyChange: { manualProvider: "groq" },
    });

    const rows = listWorkspaceApprovalRequests("ws-a");
    expect(rows).toHaveLength(1);
    expect(rows[0].workspaceId).toBe("ws-a");
  });

  it("lists all approvals when no workspaceId given", () => {
    createWorkspaceApprovalRequest({
      workspaceId: "ws-c",
      policyChange: { blockedProviders: ["gemini"] },
    });
    createWorkspaceApprovalRequest({
      workspaceId: "ws-d",
      policyChange: { routingMode: "local-only" },
    });

    const all = listWorkspaceApprovalRequests();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("filters approvals by status", () => {
    const record = createWorkspaceApprovalRequest({
      workspaceId: "ws-e",
      policyChange: { manualProvider: "local" },
    });

    resolveWorkspaceApprovalRequest(record.id, "approved", "reviewer", "ok");

    const pending = listWorkspaceApprovalRequests("ws-e", "pending");
    const approved = listWorkspaceApprovalRequests("ws-e", "approved");

    expect(pending).toHaveLength(0);
    expect(approved).toHaveLength(1);
  });

  it("gets a single approval by ID", () => {
    const record = createWorkspaceApprovalRequest({
      workspaceId: "ws-f",
      policyChange: { routingMode: "hybrid" },
    });

    const fetched = getWorkspaceApprovalRequest(record.id);
    expect(fetched?.id).toBe(record.id);
  });

  it("returns null for unknown approval ID", () => {
    expect(getWorkspaceApprovalRequest("nonexistent-id")).toBeNull();
  });

  it("resolves approval to approved and writes audit event", () => {
    const record = createWorkspaceApprovalRequest({
      workspaceId: "ws-2",
      policyChange: { blockedProviders: ["gemini"] },
    });

    appendAuditEventMock.mockClear();

    const resolved = resolveWorkspaceApprovalRequest(
      record.id,
      "approved",
      "reviewer-1",
      "Looks safe",
    );

    expect(resolved?.status).toBe("approved");
    expect(resolved?.reviewedBy).toBe("reviewer-1");
    expect(resolved?.reviewNote).toBe("Looks safe");
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspaceApproval.approved",
      }),
    );
  });

  it("resolves approval to rejected and writes audit event", () => {
    const record = createWorkspaceApprovalRequest({
      workspaceId: "ws-3",
      policyChange: { routingMode: "local-only" },
    });

    appendAuditEventMock.mockClear();

    const resolved = resolveWorkspaceApprovalRequest(
      record.id,
      "rejected",
      "reviewer-2",
      "Needs more justification",
    );

    expect(resolved?.status).toBe("rejected");
    expect(appendAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "workspaceApproval.rejected",
      }),
    );
  });

  it("clearWorkspaceApprovals removes all records", () => {
    createWorkspaceApprovalRequest({
      workspaceId: "ws-clear",
      policyChange: { manualProvider: "local" },
    });

    clearWorkspaceApprovals();
    expect(listWorkspaceApprovalRequests()).toHaveLength(0);
  });
});

describe("Sprint 37 smoke tests — file surface", () => {
  it("workspace-approvals.ts exists in src/governance/", () => {
    expect(
      existsSync(join(process.cwd(), "src/governance/workspace-approvals.ts")),
    ).toBe(true);
  });

  it("workspace-policy-handlers.cjs writes audit events and registers approval channels", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-policy-handlers.cjs"),
      "utf-8",
    );
    expect(source).toContain("audit-log.js");
    expect(source).toContain("appendAuditEvent");
    expect(source).toContain("workspacePolicy.set");
    expect(source).toContain("workspaceApproval.requested");
    expect(source).toContain("workspaceApproval:list");
    expect(source).toContain("workspaceApproval:resolve");
  });

  it("preload exposes workspaceApproval namespace", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(source).toContain('exposeInMainWorld("workspaceApproval"');
    expect(source).toContain("workspaceApproval:list");
    expect(source).toContain("workspaceApproval:resolve");
  });

  it("preload workspacePolicy.set accepts options parameter", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(source).toContain("workspaceId, policyPatch, options");
  });

  it("types.d.ts declares workspaceApproval on Window", () => {
    const source = readFileSync(
      join(process.cwd(), "src/ui/types.d.ts"),
      "utf-8",
    );
    expect(source).toContain("workspaceApproval:");
    expect(source).toMatch(
      /status\?:\s*["']pending["']\s*\|\s*["']approved["']\s*\|\s*["']rejected["']/,
    );
    expect(source).toMatch(
      /status:\s*["']approved["']\s*\|\s*["']rejected["']/,
    );
  });

  it("dashboard includes Workspace Approvals panel", () => {
    const source = loadDashboardSurface();
    expect(source).toContain("Workspace Approvals");
    expect(source).toContain("load-workspace-approvals");
    expect(source).toContain("resolve-workspace-approval");
    expect(source).toContain("window.workspaceApproval.list");
    expect(source).toContain("window.workspaceApproval.resolve");
  });

  it("dashboard preserves Sprint 36 compatibility strings", () => {
    const source = loadDashboardSurface();
    expect(source).toContain("Workspace Analytics & Explainability");
    expect(source).toContain("Workspace Analytics");
    expect(source).toContain("Provider Trends");
    expect(source).toContain("Decision Timeline");
    expect(source).toContain("metric-success-rate");
    expect(source).toContain("metric-error-rate");
    expect(source).toContain("metric-latency");
    expect(source).toContain("workspaceRouting.analytics");
    expect(source).toContain("Audit Trail");
  });

  it("main.cjs still registers audit handlers (no regression)", () => {
    const source = readFileSync(
      join(process.cwd(), "electron-ui/main.cjs"),
      "utf-8",
    );
    expect(source).toContain("registerAuditHandlers");
  });
});
