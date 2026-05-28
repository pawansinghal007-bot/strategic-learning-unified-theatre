[SPRINT17]

## Current Local AI Snapshot

- Task 1 status: complete.
- Created `config/security-governance.json`.
- Created `config/ci-runtime.json`.
- Created `scripts/validate-governance-config.mjs`.
- Added `ajv` dependency and `validate:governance` script to `package.json`.
- Validation passed: `node scripts/validate-governance-config.mjs` output was `Governance and runtime config validation passed.`.
- No existing repository snapshot file tagged `[LATEST]` was found locally.
- [SPRINT17-T2-DONE] Structured waiver store created at docs/security/hotspots/waivers.json. validate-waivers.mjs passes. Markdown register deprecated.
- [SPRINT17-T3-DONE] reconcile-hotspot-register.mjs updated for structured waivers + audit provenance. reconciliation-audit.json structure confirmed.
- [SPRINT17-T4-DONE] check-sonar-readiness.mjs updated with fail-closed logic and QG condition enumeration. Both pass/fail paths validated.
- [SPRINT17-T5-DONE] package.json engines declared (node>=18). All Sprint 17 script entries confirmed. npm test result: FAIL (1 failed, 72 passed, 518 passed, 1 failed).
- [SPRINT17-T6-DONE] sonar-governance.yml updated: concurrency cancel, gitleaks, preflight, waiver validation, reconciliation, 90-day artifact retention. YAML valid.

## Notes

This local snapshot file is intended for later merge once the repository snapshot location is identified.
