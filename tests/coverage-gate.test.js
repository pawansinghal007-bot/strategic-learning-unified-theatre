import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const coreModules = [
  "src/accounts/secret-store.js",
  "src/daemon/daemon-runner.js",
  "src/browser-bridge.js",
  "src/agent-handoff.js",
  "src/llm/local-llm.js",
  "src/idea-store.js",
];
const threshold = 70;

function normalizeKey(filePath) {
  return filePath.replaceAll("\\", "/");
}

function findSummaryEntry(summary, modulePath) {
  return Object.entries(summary).find(([key]) =>
    normalizeKey(key).endsWith(normalizeKey(modulePath)),
  );
}

function readCoverageSummary() {
  const summaryPath = path.resolve(
    process.cwd(),
    "coverage",
    "coverage-summary.json",
  );
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, "utf8"));
}

function collectGateFailures(summary, thresholds) {
  return coreModules.flatMap((modulePath) => {
    const entry = findSummaryEntry(summary, modulePath);
    if (!entry) return [`${modulePath}: missing coverage summary entry`];

    const [, metrics] = entry;
    return ["statements", "branches"].flatMap((metric) => {
      const pct = metrics?.[metric]?.pct;
      const required = thresholds?.[metric] ?? threshold;
      return typeof pct === "number" && pct < required
        ? [`${modulePath}: ${metric} ${pct}% < ${required}%`]
        : [];
    });
  });
}

describe("Coverage gate", () => {
  it("keeps Vitest coverage thresholds locked for core modules", async () => {
    const configPath = path.resolve(process.cwd(), "vitest.config.js");
    const config = await import(
      `${pathToFileURL(configPath).href}?coverage-gate=${Date.now()}`
    );
    const coverage = config.default?.test?.coverage;

    expect(coverage?.provider).toBe("v8");
    expect(coverage?.include).toEqual(coreModules);
    expect(coverage?.thresholds).toMatchObject({
      statements: threshold,
      branches: threshold,
      functions: threshold,
      lines: threshold,
    });
  });

  it("reports named module percentages when generated coverage misses the gate", async () => {
    const summary = readCoverageSummary();
    if (!summary) return;

    const configPath = path.resolve(process.cwd(), "vitest.config.js");
    const config = await import(
      `${pathToFileURL(configPath).href}?coverage-summary=${Date.now()}`
    );
    const thresholds = config.default?.test?.coverage?.thresholds;
    const failures = collectGateFailures(summary, thresholds);

    for (const failure of failures) {
      expect(failure).toMatch(
        /src\/.+\.js: (missing coverage summary entry|(?:statements|branches) [\d.]+% < \d+%)/,
      );
    }

    const coverageRun =
      process.env.npm_lifecycle_event === "coverage" ||
      process.argv.includes("--coverage");

    if (coverageRun) {
      expect(failures, failures.join("\n")).toEqual([]);
    }
  });
});
