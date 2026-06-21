import fs from "node:fs/promises";

const host = process.env.SONAR_HOST_URL;
const token = process.env.SONAR_TOKEN;
const projectKey = process.env.PROJECT_KEY || process.env.SONAR_PROJECT_KEY;

if (!host || !token || !projectKey) {
  console.error(
    "Missing SONAR_HOST_URL, SONAR_TOKEN, or PROJECT_KEY/SONAR_PROJECT_KEY",
  );
  process.exit(1);
}

function authHeader(value) {
  return `Basic ${Buffer.from(`${value}:`).toString("base64")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader(token),
    },
  });

  if (!response.ok) {
    throw new Error(`Sonar API failed ${response.status}: ${url}`);
  }

  return response.json();
}

const issuesUrl =
  `${host}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}` +
  `&resolved=false&ps=500&p=1`;

const measuresUrl =
  `${host}/api/measures/component?component=${encodeURIComponent(projectKey)}` +
  `&metricKeys=coverage,new_coverage,duplicated_lines_density,alert_status`;

const [issues, measures] = await Promise.all([
  fetchJson(issuesUrl),
  fetchJson(measuresUrl),
]);

const metricMap = Object.fromEntries(
  (measures.component?.measures ?? []).map((m) => [m.metric, m.value]),
);

const summary = {
  projectKey,
  exportedAt: new Date().toISOString(),
  totalOpenIssues: issues.total ?? 0,
  byRule: Object.values(
    (issues.issues ?? []).reduce((acc, issue) => {
      const key = issue.rule || "unknown";
      acc[key] ??= { rule: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count),
  coverage: Number(metricMap.coverage ?? 0),
  newCoverage: Number(metricMap.new_coverage ?? 0),
  duplicatedLinesDensity: Number(metricMap.duplicated_lines_density ?? 0),
  alertStatus: metricMap.alert_status ?? "UNKNOWN",
};

await fs.mkdir("reports", { recursive: true });
await fs.writeFile(
  "reports/sonar-summary.json",
  JSON.stringify(summary, null, 2),
);

console.log(JSON.stringify(summary, null, 2));
