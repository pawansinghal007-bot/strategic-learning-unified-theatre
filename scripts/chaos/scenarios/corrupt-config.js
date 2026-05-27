"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertRecovery, createChaosHome } = require("../utils");
const { configCorruptionRecoveryMs } = require("../slo");

module.exports = async function corruptConfigScenario() {
  const startedAt = Date.now();
  const chaosHome = createChaosHome();

  try {
    const configPath = path.join(chaosHome, ".vscode-rotator", "config.json");
    fs.writeFileSync(configPath, "{not-json", "utf8");
    fs.writeFileSync(configPath, "{}", "utf8");
    assertRecovery(
      "corrupt-config",
      Date.now() - startedAt,
      configCorruptionRecoveryMs,
    );
  } finally {
    fs.rmSync(chaosHome, { recursive: true, force: true });
  }
};
