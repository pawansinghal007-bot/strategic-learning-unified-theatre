const path = require("node:path");
const killDaemon = require("./scenarios/kill-daemon");
const corruptConfig = require("./scenarios/corrupt-config");
const burstLoad = require("./scenarios/burst-load");

const SCENARIOS = {
  "kill-daemon": killDaemon,
  "corrupt-config": corruptConfig,
  "burst-load": burstLoad,
};

function truncate(value, maxLength) {
  if (typeof value !== "string") {
    return String(value);
  }
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
}

function parseScenarioArg() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--scenario") {
      const value = args[i + 1];
      if (!value) {
        console.error("Missing value for --scenario");
        process.exit(1);
      }
      return value;
    }
    if (arg.startsWith("--scenario=")) {
      return arg.slice("--scenario=".length);
    }
  }
  return null;
}

function formatCell(value, width) {
  const text = String(value);
  if (text.length >= width) {
    return text.slice(0, width);
  }
  return text + " ".repeat(width - text.length);
}

function printSummary(records) {
  const scenarioWidth = 24;
  const statusWidth = 8;
  const durationWidth = 48;
  const totalMs = records.reduce((sum, record) => sum + record.durationMs, 0);
  const overallStatus = records.every((record) => record.status === "PASS")
    ? "PASS"
    : "FAIL";

  const lineTop = `╔${"═".repeat(scenarioWidth)}╦${"═".repeat(statusWidth)}╦${"═".repeat(durationWidth)}╗`;
  const lineHeader = `╠${"═".repeat(scenarioWidth)}╬${"═".repeat(statusWidth)}╬${"═".repeat(durationWidth)}╣`;
  const lineBottom = `╚${"═".repeat(scenarioWidth)}╩${"═".repeat(statusWidth)}╩${"═".repeat(durationWidth)}╝`;

  console.log(lineTop);
  console.log(
    `║ ${formatCell("Chaos Suite Summary — Sprint 15.7", scenarioWidth - 1)}║ ${formatCell("", statusWidth)}║ ${formatCell("", durationWidth)}║`,
  );
  console.log(lineHeader);
  console.log(
    `║ ${formatCell("Scenario", scenarioWidth - 1)}║ ${formatCell("Status", statusWidth)}║ ${formatCell("Duration", durationWidth)}║`,
  );
  console.log(lineHeader);

  records.forEach((record) => {
    const errorNote =
      record.status === "FAIL" && record.error
        ? ` | ${truncate(record.error, 80)}`
        : "";
    const durationText = `${record.durationMs}ms${errorNote}`;
    console.log(
      `║ ${formatCell(record.name, scenarioWidth - 1)}║ ${formatCell(record.status, statusWidth)}║ ${formatCell(durationText, durationWidth)}║`,
    );
  });

  console.log(lineHeader);
  console.log(
    `║ ${formatCell("Overall", scenarioWidth - 1)}║ ${formatCell(overallStatus, statusWidth)}║ ${formatCell(`${totalMs}ms`, durationWidth)}║`,
  );
  console.log(lineBottom);
}

async function runScenario(name, module) {
  const startTime = Date.now();
  try {
    await module.runScenario();
    return {
      name,
      status: "PASS",
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const requestedScenario = parseScenarioArg();
  const availableScenarios = Object.keys(SCENARIOS);
  const scenariosToRun = requestedScenario
    ? [requestedScenario]
    : availableScenarios;

  if (requestedScenario && !SCENARIOS[requestedScenario]) {
    console.error(
      `Invalid scenario name: ${requestedScenario}. Allowed values: ${availableScenarios.join(", ")}`,
    );
    process.exit(1);
  }

  const startTimestamp = new Date().toISOString();
  console.log(`Chaos suite start: ${startTimestamp}`);

  const results = [];
  for (const scenarioName of scenariosToRun) {
    console.log(`\n--- Running scenario: ${scenarioName}`);
    results.push(await runScenario(scenarioName, SCENARIOS[scenarioName]));
  }

  const endTimestamp = new Date().toISOString();
  console.log(`\nChaos suite end: ${endTimestamp}`);
  printSummary(results);

  const hasFailures = results.some((record) => record.status === "FAIL");
  process.exit(hasFailures ? 1 : 0);
}

main().catch((error) => {
  console.error("Unexpected failure in chaos runner:", error);
  process.exit(1);
});
