# V4 — Mistake tracker, wired into the loop

## Commands run

```bash
# 1. Read the main source file
cat src/llm/mistake-tracker.js

# 2. Search for mistakeText callers (internal helper)
grep -rn "mistakeText" --include="*.js" --include="*.ts" src/

# 3. Search for ruleFromMistake callers (internal helper)
grep -rn "ruleFromMistake" --include="*.js" --include="*.ts" src/

# 4. Search for MistakeTracker consumers across src/
grep -rn "MistakeTracker" --include="*.js" --include="*.ts" src/

# 5. Search for rubric rule consumers (the output of ruleFromMistake)
grep -rn "listRubricRules\|rubric_rules\|addRubricRule\|rubric" --include="*.js" --include="*.ts" src/

# 6. Check if gateway.ts consumes rubric/mistake context
grep -n "rubric\|mistake\|MistakeTracker\|listRubricRules" src/llm/gateway.ts

# 7. Check if orchestrator.ts consumes rubric/mistake context
grep -n "rubric\|mistake\|MistakeTracker\|listRubricRules" src/agents/orchestrator.ts

# 8. Check if sub-agent.ts consumes rubric/mistake context
grep -n "rubric\|mistake\|MistakeTracker\|listRubricRules" src/agents/sub-agent.ts

# 9. Check if request-context.ts consumes rubric/mistake context
grep -n "rubric\|mistake\|MistakeTracker\|listRubricRules" src/memory/request-context.ts

# 10. Check if PromptGenerator is used by gateway/orchestrator
grep -n "PromptGenerator\|prompt-generator" src/llm/gateway.ts src/agents/orchestrator.ts src/agents/sub-agent.ts src/memory/request-context.ts
```

## Terminal output

**Command 2 — `mistakeText` in src/:**

```
src/llm/mistake-tracker.js:4:function mistakeText(mistake) {
src/llm/mistake-tracker.js:29:    const embedding = await this.embeddings.embed(mistakeText(mistake));
```

Only same-file usage. No external callers.

**Command 3 — `ruleFromMistake` in src/:**

```
src/llm/mistake-tracker.js:10:function ruleFromMistake(mistake) {
src/llm/mistake-tracker.js:40:          rule: ruleFromMistake(updated),
```

Only same-file usage. Called at line 40 within `addMistake` when `recurrence_count >= 2`.

**Command 4 — `MistakeTracker` consumers in src/:**

```
src/llm/mistake-tracker.js:15:export class MistakeTracker {
src/browser-bridge.js:12:import { MistakeTracker } from "./llm/mistake-tracker.js";
src/browser-bridge.js:165:    const tracker = new MistakeTracker(trackerOptions);
src/commands/llm.js:13:import { MistakeTracker } from "../llm/mistake-tracker.js";
src/commands/llm.js:84:    const tracker = new MistakeTracker({ baseDir });
src/commands/llm.js:733:    const tracker = new MistakeTracker();
src/commands/llm.js:758:      const tracker = new MistakeTracker();
src/commands/llm.js:772:      const tracker = new MistakeTracker();
src/llm/local-llm.js:21:import { MistakeTracker } from "./mistake-tracker.js";
src/llm/local-llm.js:250:  const tracker = new MistakeTracker(options);
src/llm/local-llm.js:267:    const tracker = new MistakeTracker({ baseDir, db });
vscode-extension/collector.js:7:import { MistakeTracker } from "../src/llm/mistake-tracker.js";
vscode-extension/collector.js:394:    const tracker = new MistakeTracker({ baseDir: this.baseDir });
```

**Command 5 — Rubric rule consumers in src/:**

```
src/llm/mistake-tracker.js:39:        await this.db.addRubricRule({
src/llm/mistake-tracker.js:54:  async listRubric() {
src/llm/mistake-tracker.js:56:    const rules = await this.db.listRubricRules();
src/llm/experience-db.js:25:    rubric_rules: [],
src/llm/experience-db.js:296:  async addRubricRule({
src/llm/experience-db.js:340:  async listRubricRules({ activeOnly = false } = {}) {
src/llm/experience-db.js:342:    return this.state.rubric_rules.filter(
src/llm/experience-db.js:347:  async setRubricActive(id, active) {
src/llm/experience-db.js:349:    const row = this.state.rubric_rules.find((rule) => rule.id === Number(id));
src/llm/experience-db.js:716:      await this.addRubricRule({
src/llm/knowledge-graph.js:98:  const ruleNodes = Array.isArray(db.state.rubric_rules)
src/llm/knowledge-graph.js:99:    ? db.state.rubric_rules
src/llm/prompt-generator.js:93:    const rules = await this.db.listRubricRules({ activeOnly: true });
src/commands/llm.js:717:          result.promoted ? "Mistake promoted to rubric" : "Mistake recorded",
src/commands/llm.js:729:  const rubric = llm
src/commands/llm.js:730:    .command("rubric")
src/commands/llm.js:735:      const rules = await tracker.listRubric();
```

**Commands 6-10 — Gateway, orchestrator, sub-agent, request-context, PromptGenerator cross-references:**

