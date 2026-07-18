# Coverage 100% Analysis — Authoritative Line-by-Line Audit

> Generated: 2026-07-19 (FRESH SCAN) | Framework: Vitest v4.1.9 | Provider: v8
> Config: `vitest.test-ci.config.ts` | Thresholds: 95% branches (global)
> Status: **✅ ALL TESTS PASSING** — 6032/6032 tests across 338 test files (2026-07-19 fresh scan)

**✅ Test Run Status**: 338 test files | 6032 passed (6032 total) | 0 tests failed | Duration: 33.82s
**Coverage for experience-db.js**: 98.6% statements, **95.05% branches** (14 uncovered), 96.47% functions, 98.82% lines

### Gateway.ts Current State:

- **Branches**: 98.28% (3 uncovered branches: lines 133, 203 dead code + line 772 error accumulation)
- **41 total tests added** across 2 test files (31 + 10)
- **9 branches covered in Phase 2**: lines 427, 540, 639, 660, 711, 877, 943, 944, 945
- **3 branches remain uncovered**:
  - Lines 133, 203: Dead code (null-coalescing on RegExp.exec().index — always defined per ECMAScript spec) — PENDING REVIEW, no v8-ignore applied
  - Line 772: Error accumulation branch in `ask()` fallback loop — requires further investigation

### LLM.js Current State:

- **Branches**: 95.51% (7 uncovered) — 25 new tests added in `tests/commands/llm-branch-coverage.test.js`
- **7 branches remain uncovered** (all `err?.message ?? err` null-coalescing fallback patterns):
  - BRDA:203,22,1,0 — `formatValidationError`: `String(err)` fallback
  - BRDA:254,26,1,0 — `setup` command: `verifyLocalLlmRuntime()` catch
  - BRDA:288,28,1,0 — `ask` command: `verifyLocalLlmRuntime()` catch
  - BRDA:395,36,1,0 — `topics` command: `db.open()` catch
  - BRDA:467,41,1,0 — `export-training` command: catch
  - BRDA:693,64,1,0 — `mistake add` command: catch
  - BRDA:826,74,1,0 — `rate-prompt` command: catch

### Experience-DB.js Current State:

- Branches: 95.05% (14 uncovered) — 89 tests all passing

### Document-Ingester.js Current State:

- Branches: 93.37% (11 uncovered) — targeted tests added in `tests/llm/document-ingester-coverage.test.js`

### Routing-History and AI Command Coverage:

- Branch-focused tests in `tests/llm/routing-history-coverage.test.ts` and `tests/commands/ai.coverage-additions.test.js`

### Dashboard.js Current State:

- Branches: 95.0% (29 uncovered) — ⛔ DO NOT EDIT per user instruction

## Executive Summary

| Metric     | Coverage           | Target | Status  |
| ---------- | ------------------ | ------ | ------- |
| Statements | 99.39% (9864/9924) | 95%    | ✅ PASS |
| Branches   | 96.4% (6266/6500)  | 95%    | ✅ PASS |
| Functions  | 98.83% (1778/1799) | 95%    | ✅ PASS |
| Lines      | 99.6% (9221/9258)  | 95%    | ✅ PASS |

**✅ ALL THRESHOLDS PASSING** — Branch coverage at 96.4% (exceeds 95% threshold by 1.4pp). **234 total uncovered branches across 44 files**.

### Key Findings

1. **✅ 95% BRANCH THRESHOLD MET** — Branch coverage at 96.4% (6266/6500) — all thresholds passing
2. **✅ ALL TESTS PASSING** — 6032/6032 tests across 338 test files
3. **234 uncovered branches remain** across 44 files
4. **Tier 3 quick wins available**: 10 files with exactly 1 uncovered branch each — candidates for v8-ignore or targeted tests
5. **PENDING REVIEW policy**: Dead-code branches are documented as PENDING REVIEW below with detailed reasoning — no v8-ignore applied silently. User will review and decide.
6. **Major gap files**: 7 files with 10+ uncovered branches account for 116 of 234 uncovered branches (49.6% of total)

### PENDING REVIEW — Dead-Code Branches (No v8-ignore Applied)

**Policy**: Per user instruction, no v8-ignore annotations are applied silently. All dead-code branches are documented here with detailed reasoning. User will review later and come back to apply v8 ignore if needed.

