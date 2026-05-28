# Sprint 11B: VS Code Extension — Sidebar Views & Sprint Integration

**Project**: strategic-learning-unified-theatre  
**Sprint Goal**: Build Ideas and Related Context tree views; integrate with sprint handoff system  
**Duration**: 1 week  
**Status**: PLANNING  
**Max Tokens**: 150K  
**Dependency**: Sprint 11A must be complete (6 core commands stable)  

---

## Overview

This sprint focuses on **Phase 2** of the extension roadmap: add sidebar views that surface project context (Ideas and Related Context) and tighten the "Active Sprint" webview to show structured sprint state. Goal: make the sidebar a natural part of the daily "run AI-assisted sprints" workflow.

### Hero Workflows Served

1. **"Run AI-assisted sprints"** → Views: Ideas tree, Related Context tree, Active Sprint webview  
   - User opens VS Code → sees ideas in sidebar → clicks to view details → refreshes after creating new idea  
   - User has a question → runs "Find Related Context" → sidebar updates with related past sprints, ideas, responses  

---

## Reference Documents

**Always refer to these before coding:**
- [strategic-learning-unified-theatre-master-instructions.md](../strategic-learning-unified-theatre-master-instructions.md) — Latest project status
- [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md) — Manifest template, sidebar structure
- [SPRINT-11A-CORE-COMMANDS.md](./SPRINT-11A-CORE-COMMANDS.md) — Ensure core commands are implemented first
- `Solution/vscode-extension/extension.js` — From Sprint 11A
- `Solution/vscode-extension/package.json` — From Sprint 11A

---

## Acceptance Criteria

✅ Ideas tree view renders (read-only list of ideas by priority)  
✅ Related Context tree view renders (flat list of related items)  
✅ "Create Idea" command works and refreshes Ideas tree  
✅ "Active Sprint" webview shows structured fields (goal, status, token budget, resume prompt)  
✅ "Copy Resume Prompt" button copies to clipboard  
✅ No blocking errors when opening sidebar (graceful empty states)  
✅ Tree views update after commands (e.g., after `ingestCurrentFiles`, after `findRelatedContext`)  
✅ Status bar shows active sprint status or "No sprint"  

---

## Implementation Scope

### Tree View Providers (2)

| View | Data Source | Refresh Trigger | Display Format |
|------|-------------|-----------------|-----------------|
| Ideas | `idea list --export json` | On activate, after create idea | Title + priority badge |
| Related | `llm related --to "<query>"` | On `findRelatedContext` command | Grouped by type (sprint/idea/response) |

### Webview Updates (1)

| View | Current State | Changes |
|------|---------------|---------|
| Active Sprint | Plain text stdout | Parse JSON, show fields in blocks, add metadata |

### Commands (1 New)

| Command | Purpose | Complexity |
|---------|---------|-----------|
| `createNewIdea` | Open inputs, call `idea create`, refresh Ideas tree | MED |

### Status Bar Item (1 New)

| Item | Display | Click Action |
|------|---------|--------------|
| "Rotator: [Sprint ID]" | Current sprint or "No sprint" | Open Active Sprint webview |

---

## Known Issues & Constraints

- **Ideas Tree Empty State**: Must gracefully show "No ideas yet. Create one?" if `idea list` returns empty.  
- **Related Context Timing**: `llm related` might take 2–5 seconds. Show progress indicator.  
- **TreeDataProvider Refresh**: Must call `_onDidChangeTreeData.fire()` to refresh tree after mutations.  
- **Handoff JSON Format**: Sprint 11A should verify if `handoff get-active --json` exists; if not, may need to parse text output or add CLI flag.  
- **File Watcher Optional**: Do NOT add file system watchers in this sprint; trees refresh on command completion only.

---

## Three-Prompt Breakdown

### PROMPT 1: ANALYSIS

**Do this first. Do NOT start coding.**

**Task**: Understand tree provider pattern, verify CLI output formats, plan UI layout.

**Specific questions to answer:**

1. **TreeDataProvider Pattern**  
   - Review VS Code TreeDataProvider API documentation  
   - How to implement `getTreeItem()` and `getChildren()` for a flat list vs grouped list?  
   - What's the minimal implementation to show a read-only tree?

2. **CLI Output Validation**  
   - Run `strategic-learning-unified-theatre idea list --export json` locally and capture output  
   - Run `strategic-learning-unified-theatre llm related --to "async errors" --limit 5` and capture output format  
   - Is output valid JSON? Can it be parsed directly by extension?  
   - **Document**: Exact JSON schema for both commands

