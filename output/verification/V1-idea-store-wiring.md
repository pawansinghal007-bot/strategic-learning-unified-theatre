# V1 — Idea Store wiring

## Commands run

```bash
# 1. Read the main source file
cat src/idea-store.js

# 2. Search repo for all references to createIdea
grep -rn "createIdea" --include="*.js" --include="*.ts" src/

# 3. Search repo for all references to listIdeas
grep -rn "listIdeas" --include="*.js" --include="*.ts" src/

# 4. Search repo for all references to updateIdea
grep -rn "updateIdea" --include="*.js" --include="*.ts" src/

# 5. Search for actual call sites (invocations, not imports) in src/commands/idea.js
grep -n "createIdea(\|listIdeas(\|updateIdea(\|markIdeaDone(\|linkIdeaToSprint(" src/commands/idea.js

# 6. Search for listIdeas call in knowledge-graph.js
grep -n "listIdeas(" src/llm/knowledge-graph.js
```

## Terminal output

**Command 2 — `grep -rn "createIdea" --include="*.js" --include="*.ts" src/`**

```
src/idea-store.js:33:function createIdeaInvalidError(error, context = {}) {
src/idea-store.js:45:    throw createIdeaInvalidError(error, context);
src/idea-store.js:181:export async function createIdea({
src/idea-store.js:207:    operation: "createIdea",
src/commands/idea.js:11:  createIdea,
src/commands/idea.js:139:        const ideaDoc = await createIdea({
```

**Command 3 — `grep -rn "listIdeas" --include="*.js" --include="*.ts" src/`**

```
src/idea-store.js:131:      { operation: "listIdeas", filePath },
src/idea-store.js:264:export async function listIdeas({
src/idea-store.js:283:  const ideas = await listIdeas(options);
src/commands/idea.js:13:  listIdeas,
src/commands/idea.js:161:        const ideas = await listIdeas({
src/llm/knowledge-graph.js:4:import { listIdeas } from "../idea-store.js";
src/llm/knowledge-graph.js:174:    const ideas = await listIdeas({
```

**Command 4 — `grep -rn "updateIdea" --include="*.js" --include="*.ts" src/`**

```
src/idea-store.js:291:export async function updateIdea(id, patch = {}, options = {}) {
src/idea-store.js:304:    operation: "updateIdea",
src/idea-store.js:319:  return updateIdea(id, { status: "done" }, options);
src/idea-store.js:323:  return updateIdea(id, { linkedSprint: String(sprintId).trim() }, options);
```

**Command 5 — `grep -n "createIdea(\|listIdeas(\|updateIdea(\|markIdeaDone(\|linkIdeaToSprint(" src/commands/idea.js`**

```
139:        const ideaDoc = await createIdea({
161:        const ideas = await listIdeas({
211:        await linkIdeaToSprint(id, options.sprint);
227:        await markIdeaDone(id);
```

**Command 6 — `grep -n "listIdeas(" src/llm/knowledge-graph.js`**

```
174:    const ideas = await listIdeas({
```

## Code evidence

### createIdea — real callers (non-test)

**Caller 1: `src/commands/idea.js:139`** (CLI `idea create` command)

```javascript
// Lines 139-145
const ideaDoc = await createIdea({
  project: options.project,
  tags: options.tag,
  priority,
  body: `# ${title}\n\n${body}`,
});
console.log(chalk.green("Created idea:"), chalk.cyan(ideaDoc.id));
```

**Internal use: `src/idea-store.js:181`** (export definition — not a caller)

```javascript
export async function createIdea({
  project,
  tags,
  status = "inbox",
  priority = 3,
  linkedSprint = null,
  body,
  cwd,
} = {}) {
```

### listIdeas — real callers (non-test)

**Caller 1: `src/commands/idea.js:161`** (CLI `idea list` command)

```javascript
// Lines 161-165
const ideas = await listIdeas({
  project: options.project,
  status: options.status,
  tag: options.tag,
});
```

**Caller 2: `src/llm/knowledge-graph.js:174`** (knowledge graph builder)

```javascript
// Lines 174-177
const ideas = await listIdeas({
  cwd: ideaRoot,
  status: undefined,
});
```

**Internal use: `src/idea-store.js:283`** (findIdeaById uses listIdeas internally)

```javascript
export async function findIdeaById(id, options = {}) {
  const ideas = await listIdeas(options);
  const found = ideas.find((idea) => idea.id === id);
```

### updateIdea — real callers (non-test)

**Caller 1: `src/idea-store.js:319`** (markIdeaDone — internal wrapper)

```javascript
export async function markIdeaDone(id, options = {}) {
  return updateIdea(id, { status: "done" }, options);
}
```

**Caller 2: `src/idea-store.js:323`** (linkIdeaToSprint — internal wrapper)

```javascript
export async function linkIdeaToSprint(id, sprintId, options = {}) {
  return updateIdea(id, { linkedSprint: String(sprintId).trim() }, options);
}
```

**Note: `updateIdea` is NOT imported or called directly from `src/commands/idea.js`.** The CLI command file imports `markIdeaDone` and `linkIdeaToSprint` instead, which are thin wrappers around `updateIdea`.

### markIdeaDone — real callers (non-test)

**Caller: `src/commands/idea.js:227`** (CLI `idea done` command)

```javascript
await markIdeaDone(id);
spinner.succeed("Idea marked done");
```

### linkIdeaToSprint — real callers (non-test)

**Caller: `src/commands/idea.js:211`** (CLI `idea link` command)

```javascript
await linkIdeaToSprint(id, options.sprint);
spinner.succeed("Idea linked to sprint");
```

## Verdict

Confirmed built

## Notes

All three exported functions (`createIdea`, `listIdeas`, `updateIdea`) have real non-test callers. `createIdea` is wired to the CLI `idea create` command. `listIdeas` is wired to both the CLI `idea list` command and the knowledge graph builder (`src/llm/knowledge-graph.js`). `updateIdea` is called internally by `markIdeaDone` and `linkIdeaToSprint`, both of which are wired to CLI commands (`idea done`, `idea link`). The wiring is complete and functional.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Confirmed built.**

Re-ran non-test searches for `createIdea` / `listIdeas` / `updateIdea`. Confirmed real callers:
- `src/commands/idea.js` — `createIdea`, `listIdeas`, `markIdeaDone`, `linkIdeaToSprint` (the last two call `updateIdea` internally in `src/idea-store.js`)
- `src/llm/knowledge-graph.js` — `listIdeas`

File structure matches the required sections. Evidence snippets and line references are consistent with current source. No material corrections.
