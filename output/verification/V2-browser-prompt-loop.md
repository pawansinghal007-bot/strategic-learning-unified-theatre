# V2 — Browser prompt-send loop, real usage

## Commands run

```bash
# 1. Read the main source file
cat src/browser-bridge.js

# 2. Search repo for all references to sendPrompt
grep -rn "sendPrompt" --include="*.js" --include="*.ts" --include="*.cjs" --include="*.mjs" --include="*.jsx" src/ electron-ui/ scripts/

# 3. Search repo for all references to captureThread
grep -rn "captureThread" --include="*.js" --include="*.ts" --include="*.cjs" --include="*.mjs" src/ electron-ui/ scripts/

# 4. Search repo for all references to listResponses
grep -rn "listResponses" --include="*.js" --include="*.ts" --include="*.cjs" --include="*.mjs" --include="*.jsx" src/ electron-ui/ renderer/

# 5. Narrow to actual invocations (not imports/exports) in src/
grep -n "sendPrompt(" src/commands/browser.js src/commands/llm.js src/browser-bridge.js
grep -n "captureThread(" src/commands/browser.js src/daemon/watcher.js
grep -n "listResponses(" src/commands/browser.js src/commands/llm.js

# 6. Check Electron IPC handlers
grep -n "sendPrompt(\|listResponses(" electron-ui/ipc/handlers.cjs

# 7. Check renderer usage
grep -n "listResponses(" renderer/screens/BrowserAutomation.jsx

# 8. Check scripts/ usage
grep -n "captureThread(" scripts/one-time-capture.mjs
```

## Terminal output

**Command 2 — `sendPrompt` references in non-test source:**

```
src/browser-bridge.js:408:export async function sendPrompt(options) {
src/browser-bridge.js:616:      const result = await _self.sendPrompt({
src/browser-bridge.js:716:  return sendPrompt({ platform, prompt: text, dryRun });
src/commands/browser.js:8:  sendPrompt,
src/commands/browser.js:184:        const result = await sendPrompt({
src/commands/llm.js:16:  sendPrompt,
src/commands/llm.js:520:          const sendResult = await sendPrompt({
electron-ui/ipc/handlers.cjs:335:    return await browserBridge.sendPrompt(payload);
```

**Command 3 — `captureThread` references in non-test source:**

```
src/browser-bridge.js:893:async function captureThread(
src/commands/browser.js:20:  captureThread,
src/commands/browser.js:38:  const result = await captureThread(parsedPlatform, {
src/daemon/watcher.js:13:import { captureThread } from "../browser-bridge.js";
src/daemon/watcher.js:461:            const result = await captureThread(platform, {
scripts/one-time-capture.mjs:1:import { captureThread } from '../src/browser-bridge.js';
scripts/one-time-capture.mjs:8:      const result = await captureThread(platform, { headless: true, timeout: 90000 });
```

**Command 4 — `listResponses` references in non-test source:**

```
src/browser-bridge.js:788:export async function listResponses(options = {}) {
src/commands/browser.js:16:  listResponses,
src/commands/browser.js:575:        const list = await listResponses({
src/commands/llm.js:17:  listResponses,
src/commands/llm.js:536:          const previous = await listResponses({ platform, limit: 1 });
src/commands/llm.js:546:          const latest = await listResponses({ platform, limit: 1 });
electron-ui/ipc/handlers.cjs:342:  ipcMain.handle("browser:listResponses", async (e, payload) => {
electron-ui/ipc/handlers.cjs:343:    return await browserBridge.listResponses(payload);
renderer/screens/BrowserAutomation.jsx:25:        globalThis.rotator.browser.listResponses({ platform, limit: 10 }),
```

## Code evidence

### sendPrompt — real callers (non-test)

**Caller 1: `src/commands/browser.js:184`** (CLI `browser send` command)

```javascript
// Lines 184-192
const result = await sendPrompt({
  platform,
  prompt,
  browserType,
  timeout,
  headless: options.headless,
  dryRun: options.dryRun,
});
```

**Caller 2: `src/commands/llm.js:520`** (CLI `llm` command — auto mode)

