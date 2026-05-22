Here's an updated version of Prompt 3 with the handoff pattern integrated, progress captured, and all document references updated to reflect Sprint 12's completed state.Here's the fully updated Prompt 3 document with the handoff pattern integrated and all progress captured:

---

## PROMPT 3 — Testing & Docs: Prove It Learns, Then Lock It In

> **Goal**: Write unit tests for `VscodeContextCollector` and `ingest-staged`. Run full regression. Verify the end-to-end learning loop works. Update master instructions.

> ⚡ **Token-efficient session start** — run this FIRST, before reading any other file:
> ```
> strategic-learning-unified-theatre ai snapshot > handoff-snapshot.txt
> ```
> Paste the snapshot output (~500 tokens) here at session start instead of reading the 8,000-token master instructions. Only open master instructions if the snapshot is missing or you need architecture detail not in the snapshot.

---

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Session start (required):
  1. Run: strategic-learning-unified-theatre ai snapshot                             (500-token context — START HERE)
  2. E:\VS Code Agent\Solution\sprints\SPRINT-12-CODING-LOG.md  (review Prompt 2 decisions)

Only read these if snapshot is insufficient:
  - E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md      (full file — 8,000 tokens)
  - E:\VS Code Agent\Solution\sprints\SPRINT-12-ANALYSIS.md
  - E:\VS Code Agent\Solution\vscode-extension\collector.js     (Prompt 2 output — COMPLETE)
  - E:\VS Code Agent\Solution\src\commands\llm.js               (includes ingest-staged)
  - E:\VS Code Agent\Solution\tests\                            (existing test patterns)

Sprint: Sprint 12 — VS Code Passive Learning
Baseline: 218 tests passing. Goal: finish at ≥ 243 tests passing (25 new).

---
## SPRINT 12 PROMPT 2 STATUS — READ BEFORE WRITING ANY CODE

Prompt 2 is COMPLETE. Do not re-implement collector.js.
Changes already landed:

  vscode-extension/collector.js
    - VscodeContextCollector implemented (alias: VscodeSignalCollector)
    - Captures: file saves (vscode-edit), diagnostics (vscode-diagnostic),
      git commits (vscode-git), task exit errors (vscode-task-error)
    - Hard-exclude: .env, *.key, *.pem — unconditional, no config override
    - 10-minute debounce per file
    - 30-second flush cycle → atomic staging write (.tmp → rename, chmod 600)
    - Optional CLI ingest via `node src/cli.js llm ingest-staged`
    - deactivate() flushes buffer and cleans up listeners

  vscode-extension/extension.js
    - Instantiates VscodeContextCollector with context + cliPath
    - Registers command: strategic-learning-unified-theatre.togglePassiveLearning
    - Improved deactivate cleanup

  vscode-extension/package.json
    - Added command contribution + activation event for togglePassiveLearning

  src/config.js
    - Added vscodeLearn.excludePatterns
    - Added vscodeLearn.hardExcludePatterns

  Focused test run after Prompt 2: 26 passed (tests/vscode-collector.test.js)
  Full suite baseline: 218 passing

---

