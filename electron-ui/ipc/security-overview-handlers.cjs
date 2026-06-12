"use strict";

const { ipcMain } = require("electron");

const {
  loadSecurityTriage,
  saveSecurityTriage,
  upsertSecurityTriageEntry,
  getSecurityTriageStatus,
} = require("../../src/security/security-overview/triage");

function securityOverview() {
  return require("../../src/security/security-overview/index.js");
}

function registerSecurityOverviewHandlers() {
  ipcMain.handle("security-overview:summarize", async (_event, payload) => {
    const {
      flattenFindings,
      loadSecurityBaseline,
      loadSecuritySuppressions,
      isSecuritySuppressed,
      buildSecurityOverviewSnapshot,
    } = securityOverview();

    const baseline = loadSecurityBaseline(payload?.baselinePath ?? "");
    const suppressions = loadSecuritySuppressions(
      payload?.suppressionsPath ?? "",
    );
    const triageEntries = loadSecurityTriage(payload?.triagePath ?? "");

    const secretFindings = flattenFindings(payload?.secrets ?? [], "secret");
    const riskFindings = flattenFindings(payload?.risks ?? [], "risk");

    const findings = [...secretFindings, ...riskFindings].map((f) => {
      const suppressed = isSecuritySuppressed(f, suppressions);
      const triageStatus = suppressed
        ? "suppressed"
        : getSecurityTriageStatus(f.fingerprint, triageEntries);

      return {
        ...f,
        suppressed,
        baselineMatched:
          typeof f.fingerprint === "string"
            ? baseline.has(f.fingerprint)
            : false,
        triageStatus,
      };
    });

    return {
      ok: true,
      findings,
      snapshot: buildSecurityOverviewSnapshot(findings),
    };
  });

  ipcMain.handle(
    "security-overview:save-baseline",
    async (_event, baselinePath, fingerprints) => {
      const { saveSecurityBaseline } = securityOverview();
      return saveSecurityBaseline(
        baselinePath,
        Array.isArray(fingerprints) ? fingerprints : [],
      );
    },
  );

  ipcMain.handle(
    "security-overview:load-suppressions",
    async (_event, suppressionsPath) => {
      const { loadSecuritySuppressions } = securityOverview();
      return {
        ok: true,
        suppressions: loadSecuritySuppressions(suppressionsPath ?? ""),
      };
    },
  );

  ipcMain.handle(
    "security-overview:save-suppressions",
    async (_event, suppressionsPath, suppressions) => {
      const { saveSecuritySuppressions } = securityOverview();
      return saveSecuritySuppressions(
        suppressionsPath,
        Array.isArray(suppressions) ? suppressions : [],
      );
    },
  );

  ipcMain.handle(
    "security-overview:load-triage",
    async (_event, triagePath) => {
      const {
        loadSecurityTriage,
      } = require("../../src/security/security-overview/triage");
      return {
        ok: true,
        entries: loadSecurityTriage(triagePath || ""),
      };
    },
  );

  ipcMain.handle(
    "security-overview:set-triage",
    async (_event, triagePath, fingerprint, status, reason, updatedBy) => {
      const {
        loadSecurityTriage,
        saveSecurityTriage,
        upsertSecurityTriageEntry,
      } = require("../../src/security/security-overview/triage");
      const entries = loadSecurityTriage(triagePath || "");
      const next = upsertSecurityTriageEntry(entries, {
        fingerprint: String(fingerprint),
        status,
        reason: reason ?? undefined,
        updatedAt: Date.now(),
        updatedBy: updatedBy ?? undefined,
      });
      return saveSecurityTriage(triagePath, next);
    },
  );
}

module.exports = { registerSecurityOverviewHandlers };
