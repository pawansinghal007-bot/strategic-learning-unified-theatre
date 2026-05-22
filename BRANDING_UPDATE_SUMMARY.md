# Branding Update Summary — vscode-rotator → Strategic Learning Unified Theatre

**Date**: 2026-05-22  
**Status**: ✅ Complete  
**Total Test Verification**: 244 tests passing (Solution suite)

---

## Overview

The project has been successfully rebranded from **vscode-rotator** to **Strategic Learning Unified Theatre** across all documentation, configuration, CLI, and extension files. All runtime storage paths (`~/.vscode-rotator`) have been intentionally preserved for backward compatibility.

---

## Changes Applied

### 1. Package Metadata & CLI
- ✅ Root `package.json`: `name` → `strategic-learning-unified-theatre`
- ✅ `Solution/package.json`: 
  - `name` → `strategic-learning-unified-theatre`
  - `productName` → `Strategic Learning Unified Theatre`
  - `bin.strategic-learning-unified-theatre` (CLI command updated)
- ✅ `Solution/vscode-extension/package.json`:
  - `name` → `strategic-learning-unified-theatre-extension`
  - `displayName` → `Strategic Learning Unified Theatre Assistant`
  - `publisher` → `strategic-learning-unified-theatre`
  - Command IDs: `strategic-learning-unified-theatre.*`

### 2. Source Code
- ✅ `Solution/src/cli.js`: CLI program name → `strategic-learning-unified-theatre`
- ✅ `Solution/vscode-extension/extension.js`: Display names & command names updated
- ✅ `Solution/scripts/install.js`:
  - Windows task name → `strategic-learning-unified-theatre-daemon`
  - macOS label → `com.strategic-learning-unified-theatre.daemon`
  - Service descriptions updated
  - **Preserved**: `logDir = path.join(os.homedir(), ".vscode-rotator")` (runtime directory)

### 3. Electron & UI
- ✅ `Solution/electron-ui/main.cjs`:
  - Cache directory → `strategic-learning-unified-theatre-cache`
  - Electron store name → `strategic-learning-unified-theatre-ui`
- ✅ `Solution/electron-tray/main.js`: Preserved runtime logging path
- ✅ `Solution/src/agent-handoff.js`: Prompt generation text uses new brand name

### 4. Build & Configuration
- ✅ `Solution/package.json` build config:
  - `appId` → `com.strategic.learning.unified.theatre`
  - `productName` → `Strategic Learning Unified Theatre`
- ✅ Asset rename: `vscode-rotator.ico` → `strategic-learning-unified-theatre.ico`
- ✅ `Solution/src/config.js`: Configuration paths preserved as `~/.vscode-rotator`

### 5. Documentation
- ✅ `Strategic Learning Unified Theatre End User Guide.md`: File renamed, branding updated
- ✅ `Solution/docs/README.md`: Project references updated while preserving `~/.vscode-rotator` paths
- ✅ `Solution/Prompt 1.md`: Documentation updated
- ✅ `Solution/Prompt 2.md`: Documentation updated
- ✅ `Solution/Prompt 3.md`: Documentation updated
- ✅ `EXTERNAL_REFERENCES.md`: Updated to reflect rebranding status
- ✅ `vscode-rotator-master-instructions.md`: Archival note added (file history preserved)

### 6. File Index & Helpers
- ✅ `strategic-learning-unified-theatre-file-index.json`: Created (machine-readable inventory)
- ✅ `FILE_INDEX.md`: Created (human-readable summary)
- ✅ `tools/file-index.js`: Helper CLI for index queries
- ✅ `PROMPTS_SUMMARY.md`: Created (prompt audit summary)

### 7. Workspace Scripts
- ✅ Root `package.json`: Added `test:solution` script
  - Command: `npm --prefix ./Solution test`
  - Purpose: Run Solution suite without root-level Vite config conflicts

---

## Preserved Runtime Paths

All of the following paths remain unchanged (intentionally preserved):

