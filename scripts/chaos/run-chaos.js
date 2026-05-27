#!/usr/bin/env node
"use strict";

const killDaemon = require("./scenarios/kill-daemon");
const corruptConfig = require("./scenarios/corrupt-config");
const burstLoad = require("./scenarios/burst-load");

const scenarios = {
  "kill-daemon": killDaemon,
  "corrupt-config": corruptConfig,
  "burst-load": burstLoad,
};

function parseArgs(argv) {
  const scenarioIndex = argv.indexOf("--scenario");
  if (scenarioIndex === -1) {
    return { scenario: null };
  }

  return { scenario: argv[scenarioIndex + 1] };
}

async function run() {
  const { scenario } = parseArgs(process.argv.slice(2));
  const selected = scenario ? [scenario] : Object.keys(scenarios);
  const results = [];

  for (const name of selected) {
    const runScenario = scenarios[name];
    if (!runScenario) {
      throw new Error(`Unknown chaos scenario: ${name}`);
    }

    const startedAt = Date.now();
    await runScenario();
    results.push({ name, ok: true, elapsedMs: Date.now() - startedAt });
  }

  console.log(JSON.stringify({ ok: true, scenarios: results }, null, 2));
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = { parseArgs, run };
