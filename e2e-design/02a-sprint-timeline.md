# Sprint Timeline

## Sprint Timeline Table

| Sprint    | Capability                                                                                                         | UI Surface                                  | Risk                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Sprint 11 | Embedded AI browser pane and passive response capture for ChatGPT/Claude/Gemini/Perplexity                         | Embedded browser/dashboard capture panel    | Medium — external platform DOM and preload security boundary can break capture behavior                |
| Sprint 26 | Explainable routing decisions with persistent history, human-readable reason strings, and CLI/dashboard visibility | Routing history/explanation dashboard panel | Medium — routing explanation logging and restart persistence must remain consistent                    |
| Sprint 29 | Per-workspace policy overrides, workspace context injection, and workspace-aware provider routing                  | Workspace policy/context panel              | Medium — workspace overrides must merge correctly with global policy and affect gateway routing safely |
| Sprint 38 | Audit log JSON/HTML export with self-verification and dashboard verification badge/alerts                          | Audit trail and verification panel          | Medium — audit export integrity and verification failure handling require careful tamper-proof design  |
| Sprint 37 | Workspace approvals governance with approval requests, resolution, and policy audit event linkage                  | Workspace approvals panel                   | High — approval workflows add manual review complexity and sensitive-policy enforcement risk           |
| Sprint 39 | Workspace quota governance with per-workspace daily/weekly limits and alert/fallback/block enforcement modes       | Workspace quotas panel                      | High — quota enforcement directly affects request routing and can block access                         |

## Evidence Log

| Sprint    | Commit/Doc Reference                                          | Confidence |
| --------- | ------------------------------------------------------------- | ---------- |
| Sprint 11 | `docs/sprint-11-analysis.md`                                  | High       |
| Sprint 26 | `docs/sprint-26-scope.md`                                     | High       |
| Sprint 29 | `docs/sprint-29-scope.md`                                     | High       |
| Sprint 38 | `docs/sprint-38-scope.md`                                     | High       |
| Sprint 37 | `git-history.txt` commit `0b66be6f` / `e79d87f3` / `5b649208` | High       |
| Sprint 39 | `docs/sprint-39-scope.md`                                     | High       |
