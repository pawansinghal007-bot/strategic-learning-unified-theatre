# Plan: Project Cleanup & Structure Audit

**TL;DR**: The project root is severely cluttered with 100+ backup directories, timestamped snapshots, temporary debug files, and output artifacts. These should be moved to a `.archive/` directory or deleted. The core project structure is intact but obscured by noise. Cleanup will: improve navigation, reduce disk space (~500MB+), and maintain referential integrity via git history.

---

## Critical Findings

### 🔴 High-Priority Clutter (Delete or Archive)

**Snapshot Backups (100+ directories)**

- `strategic-learning-unified-theatre-ai-snapshot-sprint*-*` (50+ dirs)
- `strategic-learning-unified-theatre-ai-snapshot-v*.*.` (15+ dirs)
- `strategic-learning-unified-theatre-ai-snapshot-v2.*-stable` (10+ dirs)
- These appear to be periodic AI/LLM context snapshots; they're no longer needed in active development

**Architecture Baseline Files (30+ timestamped backups)**

- `PROJECT_ARCHITECTURE_BASELINE-*.md` (30 files with timestamps)
- `PROJECT_ARCHITECTURE_BASELINE.md` (keep one canonical version)
- These are historical snapshots; only keep the latest or one reference version

**Debug & Diagnostic Files (temporary)**

- `diagnose.cjs`, `diagnose2.cjs` + Zone.Identifier variants
- `fix-dashboard*.{cjs,js}` (5+ variants)
- `fix-ipc.cjs`
- `debug-plugin-run.mjs`
- `test-bc2-integration.js`, `test-bc2-diagnostics.js`, `test-llama.mjs`, `test_gpu.py`

**Sprint & Report Files (obsolete data)**

- `ai-snapshot-sprint*.md` (3 files)
- `sprint*.csv`, `sprint*.txt` (Sonar-related)
- `impacted-tests.txt`, `remaining_*.txt`
- Sonar audit reports: `sonar_issues.csv`, `sonar_hotspots.csv`, `sonar_reliability_maintainability.csv`, `sonar_issues.md`

**Audit & Log Files**

- `audit-log-ws-*.json`, `audit-log-ws-*.html`, `audit-log-ws-*.txt`
- `project_audit_dump.txt`, `git-history.txt`
- `key-files.txt`, `source-files.txt`, `src-structure.txt`, `tsconfigs.txt`, `root-package.txt`, `vite-config.txt`

**Other Temporary Files**

- `hello.py`, `test_gpu.py`, `test-error.ts` (test stubs)
- `test_summary.txt`, `tmp-test-*`, `smoke-test-sprint12.js`
- `BC2-INTEGRATION-GUIDE.js`
- `*.tar.gz`, `sprint52-input-files.tar/`
- `.continuerc.json` (Continue IDE config, can be ignored)
- `run-tests.cjs`, `smoke-test-sprint12.js`, `test-*.js` variants
- `load-env.ps1`, `safe_audit.sh`, `search_repo.py`
- `Modelfile` (Ollama model file; only needed if AI runtime is part of active development)

**Build Output & Generated Files**

- `build/` (rebuild as needed)
- `dist/` (rebuild as needed)
- `coverage/` (regenerate per test run)
- `playwright-report*/` (regenerate per test run)
- `test-results/` (regenerate per test run)
- `robot-results/` (regenerate per test run)
- `dumps/`, `audit_chunks/` (temporary processing)

**Generated Reports**

- `sonar-project.properties`, `sonar-issues-report.json`, `sonar_*.csv`, `sonar_*.json`
- `report-task.txt`, `sprint*-report.md`

### 🟡 Medium-Priority Issues (Verify & Standardize)

**Multiple Config Variants for Same Tool**

- Playwright: `playwright.config.ts` + `playwright.human.config.{cjs,js}` + `playwright.ui.config.{cjs,js}`
  - **Decision**: Keep only needed variants; verify which are actually used in CI/CD and tests
- Vitest: `vitest.config.{js,ts}` + `vitest.integration.config.js` + `.log` file
  - **Decision**: Keep all if used; remove `.log`

**Duplicate / Variant Files**

- `browser-bridge.js` + `browser-bridge.jsy` (likely a typo)
- `diagnose.cjs:Zone (2).Identifier` (Windows zone marker; should be `.gitignore`d)

**Untracked Directories** (not in `.gitignore` but should be)

- `.codex/`, `.continue/` (IDE integration caches)
- `.scannerwork/` (SonarQube working directory)
- `reports/`, `robot/` (should review if these are build artifacts or source)

### 🟢 Legitimate Project Files (Keep)

**Core Source**

- `src/` — Main application source
- `renderer/` — Renderer process code
- `plugins/` — Plugin system
- `electron-tray/`, `electron-ui/` — Electron UI code
- `Service/`, `Preload/`, `IPC/`, `main/` — Entry points and IPC modules

**Testing & Validation**

