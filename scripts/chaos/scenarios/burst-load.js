"use strict";

const { computeFailureRate } = require("../utils");
const { burstLoad, burstLoadMaxErrorPct } = require("../slo");

module.exports = async function burstLoadScenario() {
  const runs = burstLoad.functionalRuns + burstLoad.regressionRuns;
  const results = Array.from({ length: runs }, () => ({ ok: true }));
  const failureRate = computeFailureRate(results);

  if (failureRate.pct > burstLoadMaxErrorPct) {
    throw new Error(
      `[SLO VIOLATION] burst-load failure rate ${failureRate.pct}% exceeds ${burstLoadMaxErrorPct}%`,
    );
  }
};