```javascript
// Lines 520-527
const sendResult = await sendPrompt({
  platform,
  prompt: result.prompt,
  browserType: "chromium",
  headless: false,
  dryRun: false,
});
```

**Caller 3: `src/browser-bridge.js:616`** (internal — comparePrompts sends to multiple platforms via self-import)

```javascript
// Lines 616-624
const result = await _self.sendPrompt({
  platform,
  prompt,
  browserType,
  headless,
  dryRun: false,
  timeout,
});
```

**Caller 4: `src/browser-bridge.js:716`** (internal — runPromptTemplate delegates to sendPrompt)

```javascript
return sendPrompt({ platform, prompt: text, dryRun });
```

**Caller 5: `electron-ui/ipc/handlers.cjs:335`** (Electron IPC handler — `browser:send`)

```javascript
ipcMain.handle("browser:send", async (e, payload) => {
  return await browserBridge.sendPrompt(payload);
});
```

### captureThread — real callers (non-test)

**Caller 1: `src/commands/browser.js:38`** (CLI `browser capture` via captureAndIngest)

```javascript
// Lines 38-43
const result = await captureThread(parsedPlatform, {
  outputDir,
  headless,
  timeout: parsedTimeout,
});
```

**Caller 2: `src/daemon/watcher.js:461`** (daemon capture cycle — auto-capture on file changes)

```javascript
// Lines 461-465
const result = await captureThread(platform, {
  headless: true,
  timeout: captureConfig.timeoutMs ?? 60000,
});
```

**Caller 3: `scripts/one-time-capture.mjs:8`** (one-time capture script)

```javascript
const result = await captureThread(platform, {
  headless: true,
  timeout: 90000,
});
```

### listResponses — real callers (non-test)

**Caller 1: `src/commands/browser.js:575`** (CLI `browser responses list`)

```javascript
// Lines 575-578
const list = await listResponses({
  platform: options.platform,
  limit: Number.parseInt(options.limit, 10),
});
```

**Caller 2: `src/commands/llm.js:536`** (CLI `llm` command — manual mode, check for previous response)

```javascript
const previous = await listResponses({ platform, limit: 1 });
const previousFilename = previous[0]?.filename;
```

**Caller 3: `src/commands/llm.js:546`** (CLI `llm` command — manual mode, check for new response)

```javascript
const latest = await listResponses({ platform, limit: 1 });
```

**Caller 4: `electron-ui/ipc/handlers.cjs:342-343`** (Electron IPC handler — `browser:listResponses`)

```javascript
ipcMain.handle("browser:listResponses", async (e, payload) => {
  return await browserBridge.listResponses(payload);
});
```

**Caller 5: `renderer/screens/BrowserAutomation.jsx:25`** (Electron renderer UI — refreshes response list)

```javascript
const [respList, promptList] = await Promise.all([
  globalThis.rotator.browser.listResponses({ platform, limit: 10 }),
  globalThis.rotator.browser.listPrompts(),
]);
```

## Verdict

Confirmed built

## Notes

All three functions (`sendPrompt`, `captureThread`, `listResponses`) have extensive real non-test callers across the CLI layer (`src/commands/browser.js`, `src/commands/llm.js`), the daemon layer (`src/daemon/watcher.js`), the Electron IPC bridge (`electron-ui/ipc/handlers.cjs`), the Electron renderer (`renderer/screens/BrowserAutomation.jsx`), and internal self-references within `browser-bridge.js` itself. The full prompt-send loop (send → capture → list) is wired end-to-end.
---

## Comment by Grok

**Independent re-check (2026-07-21): Agree with verdict — Confirmed built.**

Re-confirmed non-test callers of the prompt loop:
- `sendPrompt` / `listResponses`: `src/commands/browser.js`, `src/commands/llm.js`, Electron IPC (`electron-ui/ipc/handlers.cjs`), preload + renderer (`BrowserAutomation.jsx`)
- `captureThread`: `src/daemon/watcher.js`, `src/commands/browser.js`, `scripts/one-time-capture.mjs`

Full send → capture → list path is wired. Structure and evidence look solid. No material corrections.
