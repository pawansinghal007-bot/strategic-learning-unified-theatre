"use strict";

const { ipcMain } = require("electron");

function routingHistory() {
  return require("../../src/llm/routing-history.js");
}

function registerWorkspaceRoutingHandlers() {
  ipcMain.handle(
    "workspaceRouting:list",
    async (_event, workspaceId, limit = 50) => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return routingHistory().listRoutingHistoryForWorkspace(
        workspaceId,
        limit,
      );
    },
  );

  ipcMain.handle("workspaceRouting:summary", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().getWorkspaceRoutingSummary(workspaceId);
  });

  ipcMain.handle("workspaceRouting:trends", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().getWorkspaceProviderTrends(workspaceId);
  });

  ipcMain.handle(
    "workspaceRouting:timeline",
    async (_event, workspaceId, limit = 50) => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return routingHistory().getWorkspaceRoutingTimeline(workspaceId, limit);
    },
  );

  ipcMain.handle("workspaceRouting:analytics", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().getWorkspaceAnalytics(workspaceId);
  });

  ipcMain.handle("workspaceRouting:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().clearRoutingHistoryForWorkspace(workspaceId);
  });

  // ── Sprint 33 ────────────────────────────────────────────────────────
  ipcMain.handle(
    "workspaceRouting:buckets",
    async (_event, workspaceId, granularity = "day") => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return routingHistory().getWorkspaceTimeBuckets(workspaceId, granularity);
    },
  );

  ipcMain.handle("workspaceRouting:globalAnalytics", async (_event) => {
    return routingHistory().getGlobalWorkspaceAnalytics();
  });

  ipcMain.handle("workspaceRouting:exportJson", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().exportWorkspaceAnalyticsJson(workspaceId);
  });

  ipcMain.handle("workspaceRouting:exportCsv", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().exportWorkspaceAnalyticsCsv(workspaceId);
  });

  // ── Sprint 34 ────────────────────────────────────────────────────────
  ipcMain.handle("workspaceRouting:providerComparison", async (_event) => {
    return routingHistory().getProviderComparisonAcrossWorkspaces();
  });

  ipcMain.handle(
    "workspaceRouting:bucketChartSvg",
    async (_event, workspaceId, granularity = "day") => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return routingHistory().getWorkspaceBucketChartSvg(
        workspaceId,
        granularity,
      );
    },
  );

  ipcMain.handle(
    "workspaceRouting:providerComparisonChartSvg",
    async (_event) => {
      return routingHistory().getProviderComparisonChartSvg();
    },
  );

  ipcMain.handle(
    "workspaceRouting:exportHtmlReport",
    async (_event, workspaceId) => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return routingHistory().exportWorkspaceAnalyticsHtmlReport(workspaceId);
    },
  );
}

module.exports = { registerWorkspaceRoutingHandlers };
