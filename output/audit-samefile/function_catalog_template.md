# Function Catalog

Repo: `Solution`

Generated from: `/home/pawan/vscodeagent/Solution`

## Audit steps

1. Run the script at the repo root.
2. Review rows with low live_confidence first.
3. Validate framework wiring, reflection, decorators, and config-based dispatch.
4. Fill owner_review and status. Suggested status values: keep, verify, remove, merge, rename.

## Snapshot

- Total functions found: 5131
- js: 4550
- jsx: 73
- py: 22
- ts: 486

## Catalog columns

- function_name: function or method identifier.
- visibility: public, internal, or test-only heuristic.
- invocation_type: route, CLI, scheduler, handler, test, or direct.
- live_confidence: high, medium, low heuristic based on references and entry-point clues.

## Review table

| function_name | file_path | line | visibility | invocation_type | live_confidence | owner_review | status |
|---|---|---:|---|---|---|---|---|
| waitForApi | `e2e/base.ts` | 51 | public | Direct | high |  |  |
| writeJson | `e2e/regression/approval-audit-compliance.spec.ts` | 114 | test-only | Test | medium |  |  |
| createIsolatedState | `e2e/regression/approval-audit-compliance.spec.ts` | 119 | test-only | Test | medium |  |  |
| writeJson | `e2e/regression/workspace-policy-context-routing.spec.ts` | 95 | test-only | Test | medium |  |  |
| createIsolatedState | `e2e/regression/workspace-policy-context-routing.spec.ts` | 100 | test-only | Test | medium |  |  |
| writeJson | `e2e/smoke/account-rotation-ai-capture.spec.ts` | 98 | test-only | Test | medium |  |  |
| createIsolatedState | `e2e/smoke/account-rotation-ai-capture.spec.ts` | 103 | test-only | Test | medium |  |  |
| seedAccount | `e2e/smoke/account-rotation-ai-capture.spec.ts` | 196 | test-only | Test | medium |  |  |
| loadIcon | `electron-tray/main.js` | 31 | internal | CLI | high |  |  |
| getStateFromAccounts | `electron-tray/main.js` | 36 | internal | CLI | high |  |  |
| truncate | `electron-tray/main.js` | 44 | internal | CLI | high |  |  |
| pickCurrentAccount | `electron-tray/main.js` | 50 | internal | CLI | high |  |  |
| refreshAccounts | `electron-tray/main.js` | 60 | internal | CLI | high |  |  |
| buildMenu | `electron-tray/main.js` | 74 | internal | CLI | high |  |  |
| updateTray | `electron-tray/main.js` | 150 | internal | CLI | high |  |  |
| initializeTray | `electron-tray/main.js` | 158 | internal | CLI | high |  |  |
| handleDaemonEvent | `electron-tray/main.js` | 167 | internal | CLI | high |  |  |
| init_collection | `index_repo.py` | 102 | internal | Direct | medium |  |  |
| is_text_file | `index_repo.py` | 116 | internal | Direct | medium |  |  |
| chunk_text | `index_repo.py` | 135 | internal | Direct | medium |  |  |
| embed | `index_repo.py` | 145 | internal | Direct | medium |  |  |
| chunk_id | `index_repo.py` | 157 | internal | Direct | medium |  |  |
| remove_existing_file | `index_repo.py` | 166 | internal | Direct | medium |  |  |
| index_file | `index_repo.py` | 183 | internal | Direct | medium |  |  |
| scan_repo | `index_repo.py` | 229 | internal | Direct | medium |  |  |
| parseToolArgs | `live-harness.ts` | 5 | internal | Direct | medium |  |  |
| should_skip | `output/repo_function_audit.py` | 42 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| is_text_code | `output/repo_function_audit.py` | 52 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| safe_read | `output/repo_function_audit.py` | 55 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| line_number | `output/repo_function_audit.py` | 61 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| visibility | `output/repo_function_audit.py` | 64 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| invocation_type | `output/repo_function_audit.py` | 74 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| parse_functions | `output/repo_function_audit.py` | 86 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| find_references | `output/repo_function_audit.py` | 129 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| confidence | `output/repo_function_audit.py` | 172 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| repo_name | `output/repo_function_audit.py` | 183 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| main | `output/repo_function_audit.py` | 186 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Bt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| De | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| E | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Er | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| F | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Fe | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ft | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| G | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ie | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| It | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| K | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Me | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Mt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ne | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| P | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Pt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Qe | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Re | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Rn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Rt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| T | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Te | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ye | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Zt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| _e | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ar | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| be | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| c | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| d | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| de | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ee | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| et | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| fe | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| g | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ht | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| j | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| kt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| le | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ln | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| lr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| me | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| mt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| n | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| or | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| pt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| s | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| sr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ve | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| we | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| xe | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| y | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 1 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| $a | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| $t | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ae | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ao | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| B | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Br | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ci | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Co | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Do | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Eo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Et | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Fo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Gt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ir | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Kn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Li | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Mo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| No | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Oo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Rr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Si | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| So | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ti | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| To | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| U | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Un | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Va | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| We | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Wr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Za | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| _n | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| _t | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| as | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| bi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ce | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| cn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| cr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| cs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| er | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| es | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| f | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| fn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| fs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| go | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| gs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| is | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| it | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| jn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ki | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ko | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| kr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ls | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| m | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| mo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ns | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| os | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ps | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| qn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| qt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| re | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| rs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| sn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ss | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ts | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| un | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| us | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| vo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| wi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| wo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| wt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| xo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| ye | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| yi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| yo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| zr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 4 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| $o | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ai | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| As | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Bi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Bo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Bs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Cs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Di | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ds | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ei | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Es | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Fi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Fs | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Gn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Go | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ho | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ii | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Io | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Is | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Jn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Jo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Kr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Lr | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ls | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Mi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ms | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ni | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ns | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Oi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Os | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Pi | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Po | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ps | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Qn | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Qo | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Qt | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |
| Ri | `playwright-report-ui/trace/assets/codeMirrorModule-Ds_H_9Yq.js` | 5 | internal | CLI, Handler, Scheduler, Test | high |  |  |

_Only the first 200 rows are shown here. Use `function_catalog.csv` for the full catalog._
