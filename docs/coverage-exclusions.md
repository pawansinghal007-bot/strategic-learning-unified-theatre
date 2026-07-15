# Coverage exclusions

## Policy

Coverage is measured against the included testable scope only. Files excluded below
have documented reasons. Both `vitest.config.js` and `sonar-project.properties` must
match this document exactly. Measured coverage is reported as-is from the tool output —
no manual adjustment.

## Coverage thresholds (policy)

The following thresholds are are **minimum required coverage levels**. These are policy
decisions, not derived from current measurements. The code must clear these bars, and
the gate should block merges if coverage falls below these values.

| Metric     | Threshold | Rationale                                |
| ---------- | --------- | ---------------------------------------- |
| Statements | 75%       | Minimum floor for pure logic (Bucket A)  |
| Branches   | 60%       | Conditional paths covered; 65%+ measured |
| Functions  | 80%       | All public functions exercised           |
| Lines      | 80%       | Line-level coverage for testable code    |

**Notes:**

- Thresholds are round numbers chosen as policy floors, not derived from current measurements
- Current measured baseline (Sprint 90): 81.25% statements, 68.15% branches
- Branch threshold (60%) is slightly lower than statements (75%) because branch coverage
  tends to be harder to improve - each conditional adds multiple branches that may need
  separate test cases to exercise both true and false paths
- Thresholds may be ratcheted up as Bucket A work continues and coverage improves
- The gate should block merges if coverage falls below these policy thresholds

## Current measured baseline (Sprint 90)

| Metric     | Value  |
| ---------- | ------ |
| Statements | 79.77% |
| Branches   | 67.37% |
| Functions  | 84.84% |
| Lines      | 80.89% |

## Bucket A — testable logic (tests written in Sprint 90)

These files contain pure functions, class methods with injectable dependencies, or data-transformation code that can be exercised with `vi.mock()` for any I/O boundary.

| File                                              | Reason category                          | Tests written |
| ------------------------------------------------- | ---------------------------------------- | ------------- |
| `src/security/security-overview/ai-explain.ts`    | Pure prompt-building and parsing logic   | Yes           |
| `src/limit-detector.js`                           | Pure string matching for limit detection | Yes           |
| `src/scheduler.js`                                | Pure cooldown scheduling logic           | Yes           |
| `src/session-supervisor.js`                       | Pure backoff computation logic           | Yes           |
| `src/accounts/switcher.js`                        | Pure account switching logic             | Yes           |
| `src/internal/journal.js`                         | Pure file append logic                   | Yes           |
| `src/startup-plugins.js`                          | Pure plugin loading logic                | Yes           |
| `src/internal/config.js`                          | Pure config loading/parsing logic        | Yes           |
| `src/accounts/health.js`                          | Pure health checking logic               | Yes           |
| `src/llm/gateway.ts`                              | Pure routing logic                       | Yes           |
| `src/policies/provider-policy.ts`                 | Pure policy evaluation logic             | Yes           |
| `src/llm/knowledge-graph.js`                      | Pure graph building logic                | Yes           |
| `src/llm/storage.ts`                              | Pure JSON file I/O logic                 | Yes           |
| `src/llm/training-exporter.js`                    | Pure document grouping logic             | Yes           |
| `src/ai-memory/repositories/handoff-repo.js`      | Pure DB repository logic                 | Yes           |
| `src/ai-memory/repositories/sprint-state-repo.js` | Pure DB repository logic                 | Yes           |
| `src/policies/policy-presets.ts`                  | Pure policy preset definitions           | Yes           |
| `src/security/risks/parsers.ts`                   | Pure parsing logic                       | Yes           |
| `src/shared/errors/base.ts`                       | Pure error class definitions             | Yes           |
| `src/internal/paths.js`                           | Pure path resolution logic               | Yes           |
| `src/llm/provider-health.ts`                      | Pure provider health tracking logic      | Yes           |
| `src/llm/provider-usage.ts`                       | Pure provider usage tracking logic       | Yes           |
| `src/llm/routing-explainer.ts`                    | Pure routing explanation logic           | Yes           |
| `src/llm/routing-history.ts`                      | Pure routing history logic               | Yes           |
| `src/llm/document-ingester.js`                    | Pure document ingester logic             | Yes           |
| `src/llm/embeddings.js`                           | Pure embedding logic                     | Yes           |
| `src/commands/ai.js`                              | Pure flag parsing and dispatch logic     | Yes           |
| `src/governance/workspace-approvals.ts`           | Pure approval state machine logic        | Yes           |
| `src/governance/workspace-quotas.ts`              | Pure quota enforcement logic             | Yes           |
| `src/llm/experience-db.js`                        | Pure DB logic                            | Yes           |
| `src/llm/mistake-tracker.js`                      | Pure tracking logic                      | Yes           |
| `src/llm/local-llm.js`                            | Pure LLM provider routing logic          | Yes           |
| `src/llm/prompt-generator.js`                     | Pure prompt building logic               | Yes           |
| `src/daemon/watcher.js`                           | Pure event routing logic                 | Yes           |
| `src/knowledge/ingest/embedder.js`                | Pure embedding logic                     | Yes           |
| `src/encrypt.js`                                  | Pure encryption logic                    | Yes           |
| `src/browser-bridge.js`                           | Pure browser automation logic            | Yes           |
| `src/storage/storage-monitor.js`                  | Pure file monitoring logic               | Yes           |
| `src/internal/git-monitor.js`                     | Pure git status parsing logic            | Yes           |
| `src/startup-bootstrap.js`                        | Pure async initialization logic          | Yes           |
| `src/knowledge/ingest/ingest-repository.ts`       | Pure repository ingestion logic          | Yes           |
| `src/security/secrets/suppressions.ts`            | Pure suppression matching logic          | Yes           |
| `src/shared/errors/memory.error.ts`               | Pure error class definitions             | Yes           |
| `src/shared/errors/routing.error.ts`              | Pure error class definitions             | Yes           |

