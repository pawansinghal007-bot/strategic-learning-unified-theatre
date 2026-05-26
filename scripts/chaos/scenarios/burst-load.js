const { spawn } = require("node:child_process");
const path = require("node:path");
const slo = require("../slo");
const utils = require("../utils");

const ROBOT_BIN = "robot";
const ROBOT_BASE_ARGS = ["--outputdir", "robot-chaos", "robot/"];
const HEALTH_SUBCOMMAND = ["health", "--json"];
const CLI_ENTRY = path.resolve(__dirname, "../../../Solution/src/cli.js");

async function runScenario() {
  console.log("=== Scenario 3: burst load via Robot suites ===");

  const robotCheck = await utils.runChild(ROBOT_BIN, ["--version"], {});
  if (robotCheck.code !== 0) {
    console.log("Robot not available — skipping burst scenario");
    return;
  }

  const tasks = [];

  for (let i = 0; i < slo.burstLoad.functionalRuns; i++) {
    tasks.push(
      utils
        .runChild(ROBOT_BIN, [...ROBOT_BASE_ARGS, "--suite", "functional"], {})
        .then((r) => ({ suite: "functional", ok: r.code === 0, code: r.code })),
    );
  }

  for (let i = 0; i < slo.burstLoad.regressionRuns; i++) {
    tasks.push(
      utils
        .runChild(ROBOT_BIN, [...ROBOT_BASE_ARGS, "--suite", "regression"], {})
        .then((r) => ({ suite: "regression", ok: r.code === 0, code: r.code })),
    );
  }

  const results = await Promise.all(tasks);
  const failureStats = utils.computeFailureRate(results);

  console.log(
    `Robot burst results: failures=${failureStats.failures}/${failureStats.total} (${failureStats.pct}%)`,
  );

  if (failureStats.pct > slo.burstLoadMaxErrorPct) {
    throw new Error(
      `[SLO VIOLATION] Robot burst failure rate ${failureStats.pct}% > allowed ${slo.burstLoadMaxErrorPct}%`,
    );
  }

  const chaosHome = utils.createChaosHome();
  const { healthy } = await utils.waitForHealthy({
    timeoutMs: slo.postBurstHealthTimeoutMs,
    label: "post-robot-burst",
    chaosHome,
    healthArgs: [CLI_ENTRY, ...HEALTH_SUBCOMMAND],
    nodeBin: process.execPath,
  });

  if (!healthy) {
    throw new Error("Scenario 3 FAIL: system unhealthy after Robot burst load");
  }

  console.log(
    `Scenario 3 PASS: burst failure rate=${failureStats.pct}%, post-burst health ok`,
  );
}

module.exports = {
  runScenario,
};
