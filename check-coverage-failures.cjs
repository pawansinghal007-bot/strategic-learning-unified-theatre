const fs = require("fs");
const path = require("path");
const { globSync } = require("glob");

const summaryPath = path.resolve(
  process.cwd(),
  "coverage",
  "coverage-summary.json",
);
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

const configPath = path.resolve(process.cwd(), "vitest.config.js");
const config = require(configPath);
const coverageConfig = config.default?.test?.coverage;

const baseDir = process.cwd();
const includePatterns = coverageConfig.include || [
  "src/**/*.js",
  "src/**/*.ts",
];
const excludePatterns = coverageConfig.exclude || [];

function normalizeKey(filePath) {
  return filePath.replaceAll("\\", "/");
}

function findSummaryEntry(summary, modulePath) {
  return Object.entries(summary).find(([key]) =>
    normalizeKey(key).endsWith(normalizeKey(modulePath)),
  );
}

// Resolve glob patterns to actual file paths
const files = [];
for (const pattern of includePatterns) {
  const resolvedPattern = pattern.replace(/^src\//, baseDir + "/src/");
  const matchedFiles = globSync(resolvedPattern, { ignore: excludePatterns });
  files.push(...matchedFiles);
}

const threshold = {
  statements: 74,
  branches: 60,
  functions: 70,
  lines: 70,
};
const failures = [];

for (const filePath of files) {
  const entry = findSummaryEntry(summary, filePath);
  if (!entry) {
    failures.push(`${filePath}: missing coverage summary entry`);
    continue;
  }

  const [, metrics] = entry;
  for (const metric of ["statements", "branches"]) {
    const pct = metrics?.[metric]?.pct;
    if (typeof pct === "number" && pct < threshold[metric]) {
      failures.push(`${filePath}: ${metric} ${pct}% < ${threshold[metric]}%`);
    }
  }
}

console.log("Total files checked:", files.length);
console.log("Total failures:", failures.length);
console.log("");
console.log("Failures:");
for (const f of failures) {
  console.log("  " + f);
}
