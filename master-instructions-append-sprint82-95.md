## Sprint 82 — Security Overview Coverage & Validation

Status: Closed

Objective:
Improve coverage and validation for security overview modules following the Sprint 81 coverage-pipeline fix.

Results:

- Coverage and validation improvements landed for security-overview code paths.
- Snapshot tag: sprint-82-complete.

## Sprint 83 — Coverage Improvement & Violation Triage

Status: Closed

Objective:
Continue coverage improvement and triage remaining Sonar violations.

Results:

- Coverage improved; violations triaged per docs/sprint-83-scope.md.
- Snapshot tag: sprint-83-complete.

## Sprint 84 — Quality and Scope Guard + Sonar Backlog

Status: Closed

Objective:
Establish a tracked, grouped backlog of the remaining Sonar issues so cleanup work proceeds safely without expanding scope or weakening existing guards.

Scope:

- Add four planning documents: docs/sprint-84-scope.md, docs/sprint-84-checklist.md, docs/sprint-84-sonar-backlog.md, docs/sprint-84-master-plan-update.md.
- Group the 44 remaining Sonar issues into Group A (mechanical cleanup), Group B (readability/consistency), Group C (structural refactors).
- Document validation commands (npx vitest run, npx tsc --noEmit, sonar-scanner) directly in the backlog doc.
- Explicitly protect compatibility strings and ingest guard behavior from being weakened during cleanup.

Results:

- Backlog and guard tests added: tests/sprint84-quality-and-scope-guard.test.js, tests/sprint84-sonar-backlog-guard.test.js.
- No tag recorded for this sprint; work is verified via the guard tests above.

## Sprint 85 — Eliminate S2486 Violations with Structural Fixes

Status: Closed

Objective:
Resolve S2486 (ignored exception) violations with real structural handling rather than suppression.

Results:

- S2486 violations eliminated via structural fixes.
- Snapshot tag: sprint-85-complete.

## Sprint 86 — Quality Gate Remediation: Hotspot Triage + Coverage Baseline

Status: Closed

Objective:
Triage all outstanding Sonar security hotspots and establish a coverage baseline.

Results:

- All 16 security hotspots logged in docs/security-hotspot-log.md, each with a justification field.
- Guard test added: tests/sprint86-hotspot-guard.test.js (asserts 16 logged entries, justification on each).
- Snapshot tag: sprint-86-complete.

## Sprint 87/88 — Security Gate Guard

Status: Closed

Objective:
Close out remaining security-tooling hygiene issues and finalize hotspot disposition ahead of the coverage-policy work in Sprint 89-90. Sprints 87 and 88 were executed and verified together under a single guard.

Results:

- Removed Math.random() usage from security-tooling files (src/llm/routing-history.ts, dependency-check-runner.ts, trivy-runner.ts, gitleaks-runner.ts).
- Removed SHA-1 usage from gitleaks-runner.ts.
- Hotspot log cleaned of TO_REVIEW entries and stale zero-count summaries; all PATH hotspot entries moved from SAFE to ACKNOWLEDGED.
- Guard test added: tests/sprint87-gate-guard.test.js ("Sprint 87/88 security gate guard").
- No tag recorded for this combined sprint; verified via the guard test above.

## Sprint 89 — Coverage Exclusions Baseline

Status: Closed

Objective:
Establish a documented, intentional baseline of coverage exclusions so future sprints can extend it consistently instead of ad hoc.

Results:

- 30+ files added to a tracked coverage-exclusions baseline (docs/coverage-exclusions.md), later carried forward and referenced by Sprint 90 and the Sprint 91 snapshot.
- No tag recorded for this sprint; superseded/extended by Sprint 90's formal policy doc.

## Sprint 90 — Coverage Policy Guard

Status: Closed

Objective:
Formalize the coverage-exclusion baseline from Sprint 89 into an explicit, enforced policy document.

Results:

- docs/coverage-exclusions.md restructured with ## Policy, ## Current measured baseline, ## Bucket A, ## Bucket B, ## Bucket C sections.
- Baseline table contains no TBD values and makes no false 100%-on-any-metric claims.
- Guard test added: tests/sprint90-coverage-policy.test.js.
- No tag recorded for this sprint; verified via the guard test above.

## Sprint 91 — Sonar Fixes + Coverage Guard Passing

Status: Closed

Objective:
Clear remaining Sonar rule violations (S3776, S7785, S4043, S1128, S2699) and get the Sprint 90 coverage guard passing.

Results:

- S3776 (cognitive complexity), S7785 (top-level await), S4043 (array sort), S1128 (unused import), S2699 (test assertion) violations fixed.
- Sprint 90 coverage guard now passing.
- Snapshot tag: sprint-91-complete.