## Bucket B — Electron / CLI / external-tool wrappers

These files require a real Electron runtime, OS binary, or hardware device. Unit testing
them would produce brittle tests that measure framework noise, not product behaviour.

| File                   | Reason category                        |
| ---------------------- | -------------------------------------- |
| `src/vscode.js`        | External-binary (uses tasklist/pgrep)  |
| `src/llm/inference.js` | External-binary (spawns Ollama)        |
| `src/test-runner.js`   | External-binary (spawns test commands) |

## Bucket C — Integration surfaces / IPC contracts

These files are primarily covered by integration or end-to-end tests, not unit tests.
Their dominant coverage gap comes from IPC wiring or reactive UI logic.

| File   | Reason category |
| ------ | --------------- |
| (none) | (none)          |

## Existing exclusions (carried from Sprint 89)

These files were already excluded in Sprint 89 and remain in the exclusion list:

| File                                      | Reason category      |
| ----------------------------------------- | -------------------- |
| `src/preload.ts`                          | Electron-preload     |
| `src/main/**/*`                           | Electron-main        |
| `src/cli.js`                              | CLI-entrypoint       |
| `src/cli/llm-*.ts`                        | CLI-entrypoint       |
| `src/browser-adapters/*.js`               | External-binary      |
| `src/llm/providers/*.ts`                  | LLM-provider-wrapper |
| `src/llm/index.ts`                        | LLM-provider-wrapper |
| `src/security/**/*-runner.ts`             | External-binary      |
| `src/security/**/index.ts`                | Security-tools       |
| `src/security/**/schema.ts`               | Schema-only          |
| `src/ui/dashboard.js`                     | Renderer-handler     |
| `src/ui/types.d.ts`                       | Schema-only          |
| `src/auth-capture.js`                     | Auth-capture         |
| `src/commands/storage.js`                 | CLI-entrypoint       |
| `src/domain/types.js`                     | Schema-only          |
| `src/internal/reporter.js`                | Internal-utility     |
| `src/commands/handoff.js`                 | CLI-entrypoint       |
| `src/commands/idea.js`                    | CLI-entrypoint       |
| `src/commands/browser.js`                 | CLI-entrypoint       |
| `src/commands/llm.js`                     | CLI-entrypoint       |
| `src/commands/bc2-sync.js`                | CLI-entrypoint       |
| `src/daemon/daemonStatus.js`              | External-binary      |
| `src/knowledge/schema/*.ts`               | Schema-only          |
| `src/shared/contracts/provider.ts`        | IPC-contract         |
| `src/shared/errors/index.ts`              | Schema-only          |
| `src/installer/hw-probe/*.ts`             | Installer-probe      |
| `src/renderer/types/electron.d.ts`        | Schema-only          |
| `src/security/security-overview/index.ts` | Security-overview    |
| `src/governance/workspace-context.ts`     | IPC-contract         |
| `src/shared/ipc/contract.ts`              | IPC-contract         |