3. **Handoff Get-Active Format**  
   - Run `strategic-learning-unified-theatre handoff get-active` and capture output  
   - Is it plain text, JSON, or structured key-value?  
   - If plain text, design a simple text-to-object parser (regex or split-by-newline)  
   - **Decide**: Should we add `--json` flag to CLI, or parse existing format?

4. **UI Layout**  
   - Sketch the sidebar layout in text:  
     ```
     🧠 Strategic Learning Unified Theatre
       📋 Ideas
         - [HIGH] Add retry logic
         - [MED] Refactor async
       🔗 Related Context
         (empty until user runs find related)
       ⚙️ Current Sprint
         [Webview panel]
     ```

5. **Refresh Strategy**  
   - Which commands should trigger tree refresh?  
   - E.g., after `createNewIdea` → refresh Ideas tree; after `findRelatedContext` → refresh Related tree  
   - How to debounce refresh (avoid flickering)?

**Deliverable**: A small document (`SPRINT-11B-ANALYSIS.md`) answering all 5 questions. **Do not code yet.**

---

### PROMPT 2: CODING

**Once PROMPT 1 is complete, proceed to code.**

**Task**: Implement tree providers and webview for sprint views. Update package.json.

**Steps:**

1. **Implement Ideas TreeDataProvider**  
   ```javascript
   class IdeasTreeProvider extends vscode.TreeDataProvider {
     async getChildren() {
       // Call runCli(['idea', 'list', '--export', 'json'])
       // Parse JSON
       // Group by priority: HIGH → MED → LOW
       // Return TreeItem array
     }
     
     getTreeItem(idea) {
       // Create label: "[PRIORITY] Title"
       // Set contextValue='idea' for menu contributions
       // Return TreeItem
     }
   }
   ```

2. **Implement Related Context TreeDataProvider**  
   - Initially empty  
   - Gets populated when user runs `findRelatedContext` command  
   - Groups items: "Recent Sprints" > "Related Ideas" > "LLM Responses"  

3. **Enhance `findRelatedContext` Command**  
   - After running CLI, update RelatedContextProvider  
   - Trigger tree refresh via `_onDidChangeTreeData.fire()`  

4. **Implement `createNewIdea` Command**  
   - Show input box: title  
   - Show input box: body (multi-line, optional)  
   - Show quick pick: tags (comma-separated, optional)  
   - Show quick pick: priority (high|med|low)  
   - Call `runCli(['idea', 'create', '--title', title, ...])`  
   - On success: refresh Ideas tree + show confirmation  
   - On error: show error toast  

5. **Upgrade "Active Sprint" Webview**  
   - Parse JSON from `handoff get-active --json` (or parse text if JSON not available)  
   - Render structured layout:  
     ```
     🎯 Sprint Goal
     [goal text]
     
     📊 Status & Metadata
     Status: active
     Agent: claude
     Model: claude-3-sonnet
     Token Budget: 100000
     Tokens Used: 45000
     
     📋 Resume Prompt
     [read-only text area, select-all friendly]
     
     [Copy to Clipboard Button]
     ```

6. **Add Status Bar Item**  
   - Create status bar item on activation  
   - Update text based on active sprint (poll every 10 seconds or on command completion)  
   - Click action: show Active Sprint webview  
   - Example text: "Rotator: Sprint abc123 (active)" or "Rotator: No sprint"  

7. **Update package.json**  
   - Add `viewsContainers` and `views` for sidebar  
   - Add `createNewIdea` command  
   - Add menu contributions (e.g., "Create Idea" button in Ideas tree header)  
   - Add status bar item registration (programmatic in activation)  

8. **Smoke Test**  
   - Open VS Code (`F5`)  
   - Verify "Strategic Learning Unified Theatre" appears in activity bar  
   - Click to open sidebar → see Ideas tree (populated or empty gracefully)  
   - Create a test idea → watch Ideas tree refresh  
   - Run `findRelatedContext` → watch Related Context tree populate  
   - Click on "Active Sprint" view → see sprint details  
   - Click status bar "Rotator: ..." → open sprint webview  

**Deliverable**: Updated `extension.js` + `package.json`, tree providers working, webview enhanced. **Do not write tests yet.**

---

### PROMPT 3: TESTING & DOCUMENTATION UPDATE

**After PROMPT 2 code is stable, add tests and update docs.**

**Task**: Add tree provider tests, webview tests. Update master instructions.

**Steps:**

1. **Unit Tests for Tree Providers** (`tests/extension-trees.test.js`)  
   - Mock `runCli` to return sample ideas JSON  
   - Test Ideas tree: renders all ideas, groups by priority  
   - Test Related tree: initially empty, populates after update  
   - Test error handling: empty idea list, CLI error → graceful empty state  
   - **Coverage target**: 75%+

