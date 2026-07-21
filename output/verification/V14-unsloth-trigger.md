# V14 — Unsloth trigger (repo-wide)

## Commands run

```bash
# 1. Repo-wide grep for "unsloth" (case-insensitive)
grep -rni "unsloth" --include="*" -l . 2>/dev/null | head -50

# 2. Repo-wide grep for "unsloth" with line content (source files only)
grep -rni "unsloth" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.json" --include="*.md" --include="*.yaml" --include="*.yml" --include="*.ps1" --include="*.cjs" --include="*.mjs" 2>/dev/null

# 3. Repo-wide grep for "launch-studio" variants (source files only)
grep -rni "launch-studio\|launchStudio\|launch_studio\|LaunchStudio" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.json" --include="*.md" --include="*.yaml" --include="*.yml" --include="*.ps1" --include="*.cjs" --include="*.mjs" 2>/dev/null

# 4. Repo-wide grep for WSL training script references (excluded node_modules/.git)
grep -rni "wsl.*train\|train.*wsl\|wsl.*script\|\.sh.*train\|train\.sh" . --include="*.js" --include="*.ts" --include="*.py" --include="*.sh" --include="*.json" --include="*.md" --include="*.ps1" --include="*.cjs" --include="*.mjs" --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null

# 5. package.json scripts check
cat package.json | grep -i "unsloth\|launch-studio\|wsl\|train" 2>/dev/null || echo "NO MATCHES"

# 6. Shell scripts check (all .sh files excluding node_modules)
find . -name "*.sh" -not -path "./node_modules/*" -not -path "./.git/*" -exec grep -li "unsloth\|launch-studio\|wsl.*train\|train.*wsl" {} \; 2>/dev/null || echo "NO MATCHES"

# 7. JSON configs check (excluding node_modules/.git)
grep -rni "unsloth\|launch-studio\|launchStudio" . --include="*.json" --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | head -20

# 8. Windows scripts check
grep -rni "unsloth\|launch-studio" . --include="*.ps1" --include="*.bat" --include="*.cmd" 2>/dev/null || echo "NO MATCHES IN WINDOWS SCRIPTS"

# 9. List all shell scripts in repo
find . -name "*.sh" -not -path "./node_modules/*" -not -path "./.git/*" 2>/dev/null | head -30

# 10. Verify shell scripts individually
grep -li "unsloth\|launch-studio\|wsl.*train\|train.*wsl" ./scripts/update-architecture-baseline.sh ./collect-sprint96-info.sh ./safe_audit.sh ./collect-capabilities.sh 2>/dev/null || echo "NO MATCHES IN SHELL SCRIPTS"
```

## Terminal output

**Command 1 — unsloth file list:**

```
./sprints/SPRINT-13-ANALYSIS.md
```

**Command 2 — unsloth with line content:**

```
./sprints/SPRINT-13-ANALYSIS.md:29:- Non-viable: Unsloth (not suitable for Windows + Python 3.14.5 CPU environment)
./sprints/SPRINT-13-ANALYSIS.md:62:- Python 3.14.5 compatibility with Axolotl/Unsloth (blocked)
```

**Command 3 — launch-studio variants:**

```
(no output — zero matches)
```

**Command 4 — WSL training script references (excluded node_modules/.git):**

```
./master_timeline_sprints_1_97.md:96:| 91     | Sonar S3776/S7785/S4043/S1128/S2699 fixes + coverage threshold compliance: ...
./reports/gitleaks.json:292:  "Message": "sprint-91-complete: fix all test failures and coverage thresholds\n\nTest Fixes:\n- Fixed storageStatus.test.js: added WSL2 detection for chmod 0o000 test limitation\n...
./reports/gitleaks.json:313:  "Message": "sprint-91-complete: fix all test failures and coverage thresholds\n\nTest Fixes:\n- Fixed storageStatus.test.js: added WSL2 detection for chmod 0o000 test limitation\n...
./reports/gitleaks.json:334:  "Message": "sprint-91-complete: fix all test failures and coverage thresholds\n\nTest Fixes:\n- Fixed storageStatus.test.js: added WSL2 detection for chmod 0o000 test limitation\n...
./reports/gitleaks.json:355:  "Message": "sprint-91-complete: fix all test failures and coverage thresholds\n\nTest Fixes:\n- Fixed storageStatus.test.js: added WSL2 detection for chmod 0o000 test limitation\n...
./reports/gitleaks.json:376:  "Message": "sprint-91-complete: fix all test failures and coverage thresholds\n\nTest Fixes:\n- Fixed storageStatus.test.js: added WSL2 detection for chmod 0o000 test limitation\n...
```

(Note: These WSL2 references are about test detection for chmod limitations, NOT training scripts.)

**Command 5 — package.json scripts:**

```
"description": "Strategic Learning Unified Theatre local project with screen capture, LLM ingestion, and adapter training.",
```

(Only the package description mentions "training" — no scripts section references unsloth/launch-studio/wsl/train.)

**Command 6 — Shell scripts check:**

```
(no output — zero matches)
```

**Command 7 — JSON configs:**

```
(no output — zero matches)
```

**Command 8 — Windows scripts:**

```
NO MATCHES IN WINDOWS SCRIPTS
```

**Command 9 — All shell scripts in repo:**

```
./scripts/update-architecture-baseline.sh
./collect-sprint96-info.sh
./safe_audit.sh
./collect-capabilities.sh
```

**Command 10 — Shell scripts individual check:**

```
NO MATCHES IN SHELL SCRIPTS
```

## Code evidence

**`sprints/SPRINT-13-ANALYSIS.md` — Line 29:**

```markdown
- Non-viable: Unsloth (not suitable for Windows + Python 3.14.5 CPU environment)
```

**`sprints/SPRINT-13-ANALYSIS.md` — Line 62:**

```markdown
- Python 3.14.5 compatibility with Axolotl/Unsloth (blocked)
```

**`package.json` — description field:**

```json
"description": "Strategic Learning Unified Theatre local project with screen capture, LLM ingestion, and adapter training.",
```

## Verdict

Missing

## Notes

Zero active Unsloth trigger, launch-studio reference, or WSL training script shell-out exists anywhere in the codebase. The only references to "Unsloth" are two historical notes in `sprints/SPRINT-13-ANALYSIS.md` marking it as non-viable for the Windows + Python 3.14.5 CPU environment. No `launch-studio` variant exists in any file type. No shell scripts, JSON configs, package.json scripts, or Windows batch files contain any training trigger mechanism. The WSL2 mentions found are exclusively about test detection for chmod limitations in `storageStatus.test.js`, unrelated to model training.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing.**

Repo-wide search: no `unsloth` / `launch-studio` under `src/`, `scripts/`, `package.json`, extension, or CI. Only historical notes in `sprints/SPRINT-13-ANALYSIS.md` (marked non-viable). Zero executable trigger. No material corrections.