**Fresh Scan Results**: 234 uncovered branches across 44 files. The following are confirmed dead-code/defensive branches that appear unreachable in normal operation.

**Tier 3 Quick Wins (1 uncovered branch each — candidates for v8-ignore or targeted tests)**:

| File                                      | BRDA Location  | Uncovered Branch                                | Detailed Reason It Appears Unreachable                                                                                                             | Recommendation              |
| ----------------------------------------- | -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `src/security/secrets/gitleaks-runner.ts` | BRDA:39,5,1,0  | `return "unknown"` fallback category            | All gitleaks rule ID patterns are comprehensively mapped. "unknown" fires only for unmapped rule IDs that don't exist in current gitleaks ruleset. | v8-ignore (dead code)       |
| `src/security/secrets/baseline.ts`        | BRDA:18,0,5,0  | switch default for unknown provider             | All known providers are explicitly enumerated in cases. Default is a defensive fallback for future providers.                                      | v8-ignore (dead code)       |
| `src/policies/sensitive-task-rules.ts`    | BRDA:72,6,0,0  | `if (!m) continue` true branch (regex no-match) | Task rule lines always follow the expected format. Only fires on malformed lines.                                                                  | v8-ignore (defensive)       |
| `src/llm/status.ts`                       | BRDA:11,0,5,0  | switch default for unknown provider             | All known providers are enumerated in cases. Default is a fallback for future providers only.                                                      | v8-ignore (dead code)       |
| `src/llm/knowledge-graph.js`              | BRDA:184,2,0,0 | Edge case branch for empty graph                | Knowledge graph is always initialized with at least one node during startup.                                                                       | Targeted test or v8-ignore  |
| `src/internal/reporter.js`                | BRDA:37,6,0,0  | `if (!m) continue` true branch (regex no-match) | Journal lines always start with `- ` prefix. Only fires on malformed lines.                                                                        | v8-ignore (defensive)       |
| `src/governance/workspace-context.ts`     | BRDA:70,1,0,0  | Null check for workspace root                   | Workspace root is always resolved before workspace-context is loaded.                                                                              | v8-ignore (defensive)       |
| `src/commands/handoff.js`                 | BRDA:19,0,1,0  | `if (Array.isArray(err?.issues))` false branch  | Defensive ZodError fallback. Non-ZodError path is unreachable in normal flow.                                                                      | CONFIRMED v8-ignore applied |
| `src/commands/browser.js`                 | BRDA:557,2,0,0 | Browser launch failure branch                   | Browser launch is highly reliable in test environment. Failure path is a defensive handler.                                                        | Targeted test or v8-ignore  |
| `src/cli/llm-routing.ts`                  | BRDA:10,1,0,0  | Routing fallback for unmatched patterns         | All LLM provider patterns are explicitly matched. Fallback fires only for unrecognized patterns.                                                   | v8-ignore (dead code)       |

**Strategy**: 95% threshold is now met. Focus on reducing total uncovered branches for higher coverage targets. Tier 3 quick wins (10 files with 1 branch each) remain available for v8-ignore or targeted tests. Total uncovered: 234 branches across 44 files.

---

## Remediation Progress (44 Files with Uncovered Branches — FRESH SCAN 2026-07-19)

Sorted by uncovered branch count (descending). **96.4% branches — 234 uncovered branches total — ALL THRESHOLDS PASSING**.

**TIER 1: Major Gap Files (10+ uncovered branches)**

