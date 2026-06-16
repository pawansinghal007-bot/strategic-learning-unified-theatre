import { readReportTask, getSonarToken, fetchJson } from "./sonar-utils.mjs";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

async function waitForCeTask(serverUrl, ceTaskId, token) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const data = await fetchJson(
      `${serverUrl}/api/ce/task?id=${ceTaskId}`,
      token,
    );
    const status = data.task?.status;
    if (status === "SUCCESS") return data.task;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(
        `Sonar background task ${ceTaskId} ended with status ${status}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timed out waiting for Sonar background task ${ceTaskId} to complete`,
  );
}

async function main() {
  const report = readReportTask();
  const token = getSonarToken();
  const serverUrl = report.serverUrl;
  const ceTaskId = report.ceTaskId;

  if (!serverUrl || !ceTaskId) {
    console.error(
      "Sonar quality gate check FAILED: report-task.txt is missing serverUrl or ceTaskId.",
    );
    process.exit(1);
  }

  console.log(
    `Waiting for Sonar background task ${ceTaskId} on ${serverUrl}...`,
  );
  let task;
  try {
    task = await waitForCeTask(serverUrl, ceTaskId, token);
  } catch (err) {
    console.error("Sonar quality gate check FAILED:", err.message);
    process.exit(1);
  }

  const analysisId = task.analysisId;
  if (!analysisId) {
    console.error(
      "Sonar quality gate check FAILED: background task succeeded but returned no analysisId.",
    );
    process.exit(1);
  }

  let gateData;
  try {
    gateData = await fetchJson(
      `${serverUrl}/api/qualitygates/project_status?analysisId=${analysisId}`,
      token,
    );
  } catch (err) {
    console.error("Sonar quality gate check FAILED:", err.message);
    process.exit(1);
  }

  const status = gateData.projectStatus?.status;
  if (status !== "OK") {
    console.error(`Sonar quality gate FAILED with status: ${status}`);
    for (const cond of gateData.projectStatus?.conditions || []) {
      console.error(
        `  ${cond.metricKey}: ${cond.status} (actual=${cond.actualValue}, threshold=${cond.errorThreshold ?? cond.warningThreshold ?? "n/a"})`,
      );
    }
    process.exit(1);
  }

  console.log("Quality gate passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(
    "Sonar quality gate check FAILED with an unexpected error:",
    err,
  );
  process.exit(1);
});
