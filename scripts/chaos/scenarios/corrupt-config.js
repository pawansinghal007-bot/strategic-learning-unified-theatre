const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const slo = require("../slo");
const utils = require("../utils");

const DAEMON_SUBCOMMAND = ["daemon"];
const HEALTH_SUBCOMMAND = ["health", "--json"];
const CLI_ENTRY = path.resolve(__dirname, "../../../Solution/src/cli.js");
const NODE_BIN = process.execPath;

async function runScenario() {
  console.log("=== Scenario 2: corrupt config/state files ===");

  const chaosHome = utils.createChaosHome();
  const configFile = utils.configPath(chaosHome);
  const dbFile = utils.experienceDbPath(chaosHome);

  fs.writeFileSync(
    configFile,
    JSON.stringify({ enhanceSchedule: { enabled: false } }, null, 2),
    "utf8",
  );

  const daemon = spawn(NODE_BIN, [CLI_ENTRY, ...DAEMON_SUBCOMMAND], {
    env: { ...process.env, HOME: chaosHome },
    stdio: ["ignore", "inherit", "inherit"],
  });

  await utils.delay(3000);

  console.log("Corrupting config.json and experience.db...");
  utils.backupFile(configFile);
  utils.backupFile(dbFile);

  fs.writeFileSync(configFile, "{ this-is: 'not-json' :::", "utf8");

  if (fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, Buffer.alloc(16));
  } else {
    fs.writeFileSync(dbFile, "not-a-valid-sqlite-db", "utf8");
  }

  await utils.delay(2000);

  let healthy = false;
  let recoveryTimeMs = 0;

  try {
    const result = await utils.waitForHealthy({
      timeoutMs: slo.configCorruptionRecoveryMs,
      label: "config-corruption",
      chaosHome,
      healthArgs: [CLI_ENTRY, ...HEALTH_SUBCOMMAND],
      nodeBin: NODE_BIN,
    });

    healthy = result.healthy;
    recoveryTimeMs = result.recoveryTimeMs;
  } finally {
    try {
      daemon.kill("SIGTERM");
    } catch (err) {
      // best-effort teardown
    }
    utils.restoreFile(configFile);
    utils.restoreFile(dbFile);
  }

  if (!healthy) {
    throw new Error(
      "Scenario 2 FAIL: system did not recover from corrupt config — manual intervention required. Procedure: delete ~/.vscode-rotator/config.json and experience.db, then restart daemon.",
    );
  }

  utils.assertRecovery(
    "config-corruption",
    recoveryTimeMs,
    slo.configCorruptionRecoveryMs,
  );
  console.log(`Scenario 2 PASS: system recovered in ${recoveryTimeMs}ms`);
}

module.exports = {
  runScenario,
};
