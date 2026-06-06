"use strict";

const { ipcMain, dialog, BrowserWindow } = require("electron");
const { writeFile } = require("node:fs/promises");
const path = require("node:path");
const { appendAuditEvent } = require("../../src/audit/audit-log.js");

function registerWorkspaceReportHandlers() {
  ipcMain.handle(
    "workspaceReport:save",
    async (_event, workspaceId, format, filter) => {
      const {
        exportWorkspaceAnalyticsJson,
        exportWorkspaceAnalyticsCsv,
        exportWorkspaceAnalyticsHtmlReport,
      } = require("../../src/llm/routing-history.js");

      const ext =
        format === "json" ? "json" : format === "csv" ? "csv" : "html";

      const win = BrowserWindow.getFocusedWindow() ?? null;

      const result = await dialog.showSaveDialog(win, {
        title: "Save workspace analytics report",
        defaultPath: `workspace-${workspaceId}-analytics.${ext}`,
        filters: [
          { name: "HTML", extensions: ["html"] },
          { name: "JSON", extensions: ["json"] },
          { name: "CSV", extensions: ["csv"] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return {
          canceled: true,
          saved: false,
          filePath: null,
          format,
        };
      }

      let content;

      if (format === "json") {
        content = exportWorkspaceAnalyticsJson(
          workspaceId,
          filter ?? undefined,
        );
      } else if (format === "csv") {
        content = exportWorkspaceAnalyticsCsv(workspaceId, filter ?? undefined);
      } else {
        content = exportWorkspaceAnalyticsHtmlReport(
          workspaceId,
          filter ?? undefined,
        );
      }

      await writeFile(result.filePath, content, "utf8");

      const resolvedPath = path.resolve(result.filePath);

      appendAuditEvent({
        action: "report.save",
        actor: { type: "renderer" },
        targetType: "workspaceReport",
        workspaceId,
        details: {
          format,
          filePath: resolvedPath,
        },
      });

      return {
        canceled: false,
        saved: true,
        filePath: resolvedPath,
        format,
      };
    },
  );
}

module.exports = { registerWorkspaceReportHandlers };