- `~/.vscode-rotator/config.json` — Configuration
- `~/.vscode-rotator/experience.db` — SQLite database
- `~/.vscode-rotator/accounts.enc` — Encrypted account store
- `~/.vscode-rotator/vscode-signals/` — VS Code learning signals
- `~/.vscode-rotator/browser-responses/` — Browser capture responses
- `~/.vscode-rotator/browser-profiles/` — Persistent login profiles
- `~/.vscode-rotator/browser-selectors.json` — Platform selectors
- `~/.vscode-rotator/prompt-library.json` — Prompt library
- `~/.vscode-rotator/sprints/` — Sprint manifests
- `~/.vscode-rotator/ideas/` — Idea store (global)
- `~/.vscode-rotator/models/` — LLM models
- `.vscode-rotator/ideas/` — Idea store (project-scoped)
- All temporary test directories created during test execution

**Rationale**: Runtime storage paths are used across multiple sessions, configurations, and potentially external tools. Changing them would require user data migration. The directory name `vscode-rotator` is maintained as a stable storage identifier.

---

## Test Verification

✅ **Full test suite (Solution)**: 244 tests passing  
- Vitest local run: 21.81 seconds
- E2E verification: `e2e/browser-pane.e2e.js` passing
- All 26 test files passing

**Command to verify**:
```bash
npm run test:solution
```

---

## Files Modified

| File | Change Type | Notes |
|------|------------|-------|
| `package.json` | Updated | Root workspace, added `test:solution` script |
| `Solution/package.json` | Updated | Product name, bin entry, build config |
| `Solution/vscode-extension/package.json` | Updated | Extension name, display name, publisher |
| `Solution/src/cli.js` | Updated | CLI program name |
| `Solution/vscode-extension/extension.js` | Updated | Command display names |
| `Solution/scripts/install.js` | Updated | Service names (runtime path preserved) |
| `Solution/electron-ui/main.cjs` | Updated | App cache & store names |
| `Strategic Learning Unified Theatre End User Guide.md` | Renamed | From `VSCode Rotator End User Guide.md` |
| `Solution/docs/README.md` | Updated | Project references |
| `Solution/Prompt*.md` | Updated | Documentation text |
| `EXTERNAL_REFERENCES.md` | Updated | Status and recommendations |
| `vscode-rotator-master-instructions.md` | Updated | Added archival rebranding note (history preserved) |

---

## Files Created

| File | Purpose |
|------|---------|
| `strategic-learning-unified-theatre-file-index.json` | Machine-readable file inventory |
| `FILE_INDEX.md` | Human-readable file summary |
| `tools/file-index.js` | CLI helper for index queries |
| `PROMPTS_SUMMARY.md` | Prompt document audit results |
| `BRANDING_UPDATE_SUMMARY.md` | This document |

---

## Migration Path

If in the future you need to migrate runtime storage (e.g., rename `~/.vscode-rotator` to `~/.strategic-learning-unified-theatre`):

1. Create new storage directory at new path
2. Copy all files from `~/.vscode-rotator` to new path
3. Update `Solution/src/config.js` and `Solution/scripts/install.js` to reference new path
4. Run full test suite to verify
5. Deprecate old directory after verification period

Currently **not recommended** to avoid breaking existing user installations.

---

## Checklist

- [x] Package metadata updated
- [x] CLI name updated
- [x] Extension display names updated
- [x] Documentation updated
- [x] Runtime paths preserved
- [x] File index created
- [x] Tests passing (244/244)
- [x] Workspace script added
- [x] Master instructions archival note added
- [x] External references documented
- [x] Summary created

---

## Next Steps

1. ✅ All branding changes applied and verified
2. ✅ Test suite passing (244 tests)
3. ⏳ Merge to main branch (when ready)
4. ⏳ Consider external docs update (C:\SW Development\VS Code Enhnced\) if still in use
5. ⏳ Plan Sprint 13 work

---

**Status**: Ready for merge. All changes are backward compatible and non-breaking.
