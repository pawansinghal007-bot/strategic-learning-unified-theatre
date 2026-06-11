"use strict";

const { ipcMain, BrowserWindow } = require("electron");

function audit() {
  return require("../../src/audit/audit-log.js");
}

function workspacePolicy() {
  return require("../../src/policies/workspace-policy.js");
}

function approvals() {
  return require("../../src/governance/workspace-approvals.js");
}

function quotas() {
  return require("../../src/governance/workspace-quotas.js");
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

function broadcastQuotaNotification(payload) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send("workspaceQuota:notification", payload);
    }
  }
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

  ipcMain.handle("workspaceQuota:get", async (_event, workspaceId) => {
    const {
      getWorkspaceQuotaPolicy,
    } = require("../../src/governance/workspace-quotas.js");
    return getWorkspaceQuotaPolicy(workspaceId);
  });

  ipcMain.handle("workspaceQuota:list", async () => {
    const {
      listWorkspaceQuotaPolicies,
    } = require("../../src/governance/workspace-quotas.js");
    return listWorkspaceQuotaPolicies();
  });

  ipcMain.handle(
    "workspaceQuota:set",
    async (_event, workspaceId, quotaPatch, options) => {
      const {
        setWorkspaceQuotaPolicy,
      } = require("../../src/governance/workspace-quotas.js");
      return setWorkspaceQuotaPolicy({
        workspaceId,
        dailyLimit: quotaPatch?.dailyLimit ?? null,
        weeklyLimit: quotaPatch?.weeklyLimit ?? null,
        mode: quotaPatch?.mode ?? "alert",
        fallbackProvider: quotaPatch?.fallbackProvider ?? null,
        alertThresholdPct: quotaPatch?.alertThresholdPct ?? null, // ← add this
        requestedBy: options?.requestedBy ?? null,
        reason: options?.reason ?? null,
      });
    },
  );

  ipcMain.handle(
    "workspaceQuota:clear",
    async (_event, workspaceId, requestedBy) => {
      const {
        clearWorkspaceQuotaPolicy,
      } = require("../../src/governance/workspace-quotas.js");
      return clearWorkspaceQuotaPolicy(workspaceId, requestedBy ?? null);
    },
  );

  ipcMain.handle(
    "workspaceQuota:recordUsage",
    async (_event, workspaceId, payload) => {
      const usage = quotas().recordWorkspaceQuotaUsage({
        workspaceId,
        timestamp: payload?.timestamp,
        provider: payload?.provider ?? null,
      });
      const latest = quotas().getLatestWorkspaceQuotaNotification(workspaceId);
      if (
        latest &&
        latest.workspaceId === workspaceId &&
        (latest.type === "threshold" || latest.type === "exceeded")
      ) {
        broadcastQuotaNotification(latest);
      }
      return usage;
    },
  );

  ipcMain.handle("workspaceQuota:usage", async (_event, workspaceId, now) => {
    const {
      getWorkspaceQuotaUsage,
    } = require("../../src/governance/workspace-quotas.js");
    return getWorkspaceQuotaUsage(workspaceId, now);
  });

  ipcMain.handle(
    "workspaceQuota:evaluate",
    async (_event, workspaceId, now) => {
      const {
        evaluateWorkspaceQuotaStatus,
      } = require("../../src/governance/workspace-quotas.js");
      return evaluateWorkspaceQuotaStatus(workspaceId, now);
    },
  );

  ipcMain.handle("workspaceQuota:clearUsage", async (_event, workspaceId) => {
    const {
      clearWorkspaceQuotaUsage,
    } = require("../../src/governance/workspace-quotas.js");
    return clearWorkspaceQuotaUsage(workspaceId);
  });

  ipcMain.handle(
    "workspaceQuota:latestNotification",
    async (_event, workspaceId) => {
      const {
        getLatestWorkspaceQuotaNotification,
      } = require("../../src/governance/workspace-quotas.js");
      return getLatestWorkspaceQuotaNotification(workspaceId);
    },
  );

  ipcMain.handle(
    "workspaceQuota:notifications",
    async (_event, workspaceId) => {
      const {
        listWorkspaceQuotaNotifications,
      } = require("../../src/governance/workspace-quotas.js");
      return listWorkspaceQuotaNotifications(workspaceId);
    },
  );

  ipcMain.handle("workspaceQuota:resetDaily", async (_event, now) => {
    const {
      resetWorkspaceQuotaDaily,
      getLatestWorkspaceQuotaNotification,
    } = require("../../src/governance/workspace-quotas.js");
    const result = resetWorkspaceQuotaDaily(now, "manual");
    const latest = getLatestWorkspaceQuotaNotification();
    if (latest && latest.type === "dailyReset") {
      broadcastQuotaNotification(latest);
    }
    return result;
  });

  ipcMain.handle("workspaceQuota:rollup", async (_event, now) => {
    return quotas().getWorkspaceQuotaRollup(now);
  });
}

module.exports = {
  registerWorkspacePolicyHandlers,
  broadcastQuotaNotification,
};
