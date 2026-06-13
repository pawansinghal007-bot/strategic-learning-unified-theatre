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
      const {
        normalizeTriageStatus,
      } = require("../../src/security/security-overview/index.js");
      status = normalizeTriageStatus(status);
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

  ipcMain.handle(
    "security-overview:set-triage-bulk",
    async (_event, triagePath, fingerprints, status, reason, updatedBy) => {
      try {
        const {
          loadSecurityTriage,
          saveSecurityTriage,
          applyBulkTriage,
        } = require("../../src/security/security-overview/triage.js");
        const { normalizeTriageStatus } = require(
          "../../src/security/security-overview/index.js",
        );

        const entries = loadSecurityTriage(triagePath ?? "");
        const normalizedStatus = normalizeTriageStatus(status);
        const safeFingerprints = Array.isArray(fingerprints)
          ? fingerprints
          : [];
        const now = Date.now();

        const next = applyBulkTriage(
          entries,
          safeFingerprints,
          normalizedStatus,
          reason ?? undefined,
          updatedBy ?? undefined,
          now,
        );

        return saveSecurityTriage(triagePath, next);
      } catch (err) {
        return { ok: false, error: String(err?.message ?? err) };
      }
    },
  );

  ipcMain.handle(
    "security-overview:compare-baseline",
    async (_event, currentSnapshot, baselinePath) => {
      if (currentSnapshot == null || typeof currentSnapshot !== "object") {
        return {
          ok: false,
          error: "compare-baseline: currentSnapshot missing or invalid",
        };
      }
      const {
        loadSecurityBaselineSnapshot,
        compareSecurityOverviewWithBaseline,
      } = require("../../src/security/security-overview/drift.js");
      const baselineSnapshot = loadSecurityBaselineSnapshot(
        baselinePath ?? null,
      );
      return compareSecurityOverviewWithBaseline(
        currentSnapshot,
        baselineSnapshot,
      );
    },
  );

  ipcMain.handle(
    "security-overview:explain-introduced",
    async (_event, payload) => {
      try {
        const {
          explainIntroducedFindings,
        } = require("../../src/security/security-overview/index.js");
        const input = payload && typeof payload === "object" ? payload : {};

        return await explainIntroducedFindings({
          drift:
            input.drift && typeof input.drift === "object" ? input.drift : {},
          workspaceId:
            typeof input.workspaceId === "string"
              ? input.workspaceId
              : undefined,
          maxFindings:
            typeof input.maxFindings === "number"
              ? input.maxFindings
              : undefined,
          model: typeof input.model === "string" ? input.model : undefined,
          includeKnowledge: input.includeKnowledge !== false,
          knowledgeQuery:
            typeof input.knowledgeQuery === "string"
              ? input.knowledgeQuery
              : undefined,
          minScore:
            typeof input.minScore === "number" ? input.minScore : undefined,
        });
      } catch (err) {
        return {
          ok: false,
          workspaceId: null,
          analyzedCount: 0,
          knowledgeUsed: false,
          prompt: "",
          answer: "",
          items: [],
          error: err?.message || String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "security-overview:get-drift-classification",
    async (_event, payload) => {
      try {
        if (!payload || typeof payload !== "object") {
          return {
            ok: false,
            error: "get-drift-classification: payload missing",
          };
        }
        const {
          classifyDriftSeverity,
        } = require("../../src/security/security-overview/index.js");
        const introduced = Array.isArray(payload.introduced)
          ? payload.introduced
          : [];
        const resolved = Array.isArray(payload.resolved)
          ? payload.resolved
          : [];
        const persistent = Array.isArray(payload.persistent)
          ? payload.persistent
          : [];
        const classification = classifyDriftSeverity({
          introduced,
          resolved,
          persistent,
        });
        return { ok: true, classification };
      } catch (err) {
        return { ok: false, error: String(err?.message ?? err) };
      }
    },
  );
}

module.exports = { registerSecurityOverviewHandlers };
