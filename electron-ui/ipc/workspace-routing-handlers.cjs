"use strict";

const { ipcMain } = require("electron");

function routingHistory() {
  return require("../../src/llm/routing-history.js");
}

function registerWorkspaceRoutingHandlers() {
  ipcMain.handle(
    "workspaceRouting:list",
    async (_event, workspaceId, limit = 50, filter = null) => {
      if (!workspaceId || typeof workspaceId !== "string")
        throw new Error("workspaceId is required");
      return routingHistory().listRoutingHistoryForWorkspace(
        workspaceId,
        limit,
        filter || undefined,
      );
    },
  );

  ipcMain.handle("workspaceRouting:summary", async (_event, workspaceId, filter = null) => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("workspaceId is required");
    return routingHistory().getWorkspaceRoutingSummary(
      workspaceId,
      filter || undefined,
    );
  });

  ipcMain.handle("workspaceRouting:trends", async (_event, workspaceId, filter = null) => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("workspaceId is required");
    return routingHistory().getWorkspaceProviderTrends(
      workspaceId,
      filter || undefined,
    );
  });

  ipcMain.handle(
    "workspaceRouting:timeline",
    async (_event, workspaceId, limit = 50, filter = null) => {
      if (!workspaceId || typeof workspaceId !== "string")
        throw new Error("workspaceId is required");
      return routingHistory().getWorkspaceRoutingTimeline(
        workspaceId,
        limit,
        filter || undefined,
      );
    },
  );

  ipcMain.handle("workspaceRouting:analytics", async (_event, workspaceId, filter = null) => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("workspaceId is required");
    return routingHistory().getWorkspaceAnalytics(
      workspaceId,
      filter || undefined,
    );
  });

  ipcMain.handle(
    "workspaceRouting:buckets",
    async (_event, workspaceId, bucket = "day", filter = null) => {
      if (!workspaceId || typeof workspaceId !== "string")
        throw new Error("workspaceId is required");
      return routingHistory().getWorkspaceTimeBuckets(
        workspaceId,
        bucket,
        filter || undefined,
      );
    },
  );

  ipcMain.handle("workspaceRouting:globalAnalytics", async (_event, filter = null) => {
    return routingHistory().getGlobalWorkspaceAnalytics(filter || undefined);
  });

  ipcMain.handle("workspaceRouting:exportJson", async (_event, workspaceId, filter = null) => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("workspaceId is required");
    return routingHistory().exportWorkspaceAnalyticsJson(
      workspaceId,
      filter || undefined,
    );
  });

  ipcMain.handle("workspaceRouting:exportCsv", async (_event, workspaceId, filter = null) => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("workspaceId is required");
    return routingHistory().exportWorkspaceAnalyticsCsv(
      workspaceId,
      filter || undefined,
    );
  });

  // Sprint 34 — new channels
  ipcMain.handle("workspaceRouting:providerComparison", async (_event, filter = null) => {
    return routingHistory().getProviderComparisonAcrossWorkspaces(
      filter || undefined,
    );
  });

  ipcMain.handle(
    "workspaceRouting:bucketChartSvg",
    async (_event, workspaceId, bucket = "day", filter = null) => {
      if (!workspaceId || typeof workspaceId !== "string")
        throw new Error("workspaceId is required");
      return routingHistory().getWorkspaceBucketChartSvg(
        workspaceId,
        bucket,
        filter || undefined,
      );
    },
  );

  ipcMain.handle("workspaceRouting:providerComparisonChartSvg", async (_event, filter = null) => {
    return routingHistory().getProviderComparisonChartSvg(
      filter || undefined,
    );
  });

  ipcMain.handle(
    "workspaceRouting:exportHtmlReport",
    async (_event, workspaceId, filter = null) => {
      if (!workspaceId || typeof workspaceId !== "string")
        throw new Error("workspaceId is required");
      return routingHistory().exportWorkspaceAnalyticsHtmlReport(
        workspaceId,
        filter || undefined,
      );
    },
  );

  ipcMain.handle("workspaceRouting:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("workspaceId is required");
    return routingHistory().clearRoutingHistoryForWorkspace(workspaceId);
  });
}

module.exports = { registerWorkspaceRoutingHandlers };
