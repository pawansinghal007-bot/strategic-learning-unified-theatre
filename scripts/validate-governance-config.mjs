import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";

const root = path.resolve("config");
const governancePath = path.join(root, "security-governance.json");
const runtimePath = path.join(root, "ci-runtime.json");

const governanceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sonar", "release", "acknowledgedWaiver", "secretScanning", "hotspotWaiverSchema"],
  properties: {
    sonar: {
      type: "object",
      additionalProperties: false,
      required: ["qualityGateFailOnError", "protectedBranches", "hotspotSeverityThreshold"],
      properties: {
        qualityGateFailOnError: { type: "boolean" },
        protectedBranches: { type: "array", items: { type: "string" }, minItems: 1 },
        hotspotSeverityThreshold: { type: "string", enum: ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] }
      }
    },
    release: {
      type: "object",
      additionalProperties: false,
      required: ["enforceBranchPolicy", "allowedBranches", "requireReviewerApproval"],
      properties: {
        enforceBranchPolicy: { type: "boolean" },
        allowedBranches: { type: "array", items: { type: "string" }, minItems: 1 },
        requireReviewerApproval: { type: "boolean" }
      }
    },
    acknowledgedWaiver: {
      type: "object",
      additionalProperties: false,
      required: ["defaultExpiryDays", "maxRenewals", "renewalWindowDays"],
      properties: {
        defaultExpiryDays: { type: "integer", minimum: 1 },
        maxRenewals: { type: "integer", minimum: 0 },
        renewalWindowDays: { type: "integer", minimum: 0 }
      }
    },
    secretScanning: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "failOnDetection", "scanPaths"],
      properties: {
        enabled: { type: "boolean" },
        failOnDetection: { type: "boolean" },
        scanPaths: { type: "array", items: { type: "string" }, minItems: 1 }
      }
    },
    hotspotWaiverSchema: { type: "object" }
  }
};

const runtimeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "retryMaxAttempts",
    "retryBaseDelayMs",
    "retryJitterMs",
    "waitTimeoutSec",
    "waitIntervalMs",
    "artifactRetentionDays",
    "sonarScannerVersion",
    "nodeVersionRequired"
  ],
  properties: {
    retryMaxAttempts: { type: "integer", minimum: 1 },
    retryBaseDelayMs: { type: "integer", minimum: 0 },
    retryJitterMs: { type: "integer", minimum: 0 },
    waitTimeoutSec: { type: "integer", minimum: 1 },
    waitIntervalMs: { type: "integer", minimum: 1 },
    artifactRetentionDays: { type: "integer", minimum: 1 },
    sonarScannerVersion: { type: "string", minLength: 1 },
    nodeVersionRequired: { type: "string", minLength: 1 }
  }
};

function formatErrors(errors) {
  return errors
    .map((error) => {
      const instancePath = error.instancePath || error.dataPath || "<root>";
      return `${instancePath} ${error.message}`.trim();
    })
    .join("\n");
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const ajv = new Ajv({ allErrors: true, strict: false });

  const securityConfig = await loadJson(governancePath);
  const runtimeConfig = await loadJson(runtimePath);

  const validateGovernance = ajv.compile(governanceSchema);
  const validateRuntime = ajv.compile(runtimeSchema);

  const isGovernanceValid = validateGovernance(securityConfig);
  const isRuntimeValid = validateRuntime(runtimeConfig);

  if (!isGovernanceValid || !isRuntimeValid) {
    if (!isGovernanceValid) {
      console.error("Security governance config validation failed:");
      console.error(formatErrors(validateGovernance.errors || []));
    }
    if (!isRuntimeValid) {
      console.error("CI runtime config validation failed:");
      console.error(formatErrors(validateRuntime.errors || []));
    }
    process.exit(1);
  }

  try {
    ajv.compile(securityConfig.hotspotWaiverSchema);
  } catch (err) {
    console.error("hotspotWaiverSchema is not valid JSON Schema:");
    console.error(err.message || err);
    process.exit(1);
  }

  console.log("Governance and runtime config validation passed.");
}

  try {
    await main();
  } catch (err) {
    console.error(err?.message ?? err);
    process.exit(1);
  }
