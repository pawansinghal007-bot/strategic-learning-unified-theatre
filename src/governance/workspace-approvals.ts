import { readJsonFile, writeJsonFile } from "../llm/storage";
import { appendAuditEvent } from "../audit/audit-log";

const APPROVALS_FILE = "workspace-approvals.json";
const MAX_APPROVALS = 2000;

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface WorkspaceApprovalRequestInput {
  workspaceId: string;
  policyChange: Record<string, unknown>;
  requestedBy?: string | null;
  reason?: string | null;
  timestamp?: number;
}

export interface WorkspaceApprovalRecord {
  id: string;
  workspaceId: string;
  status: ApprovalStatus;
  policyChange: Record<string, unknown>;
  requestedBy: string | null;
  reviewedBy: string | null;
  reason: string | null;
  reviewNote: string | null;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceApprovalStore {
  approvals: WorkspaceApprovalRecord[];
}

const DEFAULT_STORE: WorkspaceApprovalStore = { approvals: [] };

function loadStore(): WorkspaceApprovalStore {
  return readJsonFile(APPROVALS_FILE, DEFAULT_STORE);
}

function saveStore(store: WorkspaceApprovalStore): WorkspaceApprovalStore {
  writeJsonFile(APPROVALS_FILE, store);
  return store;
}

export function createWorkspaceApprovalRequest(
  input: WorkspaceApprovalRequestInput,
): WorkspaceApprovalRecord {
  const store = loadStore();
  const now = input.timestamp ?? Date.now();
  const record: WorkspaceApprovalRecord = {
    id: `approval-${store.approvals.length + 1}-${now}`,
    workspaceId: input.workspaceId,
    status: "pending",
    policyChange: input.policyChange,
    requestedBy: input.requestedBy ?? null,
    reviewedBy: null,
    reason: input.reason ?? null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };

  store.approvals.push(record);
  if (store.approvals.length > MAX_APPROVALS) {
    store.approvals = store.approvals.slice(
      store.approvals.length - MAX_APPROVALS,
    );
  }
  saveStore(store);

  appendAuditEvent({
    action: "workspaceApproval.requested",
    actor: { type: "renderer", id: input.requestedBy ?? undefined },
    targetType: "workspaceApproval",
    workspaceId: input.workspaceId,
    details: {
      approvalId: record.id,
      policyChange: input.policyChange,
      reason: input.reason ?? null,
    },
  });

  return record;
}

export function listWorkspaceApprovalRequests(
  workspaceId?: string,
  status?: ApprovalStatus,
): WorkspaceApprovalRecord[] {
  const store = loadStore();
  return store.approvals
    .filter((item) => (workspaceId ? item.workspaceId === workspaceId : true))
    .filter((item) => (status ? item.status === status : true))
    .slice()
    .reverse();
}

export function getWorkspaceApprovalRequest(
  approvalId: string,
): WorkspaceApprovalRecord | null {
  const store = loadStore();
  return store.approvals.find((item) => item.id === approvalId) ?? null;
}

export function resolveWorkspaceApprovalRequest(
  approvalId: string,
  status: "approved" | "rejected",
  reviewedBy?: string | null,
  reviewNote?: string | null,
): WorkspaceApprovalRecord | null {
  const store = loadStore();
  const record = store.approvals.find((item) => item.id === approvalId);
  if (!record) return null;

  record.status = status;
  record.reviewedBy = reviewedBy ?? null;
  record.reviewNote = reviewNote ?? null;
  record.updatedAt = Date.now();
  saveStore(store);

  appendAuditEvent({
    action:
      status === "approved"
        ? "workspaceApproval.approved"
        : "workspaceApproval.rejected",
    actor: { type: "renderer", id: reviewedBy ?? undefined },
    targetType: "workspaceApproval",
    workspaceId: record.workspaceId,
    details: {
      approvalId: record.id,
      reviewNote: reviewNote ?? null,
      policyChange: record.policyChange,
    },
  });

  return record;
}

export function clearWorkspaceApprovals(): boolean {
  const store = loadStore();
  const hadAny = store.approvals.length > 0;
  saveStore({ approvals: [] });
  return hadAny;
}
