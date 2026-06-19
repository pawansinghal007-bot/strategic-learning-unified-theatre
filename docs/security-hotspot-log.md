# Security Hotspot Triage Log

## Sprint 86 — Hotspot Review Status

**Total Hotspots**: 16  
**Status**: 0/16 reviewed (0.0%)  
**Gate Condition**: Security Hotspots Reviewed = 0.0% (required: 100%)

---

## Hotspot Entries

### 1. Regex Backtracking (javascript:S5852)
- **File**: `src/internal/git-monitor.js:22`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - regex pattern in git-monitor.js

### 2. Regex Backtracking (javascript:S5852)
- **File**: `src/storage/vscode-learn-utils.js:62`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - regex pattern in utils

### 3. Regex Backtracking (javascript:S5852)
- **File**: `src/test-runner.js:83`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - regex pattern in test-runner

### 4. Regex Backtracking (javascript:S5852)
- **File**: `src/test-runner.js:228`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - regex pattern in test-runner

### 5. Regex Backtracking (typescript:S5852)
- **File**: `src/installer/hw-probe/hwProbe.ts:268`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - regex pattern in hwProbe

### 6. Weak PRNG (typescript:S2245)
- **File**: `src/llm/routing-history.ts:66`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - Math.random() usage

### 7. Weak PRNG (typescript:S2245)
- **File**: `src/security/risks/dependency-check-runner.ts:59`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - Math.random() usage

### 8. Weak PRNG (typescript:S2245)
- **File**: `src/security/risks/trivy-runner.ts:17`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - Math.random() usage

### 9. Weak PRNG (typescript:S2245)
- **File**: `src/security/secrets/gitleaks-runner.ts:162`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - Math.random() usage

### 10. Path Traversal (javascript:S4036)
- **File**: `src/auth-capture.js:106`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - PATH variable handling

### 11. Path Traversal (javascript:S4036)
- **File**: `src/encrypt.js:43`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - PATH variable handling

### 12. Path Traversal (javascript:S4036)
- **File**: `src/encrypt.js:57`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - PATH variable handling

### 13. Path Traversal (javascript:S4036)
- **File**: `src/encrypt.js:76`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - PATH variable handling

### 14. Weak Hash (typescript:S4790)
- **File**: `src/security/secrets/gitleaks-runner.ts:70`
- **Rule**: S4790 - Weak hash algorithm
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - hash algorithm usage

### 15. Path Traversal (typescript:S4036)
- **File**: `src/security/risks/dependency-check-runner.ts:77`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - PATH variable handling

### 16. Path Traversal (typescript:S4036)
- **File**: `src/security/risks/trivy-runner.ts:23`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: TO_REVIEW
- **Justification**: Needs security owner review - PATH variable handling

---

## Summary

- **Total Hotspots**: 16
- **Reviewed**: 0
- **Safe**: 0
- **Fixed**: 0
- **To Review**: 16

## Next Steps

1. Security owner review of all 16 hotspots
2. Mark hotspots as Safe/Fixed after review
3. Update this log with final status
4. Run guard test to verify all entries are logged
