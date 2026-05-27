# Sprint 11C: VS Code Extension — Lightweight Automation & Knowledge Graph

**Project**: strategic-learning-unified-theatre  
**Sprint Goal**: Implement one key auto-action (prompt on workspace open if no recent snapshot); add knowledge graph visualization  
**Duration**: 1 week  
**Status**: PLANNING  
**Max Tokens**: 150K  
**Dependency**: Sprint 11A (core commands) + Sprint 11B (sidebar views) must be complete  

---

## Overview

This sprint focuses on **Phase 3 & 4** of the extension roadmap: add minimal but impactful automation (auto-prompt user to ingest workspace on launch if not done recently) and reward the user with knowledge graph visualization. This is the "polish" phase where the extension starts feeling like a daily companion rather than a tool.

### Hero Workflows Served

1. **"Ask smarter"** + **"Run AI-assisted sprints"** → Auto-ingest at startup + knowledge graph visualization  
   - User opens VS Code → extension auto-checks if workspace snapshot is stale (>7 days) → prompts: "Your workspace has changed. Ingest files?" → calls `ingestCurrentFiles` if user clicks yes  
   - User runs "Find Related Context" → sidebar populates Related Context → user can click "Visualize Knowledge Graph" → opens interactive graph of related sprints, ideas, responses  

---

## Reference Documents

**Always refer to these before coding:**
- [strategic-learning-unified-theatre-master-instructions.md](../strategic-learning-unified-theatre-master-instructions.md) — Latest project status
- [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md) — Command definitions, manifest
- [SPRINT-11A-CORE-COMMANDS.md](./SPRINT-11A-CORE-COMMANDS.md) — Core commands (dependency)
- [SPRINT-11B-SIDEBAR-VIEWS.md](./SPRINT-11B-SIDEBAR-VIEWS.md) — Sidebar views (dependency)
- `Solution/vscode-extension/extension.js` — From Sprint 11A/11B
- `Solution/vscode-extension/package.json` — From Sprint 11A/11B

---

## Acceptance Criteria