## Sprint 92 — S5914 Fix + Sonar/Vitest Coverage Alignment

Status: Closed

Objective:
Eliminate the last trivial-assertion violation and align Sonar's coverage exclusions with the Vitest exclude list.

Results:

- tests/thread.test.js: replaced a trivial expect(1+1).toBe(2) assertion (S5914) with a real fs.existsSync check.
- tests/sprint75-guard.test.js: replaced a brittle sprint7[5-9] regex with a numeric parseInt(>=75) comparison, future-proofing it past sprint 100.
- sonar-project.properties: added 7 zero-coverage source files to sonar.coverage.exclusions to match vitest.config.ts; Sonar-reported coverage moved from 54.8% to 84.1%.
- Sonar scan result: new_violations = 0 (primary Sprint 74-92 goal met). Gate still failed on new_coverage (84.1% vs 100% threshold) and new_duplicated_lines_density (4.05% vs 2% threshold) — both flagged as threshold-configuration issues requiring human Sonar-admin action, not further test additions.
- 170 files / 1815 tests passing, typecheck clean.
- Snapshot tag: sprint-92-complete.

## Sprint 93 — Duplication Refactor + Sonar Fixes

Status: Closed

Objective:
Act on the Sprint 92 "Option B" recommendation: reduce code duplication directly rather than only adjusting Sonar thresholds.

Results:

- Extracted chunkToMilvusEntity and truncateTextForMilvus into src/knowledge/ingest/milvus-client.js, eliminating an S1192 (duplicated string literals) violation between milvus-client.js and ingest-sprint-history.js.
- Removed an unused truncateTextForMilvus import (S1128) and wrapped a bare map callback (S7727).
- Formatting-only cleanup in the Sprint 92 guard test.
- Added watcher coverage tests for `_tick` branches, the recovery loop, and git monitoring.
- No tag recorded for this sprint; verified via commit history (87d5e385, 8bc3443b, bd30f44f, 6d8ba00f).

## Sprint 94 — Watcher Coverage Expansion

Status: Closed

Objective:
Continue closing coverage gaps in the file-watcher module identified during Sprint 93.

Results:

- Added watcher coverage tests for `_appBaseDir`, `getConfig` → `loadConfig()` path, `getStoragePaths`/`normalizeStoragePath`, `maxAgeDays`, `readIndex`/`readSnapshot`, `pruneIndex`, `appendChanges`, `queueChange`, `flushPending`, `recentChanges`, `indexAll`, `watch`, `close`, `fileSize`, `storagePaths()`.
- No tag recorded for this sprint; verified via commit 3ad041ed.

## Sprint 95 — Repo Hygiene: Dead Code, Duplicate Files, and Stray Artifacts

Status: Planned

Objective:
Clean up accumulated repo debris discovered while investigating a coverage-reporting anomaly, and bring project documentation back in sync with actual sprint history (which had drifted to "sprint92-stable" while work had already progressed through Sprint 94).

Scope:

- Remove src/local-llm.js, a stale pre-migration duplicate of src/llm/local-llm.js (same logic, missing the loadConfig/assertFeatureEnabled guard added later) that was inflating coverage instrumentation with a 0%-covered phantom file. (Completed ahead of this sprint's formal close, per the local-llm.js investigation.)
- Exclude src/knowledge/ingest/milvus-client.ts and src/knowledge/ingest/ingest-sprint-history.ts from vitest.config.ts coverage — these are intentional typed-spec companions to their .js runtime counterparts (verified live via 15+ existing guard tests: sprint42-smoke, sprint43-smoke, sprint66-remediation-guard, sprint77-build-and-scope-guard, sprint79-sonar-scope-guard, sprint84-quality-and-scope-guard, sprint92-thread-and-coverage-guard), not dead code, but were never added to the coverage exclude list and were dragging down reported coverage with 0%-covered phantom rows.
- Remove ~24 stray zero-byte/garbage files in repo root (e.g. `LocalLlmInference,`, `actionsCount`, `sha256:`) created by a broken terminal paste of local-llm.js source content; same root cause produced one malformed, empty test file (`tests/ingest sprint history.coverage additions.test.js`, spaces instead of hyphens) which was also removed.
- Update CURRENT_ACTIVE_SNAPSHOT.md and this file to document Sprints 82 through 94, which had completed but were never written up here.

Exit Criteria:

- `npm run coverage` shows a single clean row for local-llm.js (no duplicate phantom row).
- vitest.config.ts coverage.exclude includes the two confirmed dead-at-runtime .ts files.
- `git status` is clean of stray untracked garbage files.
- CURRENT_ACTIVE_SNAPSHOT.md points to sprint95 (or later).
- tests/sprint95-guard.test.js passes, confirming the snapshot pointer and this documentation block both exist.
