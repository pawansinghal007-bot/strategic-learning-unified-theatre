"use strict";

const { ipcMain } = require("electron");

function workspacePolicy() {
  return require("../../src/policies/workspace-policy.js");
}

function workspaceContext() {
  return require("../../src/memory/request-context.js");
}

function registerWorkspaceHandlers() {
  ipcMain.handle("workspacePolicy:get", async (_event, workspaceId) => {
    return workspacePolicy().getWorkspacePolicyOverride(workspaceId);
  });

  ipcMain.handle("workspacePolicy:set", async (_event, workspaceId, policy) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return workspacePolicy().setWorkspacePolicyOverride(workspaceId, policy);
  });

  ipcMain.handle("workspacePolicy:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return workspacePolicy().clearWorkspacePolicyOverride(workspaceId);
  });

  ipcMain.handle("workspacePolicy:list", async () => {
    return workspacePolicy().listWorkspacePolicyOverrides();
  });

  ipcMain.handle("workspaceContext:get", async (_event, workspaceId) => {
    return workspaceContext().getWorkspaceContext(workspaceId);
  });

  ipcMain.handle(
    "workspaceContext:set",
    async (_event, workspaceId, payload) => {
      if (!workspaceId || typeof workspaceId !== "string") {
        throw new Error("workspaceId is required");
      }
      return workspaceContext().saveWorkspaceContext(workspaceId, payload);
    },
  );

  ipcMain.handle("workspaceContext:clear", async (_event, workspaceId) => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("workspaceId is required");
    }
    return workspaceContext().clearWorkspaceContext(workspaceId);
  });
}

module.exports = { registerWorkspaceHandlers };
