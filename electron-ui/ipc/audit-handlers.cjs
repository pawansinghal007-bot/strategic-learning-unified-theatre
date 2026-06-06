"use strict";

const { ipcMain } = require("electron");

function registerAuditHandlers() {
  const {
    listAuditEvents,
    verifyAuditLogIntegrity,
    getLatestAuditEvent,
  } = require("../../src/audit/audit-log.js");

  ipcMain.handle("audit:list", async (_event, limit, filter) => {
    return listAuditEvents(limit ?? 50, filter);
  });

  ipcMain.handle("audit:verify", async () => {
    return verifyAuditLogIntegrity();
  });

  ipcMain.handle("audit:latest", async () => {
    return getLatestAuditEvent();
  });

  ipcMain.handle('audit:exportJson', async (_event, filter) => {
    const { exportAuditLogJson } = require('../../src/audit/audit-log.js');
    return exportAuditLogJson(filter || undefined);
  });

  ipcMain.handle('audit:exportHtmlReport', async (_event, filter) => {
    const { exportAuditLogHtmlReport } = require('../../src/audit/audit-log.js');
    return exportAuditLogHtmlReport(filter || undefined);
  });
}

module.exports = { registerAuditHandlers };
