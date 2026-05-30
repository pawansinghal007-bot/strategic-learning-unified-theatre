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

## S2004 Refactor Guidance

- S2004 sprint complete: 16 items fixed across LOW and MED; no HIGH items remained in the active lock snapshot.
- ARROW_CONVERT -> place `const` at the top of the parent function to preserve scope closure.
- HOIST -> move to module scope above the parent only when there are zero parent-scope references.
- DOUBLE_NESTED -> fix the innermost function first, then re-assess each outer level.
- Caller mapping is required before any MED or HIGH fix.
- Never export a hoisted function unless an external caller requires it.
- Commit each fix immediately after validation; do not batch fix commits.
- Anti-pattern: do not convert to arrow if the function is used as a constructor.
- Anti-pattern: do not hoist if the function closes over parent variables.
- Stash discipline: unrelated changes stay stashed separately and must never be mixed with sprint fixes.

## S4123 SPRINT COMPLETE

Total fixed: 9 — all LOW risk, 0 deferred, 0 blocked

Fix patterns confirmed:

  REMOVE-CLEAN:
    • awaited expression returns plain value
    • no other awaits in function
    • no callers depend on async
    • fix: remove await + remove async from signature

  REMOVE-AWAIT:
    • awaited expression returns plain value
    • other awaits exist in function — async must stay
    • fix: remove await keyword only
      do NOT touch async on signature
      do NOT touch other lines in function

Triage process confirmed (4 read-only sessions before any fix):
  4A-1: extract raw list from CSV
  4A-2: trace return types — read source files only
  4A-3: grep callers — check async removability
  4A-4: apply labels + risk ratings — pure classification
  4A-5: apply fixes — one file at a time, commit per file

Anti-patterns confirmed:
  never remove await without tracing return type first
  never remove async without confirming no other awaits remain
  never remove async without confirming no callers depend on it
  never batch fixes across files without validating each file first
  always commit snapshot before session ends —
    lost snapshot = lost sprint state

Snapshot discipline:
  triage snapshots (4A-1 through 4A-4) must not be deleted
  until v1.4-stable is written and pushed
  always commit + push snapshot immediately after writing

## Prompt 5 final rescan complete
- Total reduction: 436 → 176 (-260 issues, -60%)
- Critical: 45 → 2 (-43)
- Major: 111 → 36 (-75)
- Minor: 278 → 136 (-142)
- All target rules clear: S3776=0, S2004=0, S4123=0
- Next sprint: S7781 + S7763 (28 each) — highest count