✅ On activation: check if workspace snapshot is stale (>7 days old)  
✅ If stale: show prompt "Ingest updated files?" with [Yes] [No] buttons  
✅ If user clicks Yes: run `ingestCurrentFiles` silently (show progress, no blocking)  
✅ If user clicks No or dismisses: remember choice for this session (don't prompt again today)  
✅ Knowledge Graph command opens interactive visualization (Cytoscape.js)  
✅ Graph shows: sprints (nodes), ideas (nodes), connections (edges), clickable to jump to detail  
✅ No extension crashes or hangs during automation check  
✅ Automation is opt-in via config (users can disable via settings)  

---

## Implementation Scope

### Automation Feature (1)

| Feature | Trigger | Action | User Config |
|---------|---------|--------|-------------|
| Stale Workspace Detector | On activation | Prompt if snapshot >7 days | `strategic-learning-unified-theatre.autoIngestOnStartup` (default: true) |

### Knowledge Graph Command (1)

| Command | Purpose | Tech |
|---------|---------|------|
| `strategic-learning-unified-theatre.showKnowledgeGraph` | Visualize graph of context items | Cytoscape.js + webview |

### Settings (2 New)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `strategic-learning-unified-theatre.autoIngestOnStartup` | boolean | true | Prompt to ingest if snapshot is stale |
| `strategic-learning-unified-theatre.snapshotMaxAgeDays` | number | 7 | Consider snapshot stale if older than N days |

---

## Known Issues & Constraints

- **Snapshot Timestamp**: CLI must provide snapshot creation time (check `storage snapshot --info` output for timestamp field).  
- **Cytoscape License**: Cytoscape.js is open source (MIT) — no licensing issues.  
- **Graph Data Format**: Must design JSON schema for graph nodes/edges from `llm export-knowledge-graph --json`.  
- **Large Graphs**: If >500 nodes, may be slow to render. Consider node limit or clustering.  
- **No Storage Persistence**: Graph visualization is ephemeral; refresh page to reload. OK for MVP.  
- **Prompt Frequency**: Only show auto-ingest prompt once per session (store in extension state).

---

## Three-Prompt Breakdown

### PROMPT 1: ANALYSIS

**Do this first. Do NOT start coding.**

**Task**: Understand snapshot metadata, design automation logic, plan graph schema.

**Specific questions to answer:**

1. **Snapshot Metadata**  
   - Run `strategic-learning-unified-theatre storage snapshot --info` and capture output  
   - Does it include creation timestamp? Format?  
   - Run `strategic-learning-unified-theatre storage list-snapshots` and see if timestamp is available  
   - **Document**: How to determine if snapshot is stale (>7 days)

2. **Automation Trigger Timing**  
   - Should auto-ingest check run on every activation, or only once per session?  
   - Where should prompt appear? Info message? Modal dialog?  
   - Should extension state store "last prompted" timestamp to avoid nagging?  
   - **Design**: Pseudo-code for activation flow

3. **Knowledge Graph Schema**  
   - Run `strategic-learning-unified-theatre llm export-knowledge-graph` and capture output  
   - Is it JSON? What fields? (e.g., `{nodes: [{id, label, type}], edges: [{source, target}]}`)  
   - Can it be visualized directly in Cytoscape.js, or needs transformation?  
   - **Document**: Exact JSON schema expected by Cytoscape

4. **Cytoscape.js Integration**  
   - Review Cytoscape.js webview integration  
   - How to load graph data in webview and render?  
   - What's the minimal HTML + CSS + JS needed for interactive graph?  
   - Can clicks on nodes trigger VS Code commands (e.g., jump to sprint)?

5. **Graph Node Limit & Clustering**  
   - If knowledge graph has 1000+ nodes, what should happen?  
   - Option A: Render all (may be slow)  
   - Option B: Limit to first 100 nodes  
   - Option C: Cluster by type (sprints, ideas, responses)  
   - **Decide**: Which approach for MVP?

**Deliverable**: A document (`SPRINT-11C-ANALYSIS.md`) answering all 5 questions. **Do not code yet.**

---

### PROMPT 2: CODING

**Once PROMPT 1 is complete, proceed to code.**

**Task**: Implement auto-ingest automation and knowledge graph visualization.

**Steps:**

1. **Implement Stale Workspace Detector**  
   ```javascript
   async function checkAndPromptForIngest(context, runCli) {
     // 1. Check if autoIngestOnStartup is enabled in config
     // 2. Get last ingest timestamp (from storage snapshot)
     // 3. If >7 days old:
     //    - Check if already prompted this session (store in context.globalState)
     //    - If not yet prompted: show warning message with [Yes] [No]
     //    - If [Yes]: run runCli(['storage', 'snapshot'])
     //    - If [No]: store "skipped" in globalState
   }
   ```
   - Call this function in `activate()` function  
   - Add try-catch to prevent crashes if snapshot info unavailable  

2. **Implement Knowledge Graph Webview**  
   ```javascript
   async function showKnowledgeGraph() {
     // 1. Call runCli(['llm', 'export-knowledge-graph', '--json'])
     // 2. Parse graph data (nodes + edges)
     // 3. Create webview with Cytoscape.js
     // 4. Render graph with interaction (click = show node details)
     // 5. Handle clicks to jump to sprint/idea
   }
   ```

3. **Create Webview HTML for Knowledge Graph**  
   - Include Cytoscape.js from CDN  
   - Render canvas with graph data  
   - Add stylesheet (node colors by type, edge styling)  
   - Add legend (Sprint = blue, Idea = green, Response = gray)  
   - Add info panel (show details when node clicked)  

4. **Add Settings to package.json**  
   ```json
   "configuration": {
     "strategic-learning-unified-theatre.autoIngestOnStartup": {
       "type": "boolean",
       "default": true,
       "description": "Prompt to ingest files if workspace snapshot is stale"
     },
     "strategic-learning-unified-theatre.snapshotMaxAgeDays": {
       "type": "number",
       "default": 7,
       "description": "Days before snapshot is considered stale"
     }
   }
   ```

5. **Smoke Test**  
   - Close and reopen VS Code (`F5`)  
   - Watch for auto-ingest prompt (should appear if snapshot is old)  
   - Click [Yes] → watch progress channel for `storage snapshot` command  
   - Run `showKnowledgeGraph` → watch webview open with graph  
   - Click on a node → see details in info panel  
   - Verify no hangs or crashes  

6. **Test with Config Disabled**  
   - Set `strategic-learning-unified-theatre.autoIngestOnStartup` to false  
   - Reopen VS Code → auto-ingest prompt should NOT appear  

**Deliverable**: Updated `extension.js` + `package.json`, knowledge graph webview working, automation functional. **Do not write tests yet.**

---

### PROMPT 3: TESTING & DOCUMENTATION UPDATE

**After PROMPT 2 code is stable, add tests and update docs.**

**Task**: Add automation tests, webview tests. Update master instructions. Create handoff for future work.

**Steps:**

1. **Unit Tests for Auto-Ingest** (`tests/extension-automation.test.js`)  
   - Mock `runCli`, extension state  
   - Test: stale snapshot detected → prompt shown  
   - Test: fresh snapshot → no prompt  
   - Test: user clicks [Yes] → storage snapshot runs  
   - Test: user clicks [No] → skipped, no prompt again this session  
   - Test: config disabled → no prompt ever  
   - **Coverage target**: 85%+

2. **Unit Tests for Knowledge Graph** (`tests/extension-kg.test.js`)  
   - Mock `runCli` to return sample graph JSON  
   - Test: graph data parsed correctly  
   - Test: webview HTML generated with Cytoscape config  
   - Test: node click message passed to extension  
   - Test: empty graph handled gracefully  

3. **E2E Smoke Test** (manual, documented)  
   - Fresh VS Code instance with clean extension state  
   - Verify auto-ingest prompt appears (if snapshot old)  
   - Verify knowledge graph opens and renders  
   - Verify clicking graph node doesn't crash  
   - Test with config disabled (no prompt)  

4. **Regression Tests**  
   - All Sprint 11A commands still work  
   - All Sprint 11B sidebar views still work  
   - Run `npm test` → 139+ tests passing  

5. **Update Master Instructions**  
   - Add entry: "Sprint 11C: Auto-ingest automation + knowledge graph visualization complete."  
   - Update module maturity: "Electron UI → 🟢 STABLE (core commands, sidebar, automation all working)"  
   - Record final metrics: token count, test coverage, keybindings  

6. **Create Architecture Summary**  
   - Document extension layers:  
     ```
     [User Input] ↔ [Commands] ↔ [Tree Views / Webviews]
                         ↓
                     [runCli Helper]
                         ↓
                    [Node child_process]
                         ↓
                    [CLI (src/cli.js)]
                         ↓
                    [Handlers (src/commands/*.js)]
                         ↓
                    [Local State (~/.vscode-rotator/)]
     ```

7. **Handoff for Future Work**  
   - Document any remaining TODOs (e.g., "Consider graph clustering for 500+ nodes")  
   - List optional enhancements (not in MVP): voice input, team collaboration, persistence  
   - Recommend next project: expand to web app version of extension  

**Deliverable**: `tests/extension-automation.test.js` + `tests/extension-kg.test.js`, 20+ tests, all passing. Updated `strategic-learning-unified-theatre-master-instructions.md`. Architecture summary. Ready for deployment.

---

## Files to Modify/Create

```
Solution/
├── vscode-extension/
│   ├── extension.js                    [MODIFY: add automation, knowledge graph]
│   ├── package.json                    [MODIFY: add settings, knowledge graph command]
│   └── views/
│       └── KnowledgeGraphWebview.js    [CREATE: Cytoscape.js webview]
├── tests/
│   ├── extension-automation.test.js    [CREATE: auto-ingest tests]
│   └── extension-kg.test.js            [CREATE: knowledge graph tests]
└── sprints/
    ├── SPRINT-11C-AUTOMATION-KG.md     [THIS FILE]
    ├── SPRINT-11C-ANALYSIS.md          [OUTPUT: answer 5 questions]
    ├── SPRINT-11C-CODING-LOG.md        [OUTPUT: changes made]
    └── SPRINT-11C-ARCHITECTURE-SUMMARY.md [OUTPUT: extension architecture]
```

---

## Success Metrics

| Metric | Target | Pass/Fail |
|--------|--------|-----------|
| Auto-ingest prompt appears (if snapshot stale) | ✅ On activation | — |
| Auto-ingest works end-to-end (Yes → runs ingest) | ✅ Works silently | — |
| Prompt doesn't repeat in same session (No → skip) | ✅ Skipped once | — |
| Config setting disables auto-ingest | ✅ Works | — |
| Knowledge graph webview renders | ✅ Always | — |
| Graph shows nodes + edges correctly | ✅ Matches CLI data | — |
| Clicking graph node doesn't crash | ✅ No errors | — |
| Automation tests pass (85%+ coverage) | ✅ 12+ tests | — |
| Knowledge graph tests pass | ✅ 10+ tests | — |
| Regression: All 139+ CLI tests pass | ✅ 100% pass | — |
| Extension can be packaged & deployed | ✅ vsce package | — |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Snapshot timestamp unavailable in CLI | MEDIUM | Use fallback: check file mtime if no API field |
| Large graph (1000+ nodes) renders slowly | LOW | Implement node limit in PROMPT 2; show warning |
| Auto-ingest runs during critical work | LOW | Add cancel button to progress; user can skip |
| Cytoscape.js CDN fails | LOW | Bundle locally as fallback; show error gracefully |
| Extension state corruption | LOW | Use try-catch when reading globalState |

---

## Enhancements for Future Sprints (NOT in MVP)

- **Voice Input**: Dictate questions to LLM via Ctrl+Alt+V  
- **Team Collaboration**: Share sprint context via link (read-only)  
- **Persistence**: Save graph layout to disk; restore on next open  
- **Search**: Quick search graph by title/type  
- **Filtering**: Filter graph nodes by date, priority, tag  

---

## Links & References

- **Cytoscape.js Docs**: https://js.cytoscape.org/  
- **VS Code Webview API**: https://code.visualstudio.com/api/extension-guides/webview  
- **VS Code Settings**: https://code.visualstudio.com/api/references/contribution-points#contributes.configuration  
- **Blueprint**: [vscode-extension-blueprint.md](../docs/archive/blueprints/vscode-extension-blueprint.md)
- **Master Instructions**: [strategic-learning-unified-theatre-master-instructions.md](../strategic-learning-unified-theatre-master-instructions.md)  

---

## Deployment & Release Notes

After Sprint 11C closes, extension is ready for MVP release:

```
strategic-learning-unified-theatre v1.0.0
- 6 core commands (Ask LLM, Generate Prompt, Send to Browser, Find Context, Show Sprint, Ingest Files)
- Sidebar views (Ideas tree, Related Context tree, Active Sprint webview)
- Auto-ingest automation (prompt if workspace snapshot stale)
- Knowledge graph visualization (interactive Cytoscape graph)
- Full test coverage (80%+ lines, 30+ tests)

Keybindings:
- Ctrl+Shift+L: Ask Local LLM
- Ctrl+Shift+R: Find Related Context
- F5 (dev): Run with debugger
- Cmd+Palette: Access all 9 commands
```

---

*Sprint Document Generated: May 21, 2026*  
*To start: Run PROMPT 1 (Analysis) first — do NOT code yet.*  
*IMPORTANT: This is the final core sprint. After 11C, extension is production-ready.*


