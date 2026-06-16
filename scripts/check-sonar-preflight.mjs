import fs from "node:fs";
import { execSync } from "node:child_process";

const GENERATED_DIR_PATTERNS = [
  /^coverage\//,
  /^playwright-report\//,
  /^playwright-report-human\//,
  /^playwright-report-ui\//,
  /^test-results\//,
  /^\.scannerwork\//,
  /^sonar-issues-report\.json$/,
];

function main() {
  let status;
  try {
    status = execSync("git status --porcelain", { encoding: "utf8" });
  } catch (err) {
    console.error("Failed to run git status:", err.message);
    process.exit(1);
  }

  const offending = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((file) => GENERATED_DIR_PATTERNS.some((re) => re.test(file)));

  if (offending.length > 0) {
    console.error(
      "Sonar preflight FAILED: generated/output paths are tracked or modified in git:",
    );
    for (const f of offending) console.error(`  ${f}`);
    console.error(
      "These paths should be gitignored and excluded from version control. Resolve this before running sonar:scan, sonar:qualitygate, or sonar:issues.",
    );
    process.exit(1);
  }

  if (!fs.existsSync("coverage")) {
    console.error(
      "Sonar preflight FAILED: coverage/ directory does not exist yet. Run the coverage script before sonar:scan so lcov.info is available.",
    );
    process.exit(1);
  }

  console.log(
    "Sonar preflight: tree is clean of generated artifacts, coverage/ exists.",
  );
  process.exit(0);
}

main();
