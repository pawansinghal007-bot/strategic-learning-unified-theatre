# V9 — Idea → Research → Refinement Pipeline

**Engine**: Engine 2 (AI Workflow Engine)
**Question**: Is there a code path connecting `src/idea-store.js` to `src/browser-bridge.js` (e.g. "create idea → auto-run Perplexity research → auto-run Claude refinement")?

---

## Commands Run

```bash
# 1. Read idea-store.js (first 100 lines) — schema, key functions
# 2. Read browser-bridge.js (first 100 lines) — imports, path functions
# 3. Search for idea-store imports across src/
grep -rn "import.*idea-store\|from.*idea-store\|require.*idea-store" src/ --include="*.js" --include="*.ts"

# 4. Search for browser-bridge imports across src/
grep -rn "import.*browser-bridge\|from.*browser-bridge\|require.*browser-bridge" src/ --include="*.js" --include="*.ts"

# 5. Search for pipeline/orchestrator/workflow patterns
grep -rn "pipeline\|orchestrator\|workflow\|auto.*research\|auto.*refine\|idea.*browser\|research.*idea\|refinement.*flow" src/ --include="*.js" --include="*.ts"

# 6. Check orchestrator command definitions
find .claude/commands -type f -name "*.md"
grep -rn "idea\|browser\|research\|refine\|perplexity\|claude" .claude/commands/

# 7. Check if idea.js imports browser-bridge
grep -rn "browser-bridge\|browserBridge\|sendPrompt\|launchBrowser\|captureThread" src/commands/idea.js

# 8. Check if llm.js imports idea-store
grep -rn "idea-store\|ideaStore\|createIdea\|listIdeas\|exportIdeas" src/commands/llm.js

# 9. Final search for any chaining code
grep -rn "idea.*browser\|browser.*idea\|idea.*sendPrompt\|sendPrompt.*idea\|createIdea.*sendPrompt\|sendPrompt.*createIdea\|auto.*research\|auto.*refine\|research.*pipeline\|refinement.*pipeline\|idea.*pipeline\|pipeline.*idea" src/ --include="*.js" --include="*.ts"

# 10. Search for conceptual connections
grep -rn "idea.*perplexity\|perplexity.*idea\|idea.*claude\|claude.*idea\|idea.*research\|research.*idea\|refine.*idea\|idea.*refine" src/ --include="*.js" --include="*.ts"
```

## Terminal Output

**Command 3 — idea-store imports (src/ only, non-test):**

```
src/commands/idea.js:17:} from "../idea-store.js";
src/llm/knowledge-graph.js:4:import { listIdeas } from "../idea-store.js";
src/llm/prompt-generator.js:4:import { exportIdeas } from "../idea-store.js";
src/domain/schemas.js:221: * Matches IdeaSchema from src/idea-store.js.
```

**Command 4 — browser-bridge imports (src/ only, non-test):**

```
src/browser-bridge.js:20:import * as _self from "./browser-bridge.js"; // NOSONAR
src/commands/browser.js:22:} from "../browser-bridge.js";
src/commands/llm.js:19:} from "../browser-bridge.js";
src/daemon/watcher.js:13:import { captureThread } from "../browser-bridge.js";
```

**Command 5 — pipeline/orchestrator patterns:**

```
src/agents/orchestrator.ts:2:import { parsePipeline, interpolate } from "./pipeline";
src/agents/orchestrator.ts:81:export async function runOrchestrator(...)
src/agents/pipeline.ts:1:export interface PipelineStep {
src/agents/pipeline.ts:98:export function parsePipeline(commandName: string, markdown: string): Pipeline {
src/agents/cli.ts:5:import { runOrchestrator } from "./orchestrator";
src/mcp/tool-handlers.ts:2:import { runOrchestrator } from "../agents/orchestrator.ts";
```

**Command 6 — orchestrator commands:**

```
.claude/commands/code-review.md  (only one command file exists)
grep output: (empty — no idea/browser/research/refine references)
```

**Command 7 — idea.js → browser-bridge imports:**

```
(empty — no matches)
```

**Command 8 — llm.js → idea-store imports:**

```
(empty — no matches)
```

**Command 9 — chaining code search:**

```
(empty — no matches)
```

**Command 10 — conceptual connections:**

```
(empty — no matches)
```

## Code Evidence

### Module consumers — no overlap

| Module                  | Consumers in src/                                                                   | Imports from other module?              |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| `src/idea-store.js`     | `src/commands/idea.js`, `src/llm/knowledge-graph.js`, `src/llm/prompt-generator.js` | No consumer also imports browser-bridge |
| `src/browser-bridge.js` | `src/commands/browser.js`, `src/commands/llm.js`, `src/daemon/watcher.js`           | No consumer also imports idea-store     |

### `src/commands/idea.js` (lines 1-30) — Idea CLI, no browser-bridge