| #   | File                                          | Uncovered | Status                                                                              |
| --- | --------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| 1   | `src/ui/dashboard.js`                         | 29        | ⛔ DO NOT EDIT — user instruction (29 uncovered branches remain)                    |
| 2   | `src/llm/routing-history.ts`                  | 17        | 🔥 HIGH — PENDING REVIEW (routing logic branches)                                   |
| 3   | `src/daemon/watcher.js`                       | 14        | 🔄 IN PROGRESS (86.9% branches — 14 remain)                                         |
| 4   | `src/llm/experience-db.js`                    | 14        | ✅ ANALYZED (95.05% branches — 14 uncovered branches documented, all tests passing) |
| 5   | `src/llm/document-ingester.js`                | 11        | 🔥 HIGH — PENDING REVIEW (document processing branches)                             |
| 6   | `src/commands/ai.js`                          | 10        | ⏳ Pending (command routing branches)                                               |
| 7   | `src/storage/symbol-extractor.ts`             | 9         | ⏳ Pending (symbol extraction branches)                                             |
| 8   | `src/llm/prompt-generator.js`                 | 8         | ⏳ Pending (prompt generation branches)                                             |
| 9   | `src/policies/provider-policy.ts`             | 8         | ✅ IMPROVED (93.4% branches — 8 remain)                                             |
| 10  | `src/test-runner.js`                          | 7         | ⏳ Pending (test runner branches)                                                   |
| 11  | `src/commands/llm.js`                         | 7         | ✅ IMPROVED (95.5% branches — 7 `err?.message ?? err` patterns remain)              |
| 12  | `src/governance/workspace-quotas.ts`          | 7         | ⏳ Pending (workspace quota branches)                                               |
| 13  | `src/internal/paths.js`                       | 7         | ⏳ Pending (path resolution branches)                                               |
| 14  | `src/security/security-overview/auto-scan.ts` | 7         | ⏳ Pending (security scan branches)                                                 |

**TIER 2: Medium Gap Files (2-6 uncovered branches)**

| #   | File                                           | Uncovered | Status                                                                            |
| --- | ---------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| 15  | `src/installer/hw-probe/hwProbe.ts`            | 6         | ⏳ Pending                                                                        |
| 16  | `src/shared/retrieval/code-search.ts`          | 6         | ⏳ Pending                                                                        |
| 17  | `src/internal/git-monitor.js`                  | 5         | 🔄 Partial (90% branches via 7 new tests — 5 remain)                              |
| 18  | `src/llm/embeddings.js`                        | 5         | ⏳ Pending                                                                        |
| 19  | `src/security/risks/parsers.ts`                | 5         | ⏳ Pending                                                                        |
| 20  | `src/accounts/profile-manager.js`              | 4         | ⏳ Pending                                                                        |
| 21  | `src/llm/local-llm.js`                         | 4         | ⏳ Pending                                                                        |
| 22  | `src/security/security-overview/ai-explain.ts` | 4         | ⏳ Pending                                                                        |
| 23  | `src/browser-bridge.js`                        | 3         | ⏳ Pending                                                                        |
| 24  | `src/knowledge/ingest/ingest-repository.js`    | 3         | ⏳ Pending                                                                        |
| 25  | `src/llm/agent-loop-guard.js`                  | 3         | ⏳ Pending                                                                        |
| 26  | `src/llm/gateway.ts`                           | 3         | ✅ NEARLY COMPLETE (98.3% branches — 3 remain: 2 dead code, 1 error accumulation) |
| 27  | `src/security/security-overview/normalizer.ts` | 3         | ⏳ Pending                                                                        |
| 28  | `src/shared/retrieval/vector-client.ts`        | 3         | ⏳ Pending                                                                        |
| 29  | `src/agents/tool-call-classifier.ts`           | 2         | ⏳ Pending                                                                        |
| 30  | `src/daemon/daemonStatus.js`                   | 2         | ⏳ Pending                                                                        |
| 31  | `src/internal/config.js`                       | 2         | ⏳ Pending                                                                        |
| 32  | `src/llm/training-exporter.js`                 | 2         | 🔄 Nearly complete (98.2% branches)                                               |
| 33  | `src/security/security-overview/drift.ts`      | 2         | ⏳ Pending                                                                        |
| 34  | `src/shared/retrieval/router.ts`               | 2         | ⏳ Pending                                                                        |

**TIER 3: Quick Wins (1 uncovered branch each)**

