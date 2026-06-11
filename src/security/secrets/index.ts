export { runSecretsScan } from "./gitleaks-runner.js";
export { loadBaselineFingerprints } from "./baseline.js";
export { loadSuppressions, matchSuppression } from "./suppressions.js";
export type {
  SecretFinding,
  SecretsScanResult,
  SecretsScanSummary,
  SecretsSuppressionEntry,
  SecretSeverity,
} from "./schema.js";
