import fs from "node:fs";
import path from "node:path";
import { readReportTask, getSonarToken, fetchJson } from "./sonar-utils.mjs";

async function main() {
  const report = readReportTask();
  const token = getSonarToken();
  const serverUrl = report.serverUrl;
  const projectKey = report.projectKey;

  if (!serverUrl || !projectKey) {
    console.error(
      "Sonar issues export FAILED: report-task.txt is missing serverUrl or projectKey.",
    );
    process.exit(1);
  }

  const url = `${serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&resolved=false&inNewCodePeriod=true&ps=500`;

  let data;
  try {
    data = await fetchJson(url, token);
  } catch (err) {
    console.error("Sonar issues export FAILED:", err.message);
    process.exit(1);
  }

  const total = data.total ?? data.issues?.length ?? 0;
  const outPath = path.resolve("sonar-issues-report.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`Scoped issues (unresolved, new code period): ${total}`);
  console.log(`Full report written to ${outPath}`);

  if (total > 0) {
    for (const issue of (data.issues || []).slice(0, 20)) {
      console.error(
        `  [${issue.severity}] ${issue.rule} ${issue.component}:${issue.line ?? "?"} — ${issue.message}`,
      );
    }
    console.error(
      `Sonar issues export: ${total} unresolved new-code issue(s) found.`,
    );
    process.exit(1);
  }

  console.log("Scoped issues zero.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Sonar issues export FAILED with an unexpected error:", err);
  process.exit(1);
});