| #   | File                                      | Uncovered | BRDA Location | Status                                                             |
| --- | ----------------------------------------- | --------- | ------------- | ------------------------------------------------------------------ |
| 35  | `src/cli/llm-routing.ts`                  | 1         | BRDA:10       | 🎯 QUICK WIN — routing edge case                                   |
| 36  | `src/commands/browser.js`                 | 1         | BRDA:557      | 🎯 QUICK WIN — browser launch failure                              |
| 37  | `src/commands/handoff.js`                 | 1         | BRDA:19       | 🎯 QUICK WIN — defensive ZodError fallback (already has v8-ignore) |
| 38  | `src/governance/workspace-context.ts`     | 1         | BRDA:70       | 🎯 QUICK WIN — null check branch                                   |
| 39  | `src/internal/reporter.js`                | 1         | BRDA:37       | 🎯 QUICK WIN — regex no-match continue branch                      |
| 40  | `src/llm/knowledge-graph.js`              | 1         | BRDA:184      | 🎯 QUICK WIN — edge case branch                                    |
| 41  | `src/llm/status.ts`                       | 1         | BRDA:11       | 🎯 QUICK WIN — switch default for unknown provider                 |
| 42  | `src/policies/sensitive-task-rules.ts`    | 1         | BRDA:72       | 🎯 QUICK WIN — defensive check branch                              |
| 43  | `src/security/secrets/baseline.ts`        | 1         | BRDA:18       | 🎯 QUICK WIN — switch default for unknown provider                 |
| 44  | `src/security/secrets/gitleaks-runner.ts` | 1         | BRDA:39       | 🎯 QUICK WIN — dead code return "unknown" fallback                 |

**TIER 4: Completed Files (0 uncovered branches)**

| #   | File                                            | Uncovered | Status                      |
| --- | ----------------------------------------------- | --------- | --------------------------- |
| 45  | `src/commands/idea.js`                          | 0         | ✅ Complete (100% branches) |
| 46  | `src/internal/journal.js`                       | 0         | ✅ Complete (100% branches) |
| 47  | `src/shared/retrieval/execute-retrieve.ts`      | 0         | ✅ COMPLETE (100% branches) |
| 48  | `src/mcp/server.ts`                             | 0         | ✅ COMPLETE (100% branches) |
| 49  | `src/knowledge/ingest/ingest-sprint-history.js` | 0         | ✅ COMPLETE (100% branches) |
| 50  | `src/llm/qdrant-client.js`                      | 0         | ✅ COMPLETE (100% branches) |

**Current focus**: 95% threshold is now met. Focus on reducing total uncovered branches (234 remaining) for higher coverage targets.

---

## 2. Zero-Coverage Files (6 files — intentionally excluded)

These files are excluded from coverage tracking:

| File                               | Reason                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| `src/knowledge/ingest/chunking.ts` | Shadowed TypeScript file (`.js` is the runtime version)           |
| `src/knowledge/ingest/embedder.ts` | Shadowed TypeScript file (`.js` is the runtime version)           |
| `src/llm/qdrant-client.ts`         | Shadowed TypeScript file (`.js` is the runtime version)           |
| `src/shared/contracts/provider.ts` | Pure type definitions — no runtime code                           |
| `src/shared/errors/index.ts`       | Barrel re-export only — no executable statements                  |
| `src/storage/run-indexer.ts`       | CLI entry point — `import.meta.url` guard prevents test execution |

---

## 3. Critical Coverage Gaps — Files Below 95% Statements

### 3.1 `src/knowledge/ingest/ingest-repository.js` — 89.5% stmt, 91.2% br, 92.3% fn, 89.6% lines

**Uncovered lines**: Lines 178-194 (attachVectors edge cases and CLI entry block)

**Root Cause**:

1. **CLI entry block**: `isDirectRun()` guard prevents execution during tests
2. **Edge cases in attachVectors**: Oversized chunks and vector count mismatch not tested

**Uncovered BRDA branches**:

```
BRDA:61,1,0,0    — file discovery edge case
BRDA:68,4,1,0    — skippedLargeFiles > 0
BRDA:79,5,0,0    — chunks.length === 0
BRDA:80,6,0,0    — batch processing edge
BRDA:97,7,1,0    — vector mismatch error
BRDA:141,15,0,0  — attachVectors: safeChunks === 0
BRDA:191,17,0,0  — attachVectors: oversized chunk
BRDA:197,18,0,0  — attachVectors: vector count check
BRDA:202,19,0,0  — attachVectors: vector assignment
```

### 3.2 `src/llm/inference.js` — 83.4% stmt, 75.8% br, 96.8% fn, 84.1% lines

**Uncovered paths**:

1. **Windows-specific code** (lines 37-41): Never runs on Linux CI
2. **node-llama-cpp provider** (lines 68, 97, 294-335): Alternative provider not installed in test env
3. **Error paths and edge cases** (lines 114, 123, etc.): Hard to trigger without specific failure conditions

