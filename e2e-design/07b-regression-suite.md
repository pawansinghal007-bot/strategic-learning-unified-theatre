# Regression Suite

## Suite Summary (target runtime, trigger conditions)

- Target runtime: 25-40 minutes total on a CI runner with two workers; 35-55 minutes on a developer machine with one worker.
- Recommended budget: 10 tests, isolated per-test state, mocked LLM provider, no real external AI platform login, no real OS keychain dependency, and no real VS Code restart.
- Trigger conditions:
  - Pull requests that change cross-journey behavior after smoke has passed.
  - Merge to the main integration branch when changes touch account switching, browser capture, workspace policy/context, approvals, audit, quotas, routing, preload APIs, or persistent governance stores.
  - Before release packaging, after the smoke suite and before the full suite.
  - On demand for suspected regressions in one of the five critical journeys.
- Required mode:
  - Use isolated `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG`.
  - Use `VSCODE_ROTATOR_MOCK_LLM=1`.
  - Seed local accounts, browser responses, workspace stores, approval records, quota policies, and routing history through E2E fixture helpers.
  - Avoid live ChatGPT, Claude, Gemini, Perplexity, real OS keychain writes, and real VS Code binaries.
- Coverage intent:
  - Cover all five critical journeys at moderate depth.
  - Validate realistic state transitions, restart persistence, and cross-surface consistency.
  - Avoid duplicating smoke tests that only prove boot, preload availability, seeded account readability, seeded capture readability, or the shortest governance happy path.
  - Keep edge and exhaustive failure coverage for the full suite.

## Test Cases (one subsection per test with all fields)

### REG-001 — Account Switch Updates Active Identity And Auth Target

- Test ID and name: `REG-001 — Account Switch Updates Active Identity And Auth Target`
- Objective:
  - Verify a developer can switch between two seeded AI accounts and the active identity plus fake auth target update consistently.
- Prerequisites:
  - Base E2E isolated state is created.
  - Two active accounts are seeded through `AccountStore` and `SecretStore` helpers, for example `codex-primary` and `trae-secondary`.
  - Fake auth target paths are created under isolated `HOME`.
  - Electron app is launched and account APIs are ready.
- Step-by-step execution flow:
  1. Open the accounts surface.
  2. Confirm both seeded accounts are visible or returned by `window.rotator.accounts.listDetails()`.
  3. Switch from the initial active account to `trae-secondary`.
  4. Wait for the UI active account indicator or details API to reflect the new active account.
  5. Read the fake auth target file for the selected agent.
  6. Switch back to `codex-primary`.
  7. Read active account state and fake auth target again.
- Assertions:
  - Both account records remain present after each switch.
  - Exactly one account is active after each switch.
  - The active account id and agent type match the requested switch target.
  - Fake auth target content changes to the expected test credential marker for the active account.
  - No raw secret value is displayed in account list text or returned in account detail metadata.
  - Switch operations complete without IPC errors.
- Estimated runtime:
  - 2-3 minutes.

### REG-002 — Captured Response Ingestion Writes Traceable Local State

- Test ID and name: `REG-002 — Captured Response Ingestion Writes Traceable Local State`
- Objective:
  - Verify a seeded browser capture can be ingested into local learning state and remains traceable to the original platform response.
- Prerequisites:
  - Base E2E isolated state is created.
  - `browserResponsesIngest` is enabled for this test.
  - One ChatGPT response and one Claude response are seeded in `$HOME/.vscode-rotator/browser-responses`.
  - Experience DB and AI memory DB start empty.
  - Electron app is launched and browser APIs are ready.
- Step-by-step execution flow:
  1. Open the browser/capture surface.
  2. List captured responses for all platforms.
  3. Select the seeded ChatGPT response.
  4. Trigger ingestion through the UI action or preload API.
  5. Read ingestion status or local learning summary.
  6. List responses filtered by `chatgpt`.
  7. Restart Electron with the same isolated state.
  8. Read the ingested response summary again.
- Assertions:
  - Both seeded platform responses are listed before ingestion.
  - The selected ChatGPT response is ingested successfully.
  - Ingested state includes platform, filename, timestamp, and response content marker.
  - The Claude response remains unmodified and un-ingested unless explicitly selected.
  - Restarted app still shows the ingested ChatGPT response state.
  - No duplicate ingestion record is created during restart.
- Estimated runtime:
  - 3-4 minutes.

### REG-003 — Workspace Policy Override Changes Routing Source

- Test ID and name: `REG-003 — Workspace Policy Override Changes Routing Source`
- Objective:
  - Verify a workspace-specific policy override changes resolved policy and routing explanation without affecting another workspace.
- Prerequisites:
  - Base E2E isolated state is created.
  - Provider policy default is seeded with a deterministic routing mode and provider order.
  - Two workspace ids are defined: `workspace-alpha` and `workspace-beta`.
  - Routing history store starts empty.