- `tests/`, `test/`, `e2e/`, `e2e-design/`, `robot/` — Test suites (verify robot/ is not just generated output)
- `playwright.*.config.*` — Test configuration (if all are used)
- `vitest.*.config.*` — Unit test configuration

**Documentation & Configuration**

- `.github/` — GitHub workflows, instructions
- `.vscode/` — Workspace settings
- `scripts/` — Build and utility scripts
- `docs/` — Documentation
- `config/` — Configuration files
- `schema.json` — Data schema
- `.env` — Environment variables
- `package.json`, `package-lock.json` — Dependencies
- `tsconfig.json` — TypeScript config
- `vite.config.js`, `postcss.config.cjs` — Build configs
- `tailwind.config.js` — Styling
- `.git/`, `.gitignore` — Version control

**Electron Build Artifacts** (can rebuild but slow)

- `release/` — Packaged releases (keep if not easily regenerated; consider archiving)

**Infrastructure**

- `node_modules/` — Dependencies (rebuild from lock file)
- `.scannerwork/` — SonarQube cache (can regenerate)
- `vscode-extension/` — VS Code extension source (if active project)

---

## Cleanup Plan

### Phase 1: Automated Archive & Delete (Safe)

1. Create `.archive/` directory in root
2. Move all `strategic-learning-unified-theatre-ai-snapshot-*` directories → `.archive/ai-snapshots/`
3. Move all `PROJECT_ARCHITECTURE_BASELINE-*.md` (keep latest 1-2) → `.archive/architecture-baselines/`
4. Delete all temporary debug files (diagnose*, fix-dashboard*, etc.)
5. Delete all sprint audit CSVs and reports (sprint*.csv, sonar\_*.csv, sonar-issues\*, etc.)
6. Delete all temporary logs and text files (audit-log-ws-\*, git-history.txt, key-files.txt, etc.)
7. Delete temporary test files (hello.py, test-error.ts, test_summary.txt, etc.)

### Phase 2: Build Artifact Cleanup

1. Delete `build/`, `dist/`, `coverage/`, `playwright-report*/`, `test-results/`, `robot-results/`
   - These regenerate automatically on test/build runs
2. Delete `dumps/`, `audit_chunks/` (temporary processing)
3. Delete generated reports (report-task.txt, sonar-issues-report.json, etc.)

### Phase 3: Configuration & Variant Review

1. **Playwright configs**: Test each variant in CI to identify which are actually used
   - If only 1-2 are used, delete the unused ones
   - If all used, keep; document why each exists
2. **Vitest configs**: Verify `vitest.integration.config.js` is used; delete if not
3. **Debug logs**: Remove `vitest.log`

### Phase 4: .gitignore Alignment (Prevent Recurrence)

1. Add to `.gitignore`:
   - `.codex/`, `.continue/`
   - `build/`, `dist/`, `coverage/`
   - `*.db-shm`, `*.db-wal` (already there, verify)
   - `*-output.txt`, `*-output.json` (already there, verify)
   - Sonar temp files patterns
2. Remove from tracked git history (if small enough):
   - Historic snapshots via `git rm -r --cached` for `.archive/`
   - Verify this doesn't break referential integrity

### Phase 5: Verify Integrity

1. Run test suite: `npm test`
2. Run integration tests: `npm run test:integration`
3. Run Playwright tests (at least one variant): `npm run test:ui`
4. Verify Electron build: `npm run electron:dev`
5. Check CI/CD workflows still work (review `.github/workflows/`)

---

## Disk Space Impact

**Before**: ~500MB+ (estimated)

- 100+ snapshot dirs: ~300-400MB
- 30+ architecture baselines: ~5MB
- Debug & temp files: ~50MB
- Build artifacts & reports: ~50-100MB

**After**: ~50-100MB reduction

- Keep only `.archive/` as historical reference (compress if needed)

---

## Files to Review (Interactive Decisions)

Before deletion, confirm with user:

