"use strict";

module.exports = {
  daemonCrashRecoveryMs: 30000,
  configCorruptionRecoveryMs: 30000,
  burstLoadMaxErrorPct: 5,
  healthPollIntervalMs: 1000,
  postBurstHealthTimeoutMs: 15000,
  burstLoad: {
    functionalRuns: 1,
    regressionRuns: 1,
  },
};