STEP 1 — Unit Tests: `tests/vscode-collector.test.js`

  Framework: vitest. Mock vscode module (same pattern as Sprint 11A extension tests).
  Mock fs/promises for staging file writes. Mock child_process for runCli calls.
  Target: ≥ 20 tests covering collector behaviour.

  NOTE: collector.js is already implemented. Write tests AGAINST the existing
  implementation. Read collector.js before writing tests to match actual method
  names, config keys, and output format.

  ── Constructor & Config (3 tests) ─────────────────────────────────────────
  1. When config.enabled=false: activate() registers no listeners and returns early
  2. Default config values apply when config fields are missing
  3. stagingDir defaults to ~/.vscode-rotator/vscode-signals/

  ── File Save Listener (6 tests) ────────────────────────────────────────────
  4. .env file save → silently skipped, NOT pushed to buffer
  5. *.key file save → silently skipped
  6. node_modules/ file → silently skipped
  7. Valid .js file save → chunk pushed to buffer with correct source_type header
  8. Same file saved twice within debounceMs → only one chunk buffered
  9. File > maxFileSizeBytes → skipped with warning logged to outputChannel

  ── Diagnostic Listener (4 tests) ───────────────────────────────────────────
  10. DiagnosticSeverity.Warning → ignored (not pushed to buffer)
  11. DiagnosticSeverity.Error → chunk pushed with correct format
  12. Same error seen ≥ 2 times → recurring mistake chunk also pushed
  13. Multiple errors in same file → grouped in single chunk

  ── Git Listener (2 tests) ──────────────────────────────────────────────────
  14. Git state change with new commit → chunk pushed with hash, message, files_changed
  15. Git fallback poll: `git log -1` stdout parsed correctly into chunk fields

  ── Task Error Listener (2 tests) ───────────────────────────────────────────
  16. Task exits with code 0 → NOT pushed to buffer
  17. Task exits with code 1 → chunk pushed with task name and exit_code

  ── Flush (3 tests) ─────────────────────────────────────────────────────────
  18. Empty buffer → _flush() does NOT write any file
  19. Buffer with 3 signals → staging file written with signals separated by `---`
  20. After flush: buffer is cleared and runCli(['llm', 'ingest-staged']) is called

  ── `llm ingest-staged` CLI command (5 tests in tests/llm.test.js) ──────────
  21. Staging dir empty → command exits 0, logs "0 chunks ingested"
  22. Staging file with 2 chunks → both ingested, file deleted
  23. Ingestion error on one chunk → file retained, error logged, exit 0 (non-fatal)
  24. source_type: vscode-diagnostic-recurring → MistakeTracker.recordMistake called
  25. source_type: vscode-edit → document inserted with correct tags ['editor', 'file-save']

  Run npm test and confirm:
    - All 25 new tests pass
    - All 218 pre-existing tests still pass
    - Total passing count ≥ 243

---

