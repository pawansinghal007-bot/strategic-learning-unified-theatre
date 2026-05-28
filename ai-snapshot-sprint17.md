[LATEST][SPRINT17]

## Sprint 17 Completion Snapshot

- [SPRINT17-T1-DONE] Config split complete. security-governance.json and ci-runtime.json created. validate-governance-config.mjs passes. ajv added.
- [SPRINT17-T2-DONE] Structured waiver store created at docs/security/hotspots/waivers.json. validate-waivers.mjs passes. Markdown register deprecated.
- [SPRINT17-T3-DONE] reconcile-hotspot-register.mjs updated for structured waivers + audit provenance. reconciliation-audit.json structure confirmed.
- [SPRINT17-T4-DONE] check-sonar-readiness.mjs updated with fail-closed logic and QG condition enumeration. Both pass/fail paths validated.
- [SPRINT17-T5-DONE] package.json engines declared (node>=18). All Sprint 17 script entries confirmed. npm test result: FAIL (1 failed, 72 passed, 518 passed, 1 failed).
- [SPRINT17-T6-DONE] sonar-governance.yml updated: concurrency cancel, gitleaks, preflight, waiver validation, reconciliation, 90-day artifact retention. YAML valid.

## Key files added this sprint

- config/security-governance.json
- config/ci-runtime.json
- scripts/validate-governance-config.mjs
- docs/security/hotspots/waivers.json
- scripts/validate-waivers.mjs
- scripts/reconcile-hotspot-register.mjs
- reports/sonar/hotspots.json
- reports/sonar/metadata.json
- reports/sonar/reconciliation-audit.json
- scripts/check-sonar-readiness.mjs
- reports/sonar/quality-gate.json
- .github/workflows/sonar-governance.yml
- package.json: Node >=18 engines + Sprint 17 Sonar scripts

## Open items / Sprint 18 candidates

- Build Hotspot waiver dashboard / internal API for audit and renewal workflow
- Add real Sonar scan/wait/export steps and integrate with `sonar-governance.yml`
- Improve reconciliation to consume actual Sonar export formats and audit provenance fields
- Add UI or report automation for waiver expiry, renewal, and stale register alerts
