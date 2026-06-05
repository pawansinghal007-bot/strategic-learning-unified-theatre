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

  ipcMain.handle("workspaceRouting:buckets", async (_event, workspaceId, bucket) => {
    const { getWorkspaceTimeBuckets } = require('../../src/llm/routing-history.js');
    return getWorkspaceTimeBuckets(workspaceId, bucket || 'day');
  });

  ipcMain.handle("workspaceRouting:globalAnalytics", async () => {
    const { getGlobalWorkspaceAnalytics } = require('../../src/llm/routing-history.js');
    return getGlobalWorkspaceAnalytics();
  });

  ipcMain.handle("workspaceRouting:exportJson", async (_event, workspaceId) => {
    const { exportWorkspaceAnalyticsJson } = require('../../src/llm/routing-history.js');
    return exportWorkspaceAnalyticsJson(workspaceId);
  });

  ipcMain.handle("workspaceRouting:exportCsv", async (_event, workspaceId) => {
    const { exportWorkspaceAnalyticsCsv } = require('../../src/llm/routing-history.js');
    return exportWorkspaceAnalyticsCsv(workspaceId);
  });
}

module.exports = { registerWorkspaceRoutingHandlers };
