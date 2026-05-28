Here is the full Sprint 17 execution plan. Each task is self-contained with context, prerequisites, and a memory snapshot instruction at the end.

---

## Sprint 17 — Execution & Validation Prompt Set

---

### TASK 0 — Session Bootstrap (send this first, every session)

```
Continue the previous task from the last completed step. Do not restart from scratch.

SESSION INIT:
1. Read file: strategic-learning-unified-theatre-master-instructions (locate in repo root or docs/)
2. Read the LATEST AI snapshot only — find the file tagged [LATEST] or with the highest sprint number in the snapshots folder. Do NOT scan all snapshots.
3. Print a 5-line summary of current project state and last completed sprint step.
4. Confirm Sprint 17 scope is loaded from attached documents (security-governance config split, schema validation, structured waiver store, waiver expiry enforcement, enhanced reconciliation with audit provenance, readiness check with failure-mode philosophy, CI workflow, Node runtime declaration).
5. Confirm you are ready to receive Task 1.
```

---

### TASK 1 — Config Split + Schema Validation Script

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. Sonar governance config must be split into policy (security-governance.json) and runtime (ci-runtime.json). A validation script must confirm both files are well-formed.

PREREQUISITES:
- Session bootstrap (Task 0) completed and AI snapshot loaded.
- Node >=18 available (run: node -v to confirm before proceeding).
- ajv package available or will be added to package.json.

TASK:
1. Create config/security-governance.json with the exact content from Sprint 17 patch §1 (sonar, release, acknowledgedWaiver, secretScanning, hotspotWaiverSchema blocks).
2. Create config/ci-runtime.json with the exact content from Sprint 17 patch §1 (retryMaxAttempts, retryBaseDelayMs, retryJitterMs, waitTimeoutSec, waitIntervalMs, artifactRetentionDays, sonarScannerVersion, nodeVersionRequired).
3. Create scripts/validate-governance-config.mjs with the exact content from Sprint 17 patch §2.
4. Add "ajv": "^8.12.0" to package.json dependencies if not already present.
5. Add script entry: "validate:governance": "node scripts/validate-governance-config.mjs" to package.json scripts.
6. Run: node scripts/validate-governance-config.mjs and confirm output is "Governance and runtime config validation passed."

VALIDATION: Output of step 6 must be clean exit (code 0). Show exit code.

MEMORY SNAPSHOT: After validation passes, append to the latest AI snapshot:
"[SPRINT17-T1-DONE] Config split complete. security-governance.json and ci-runtime.json created. validate-governance-config.mjs passes. ajv added."
Tag the snapshot file with [LATEST] and remove [LATEST] tag from any previous snapshot.

Do not proceed to Task 2 until validation passes.
```

---

### TASK 2 — Structured Waiver Store + Waiver Validation Script

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. Markdown waiver register is replaced with a structured JSON waiver store. A validation script enforces schema, expiry, and renewal limits using config from security-governance.json.

PREREQUISITES:
- Task 1 complete ([SPRINT17-T1-DONE] present in latest AI snapshot).
- config/security-governance.json exists and validates.
- ajv is installed (npm install if needed).

TASK:
1. Create directory docs/security/hotspots/ if it does not exist.
2. Create docs/security/hotspots/waivers.json with the example entry from Sprint 17 patch §3 (adjust hotspotKey, owner, ticket, reviewer, expires, notes to match any real entries from existing markdown register if present; otherwise use the example values).
3. Create scripts/validate-waivers.mjs with the exact content from Sprint 17 patch §4.
4. Add script entry: "sonar:validate-waivers": "node scripts/validate-waivers.mjs" to package.json scripts.
5. Run: node scripts/validate-waivers.mjs and confirm output is "Waiver validation passed."
6. If any existing markdown waiver register exists (docs/security/hotspot-register.md or similar), migrate all entries to waivers.json using the schema fields: hotspotKey, status, owner, ticket, reviewer, expires, notes, renewalCount, createdAt, createdBy. Keep the markdown file but add a header: "DEPRECATED: Source of truth is docs/security/hotspots/waivers.json".

VALIDATION: Step 5 must exit 0. Show exit code.

MEMORY SNAPSHOT: Append to latest AI snapshot:
"[SPRINT17-T2-DONE] Structured waiver store created at docs/security/hotspots/waivers.json. validate-waivers.mjs passes. Markdown register deprecated."
```

