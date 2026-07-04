# Step 4 State — Sprint 107

**Date**: 2026-07-04  
**Task**: Align test.yml workflow with Node version 22 (matching package.json engines.node >=22.12.0 and build-verify.yml)

---

## 1. Confirmation of test.yml Change

### Exact Diff

```diff
--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -15,7 +15,7 @@ jobs:
     steps:
       - name: Checkout code
         uses: actions/checkout@v4
-      - name: Setup Node.js
+      - name: Setup Node.js
         uses: actions/setup-node@v4
         with:
-          node-version: 20
+          node-version: 22
           cache: npm
```

### Verification Method

**Local Node 22 run** — actual runtime verification possible

- Node version: `v22.22.3` (confirmed via `node --version`)
- Matches package.json requirement: `engines.node: ">=22.12.0"`
- Matches build-verify.yml pattern exactly (`node-version: 22`)

---

## 2. Other Stale Node Workflows Flagged for Future

| Workflow File                            | Current Node Version | Status | Recommendation                     |
| ---------------------------------------- | -------------------- | ------ | ---------------------------------- |
| `.github/workflows/chaos.yml`            | Node 20              | Stale  | Update to Node 22 in future sprint |
| `.github/workflows/release.yml`          | Node 20              | Stale  | Update to Node 22 in future sprint |
| `.github/workflows/sonar-governance.yml` | Node 18              | Stale  | Update to Node 22 in future sprint |

**Note**: These workflows were not modified in this sprint as they were outside the scope of Step 4's immediate task (test.yml alignment only).

---

## 3. Node-22-Specific Breakage Found and Fixed

**None found** — all tests pass under Node 22.

### Verification Steps Performed

1. **TypeScript Type Check**: `npx tsc --noEmit`
   - Result: `0 errors`
   - Status: ✅ Passed

2. **Test Suite Execution**: `npm run test:ci`
   - Result: `303 test files passed (5065 tests passed)`
   - Status: ✅ Passed
   - Coverage: `94.88% statements, 92.52% branches, 92.98% functions, 95.07% lines`

3. **Test Suite Execution**: `npm run test`
   - Result: `5085 tests passed`
   - Status: ✅ Passed

---

## 4. Test Suite Results

### npm run test:ci (Coverage Gate)

```
Test Files  303 passed (303)
Tests  5065 passed (5065)
Duration  27.34s
```

**Coverage Summary**:

- Statements: 94.88% (9320/9822)
- Branches: 92.52% (5731/6194)
- Functions: 92.98% (1711/1840)
- Lines: 95.07% (8741/9194)

### npm run test (Full Suite)

```
Tests  5085 passed (5085)
```

---

## 5. Note About Step 5 Verification

**Step 5 is the hard verification gate** for MCP tool access. The changes made in Step 4 (Node version alignment) are necessary but not sufficient for full verification. Step 5 will require:

- Live/proxy MCP tool access from Copilot, Kiro, Claude, and Codex
- Live local-LLM-harness transcript verification
- Confirmation that all MCP tools function correctly under Node 22 runtime

---

## 6. Summary

| Item                              | Status        |
| --------------------------------- | ------------- |
| test.yml updated to Node 22       | ✅ Complete   |
| TypeScript type check passes      | ✅ Complete   |
| Test suite passes (coverage gate) | ✅ Complete   |
| Test suite passes (full suite)    | ✅ Complete   |
| Other stale workflows identified  | ✅ Documented |
| Node-22-specific breakage         | ✅ None found |
| State file created                | ✅ Complete   |

**Ready for Step 5**: Yes — all Step 4 verification criteria met.
