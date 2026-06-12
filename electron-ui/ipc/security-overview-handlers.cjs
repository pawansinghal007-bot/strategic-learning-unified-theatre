'use strict';

const { ipcMain } = require('electron');

function securityOverview() {
  return require('../../src/security/security-overview/index.js');
}

function registerSecurityOverviewHandlers() {
  ipcMain.handle('security-overview:summarize', async (_event, payload) => {
    const {
      flattenFindings,
      loadSecurityBaseline,
      loadSecuritySuppressions,
      isSecuritySuppressed,
      buildSecurityOverviewSnapshot,
    } = securityOverview();

    const baseline = loadSecurityBaseline(payload?.baselinePath ?? '');
    const suppressions = loadSecuritySuppressions(
      payload?.suppressionsPath ?? '',
    );

    const secretFindings = flattenFindings(payload?.secrets ?? [], 'secret');
    const riskFindings = flattenFindings(payload?.risks ?? [], 'risk');

    const findings = [...secretFindings, ...riskFindings].map((f) => ({
      ...f,
      suppressed: isSecuritySuppressed(f, suppressions),
      baselineMatched:
        typeof f.fingerprint === 'string' ? baseline.has(f.fingerprint) : false,
    }));

    return {
      ok: true,
      findings,
      snapshot: buildSecurityOverviewSnapshot(findings),
    };
  });

  ipcMain.handle(
    'security-overview:save-baseline',
    async (_event, baselinePath, fingerprints) => {
      const { saveSecurityBaseline } = securityOverview();
      return saveSecurityBaseline(
        baselinePath,
        Array.isArray(fingerprints) ? fingerprints : [],
      );
    },
  );

  ipcMain.handle(
    'security-overview:load-suppressions',
    async (_event, suppressionsPath) => {
      const { loadSecuritySuppressions } = securityOverview();
      return {
        ok: true,
        suppressions: loadSecuritySuppressions(suppressionsPath ?? ''),
      };
    },
  );

  ipcMain.handle(
    'security-overview:save-suppressions',
    async (_event, suppressionsPath, suppressions) => {
      const { saveSecuritySuppressions } = securityOverview();
      return saveSecuritySuppressions(
        suppressionsPath,
        Array.isArray(suppressions) ? suppressions : [],
      );
    },
  );
}

module.exports = { registerSecurityOverviewHandlers };