STEP 2 — E2E Learning Loop Verification (Manual)

  Setup:
    strategic-learning-unified-theatre config set vscodeLearn.enabled true
    rm -f ~/.vscode-rotator/vscode-signals/*

  ROUND 1 — Teach it a file edit:
    a. Open E:\VS Code Agent\Solution\src\llm\inference.js
    b. Add: // SPRINT-12-MARKER: testing passive learning
    c. Save. Wait 35 seconds.
    d. Run: strategic-learning-unified-theatre llm related --to "inference"
       → VERIFY: output references inference.js (source_type: vscode-edit)

  ROUND 2 — Teach it an error:
    a. Open any .ts file. Introduce: const x: number = "wrong"
    b. Wait for red squiggle. Wait 35 seconds.
    c. Run: strategic-learning-unified-theatre llm related --to "type error"
       → VERIFY: output references the diagnostic chunk

  ROUND 3 — Teach it a git decision:
    a. Small commit: git commit -am "Sprint 12: test passive git capture"
    b. Wait 35 seconds.
    c. Run: strategic-learning-unified-theatre llm related --to "Sprint 12"
       → VERIFY: output includes commit message

  ROUND 4 — Prove the LLM uses it:
    a. strategic-learning-unified-theatre llm ask "What was the last file I edited in VS Code?"
       → VERIFY: references inference.js from experience.db
    b. strategic-learning-unified-theatre llm ask "Have I had any TypeScript errors recently?"
       → VERIFY: mentions the Round 2 type error
    NOTE: Round 4 requires phi3. If unavailable, document:
    "Model not installed — Rounds 1–3 verify ingestion pipeline; Round 4 deferred."

  Document all 4 round results in SPRINT-12-CODING-LOG.md under
  "E2E Learning Loop Results".

---

STEP 3 — Privacy Verification

  [ ] echo "SECRET_KEY=abc123" > /tmp/test.env
      Open in VS Code, save → output channel must NOT show "[collector] queued"
  [ ] Create test.pem in workspace root, save → silently skipped
  [ ] Confirm no .env content in DB:
        sqlite3 ~/.vscode-rotator/experience.db \
          "SELECT content FROM documents WHERE source_type='vscode-edit' AND content LIKE '%SECRET%'"
        → must return 0 rows
  Document results in SPRINT-12-CODING-LOG.md.

---

STEP 4 — Regression
  npm test
  Confirm: ≥ 243 tests passing, 0 failing.

---

STEP 5 — Update Master Instructions
  File: E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md

  5a. Add to "What's Changed":
  ### ✅ Sprint 12 — VS Code Passive Learning — COMPLETE (<today's date>)
  - VscodeContextCollector: vscode-extension/collector.js
  - Captures: file saves, TypeScript/lint errors, git commits, task exit errors
  - Hard-exclude: .env, *.key, *.pem — unconditional
  - 10-min debounce per file; 30-sec flush → atomic staging files
  - New CLI command: strategic-learning-unified-theatre llm ingest-staged
  - Opt-in: vscodeLearn.enabled (default: false)
  - E2E loop verified: file save → DB → llm related returns result
  - Test count: <final number> tests passing ✅

  5b. Architecture diagram — add NEW TOP LAYER:
  VS Code Editor (file saves · diagnostics · git commits · task errors)
          ↓  [VscodeContextCollector — vscode-extension/collector.js]
  ~/.vscode-rotator/vscode-signals/<ts>-vscode-signals.md  (staging)
          ↓  [llm ingest-staged CLI]
  [existing diagram continues from Experience DB downward]

  5c. Module Map — add row:
  | vscode-extension/collector.js | VS Code passive signal collector |

  5d. Module Maturity — update extension row:
  | Electron UI / VS Code Extension | 🟡 IN PROGRESS | <n> pass |
  | Core commands stable (11A). Passive learning active (12). Sidebar next (12B). |

  5e. Source Types section — add:
    vscode-edit, vscode-diagnostic, vscode-diagnostic-recurring,
    vscode-git, vscode-task-error

  5f. Update "Last Updated":
  Last Updated: <today's date> — Sprint 12 Complete. <final count> tests passing.

  5g. Add Handoff Pattern note (NEW):
  ## ⚡ Token-efficient handoff pattern
  # Instead of reading this entire file (8,000+ tokens):
  strategic-learning-unified-theatre ai snapshot > handoff-snapshot.txt
  # Paste snapshot output (~500 tokens) at the top of your next session prompt.
  # Only open this file if the snapshot is missing or you need architecture
  # detail not captured in the snapshot.

---

STEP 6 — Close Sprint & Handoff
  6a. strategic-learning-unified-theatre handoff update <sprint-id> --tokens-used <n>
  6b. strategic-learning-unified-theatre handoff close <sprint-id> --status complete
  6c. strategic-learning-unified-theatre ai snapshot > sprints/SPRINT-12-SNAPSHOT.md
      Copy snapshot output → paste at top of Sprint 13 document.

  6d. In SPRINT-12-CODING-LOG.md append "Sprint 13 Recommended Scope":
    Option A: Sidebar views (Ideas Tree + Related Context panel) — visual layer
    Option B: Fine-tuning pipeline (LoRA on phi3 using experience.db) — weight update
    Option C: Active suggestions (proactive context as you type) — UX layer
    Document which of A/B/C is highest value given current system state.
    RECOMMENDATION: Given that passive ingestion is now proven (Sprint 12 E2E),
    Option A (sidebar views) delivers the highest visible value next — it makes
    the learning loop observable to the user without requiring model fine-tuning.

---

FINAL ACCEPTANCE GATE:
  ✅ ≥ 25 new tests passing (collector + ingest-staged)
  ✅ 218 pre-existing tests still passing (no regression)
  ✅ Hard-exclude verified: .env and *.key never ingested
  ✅ E2E loop verified: save → flush → ingest → llm related returns the file
  ✅ strategic-learning-unified-theatre-master-instructions.md updated (architecture + handoff pattern)
  ✅ Sprint closed in handoff tracker
  ✅ strategic-learning-unified-theatre ai snapshot captured → SPRINT-12-SNAPSHOT.md
```

---

Key changes from the original:

**Handoff pattern** is now the very first instruction, with a note explaining why (500 vs 8,000 tokens). It's also added to Step 5g as a permanent section in master instructions so future prompts pick it up automatically from the snapshot.

**Prompt 2 status block** is added before Step 1 — the next agent reads exactly what was already built so it doesn't re-implement or second-guess the collector.

**Step 1 note** clarifies tests are written *against* the existing implementation, not a spec to implement from scratch.

**Sprint 13 recommendation** in Step 6d now includes a concrete recommendation (Option A — sidebar views) rather than leaving it fully open-ended.