1. **Modelfile** — Is Ollama/LLM runtime part of active development?
2. **robot/** & **robot.config.json** — Are Robot Framework tests actively maintained or can they be archived?
3. **BC2-INTEGRATION-GUIDE.js** — Is BC2 integration still active?
4. **vscode-extension/** — Is this a standalone project or archived?
5. **release/** — Are old releases needed or can they be archived?

---

## ADDITIONAL FINDING: Sonar Coverage < 100%

### Root Causes Identified

**1. CRITICAL ISSUE: Incomplete Coverage Include List**

The `vitest.config.ts` (and `vitest.config.js`) only includes **6 specific files** in coverage measurement:

```
include: [
  'src/accounts/secret-store.js',
  'src/daemon/daemon-runner.js',
  'src/browser-bridge.js',
  'src/agent-handoff.js',
  'src/llm/local-llm.js',
  'src/idea-store.js',
]
```

**Actual src/ contains:**

- 40+ top-level module files (.js, .ts)
- 20+ subdirectories with additional code
- **At least 70+ source files NOT covered**

**Impact**: ~95% of codebase is excluded from coverage measurement → Reports show <100% because most code isn't being measured at all.

---

**2. Coverage Threshold Mismatch**

- **Configured threshold**: 70% (statements, branches, functions, lines)
- **Goal**: 100% coverage
- **Reality**: Only 6 files are measured, so threshold of 70% on 6 files ≠ 100% project-wide

---

**3. Test File Distribution Problem**

- Test discovery looks in: `tests/`, `src/`, `electron-ui/`, `renderer/`, `e2e/`
- But coverage only includes 6 src files
- No evidence of comprehensive test files for each module

---

### Why Coverage Was Deliberately Limited

The configuration suggests **intentional coverage scoping** to critical files:

- **Secret store** (security-sensitive)
- **Daemon runner** (core service)
- **Browser bridge** (main integration point)
- **Agent handoff** (state management)
- **Local LLM** (AI integration)
- **Idea store** (data persistence)

This is a valid pattern IF:

- These 6 files are the only ones requiring 100% coverage
- Other files are covered by integration/e2e tests
- The project acknowledges partial coverage as acceptable

But SonarQube reports show **coverage < 100%**, which suggests one of:
A. Full coverage was the goal but implementation was incomplete
B. SonarQube is configured to measure all src/ but vitest only covers 6 files
C. Missing test files for covered modules

---

### How SonarQube Reads Coverage

1. **Takes LCOV report** from: `coverage/lcov.info` (vitest output)
2. **LCOV file only contains lines for 6 covered files** (because vitest.config limits `include`)
3. **SonarQube's Sonar.sources = src** (all src/ files)
4. **SonarQube compares**: "Coverage report has 6 files, but src/ has 70+ files"
5. **Result**: Coverage % = (lines covered in 6 files) / (total lines in src/) = < 100%

---

### Solution Options

**Option A: Expand Coverage to All Source Code**

- Add all src files to `coverage.include` in vitest.config
- Write/fix tests for all modules
- Expect time investment: HIGH (~40-80 hours for comprehensive tests)
- Pros: True 100% coverage visibility
- Cons: May expose test infrastructure gaps

**Option B: Exclude Non-Critical Files from SonarQube**

- Keep 6-file coverage in vitest
- Add `sonar.coverage.exclusions` patterns to exclude 70+ src files from SonarQube measurement
- Pros: Reasonable effort, honest reporting
- Cons: SonarQube may still flag as incomplete

**Option C: Split Coverage Strategy (Recommended)**

- **Tier 1 (100% coverage required)**: 6 critical files (already configured)
- **Tier 2 (70%+ coverage)**: Add 15-20 important business logic files
- **Tier 3 (excluded)**: Infrastructure, utilities, config, generated files
- Update SonarQube to exclude Tier 3
- Expected time: 20-30 hours
- Pros: Balanced coverage with achievable goals

**Option D: Keep Current Setup, Update Documentation**

- Document that coverage is intentionally limited to 6 critical files
- Update SonarQube quality gate to expect ~15-25% project coverage (honest baseline)
- Keep investigation for future work
- Time: 1-2 hours
- Pros: Quick, acknowledges current state
- Cons: May fail CI/CD if quality gate expects higher %

---

## Execution Roadmap

| Phase | Action                                | Risk   | Reversibility           |
| ----- | ------------------------------------- | ------ | ----------------------- |
| 1     | Archive old snapshots & baseline docs | LOW    | ✅ In .archive/         |
| 2     | Delete debug files & temp scripts     | NONE   | ✅ In git history       |
| 3     | Delete build artifacts                | NONE   | ✅ Regenerate on build  |
| 4     | Update .gitignore                     | LOW    | ✅ Commit revert        |
| 5     | Verify tests pass                     | MEDIUM | ✅ Revert if tests fail |

---

## Decision Required

**Archive Strategy:**

- Option A: Move to `.archive/`, commit, push (keeps history visible)
- Option B: Delete locally, keep in git history (cleaner root, same recovery potential)
- Option C: Move to separate historical branch (advanced; separate history timeline)

**Recommendation**: Option A — `.archive/` directory keeps items findable and is low-friction.

---

## Coverage Decision Matrix

| Coverage Scope                                | Effort    | Impact                        | Recommended              |
| --------------------------------------------- | --------- | ----------------------------- | ------------------------ |
| **Option A**: All src/ files                  | 40-80 hrs | 100% true coverage            | Best practice, long-term |
| **Option B**: Exclude non-critical from SQ    | 2-4 hrs   | Honest ~20-30% baseline       | Quick fix                |
| **Option C**: Tiered approach (1+2+partial 3) | 20-30 hrs | 6@100%, 20@70%, rest excluded | **BEST BALANCE**         |
| **Option D**: Document & accept current       | 1-2 hrs   | Status quo (~15-25%)          | Minimum viable           |

**Final Recommendation for Coverage**: **Option C** (Tiered) offers the best path forward—expand coverage incrementally without overwhelming effort, while maintaining quality gates on critical files.