### 3.3 `src/llm/gateway.ts` — 99.2% lines, 98.3% branches (3 uncovered), 100% functions

> **FRESH SCAN: 2026-07-19** | BRF:175 BRH:172 (3 uncovered) | LF:253 LH:251 | FNF:29 FNH:29 | STMT: 258/260 (99.2%)
> **File size**: 1074 lines | **Functions**: 29 total, 29 hit (100%) | **Status**: ✅ NEARLY COMPLETE (98.3% branches — 3 remain)

**3 branches remain uncovered**:

| Category                  | Uncovered Branches | Lines    | Testability  | Recommendation                                                                                       |
| ------------------------- | ------------------ | -------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| Defensive null-coalescing | 2                  | 133, 203 | ❌ Dead code | PENDING REVIEW — v8-ignore candidate (fallback never triggers per ECMAScript spec)                   |
| Error accumulation        | 1                  | 772      | ⚠️ Difficult | Requires specific all-providers-fail scenario in `ask()` fallback loop — needs further investigation |

**BRDA:133,6,1,0 — Line 133: `tryTruncateToolResult` — `match.index ?? 0` fallback to 0**

- **Why uncovered**: `match.index` is ALWAYS defined when a regex `.exec()` succeeds. The `?? 0` fallback is dead code.
- **Recommendation**: `/* v8 ignore next */` — confirmed dead code per ECMAScript spec.
- **Category**: ❌ Dead code — PENDING REVIEW for v8-ignore annotation.

**BRDA:203,12,1,0 — Line 203: `tryMarkerBasedFallback` — `userRequestMatch.index ?? 0` fallback to 0**

- **Why uncovered**: Identical pattern to line 133. `RegExp.exec()` guarantees `.index` on successful matches.
- **Recommendation**: `/* v8 ignore next */` — confirmed dead code.
- **Category**: ❌ Dead code — PENDING REVIEW for v8-ignore annotation.

**BRDA:772,52,1,0 — Line 772: `ask` — `if (result.error)` true branch**

- **Why uncovered**: Tests either succeed on the first provider or don't test the "all providers fail" fallback loop scenario.
- **Recommendation**: Targeted test — all-providers-fail scenario.
- **Category**: ✅ Testable — all providers failing in fallback chain.

---

## 4. Dashboard.js — Detailed Branch Analysis (29 uncovered branches)

**File**: `src/ui/dashboard.js` | **Fresh run**: 100% statements, 95% branches, 100% functions, 100% lines.
**Current gap**: 29 uncovered branches remain. They are concentrated in defensive UI branches that guard against missing DOM nodes, empty inputs, and empty async results.

### 4.1 Branch taxonomy (fresh scan 2026-07-19)

| Group                                          | Uncovered branches | Why they remain uncovered                                                                                                     |
| ---------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| State setter / DOM-guard branches              | 4                  | Tests cover the normal element-present path, but do not execute the false branch for missing DOM nodes.                       |
| Filter / quota helper branches                 | 2                  | `getFilter()` returns `undefined` when no filter values are collected.                                                        |
| Audit guard branch                             | 1                  | `setAuditVerificationState()` exits early when either the badge or alert element is missing.                                  |
| Security overview / baseline / drift branches  | 15                 | These paths are guarded by null checks around the security overview output, empty baseline paths, and missing drift elements. |
| Knowledge / risk / quota-notification branches | 7                  | Fallback branches for missing table bodies, empty target paths, or absent output containers.                                  |

### 4.2 Key branch details

#### Group A — state setter guards (4 branches)

- Line 83 — `setWalkthroughState()` writes sync value only when element exists
- Line 189 — `setDriftHistoryState()` same pattern for compliance drift value element
- Line 198 — `setDemoPersistenceState()` guards persistence value element
- Line 207 — `setDemoPersistenceState()` skips `setComplianceState()` when label is `standby`

#### Group B — filter and quota helpers (2 branches)

- Line 436 — `getFilter()` returns `undefined` when filter object remains empty
- Line 536 — `setQuotaForm()` only assigns threshold input when element exists

#### Group C — audit guard (1 branch)

- Line 615 — `setAuditVerificationState()` returns early when badge or alert element is missing

