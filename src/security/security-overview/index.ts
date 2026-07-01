/* v8 ignore file -- pure re-export barrel; no executable statements to instrument */
export {
  emptySecurityOverviewSnapshot,
  buildSecurityOverviewSnapshot,
  TRIAGE_STATUSES,
  securityOverviewSchema,
} from "./schema.js";
export {
  loadSecurityBaseline,
  saveSecurityBaseline,
  loadSecurityBaseline as loadBaseline,
} from "./baseline.js";
export {
  loadSecuritySuppressions,
  saveSecuritySuppressions,
  isSecuritySuppressed,
  loadSecuritySuppressions as loadSuppressions,
  isSecuritySuppressed as isSuppressed,
} from "./suppressions.js";
export {
  flattenFindings,
  normalizeTriageStatus,
  flattenFindings as normalizeFinding,
} from "./normalizer.js";
export {
  loadSecurityTriage,
  saveSecurityTriage,
  upsertSecurityTriageEntry,
  getSecurityTriageStatus,
  isTriageStatusFinal,
  applyBulkTriage,
  upsertSecurityTriageEntry as triageFinding,
} from "./triage.js";
export {
  loadSecurityBaselineSnapshot,
  buildFindingFingerprintSet,
  compareSecurityOverviewWithBaseline,
  compareSecurityOverviewWithBaseline as detectDrift,
  classifyDriftSeverity,
} from "./drift.js";
export {
  buildIntroducedFindingsPrompt,
  parseExplainIntroducedFindingsAnswer,
  explainIntroducedFindings,
  explainIntroducedFindings as explainWithAI,
} from "./ai-explain.js";
export {
  loadDriftHistory,
  saveDriftHistory,
  appendDriftHistory,
} from "./drift-history.js";
export {
  runSecurityAutoScan,
  runSecurityAutoScan as runAutoScan,
} from "./auto-scan.js";
