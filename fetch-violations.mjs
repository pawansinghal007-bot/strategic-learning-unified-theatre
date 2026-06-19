import {
  readReportTask,
  getSonarToken,
  fetchJson,
} from "./scripts/sonar-utils.mjs";
import fs from "node:fs";

async function main() {
  try {
    const report = readReportTask();
    const token = getSonarToken();
    const serverUrl = report.serverUrl;
    const projectKey = report.projectKey;

    // Fetch ALL unresolved violations
    const url = `${serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&resolved=false&ps=500`;
    console.log("Fetching from:", url);

    const data = await fetchJson(url, token);
    const issues = data.issues || [];

    console.log(`Total unresolved issues: ${issues.length}`);

    // Group by severity
    const bySeverity = {};
    for (const issue of issues) {
      if (!bySeverity[issue.severity]) bySeverity[issue.severity] = [];
      bySeverity[issue.severity].push(issue);
    }

    console.log("\nBy severity:");
    ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"].forEach((sev) => {
      if (bySeverity[sev]) {
        console.log(`  ${sev}: ${bySeverity[sev].length}`);
      }
    });

    // Group by rule
    const byRule = {};
    for (const issue of issues) {
      if (!byRule[issue.rule]) byRule[issue.rule] = [];
      byRule[issue.rule].push(issue);
    }

    console.log("\nTop 15 rules by count:");
    Object.entries(byRule)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15)
      .forEach(([rule, issuesForRule]) => {
        console.log(
          `  ${issuesForRule.length.toString().padStart(3)}x ${rule}`,
        );
      });

    // Save to file
    fs.writeFileSync("sonar-all-issues.json", JSON.stringify(data, null, 2));
    console.log("\nFull report written to sonar-all-issues.json");

    // List first 10 issues
    console.log("\nFirst 10 issues:");
    issues.slice(0, 10).forEach((issue) => {
      console.log(`  [${issue.severity}] ${issue.rule}`);
      console.log(`    ${issue.component}:${issue.line ?? "?"}`);
      console.log(`    ${issue.message}`);
    });
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
