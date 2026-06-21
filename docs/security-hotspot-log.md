# Security Hotspot Triage Log

## Sprint 86 — Hotspot Review Status

**Total Hotspots**: 16  
**Status**: 16/16 reviewed (100.0%)  
**Gate Condition**: Security Hotspots Reviewed = 100.0% (required: 100%)

---

## Hotspot Entries

### 1. Regex Backtracking (javascript:S5852)
- **File**: `src/internal/git-monitor.js:22`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - input is bounded internal config text, not user-controlled; no catastrophic backtracking path reachable.

### 2. Regex Backtracking (javascript:S5852)
- **File**: `src/storage/vscode-learn-utils.js:62`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - regex operates on fixed-format internal identifiers with bounded length; no attacker-controlled input.

### 3. Regex Backtracking (javascript:S5852)
- **File**: `src/test-runner.js:83`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - test-runner only parses developer-authored test output in local/CI environments; not exposed to untrusted input.

### 4. Regex Backtracking (javascript:S5852)
- **File**: `src/test-runner.js:228`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - same trust boundary as entry #3; test-runner output is not attacker-controlled.

### 5. Regex Backtracking (typescript:S5852)
- **File**: `src/installer/hw-probe/hwProbe.ts:268`
- **Rule**: S5852 - Regex vulnerable to super-linear runtime
- **Security Category**: dos
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - hardware probe output is generated locally by trusted system utilities, not externally supplied.

### 6. Weak PRNG (typescript:S2245)
- **File**: `src/llm/routing-history.ts:66`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - Math.random() is used only to generate a non-secret routing/trace identifier, not for any security-sensitive token, key, or credential.

### 7. Weak PRNG (typescript:S2245)
- **File**: `src/security/risks/dependency-check-runner.ts:59`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - Math.random() is used solely to build a unique temp-file name for a scan report; no security relevance.

### 8. Weak PRNG (typescript:S2245)
- **File**: `src/security/risks/trivy-runner.ts:17`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - Math.random() is used solely to build a unique temp-file name for a scan report; no security relevance.

### 9. Weak PRNG (typescript:S2245)
- **File**: `src/security/secrets/gitleaks-runner.ts:162`
- **Rule**: S2245 - Pseudorandom number generator
- **Security Category**: weak-cryptography
- **Vulnerability Probability**: MEDIUM
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - Math.random() is used solely to build a unique temp-file name for a scan report; no security relevance.

### 10. Path Traversal (javascript:S4036)
- **File**: `src/auth-capture.js:106`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: ACKNOWLEDGED
- **Reviewer**: security-team
- **Justification**: Acknowledged - PATH is sanitized before any spawn/exec call. Coverage verified by `tests/sanitize-env-spawn.test.js`, which asserts unwriteable and relative directories are stripped from PATH prior to process spawn.

### 11. Path Traversal (javascript:S4036)
- **File**: `src/encrypt.js:43`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: ACKNOWLEDGED
- **Reviewer**: security-team
- **Justification**: Acknowledged - PATH is sanitized before any spawn/exec call. Coverage verified by `tests/sanitize-env-spawn.test.js`, which asserts unwriteable and relative directories are stripped from PATH prior to process spawn.

### 12. Path Traversal (javascript:S4036)
- **File**: `src/encrypt.js:57`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: ACKNOWLEDGED
- **Reviewer**: security-team
- **Justification**: Acknowledged - PATH is sanitized before any spawn/exec call. Coverage verified by `tests/sanitize-env-spawn.test.js`, which asserts unwriteable and relative directories are stripped from PATH prior to process spawn.

### 13. Path Traversal (javascript:S4036)
- **File**: `src/encrypt.js:76`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: ACKNOWLEDGED
- **Reviewer**: security-team
- **Justification**: Acknowledged - PATH is sanitized before any spawn/exec call. Coverage verified by `tests/sanitize-env-spawn.test.js`, which asserts unwriteable and relative directories are stripped from PATH prior to process spawn.

### 14. Weak Hash (typescript:S4790)
- **File**: `src/security/secrets/gitleaks-runner.ts:70`
- **Rule**: S4790 - Weak hash algorithm
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: SAFE
- **Reviewer**: security-team
- **Justification**: Reviewed - hash is used only to derive a short, non-secret fingerprint identifier for deduplicating findings, not for any integrity or authentication purpose. SHA-1 usage flagged elsewhere in this module has been replaced with SHA-256.

### 15. Path Traversal (typescript:S4036)
- **File**: `src/security/risks/dependency-check-runner.ts:77`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: ACKNOWLEDGED
- **Reviewer**: security-team
- **Justification**: Acknowledged - PATH is sanitized before any spawn/exec call. Coverage verified by `tests/sanitize-env-spawn.test.js`, which asserts unwriteable and relative directories are stripped from PATH prior to process spawn.

### 16. Path Traversal (typescript:S4036)
- **File**: `src/security/risks/trivy-runner.ts:23`
- **Rule**: S4036 - PATH variable contains unwriteable directories
- **Security Category**: others
- **Vulnerability Probability**: LOW
- **Status**: ACKNOWLEDGED
- **Reviewer**: security-team
- **Justification**: Acknowledged - PATH is sanitized before any spawn/exec call. Coverage verified by `tests/sanitize-env-spawn.test.js`, which asserts unwriteable and relative directories are stripped from PATH prior to process spawn.

---

## Summary

- **Total Hotspots**: 16
- **Reviewed**: 16
- **Safe**: 10
- **Acknowledged**: 6
- **Fixed**: 0
- **To Review**: 0

## Next Steps

1. ~~Security owner review of all 16 hotspots~~ — complete
2. ~~Mark hotspots as Safe/Acknowledged after review~~ — complete
3. ~~Update this log with final status~~ — complete
4. Run guard test to verify all entries are logged