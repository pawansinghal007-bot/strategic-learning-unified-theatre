/**
 * Daemon crash recovery: time allowed from SIGKILL to health returning "ok"
 * This gives the watcher daemon a short restart window while preserving fast recovery
 * expectations for chaos exercises.
 */
module.exports = {
  /**
   * Daemon crash recovery: time allowed from SIGKILL to health returning "ok"
   */
  daemonCrashRecoveryMs: 30000,

  /**
   * Config corruption recovery: time allowed from file corruption to health returning "ok"
   */
  configCorruptionRecoveryMs: 60000,

  /**
   * Burst load: maximum percentage of Robot suite runs allowed to fail.
   * Keeps chaos experiments strict while allowing a small error budget for transient failures.
   */
  burstLoadMaxErrorPct: 1,

  /**
   * Burst load: how many concurrent Robot suite runs to launch.
   */
  burstLoad: {
    /** Number of concurrent functional Robot suite runs. */
    functionalRuns: 3,

    /** Number of concurrent regression Robot suite runs. */
    regressionRuns: 2,
  },

  /**
   * Health poll interval during recovery wait.
   * This cadence keeps checks responsive without overloading the system.
   */
  healthPollIntervalMs: 1000,

  /**
   * Post-burst health check timeout.
   * Wait time for the system to recover after a burst load exercise completes.
   */
  postBurstHealthTimeoutMs: 30000,
};
