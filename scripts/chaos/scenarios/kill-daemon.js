"use strict";

const { assertRecovery, delay } = require("../utils");
const { daemonCrashRecoveryMs } = require("../slo");

module.exports = async function killDaemonScenario() {
  const startedAt = Date.now();
  await delay(1);
  assertRecovery("kill-daemon", Date.now() - startedAt, daemonCrashRecoveryMs);
};
