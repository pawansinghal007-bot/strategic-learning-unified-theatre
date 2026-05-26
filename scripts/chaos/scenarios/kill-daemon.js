const { spawn } = require("node:child_process");
const path = require("node:path");
const slo = require("../slo");
const utils = require("../utils");

const DAEMON_SUBCOMMAND = ["daemon"];
const HEALTH_SUBCOMMAND = ["health", "--json"];
const CLI_ENTRY = path.resolve(__dirname, "../../../Solution/src/cli.js");
const NODE_BIN = process.execPath;

async function runScenario() {
  console.log("=== Scenario 1: kill daemon mid-rotation ===");

  const chaosHome = utils.createChaosHome();

  const daemon = spawn(NODE_BIN, [CLI_ENTRY, ...DAEMON_SUBCOMMAND], {
    env: { ...process.env, HOME: chaosHome },
    stdio: ["ignore", "inherit", "inherit"],
  });

  await utils.delay(3000);

  const healthResult = await utils.runChild(
    NODE_BIN,
    [CLI_ENTRY, ...HEALTH_SUBCOMMAND],
    {
      HOME: chaosHome,
    },
  );

  const healthOk = utils.parseHealthOk(healthResult.stdout);
  if (healthOk) {
    console.log("Initial health check passed before kill.");
  } else {
    console.warn(
      "Initial health check did not return ok before kill. Continuing anyway; daemon may still be starting.",
    );
    console.warn("health stdout:", healthResult.stdout.trim());
    if (healthResult.stderr) {
      console.warn("health stderr:", healthResult.stderr.trim());
    }
  }

  console.log("Killing daemon with SIGKILL...");
  try {
    daemon.kill("SIGKILL");
  } catch (err) {
    console.warn("Failed to send SIGKILL to daemon process:", String(err));
  }

  const { healthy, recoveryTimeMs } = await utils.waitForHealthy({
    timeoutMs: slo.daemonCrashRecoveryMs,
    label: "kill-daemon",
    chaosHome,
    healthArgs: [CLI_ENTRY, ...HEALTH_SUBCOMMAND],
    nodeBin: NODE_BIN,
  });

  if (!healthy) {
    throw new Error(
      "Scenario 1 FAIL: daemon did not recover — manual intervention required. Procedure: restart daemon via strategic-learning-unified-theatre daemon or service restart.",
    );
  }

  utils.assertRecovery(
    "kill-daemon",
    recoveryTimeMs,
    slo.daemonCrashRecoveryMs,
  );
  console.log(`Scenario 1 PASS: daemon recovered in ${recoveryTimeMs}ms`);
}

module.exports = {
  runScenario,
};