#### Group D — security flows (15 branches)

- Lines 1300, 1313, 1316 — `loadSecurityOverview()` and `saveSecurityBaseline()` output-target and empty-input guards
- Lines 1344, 1353, 1360, 1401 — `compareSecurityBaseline()` drift-related node guards
- Lines 1445, 1454, 1462 — `explainIntroducedFindings()` output/body guards and catch-path
- Lines 1465-1469 — `loadSecurityTriage()`, `applySecurityTriage()`, `runSecretsScan()` empty-input and missing-body guards

#### Group E — knowledge, risk, and quota-notification flows (7 branches)

- Lines 1552 and 1565 — `runKnowledgeSearch()` missing-body branch
- Lines 1612-1615 — risks-scan-deps handler early return for empty repo path and fallback branches
- Line 1703 — reset-daily quota handler absent-node branch

### 4.3 Summary

The remaining dashboard branches are defensive UI guards that fail safely when the DOM is incomplete or the user submits an empty state. The current tests cover the primary success path well.

---

## 5. Full Coverage Table (All Files with Uncovered Branches — Fresh Data 2026-07-19)

| #   | File                                           | Uncovered | Branch % | Stmt % | Priority    |
| --- | ---------------------------------------------- | --------- | -------- | ------ | ----------- |
| 1   | `src/ui/dashboard.js`                          | 29        | 95.0%    | 100.0% | HIGH        |
| 2   | `src/llm/routing-history.ts`                   | 17        | 84.0%    | 99.5%  | HIGH        |
| 3   | `src/daemon/watcher.js`                        | 14        | 86.9%    | 100.0% | IN PROGRESS |
| 4   | `src/llm/experience-db.js`                     | 14        | 95.0%    | 98.6%  | HIGH        |
| 5   | `src/llm/document-ingester.js`                 | 11        | 93.4%    | 99.0%  | HIGH        |
| 6   | `src/commands/ai.js`                           | 10        | 91.5%    | 100.0% | MEDIUM      |
| 7   | `src/storage/symbol-extractor.ts`              | 9         | 89.4%    | 95.9%  | MEDIUM      |
| 8   | `src/llm/prompt-generator.js`                  | 8         | 92.2%    | 96.1%  | MEDIUM      |
| 9   | `src/policies/provider-policy.ts`              | 8         | 93.4%    | 99.4%  | HIGH        |
| 10  | `src/test-runner.js`                           | 7         | 95.4%    | 97.1%  | MEDIUM      |
| 11  | `src/commands/llm.js`                          | 7         | 95.5%    | 100.0% | HIGH        |
| 12  | `src/governance/workspace-quotas.ts`           | 7         | 93.8%    | 100.0% | MEDIUM      |
| 13  | `src/internal/paths.js`                        | 7         | 93.1%    | 98.2%  | MEDIUM      |
| 14  | `src/security/security-overview/auto-scan.ts`  | 7         | 84.8%    | 100.0% | MEDIUM      |
| 15  | `src/installer/hw-probe/hwProbe.ts`            | 6         | 93.2%    | 99.1%  | MEDIUM      |
| 16  | `src/shared/retrieval/code-search.ts`          | 6         | 83.3%    | 98.0%  | MEDIUM      |
| 17  | `src/internal/git-monitor.js`                  | 5         | 90.0%    | 100.0% | PARTIAL     |
| 18  | `src/llm/embeddings.js`                        | 5         | 91.7%    | 97.4%  | MEDIUM      |
| 19  | `src/security/risks/parsers.ts`                | 5         | 91.8%    | 100.0% | MEDIUM      |
| 20  | `src/accounts/profile-manager.js`              | 4         | 93.9%    | 100.0% | MEDIUM      |
| 21  | `src/llm/local-llm.js`                         | 4         | 94.7%    | 98.6%  | MEDIUM      |
| 22  | `src/security/security-overview/ai-explain.ts` | 4         | 96.0%    | 96.7%  | MEDIUM      |
| 23  | `src/browser-bridge.js`                        | 3         | 98.6%    | 99.5%  | LOW         |
| 24  | `src/knowledge/ingest/ingest-repository.js`    | 3         | 91.2%    | 89.5%  | LOW         |
| 25  | `src/llm/agent-loop-guard.js`                  | 3         | 96.8%    | 100.0% | LOW         |
| 26  | `src/llm/gateway.ts`                           | 3         | 98.3%    | 99.2%  | NEARLY DONE |
| 27  | `src/security/security-overview/normalizer.ts` | 3         | 94.7%    | 100.0% | LOW         |
| 28  | `src/shared/retrieval/vector-client.ts`        | 3         | 89.7%    | 95.1%  | LOW         |
| 29  | `src/agents/tool-call-classifier.ts`           | 2         | 96.9%    | 98.0%  | LOW         |
| 30  | `src/daemon/daemonStatus.js`                   | 2         | 90.9%    | 96.7%  | LOW         |
| 31  | `src/internal/config.js`                       | 2         | 92.8%    | 100.0% | LOW         |
| 32  | `src/llm/training-exporter.js`                 | 2         | 98.2%    | 99.0%  | LOW         |
| 33  | `src/security/security-overview/drift.ts`      | 2         | 96.4%    | 100.0% | LOW         |
| 34  | `src/shared/retrieval/router.ts`               | 2         | 93.5%    | 95.1%  | LOW         |
| 35  | `src/cli/llm-routing.ts`                       | 1         | 91.7%    | 100.0% | QUICK WIN   |
| 36  | `src/commands/browser.js`                      | 1         | 99.1%    | 100.0% | QUICK WIN   |
| 37  | `src/commands/handoff.js`                      | 1         | 97.1%    | 100.0% | QUICK WIN   |
| 38  | `src/governance/workspace-context.ts`          | 1         | 96.7%    | 100.0% | QUICK WIN   |
| 39  | `src/internal/reporter.js`                     | 1         | 94.1%    | 96.4%  | QUICK WIN   |
| 40  | `src/llm/knowledge-graph.js`                   | 1         | 98.9%    | 100.0% | QUICK WIN   |
| 41  | `src/llm/status.ts`                            | 1         | 96.2%    | 96.7%  | QUICK WIN   |
| 42  | `src/policies/sensitive-task-rules.ts`         | 1         | 91.7%    | 100.0% | QUICK WIN   |
| 43  | `src/security/secrets/baseline.ts`             | 1         | 94.4%    | 100.0% | QUICK WIN   |
| 44  | `src/security/secrets/gitleaks-runner.ts`      | 1         | 99.0%    | 98.8%  | QUICK WIN   |