2. **Unit Tests for Webview** (`tests/extension-webview.test.js`)  
   - Mock `runCli` to return sprint JSON  
   - Test parsing and HTML generation  
   - Test "Copy to Clipboard" button behavior (via webview message)  
   - Test "No active sprint" state  

3. **Unit Tests for `createNewIdea`** (extend `tests/extension.test.js`)  
   - Mock user inputs (title, body, tags, priority)  
   - Test successful create → tree refresh  
   - Test user cancel (ESC) → no mutation  
   - Test CLI error → error toast  

4. **E2E Smoke Test** (manual, documented)  
   - Open real VS Code, install extension  
   - Create 3 test ideas → verify all appear in tree  
   - Run "Find Related Context" → verify Related tree populates  
   - Verify no lag or crashes when opening/closing sidebar  

5. **Regression Tests**  
   - Sprint 11A core commands still work (`npm test` passes)  
   - Sidebar doesn't break existing commands  

6. **Update Master Instructions**  
   - Add entry: "Sprint 11B: Tree views (Ideas, Related Context) + sprint webview implemented."  
   - Update module maturity: "Electron UI → 🟡 IN PROGRESS (sidebar views stable, automation next)"  
   - Document any blockers from integration with CLI  

7. **Create Sprint 11C Handoff**  
   - Note which commands are ready for Sprint 11C automation  
   - List any CLI changes needed (e.g., `--json` output for consistency)

**Deliverable**: `tests/extension-trees.test.js` + `tests/extension-webview.test.js`, 30+ tests, all passing. Updated `strategic-learning-unified-theatre-master-instructions.md`. Ready for Sprint 11C.

---

## Files to Modify/Create

```
Solution/
├── vscode-extension/
│   ├── extension.js                    [MODIFY: add tree providers, webview, status bar]
│   ├── package.json                    [MODIFY: add views, viewsContainers, menus]
│   └── views/
│       ├── IdeasTreeProvider.js        [CREATE: tree data provider]
│       ├── RelatedContextProvider.js   [CREATE: tree data provider]
│       └── ActiveSprintWebview.js      [CREATE or REFACTOR: webview logic]
├── tests/
│   ├── extension-trees.test.js         [CREATE: tree provider tests]
│   └── extension-webview.test.js       [CREATE: webview tests]
└── sprints/
    ├── SPRINT-11B-SIDEBAR-VIEWS.md     [THIS FILE]
    ├── SPRINT-11B-ANALYSIS.md          [OUTPUT: answer 5 questions]
    └── SPRINT-11B-CODING-LOG.md        [OUTPUT: changes made]
```

---

## Success Metrics

| Metric | Target | Pass/Fail |
|--------|--------|-----------|
| Ideas tree renders (populated or empty gracefully) | ✅ Always | — |
| Related Context tree renders (initially empty) | ✅ Always | — |
| Create Idea command works end-to-end | ✅ 5/5 tries | — |
| Ideas tree refreshes after create | ✅ Automatic | — |
| Active Sprint webview shows structured fields | ✅ All fields | — |
| Status bar shows active sprint or "No sprint" | ✅ Accurate | — |
| No UI lag or crashes when opening sidebar | ✅ <500ms load | — |
| Tree provider tests pass (75%+ coverage) | ✅ 20+ tests | — |
| Webview tests pass | ✅ 10+ tests | — |
| Regression: Sprint 11A commands still work | ✅ 139/139 CLI tests | — |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| TreeDataProvider refresh doesn't work | MEDIUM | Test refresh mechanism early in PROMPT 2 |
| Ideas list is huge (1000+ ideas) | LOW | Add pagination or limit to first 50; warn user |
| JSON parsing fails (unexpected format) | MEDIUM | Use try-catch; graceful fallback to text |
| Webview message passing fails | LOW | Use string IDs, test early |
| Status bar update blocks UI | LOW | Run update in background; debounce refresh |

---

## Links & References

- **VS Code TreeDataProvider API**: https://code.visualstudio.com/api/extension-guides/tree-view  
- **Webview API**: https://code.visualstudio.com/api/extension-guides/webview  
- **Blueprint**: [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md)
- **Master Instructions**: [strategic-learning-unified-theatre-master-instructions.md](../strategic-learning-unified-theatre-master-instructions.md)  

---

## Next Steps

After Sprint 11B closes:
- **Sprint 11C**: Lightweight automation (auto-ingest on workspace open, knowledge graph visualization)  

---

*Sprint Document Generated: May 21, 2026*  
*To start: Run PROMPT 1 (Analysis) first — do NOT code yet.*


