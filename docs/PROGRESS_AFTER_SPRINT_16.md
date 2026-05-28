# Progress After ACHIEVEMENTS_AFTER_SPRINT_14.md

This file records the newest progress since `docs/ACHIEVEMENTS_AFTER_SPRINT_14.md` was written, with a focus on governance, policy, architecture consolidation, and the latest quality gate work.

## Current Progress Summary

- Completed Sprint 17 Sonar governance gate work:
  - Split governance configuration into `config/security-governance.json` and `config/ci-runtime.json`.
  - Added `scripts/validate-governance-config.mjs` for schema validation.
  - Built a structured hotspot waiver registry at `docs/security/hotspots/waivers.json`.
  - Added `scripts/validate-waivers.mjs` for waiver schema enforcement and expiry checks.
  - Added `scripts/reconcile-hotspot-register.mjs` for audit-capable reconciliation against Sonar hotspot export.
  - Added `scripts/check-sonar-readiness.mjs` for protected-branch fail-closed readiness checks.
  - Created `.github/workflows/sonar-governance.yml` with concurrency, GitLeaks, preflight gating, artifact retention, and Node 18 enforcement.

- Declared Node 18 runtime compatibility in `package.json`.
- Updated `strategic-learning-unified-theatre-master-instructions.md` to reflect Sprint 17 completion and current platform status.
- Added `ai-snapshot-sprint17.md` as the new `[LATEST][SPRINT17]` snapshot pointer.

## Key outcomes since the last achievements document

- Transitioned the platform from high-level architecture and tests into explicit governance automation.
- Added audit-focused configuration and validation artifacts for policy review and compliance.
- Preserved the current domain consolidation narrative while adding a new enforcement layer around Sonar and CI.

## Next Priorities

- Build the Hotspot waiver dashboard and internal API for waiver review, renewal, and audit workflows.
- Integrate real Sonar scan/export steps into the governance CI workflow.
- Expand reconciliation to support actual Sonar export formats and deeper audit provenance.
- Continue aligning docs and architecture references with the current `src/` domain layout.

## Related documents

- `docs/ACHIEVEMENTS_THROUGH_SPRINT_14.md`
- `docs/ACHIEVEMENTS_AFTER_SPRINT_14.md`
- `docs/ENTERPRISE_SPRINT_HIGHLIGHTS.md`
- `strategic-learning-unified-theatre-master-instructions.md`
