"use strict";

const { ipcMain } = require("electron");

function audit() {
  return require("../../src/audit/audit-log.js");
}

function workspacePolicy() {
  return require("../../src/policies/workspace-policy.js");
}

function approvals() {
  return require("../../src/governance/workspace-approvals.js");
}

function isSensitivePolicyPatch(policyPatch) {
  if (!policyPatch || typeof policyPatch !== "object") return false;
  return Boolean(
    policyPatch.routingMode === "local-only" ||
    policyPatch.manualProvider ||
    (Array.isArray(policyPatch.blockedProviders) &&
      policyPatch.blockedProviders.length > 0),
  );
}

function registerWorkspacePolicyHandlers() {
  ipcMain.handle("workspacePolicy:get", async (_event, workspaceId) => {
    return workspacePolicy().getWorkspacePolicyOverride(workspaceId);
  });

  ipcMain.handle(
    "workspacePolicy:set",
    async (_event, workspaceId, policyPatch, requestedBy, reason) => {
      const result = workspacePolicy().setWorkspacePolicyOverride(
        workspaceId,
        policyPatch,
      );

      audit().appendAuditEvent({
        action: "workspacePolicy.set",
        actor: { type: "renderer", id: requestedBy ?? undefined },
        targetType: "workspacePolicy",
        workspaceId,
        details: {
          policyChange: policyPatch,
          reason: reason ?? null,
        },
      });

      let approval = null;
      if (isSensitivePolicyPatch(policyPatch)) {
        approval = approvals().createWorkspaceApprovalRequest({
          workspaceId,
          policyChange: policyPatch,
          requestedBy: requestedBy ?? null,
          reason: reason ?? null,
          // Emits audit action "workspaceApproval.requested" via appendAuditEvent
        });
      }

      return { result, approval };
    },
  );

  ipcMain.handle(
    "workspacePolicy:clear",
    async (_event, workspaceId, requestedBy) => {
      const result =
        workspacePolicy().clearWorkspacePolicyOverride(workspaceId);

      audit().appendAuditEvent({
        action: "workspacePolicy.clear",
        actor: { type: "renderer", id: requestedBy ?? undefined },
        targetType: "workspacePolicy",
        workspaceId,
        details: {},
      });

      return result;
    },
  );

  ipcMain.handle("workspacePolicy:list", async () => {
    return workspacePolicy().listWorkspacePolicyOverrides();
  });

  ipcMain.handle("workspacePolicy:resolve", async (_event, workspaceId) => {
    return workspacePolicy().resolveWorkspacePolicyState(workspaceId);
  });

  ipcMain.handle(
    "workspaceApproval:list",
    async (_event, workspaceId, status) => {
      return approvals().listWorkspaceApprovalRequests(
        workspaceId || undefined,
        status || undefined,
      );
    },
  );

  ipcMain.handle(
    "workspaceApproval:resolve",
    async (_event, approvalId, status, reviewedBy, reviewNote) => {
      return approvals().resolveWorkspaceApprovalRequest(
        approvalId,
        status,
        reviewedBy ?? null,
        reviewNote ?? null,
      );
    },
  );
}

module.exports = { registerWorkspacePolicyHandlers };
