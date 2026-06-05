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

  ipcMain.handle("workspaceRouting:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return routingHistory().clearRoutingHistoryForWorkspace(workspaceId);
  });
}

module.exports = { registerWorkspaceRoutingHandlers };
