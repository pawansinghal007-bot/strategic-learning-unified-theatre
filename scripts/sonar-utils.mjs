import fs from "node:fs";
import path from "node:path";

export function readPropertiesFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const props = {};
  for (const rawLine of text.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return props;
}

export function readReportTask() {
  const reportTaskPath = path.resolve(".scannerwork", "report-task.txt");
  if (!fs.existsSync(reportTaskPath)) {
    throw new Error(
      `Missing ${reportTaskPath}. This file is created by sonar-scanner after a successful scan. Run "npm run sonar:scan" first.`,
    );
  }
  return readPropertiesFile(reportTaskPath);
}

export function getSonarToken() {
  const token = process.env.SONAR_TOKEN;
  if (!token) {
    throw new Error(
      'SONAR_TOKEN environment variable is not set. Set it to a SonarQube user token with "Execute Analysis" and "Browse" permissions on this project before running sonar:qualitygate or sonar:issues.',
    );
  }
  return token;
}

export function authHeader(token) {
  return {
    Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
  };
}

export async function fetchJson(url, token) {
  const res = await fetch(url, { headers: authHeader(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Request to ${url} failed: HTTP ${res.status} ${res.statusText}\n${body}`,
    );
  }
  return res.json();
}