- Step-by-step execution flow:
  1. Launch Electron and open the workspace policy surface.
  2. Resolve policy for `workspace-alpha` and `workspace-beta` before overrides.
  3. Set a workspace override for `workspace-alpha`, such as `routingMode: "local-first"`.
  4. Resolve policy for both workspaces again.
  5. Request or record a routing decision for each workspace.
  6. Open the routing surface and inspect the newest decisions.
  7. Read persisted workspace policy overrides.
- Assertions:
  - Before override, both workspaces resolve to provider/default policy.
  - After override, only `workspace-alpha` resolves from workspace policy.
  - `workspace-beta` remains on the provider/default policy.
  - Routing decision for `workspace-alpha` includes the workspace policy source.
  - Routing decision for `workspace-beta` does not claim the `workspace-alpha` override.
  - Persisted override store contains only the intended workspace override.
- Estimated runtime:
  - 3-4 minutes.

### REG-004 — Workspace Context Appears In Routing Explanation

- Test ID and name: `REG-004 — Workspace Context Appears In Routing Explanation`
- Objective:
  - Verify configured workspace context is included in routing decision metadata and visible in dashboard review.
- Prerequisites:
  - Base E2E isolated state is created.
  - Test workspace contains safe context files, such as source notes and a small project summary.
  - Workspace context settings are enabled for `context-workspace`.
  - Provider policy and routing stores are clean.
- Step-by-step execution flow:
  1. Launch Electron and open the workspace surface.
  2. Save context settings for `context-workspace`.
  3. Trigger a routing decision for `context-workspace`.
  4. Open the routing surface.
  5. Expand or inspect the newest routing explanation.
  6. Read the routing decision through `window.workspaceRouting.summary("context-workspace")` or equivalent API.
  7. Restart Electron and inspect the routing explanation again.
- Assertions:
  - Workspace context settings save successfully.
  - Routing decision contains the expected workspace id.
  - Explanation includes context source/count metadata.
  - Context metadata is visible through both dashboard and preload/API review surfaces.
  - Restarted app preserves the routing explanation and context metadata.
  - Context content does not appear in unrelated workspace routing records.
- Estimated runtime:
  - 3-5 minutes.

### REG-005 — Sensitive Workspace Policy Change Requires Approval

- Test ID and name: `REG-005 — Sensitive Workspace Policy Change Requires Approval`
- Objective:
  - Verify a sensitive workspace policy change creates a pending approval, blocks application until approval, and applies after resolution.
- Prerequisites:
  - Base E2E isolated state is created.
  - Approval policy is configured so the selected workspace policy field requires approval.
  - `approval-workspace` has no existing pending approvals.
  - Electron app is launched and governance APIs are ready.
- Step-by-step execution flow:
  1. Open the workspace policy surface.
  2. Submit a sensitive policy change for `approval-workspace`.
  3. Open the approvals surface.
  4. Confirm a pending approval exists for the requested change.
  5. Resolve the approval as approved with a test reason.
  6. Return to the workspace policy surface and resolve policy for `approval-workspace`.
  7. Open the audit surface and inspect recent events.
- Assertions:
  - Sensitive change does not apply before approval resolution.
  - Pending approval includes workspace id, requested change summary, requester metadata, and status.
  - Approval resolution changes status to approved.
  - Approved policy change is applied after resolution.
  - Audit events include both approval request and approval resolution.
  - Approval id links the resolution event to the original request.
- Estimated runtime:
  - 3-5 minutes.

### REG-006 — Audit Export And Integrity Verification For Governance Actions

- Test ID and name: `REG-006 — Audit Export And Integrity Verification For Governance Actions`
- Objective:
  - Verify audit entries generated by approval, policy, and quota actions pass integrity verification and can be exported as JSON and HTML.
- Prerequisites:
  - Base E2E isolated state is created.
  - A small set of governance actions is performed or seeded: one policy override, one approval resolution, and one quota usage event.
  - Export destination is a test-owned repo-local or temp path.
  - Electron app is launched and audit APIs are ready.
- Step-by-step execution flow:
  1. Open the audit surface.
  2. Read latest audit events.
  3. Run audit integrity verification.
  4. Export audit log as JSON.
  5. Export audit log as HTML.
  6. Read export results through UI/API.
  7. Parse or inspect exported files through test support helpers.
- Assertions:
  - Latest audit events include policy, approval, and quota-related events.
  - Audit verification returns `ok === true`.
  - Dashboard integrity badge shows a verified state.
  - JSON export exists, parses successfully, and includes the expected event count.
  - HTML export exists and includes the expected integrity status.
  - Exported event ids match the latest audit events inspected in the dashboard.
- Estimated runtime:
  - 3-4 minutes.

### REG-007 — Quota Alert Mode Records Usage Without Blocking Routing

- Test ID and name: `REG-007 — Quota Alert Mode Records Usage Without Blocking Routing`
- Objective:
  - Verify alert-mode quota enforcement records usage and exceeded status while still allowing routing to proceed.