---

### TASK 3 — Enhanced Reconciliation Script with Audit Provenance

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. Hotspot reconciliation must read from structured waivers.json (not markdown), compare against Sonar hotspots export, and write a reconciliation-audit.json with full CI provenance.

PREREQUISITES:
- Task 2 complete ([SPRINT17-T2-DONE] in latest AI snapshot).
- docs/security/hotspots/waivers.json exists and validates.
- reports/sonar/ directory exists (create it with placeholder files if not yet present so the script can be tested).

TASK:
1. Create scripts/reconcile-hotspot-register.mjs with the exact content from Sprint 17 patch §5.
2. Add script entry: "sonar:reconcile": "node scripts/reconcile-hotspot-register.mjs" to package.json scripts.
3. Create placeholder test files for local validation:
   - reports/sonar/hotspots.json → { "hotspots": [] }
   - reports/sonar/metadata.json → { "projectKey": "test", "branch": "main", "pullRequest": null }
4. Run: node scripts/reconcile-hotspot-register.mjs
   Expected: if waivers.json has entries and hotspots.json is empty, it will report stale waivers. This is acceptable for placeholder test — confirm the script runs without crash and writes reports/sonar/reconciliation-audit.json.
5. Inspect reconciliation-audit.json and confirm it contains: analyzedAt, projectKey, branch, sonarKeysCount, waiverKeysCount, missingInRegister, staleInRegister, reconciliationPassed fields.

VALIDATION: Script exits (any code) without crash. reconciliation-audit.json is written and contains all required fields.

MEMORY SNAPSHOT: Append to latest AI snapshot:
"[SPRINT17-T3-DONE] reconcile-hotspot-register.mjs updated for structured waivers + audit provenance. reconciliation-audit.json structure confirmed."
```

---

### TASK 4 — Readiness Check with Failure-Mode Philosophy

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. The Sonar readiness check must read governance config and apply fail-closed logic for protected branches. It must enumerate QG failure conditions rather than assuming BUG/VULNERABILITY only.

PREREQUISITES:
- Task 3 complete ([SPRINT17-T3-DONE] in latest AI snapshot).
- config/security-governance.json exists.
- reports/sonar/quality-gate.json and reports/sonar/hotspots.json exist (placeholders acceptable).

TASK:
1. Create/replace scripts/check-sonar-readiness.mjs with the exact content from Sprint 17 patch §6.
2. Add or update script entry: "sonar:check": "node scripts/check-sonar-readiness.mjs" in package.json scripts.
3. Create placeholder: reports/sonar/quality-gate.json → { "projectStatus": { "status": "OK", "conditions": [] } }
4. Run local validation test A — QG OK, no unresolved hotspots:
   IS_PROTECTED_BRANCH=false node scripts/check-sonar-readiness.mjs
   Expected: "Sonar readiness check passed." exit 0.
5. Run local validation test B — QG ERROR:
   Temporarily set quality-gate.json status to "ERROR", run again with IS_PROTECTED_BRANCH=true.
   Expected: exit 1 with failure reason printed.
6. Restore quality-gate.json to OK after test B.

VALIDATION: Test A exits 0. Test B exits 1. Show both exit codes.

MEMORY SNAPSHOT: Append to latest AI snapshot:
"[SPRINT17-T4-DONE] check-sonar-readiness.mjs updated with fail-closed logic and QG condition enumeration. Both pass/fail paths validated."
```

---

### TASK 5 — package.json, Node Runtime Declaration + Preflight

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. Node >=18 must be declared in package.json engines. CI must verify this at runtime before any Sonar steps execute.

PREREQUISITES:
- Task 4 complete ([SPRINT17-T4-DONE] in latest AI snapshot).
- package.json exists.