---

## 6. Action Plan — Path to Higher Coverage

### Phase 1: Quick Wins (10 files × 1 branch each = 10 branches)

| Action                                        | Expected Impact          |
| --------------------------------------------- | ------------------------ |
| Apply v8-ignore to Tier 3 quick win dead code | -10 uncovered branches   |
| Targeted tests for testable Tier 3 branches   | -0-10 uncovered branches |

### Phase 2: Medium Gap Files (2-9 uncovered branches each)

| Action                                                                      | Expected Impact |
| --------------------------------------------------------------------------- | --------------- |
| Add branch tests for symbol-extractor, prompt-generator, provider-policy    | -25 branches    |
| Add branch tests for test-runner, workspace-quotas, paths, auto-scan        | -21 branches    |
| Add branch tests for hwProbe, code-search, git-monitor, embeddings, parsers | -27 branches    |

### Phase 3: Major Gap Files (10+ uncovered branches)

| Action                            | Expected Impact                |
| --------------------------------- | ------------------------------ |
| Dashboard.js: DO NOT EDIT         | N/A (user instruction)         |
| Routing-history.ts: 17 branches   | Requires comprehensive testing |
| Watcher.js: 14 branches           | Continue testing               |
| Experience-db.js: 14 branches     | Already analyzed               |
| Document-ingester.js: 11 branches | File type testing or v8-ignore |
| AI.js: 10 branches                | Command handling tests         |

---

## 7. Notes

- **Test-only constraint**: All coverage improvements were made via new tests only. No production source files were modified.
- **v8-ignore policy**: No v8-ignore annotations applied without explicit user approval. Dead-code branches are marked as PENDING REVIEW.
- **Coverage thresholds**: All four metrics (statements, branches, functions, lines) exceed the 95% global threshold.
- **Fresh scan date**: 2026-07-19 — this data reflects the current state of the codebase.