```
(gateway.ts) rubric/mistake/MistakeTracker/listRubricRules: zero matches
(orchestrator.ts) rubric/mistake/MistakeTracker/listRubricRules: zero matches
(sub-agent.ts) rubric/mistake/MistakeTracker/listRubricRules: zero matches
(request-context.ts) rubric/mistake/MistakeTracker/listRubricRules: zero matches
(gateway.ts) PromptGenerator/prompt-generator: zero matches
(orchestrator.ts) PromptGenerator/prompt-generator: zero matches
(sub-agent.ts) PromptGenerator/prompt-generator: zero matches
(request-context.ts) PromptGenerator/prompt-generator: zero matches
```

## Code evidence

### mistakeText — definition and internal use only

**`src/llm/mistake-tracker.js:4`** (private helper — not exported)

```javascript
function mistakeText(mistake) {
  return [
    mistake.description,
    mistake.root_cause ?? mistake.rootCause,
    mistake.fix_applied ?? mistake.fix,
  ]
    .filter(Boolean)
    .join("\n");
}
```

**`src/llm/mistake-tracker.js:29`** (only caller — same file, for embedding)

```javascript
const embedding = await this.embeddings.embed(mistakeText(mistake));
```

### ruleFromMistake — definition and internal use only

**`src/llm/mistake-tracker.js:10`** (private helper — not exported)

```javascript
function ruleFromMistake(mistake) {
  const fix =
    mistake.fix_applied ||
    mistake.fix ||
    "review the recurrence before implementation";
  return `Avoid repeating ${mistake.category || "general"} mistake: ${mistake.description}. Apply this fix: ${fix}.`;
}
```

**`src/llm/mistake-tracker.js:40`** (only caller — same file, auto-promotion on recurrence)

```javascript
if (Number(updated.recurrence_count) >= 2) {
  await this.db.addRubricRule({
    rule: ruleFromMistake(updated),
    category: updated.category,
    created_from_mistake_id: updated.id,
  });
}
```

### Rubric rule consumer — PromptGenerator (the wiring point)

**`src/llm/prompt-generator.js:93`** (reads rubric rules into prompt context)

```javascript
const rules = await this.db.listRubricRules({ activeOnly: true });
```

**`src/llm/prompt-generator.js:124-131`** (injects rules into system prompt)

```javascript
const ruleText = rules.map((rule) => `- ${rule.rule}`).join("\n") || "- None";

const system = [
  `You are an expert software developer working on ${project || "this project"}.`,
  `Relevant documentation:\n${docText || "None indexed yet."}`,
  `Active ideas:\n${ideas || "None."}`,
  `Recent sprint history:\n${sprints.map(sprintSummary).join("\n") || "- None imported yet."}`,
  `Known mistakes to avoid:\n${ruleText}`,
  `Generate a detailed, implementation-ready prompt for: ${goal}`,
  `Target platform: ${targetPlatform}`,
].join("\n\n");
```

### MistakeTracker — producers (where mistakes are recorded)

**`src/browser-bridge.js:165`** (after browser response capture, records mistakes)

```javascript
const tracker = new MistakeTracker(trackerOptions);
```

**`src/commands/llm.js:84`** (CLI `llm add-mistake` command)

```javascript
const tracker = new MistakeTracker({ baseDir });
```

**`src/llm/local-llm.js:250`** (addMistake exported function)

```javascript
const tracker = new MistakeTracker(options);
```

**`vscode-extension/collector.js:394`** (VS Code extension collector)

```javascript
const tracker = new MistakeTracker({ baseDir: this.baseDir });
```

### Gateway and orchestrator — NO rubric/mistake wiring

| File                            | Rubric/mistake references | PromptGenerator references |
| ------------------------------- | ------------------------- | -------------------------- |
| `src/llm/gateway.ts`            | Zero matches              | Zero matches               |
| `src/agents/orchestrator.ts`    | Zero matches              | Zero matches               |
| `src/agents/sub-agent.ts`       | Zero matches              | Zero matches               |
| `src/memory/request-context.ts` | Zero matches              | Zero matches               |

## Verdict

Partial/integration unclear

## Notes

The data flow `mistakeText → ruleFromMistake → addRubricRule → listRubricRules → PromptGenerator.buildContext` is complete and wired: mistakes auto-promote to rubric rules on recurrence (≥2), and `PromptGenerator.buildContext` injects those rules as "Known mistakes to avoid" into the system prompt. However, `PromptGenerator` is only consumed by the CLI (`src/commands/llm.js`) and `src/llm/local-llm.js` — it is NOT wired into `gateway.ts`, `orchestrator.ts`, `sub-agent.ts`, or `request-context.ts`. The rubric rules do not feed into the gateway's context assembly or the orchestrator's pipeline. The loop is closed for CLI-driven prompt generation but open for the agent/gateway orchestration path.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Partial/integration unclear.**

Confirmed:
- Producers: `browser-bridge.js`, `commands/llm.js`, `local-llm.js`, `vscode-extension/collector.js`
- Internal pipeline: `mistakeText` → `ruleFromMistake` → rubric promotion on recurrence ≥2
- Consumer for rules: `PromptGenerator.buildContext` (`src/llm/prompt-generator.js`) injects “Known mistakes to avoid”
- **Not** wired into `src/llm/gateway.ts` / orchestrator context assembly (zero matches)

Verdict correctly reflects “closed for CLI prompt generation, open for gateway/orchestrator path.” No material corrections.