- Prerequisites:
  - Base E2E isolated state is created.
  - Workspace `quota-alert-workspace` has a quota policy with a low daily limit and mode `alert`.
  - Provider routing policy has at least one available provider.
  - Routing history and quota stores start clean.
- Step-by-step execution flow:
  1. Launch Electron and open quota surface.
  2. Record usage up to the daily limit for `quota-alert-workspace`.
  3. Record one additional usage event above the limit.
  4. Evaluate quota state.
  5. Request or record a routing decision for the same workspace.
  6. Open routing history and inspect the decision explanation.
  7. Open audit or quota notifications.
- Assertions:
  - Quota usage count reflects all recorded usage events.
  - Quota evaluation reports exceeded or alert state after the above-limit usage.
  - Routing decision is still allowed in alert mode.
  - Routing explanation includes quota alert context.
  - Quota notification or audit event records the exceeded condition.
  - No unrelated workspace receives the alert notification.
- Estimated runtime:
  - 3-4 minutes.

### REG-008 — Quota Block Mode Prevents Over-Limit Routing

- Test ID and name: `REG-008 — Quota Block Mode Prevents Over-Limit Routing`
- Objective:
  - Verify block-mode quota enforcement prevents routing after the configured limit is exceeded.
- Prerequisites:
  - Base E2E isolated state is created.
  - Workspace `quota-block-workspace` has a quota policy with a low daily limit and mode `block`.
  - Provider routing policy has at least one available provider.
  - Quota and routing stores start clean.
- Step-by-step execution flow:
  1. Launch Electron and open quota surface.
  2. Record usage up to the daily quota limit.
  3. Evaluate quota state.
  4. Record one additional usage event above the limit.
  5. Evaluate quota state again.
  6. Request a routing decision for `quota-block-workspace`.
  7. Open routing history and audit surfaces.
- Assertions:
  - Quota state is allowed at or below the configured allowed boundary.
  - Quota state becomes blocked after over-limit usage.
  - Routing request returns a blocked/no-provider result or equivalent denied state.
  - Routing history captures the blocked decision with quota reason.
  - Audit events include quota exceeded and routing blocked evidence.
  - Provider usage is not incremented for the blocked request.
- Estimated runtime:
  - 3-4 minutes.

### REG-009 — Routing History Captures Provider Fallback Explanation

- Test ID and name: `REG-009 — Routing History Captures Provider Fallback Explanation`
- Objective:
  - Verify provider fallback decisions are persisted and reviewable with enough explanation to diagnose why the primary provider was skipped.
- Prerequisites:
  - Base E2E isolated state is created.
  - Provider policy is seeded with a primary provider and a fallback provider.
  - Provider health marks the primary provider unavailable and fallback provider available.
  - Routing history starts empty.
- Step-by-step execution flow:
  1. Launch Electron and open routing surface.
  2. Request a routing decision for `fallback-workspace`.
  3. Read the routing decision result.
  4. Inspect the newest routing history row.
  5. Expand or read explanation details.
  6. Read persisted routing history JSON through test support helper.
  7. Restart Electron and inspect the same routing history row.
- Assertions:
  - Decision chooses the fallback provider.
  - Explanation names the primary provider as skipped or unavailable.
  - Routing row includes workspace id, selected provider, policy source, health reason, and timestamp.
  - Persisted routing history contains the same decision details as the dashboard.
  - Restarted dashboard still displays the fallback explanation.
  - No audit or routing entry claims the primary provider was selected.
- Estimated runtime:
  - 3-5 minutes.

### REG-010 — Governance Review Dashboard Stays Consistent Across Restart

- Test ID and name: `REG-010 — Governance Review Dashboard Stays Consistent Across Restart`
- Objective:
  - Verify policy, approval, quota, routing, and audit dashboard state remains consistent after an app restart following a realistic governance workflow.
- Prerequisites:
  - Base E2E isolated state is created.
  - One workspace, one provider policy, one approval rule, and one quota policy are configured.
  - Electron app is launched and governance surfaces are ready.
- Step-by-step execution flow:
  1. Apply a workspace policy override that requires approval.
  2. Approve the pending request.
  3. Record quota usage for the same workspace.
  4. Request a routing decision for the workspace.
  5. Verify audit integrity.
  6. Capture UI/API summaries for workspace policy, approvals, quotas, routing, and audit.
  7. Close Electron cleanly.
  8. Relaunch Electron with the same isolated state.
  9. Re-read the same summaries from the dashboard and preload APIs.
- Assertions:
  - Approved policy remains applied after restart.
  - Approval history preserves request and resolution state.
  - Quota usage and enforcement status remain unchanged after restart.
  - Routing history still contains the decision generated before restart.
  - Audit verification remains OK after restart.
  - Dashboard summaries and preload/API summaries agree before and after restart.
- Estimated runtime:
  - 4-6 minutes.
