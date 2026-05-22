# Workspace Cleanup Plan

**Date**: 2026-05-23  
**Task**: Remove unnecessary files cluttering the workspace

## Files to Remove

### Root Level (Temporary/Obsolete)

1. **temp_search_C_drive_sw.py** — Temporary search script (obsolete)
   - Created during initial scan for vscode-rotator references
   - No longer needed; search functionality replaced by grep_search

2. **vite-warnings.txt** — Build output artifact
   - Generated during build; can be regenerated if needed
   - Not source code

3. **npm.log** — NPM install/build log
   - Temporary artifact; can be recreated

### Solution/ Directory (Test Artifacts)

4. **test-output.json** — Old test output
   - Created by Vitest; regenrable
   - Not needed for development

5. **test-error.ts** — Test error file
   - Looks like a debug/test artifact
   - Not part of active test suite

6. **test-llama.mjs** — Old Llama test
   - Appears to be an experiment file
   - Not in active test suite

7. **test.env** — Test environment file
   - Likely obsolete; tests use proper .env mocking
   - Verify not imported before removing

8. **test.pem** — Test certificate
   - Temporary artifact
   - Keep only if referenced in active tests

9. **fix-ipc.cjs** — Old IPC fix attempt
   - Appears to be a dev experiment
   - No references in active code

10. **hello.py** — Simple test/hello script
    - Debug/demo file
    - Not part of deliverables

11. **fix-ipc.cjs** — Development experiment
    - Not part of any sprint deliverables

12. **requested-tests-20260522_150435.log** — Old test log
    - Timestamp suggests Sprint 12; no longer current
    - Can be regenerated from test suite

13. **requested-tests-full-logged.ps1** — Old test script
    - Superseded by `npm run test:solution`
    - Archive or remove

### Solution/robot/ (Deprecated)

14. **robot-framework-tdd-module-prompt.md** (root level)
    - Old R6 attempt that was superseded
    - Move to archive

### Git Alias Files

15. **Solution/add**, **ai**, **ask**, **baseline**, etc.
    - These appear to be git alias shortcut files
    - Can be safely removed (aliases are in .git/config if needed)

## Files to Keep

- ✅ All source code in `src/`, `electron-ui/`, `vscode-extension/`, `renderer/`
- ✅ All test files in `tests/`, `e2e/`, `__tests__/`
- ✅ Configuration: `vitest.config.js`, `vite.config.js`, `.gitignore`, `package.json`
- ✅ Documentation in `docs/`, `Solution/sprints/`
- ✅ Build output: `build/`, `dist_electron/` (generated as needed)

## Verification Steps

Before removal:
1. Confirm no imports of these files exist in active code
2. Verify not referenced in `.gitignore`
3. Check if any config files reference them

## Safe Deletion Command

```powershell
# Archive unnecessary files
mkdir "_archive/removed-artifacts" -Force
mv @(
  "temp_search_C_drive_sw.py",
  "vite-warnings.txt",
  "npm.log",
  "Solution/test-output.json",
  "Solution/test-error.ts",
  "Solution/test-llama.mjs",
  "Solution/fix-ipc.cjs",
  "Solution/hello.py",
  "Solution/requested-tests-20260522_150435.log",
  "Solution/requested-tests-full-logged.ps1",
  "robot-framework-tdd-module-prompt.md"
) | % { mv $_ "_archive/removed-artifacts/" }
```

## Confirmation Checklist

- [ ] Verified no import references
- [ ] Git status checked (no uncommitted cleanup-related changes expected)
- [ ] Archive directory created
- [ ] Files moved to `_archive/removed-artifacts/`
- [ ] Workspace confirmed clean
- [ ] Tests still pass after cleanup

---

**Status**: Ready for execution  
**Impact**: Reduced workspace noise; easier navigation
**Rollback**: Files in `_archive/` can be restored if needed