```javascript
import {
  createIdea,
  findIdeaById,
  listIdeas,
  markIdeaDone,
  linkIdeaToSprint,
  exportIdeas,
} from "../idea-store.js";
// No import of browser-bridge, sendPrompt, or any research/refinement module
```

### `src/commands/browser.js` (lines 1-30) — Browser CLI, no idea-store

```javascript
import {
  ensureBrowserDirs,
  sendPrompt,
  comparePrompts,
  loadPromptLibrary,
  addPrompt,
  findPrompt,
  deletePrompt,
  runPromptTemplate,
  loginToPage,
  listResponses,
  getResponseMetadata,
  clearResponses,
  tagResponse,
  captureThread,
  BROWSER_RESPONSES_DIR,
} from "../browser-bridge.js";
// No import of idea-store, createIdea, or any idea management module
```

### `src/commands/llm.js` (lines 1-30) — LLM CLI, browser-bridge but no idea-store

```javascript
import {
  sendPrompt,
  listResponses,
  ensureBrowserDirs,
} from "../browser-bridge.js";
import { PromptGenerator } from "../llm/prompt-generator.js"; // prompt-generator imports exportIdeas internally
// llm.js itself does not import idea-store directly
```

### `src/llm/knowledge-graph.js` (lines 1-10, 150-180) — Uses listIdeas for graph nodes only

```javascript
import { listIdeas } from "../idea-store.js";
// ...
const ideaNodes = [];
try {
  const ideas = await listIdeas({ cwd: ideaRoot, status: undefined });
  ideas.forEach((idea) => {
    ideaNodes.push({
      id: `idea-${idea.id}`,
      type: "idea",
      title: firstLine(idea.body),
      meta: { status: idea.status, linkedSprint: idea.linkedSprint, ... }
    });
  });
} catch { /* continue without ideas */ }
// Only reads ideas for graph visualization — no browser automation triggered
```

### `src/llm/prompt-generator.js` (lines 1-10, 80-90) — Uses exportIdeas for prompt context only

```javascript
import { exportIdeas } from "../idea-store.js";
// ...
const ideas = await exportIdeas({ project, status: "active", cwd: this.cwd });
// Only reads active ideas to include in prompt context — no browser automation triggered
```

### `src/agents/orchestrator.ts` — Pipeline system exists but has no idea→research pipeline

```typescript
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands"); // .claude/commands/
// Only one command file exists: .claude/commands/code-review.md
// No command for "idea-research-refinement" or similar workflow
```

### `src/llm/request-context.ts` (V8 context) — Only context source for gateway

```typescript
// Single context source: workspace summary + tags + last intent
// No idea context, no research pipeline context
```

### `src/llm/gateway.ts` (V8 context) — No idea/research pipeline integration

```typescript
// Only ONE context-building import: buildRequestContextPrompt from ../memory/request-context
// No imports for idea-store, browser-bridge, or any pipeline orchestrator
```

## Verdict

**Missing**

## Notes

1. **Both modules exist independently** — `src/idea-store.js` (idea CRUD with sprint linking) and `src/browser-bridge.js` (Playwright-based browser automation for AI platforms) are both fully built and functional.

2. **No connecting code path found** — No file in `src/` imports from both `idea-store` and `browser-bridge`. The consumers are completely disjoint:
   - idea-store consumers: `commands/idea.js`, `llm/knowledge-graph.js`, `llm/prompt-generator.js`
   - browser-bridge consumers: `commands/browser.js`, `commands/llm.js`, `daemon/watcher.js`

3. **No automated pipeline** — There is no code that chains "create idea → auto-run Perplexity research → auto-run Claude refinement." The orchestrator system (`src/agents/orchestrator.ts`) exists but has only one command definition (`code-review.md`) — no idea-research-refinement workflow.

4. **Manual workflow only** — A user would need to manually: (a) create an idea via `rotator idea create`, (b) research via `rotator browser send` or `rotator llm`, (c) refine via another browser/llm command. These are separate CLI invocations, not an automated pipeline.

5. **Indirect connection via PromptGenerator** — `src/commands/llm.js` imports both `PromptGenerator` (which internally imports `exportIdeas`) and `sendPrompt` from browser-bridge. However, this is not a pipeline — it's a single command that can optionally include idea context in a prompt, then send it to a browser. There's no multi-step automated flow (research → refinement).

6. **Contrast with V2** — V2 (Browser prompt-send loop) was "Confirmed built" because `src/browser-bridge.js` has the `sendPrompt` → `captureThread` loop. V9 asks specifically about the IDEA → RESEARCH → REFINEMENT pipeline, which is a higher-level workflow orchestration that does not exist.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Missing.**

No file imports both idea-store and browser-bridge into a multi-step pipeline. Consumers remain disjoint (idea CLI/knowledge-graph vs browser CLI/daemon). Optional idea context inside PromptGenerator + separate `sendPrompt` is not “create idea → Perplexity research → Claude refinement.” No material corrections.