TASK:
1. Add to package.json: "engines": { "node": ">=18" } at top level (if not already present).
2. Confirm all Sprint 17 script entries are present in package.json scripts:
   sonar:scan, sonar:wait, sonar:export, sonar:check, sonar:validate-waivers, sonar:reconcile, validate:governance.
   Add any missing entries (use "echo 'not implemented'" as placeholder for sonar:scan/wait/export if those scripts don't exist yet).
3. Run: node -e "const v=process.versions.node.split('.')[0]; if(parseInt(v)<18){console.error('Node too old:',v);process.exit(1);} console.log('Node version OK:',process.versions.node);"
   Expected: "Node version OK: <version>"
4. Run: npm run validate:governance
   Expected: clean pass.
5. Run full npm test with extended timeout:
   npm test --timeout=350000
   Wait silently for completion (up to 350 seconds). Do not print intermediate output. After completion, print only: pass/fail count and exit code.

VALIDATION: Steps 3 and 4 exit 0. npm test result printed after completion.

MEMORY SNAPSHOT: Append to latest AI snapshot:
"[SPRINT17-T5-DONE] package.json engines declared (node>=18). All Sprint 17 script entries confirmed. npm test result: [PASS/FAIL - fill in actual result]."
```

---

### TASK 6 — CI Workflow Update (GitHub Actions)

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. The GitHub Actions workflow must be updated with concurrency cancellation, secret scanning, preflight checks, waiver validation, reconciliation, artifact upload, and Node 18.

PREREQUISITES:
- Task 5 complete ([SPRINT17-T5-DONE] in latest AI snapshot).
- .github/workflows/ directory exists.

TASK:
1. Create or replace .github/workflows/sonar-governance.yml with the exact content from Sprint 17 patch §7.
2. Verify the workflow file is valid YAML: run: node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/sonar-governance.yml','utf8')); console.log('YAML valid');" (install js-yaml if needed: npm install js-yaml --save-dev).
3. Confirm concurrency block is present with cancel-in-progress: true.
4. Confirm IS_PROTECTED_BRANCH env var is set using github.ref expression.
5. Confirm artifact upload step has retention-days: 90 and if-no-files-found: error.
6. Confirm secret scanning step (gitleaks-action) is present and continue-on-error: false.

VALIDATION: YAML parses without error. All 4 confirmations in steps 3-6 pass (print "confirmed" for each).

MEMORY SNAPSHOT: Append to latest AI snapshot:
"[SPRINT17-T6-DONE] sonar-governance.yml updated: concurrency cancel, gitleaks, preflight, waiver validation, reconciliation, 90-day artifact retention. YAML valid."
```

---

### TASK 7 — Master Instructions Update + Snapshot Tagging

```
Continue the previous task from the last completed step. Do not restart from scratch.

CONTEXT: Sprint 17 / strategic-learning-unified-theatre. Master instructions must reflect Sprint 17 completion. The latest AI snapshot must be tagged [LATEST] so Copilot can find it without scanning all snapshots.

PREREQUISITES:
- Tasks 1-6 all complete (all [SPRINT17-Tx-DONE] entries present in snapshot).
- strategic-learning-unified-theatre-master-instructions file is accessible.

TASK:
1. Open strategic-learning-unified-theatre-master-instructions.
2. Locate the Sprint progress section (or create one if absent).
3. Add/update the following block:

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

4. Create a new AI snapshot file named: ai-snapshot-sprint17.md (or increment existing numbering convention).
5. Populate it with:
   - All [SPRINT17-Tx-DONE] entries from Tasks 1-6
   - Current repo structure summary (key files added this sprint)
   - Open items / Sprint 18 candidates
   - Tag the first line with: [LATEST][SPRINT17]
6. Find any previous snapshot tagged [LATEST] and replace its tag with [SPRINT16] (or appropriate sprint number).
7. Confirm the new snapshot is the only file tagged [LATEST].

VALIDATION: Master instructions updated. New snapshot exists with [LATEST][SPRINT17] tag. Previous snapshot no longer carries [LATEST].

DONE: Sprint 17 complete. Print final summary of all 7 tasks and their pass/fail status.
```

---

## Quick Reference — Task Order & Prerequisites

| Task | Name                                     | Prerequisite |
| ---- | ---------------------------------------- | ------------ |
| 0    | Session Bootstrap                        | —            |
| 1    | Config Split + Schema Validation         | T0           |
| 2    | Structured Waiver Store                  | T1           |
| 3    | Reconciliation + Audit Provenance        | T2           |
| 4    | Readiness Check (fail-closed)            | T3           |
| 5    | package.json + Node Preflight + npm test | T4           |
| 6    | CI Workflow (GitHub Actions)             | T5           |
| 7    | Master Instructions + Snapshot Tagging   | T6           |

Send Task 0 to open the session, then Tasks 1–7 one at a time. Each task's memory snapshot carries forward all context so no state is lost between commands.
