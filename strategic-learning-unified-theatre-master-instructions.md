# strategic-learning-unified-theatre Master Instructions

Last Updated: 2026-05-28 - Sprint 16 Complete. 518 tests passing.

This file carries durable project status and runtime guidance. For compact operational context, prefer:

```bash
node ./src/cli.js ai snapshot
```

## Current Status

### Sprint 16 - Unified Health Endpoint

- Date completed: 2026-05-28
- Status: DONE
- New modules added:
  - `src/system/systemHealth.js`
  - `src/daemon/daemonStatus.js`
  - `src/storage/storageStatus.js`
- CLI command added:
  - `system-health --pretty`
- Test coverage:
  - `tests/system/systemHealth.test.js`
  - Covers happy path, daemon failure/degraded state, and CLI exit-code behavior.
- Verification:
  - `npm test` passed with 73 test files and 518 tests.

## Sprint 17 — Sonar Governance Gate (COMPLETE)

- Config split: security-governance.json (policy) + ci-runtime.json (runtime)
- Schema validation: validate-governance-config.mjs (AJV, exits 0)
- Structured waiver store: docs/security/hotspots/waivers.json (owner/ticket/reviewer/expiry/renewalCount)
- Waiver validation + expiry enforcement: validate-waivers.mjs
- Reconciliation with audit provenance: reconcile-hotspot-register.mjs → reconciliation-audit.json
- Readiness check (fail-closed for protected branches): check-sonar-readiness.mjs
- CI: sonar-governance.yml (concurrency cancel, gitleaks, preflight, 90-day artifacts, Node 18)
- Node >=18 declared in package.json engines
- Local scripts do NOT reconstruct Sonar new-code semantics; QG is source of truth
- Next: Sprint 18 — Hotspot waiver dashboard / internal API (optional high ROI)

## Snapshot Guidance

- Latest Sprint 16 AI snapshot tag: `SPRINT16_COMPLETE`
- Latest Sprint 16 pointer tag: `LATEST_SPRINT16`
- Use the snapshot pointer at `~/.vscode-rotator/ai-snapshot-current.json` before scanning historical snapshot material.
