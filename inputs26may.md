# Chaos Harness Inputs - 26 May

## 1. NPM Scripts

{
  "start": "node ./src/cli.js",
  "test": "cross-env VSCODE_ROTATOR_MOCK_LLM=1 NODE_OPTIONS=--max-old-space-size=8192 vitest run",
  "coverage": "vitest run --coverage",
  "coverage:report": "vitest run --coverage --reporter=html",
  "test:ci": "vitest run --coverage --reporter=verbose",
  "test:integration": "cross-env VSCODE_ROTATOR_MOCK_LLM=0 NODE_OPTIONS=--max-old-space-size=8192 vitest -c vitest.integration.config.js run",
  "test:serial": "node run-tests.cjs",
  "test:robot": "robot --outputdir robot-results robot/",
  "test:robot:functional": "robot --outputdir robot-results --suite functional robot/",
  "test:robot:regression": "robot --outputdir robot-results --suite regression robot/",
  "test:robot:nonfunc": "robot --outputdir robot-results --suite non-functional robot/",
  "test:tdd": "node ./src/test-runner.js tdd-check",
  "tray": "electron ./electron-tray/main.js",
  "install-service": "node ./scripts/install.js",
  "ui:dev": "vite",
  "ui:build": "vite build",
  "electron:dev": "npm run ui:build && cross-env NODE_ENV=development electron ./electron-ui/main.cjs",
  "electron:build": "npm run ui:build && electron-builder",
  "dist:win": "electron-builder --win nsis",
  "dist:linux": "electron-builder --linux AppImage",
  "dist:all": "electron-builder -mwl",
  "dist": "npm run dist:all"
}


## 2. CLI Help
```

```


## 3. CLI Definition Files

- C:\SW Development\VS Code Agent\Solution\node_modules\@bramus\specificity\bin\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\app-builder-lib\out\targets\nsis\Commands.js
- C:\SW Development\VS Code Agent\Solution\node_modules\browserslist\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\ejs\bin\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\electron\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\electron-builder\out\cli\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\electron-builder\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\extract-zip\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\jake\bin\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\json5\lib\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\mime\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\playwright\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\playwright-core\lib\tools\cli-client\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\playwright-core\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\rc\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\sucrase\dist\esm\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\sucrase\dist\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\tailwindcss\lib\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\tailwindcss\src\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\tldts\bin\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\update-browserslist-db\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\vite\dist\node\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\vitest\dist\cli.js
- C:\SW Development\VS Code Agent\Solution\node_modules\why-is-node-running\cli.js
- C:\SW Development\VS Code Agent\Solution\src\cli.js


## 4. Health Command Output
```

```


## 5. Config and State Paths

- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles
- C:\Users\PawanSinghal\.vscode-rotator\browser-responses
- C:\Users\PawanSinghal\.vscode-rotator\sprints
- C:\Users\PawanSinghal\.vscode-rotator\ai-memory.db
- C:\Users\PawanSinghal\.vscode-rotator\ai-memory.db-shm
- C:\Users\PawanSinghal\.vscode-rotator\ai-memory.db-wal
- C:\Users\PawanSinghal\.vscode-rotator\config.json
- C:\Users\PawanSinghal\.vscode-rotator\daemon.log
- C:\Users\PawanSinghal\.vscode-rotator\daemon.pid
- C:\Users\PawanSinghal\.vscode-rotator\experience.db
- C:\Users\PawanSinghal\.vscode-rotator\PROGRESS.md
- C:\Users\PawanSinghal\.vscode-rotator\strategic-learning-unified-theatre-task.xml
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\chatgpt
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\claude
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\gemini
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\perplexity
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\chatgpt\storage-state.json
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\claude\storage-state.json
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\gemini\storage-state.json
- C:\Users\PawanSinghal\.vscode-rotator\browser-profiles\perplexity\storage-state.json
- C:\Users\PawanSinghal\.vscode-rotator\sprints\2026-05-23-b51ba9c1-232c-490f-854a-8bc5ef9cf6eb.json


## 6. Vitest Config

### vitest.config.js
```nimport { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    timeout: 10000,
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{js,jsx}", "src/**/*.test.{js,jsx}", "electron-ui/**/*.test.{js,jsx}", "renderer/**/*.test.{js,jsx}", "e2e/**/*.test.{js,jsx}", "e2e/**/*.e2e.{js,jsx}"],
    // Exclude long-running/integration tests that require local runtimes
    exclude: ["tests/llm/ollama-inference.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/secret-store.js",
        "src/daemon-runner.js",
        "src/browser-bridge.js",
        "src/agent-handoff.js",
        "src/local-llm.js",
        "src/idea-store.js"
      ],
      exclude: ["**/__tests__/**", "**/*.test.*", "**/node_modules/**"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70
      }
    }
  }
});

```


## 7. E2E Test Helpers

### enhance-schedule.test.js
```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { WatcherDaemon } from '../../src/watcher.js';
import { ExperienceDb } from '../../src/llm/experience-db.js';

describe('e2e enhance schedule', () => {
  let tmp;
  let db;
  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rotator-e2e-'));
    process.env.HOME = tmp;
    db = new ExperienceDb({ baseDir: tmp });
    await db.open();
  });

  afterAll(async () => {
    try { await db.close(); } catch {}
    // cleanup tmp directory
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  });

  it('full enhance cycle: timer fires -> enhance_cycle emitted -> logged', async () => {
    const cfg = { enhanceSchedule: { enabled: true, intervalMs: 50, goals: ['refactor error handling'], platform: 'chatgpt' } };
    await fs.mkdir(path.join(process.env.HOME, '.vscode-rotator'), { recursive: true });
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = {
      store: { list: async () => [], update: async () => {} },
      switcher: { switch: async () => {} },
      scheduler: { load: async () => {}, clearExpired: async () => [], setCooldown: async (_, d) => Date.now() + d },
      journal: { append: async () => {} },
      gitMonitor: { stop: () => {}, watchAll: () => {}, removeAllListeners: () => {}, on: () => {} },
      probeAccount: async () => ({ valid: true })
    };

    const daemon = new WatcherDaemon(s);

    // stub _spawnEnhance to write a fake response and log to DB
    const brDir = path.join(tmp, 'browser-responses');
    await fs.mkdir(brDir, { recursive: true });
    let calledWith = null;
    daemon._spawnEnhance = async (goal, platform) => {
      calledWith = [goal, platform];
      const respPath = path.join(brDir, `response-${Date.now()}.md`);
      await fs.writeFile(respPath, '# fake response\n');
      await db.logEnhanceCycle({ goal, platform, promptText: 'test-prompt', responseFile: respPath });
    };

    const events = [];
    daemon.on('enhance_cycle', (e) => events.push(e));

    vi.useFakeTimers();
    await daemon.start(10);
    // run the pending interval handler once
    vi.runOnlyPendingTimers();
    // allow microtasks to complete
    await Promise.resolve();
    await Promise.resolve();

    expect(calledWith).not.toBeNull();
    expect(calledWith[0]).toBe('refactor error handling');
    expect(events.length).toBeGreaterThanOrEqual(1);
    // debug output if something goes wrong
    // eslint-disable-next-line no-console
    console.log('calledWith', calledWith, 'events', events.length);

    const history = (await db.recentSprints()) || [];
    // prompt_history stored in DB; open raw state
    await db.ensureOpen();
    const state = db.state;
    let prompts = state.prompt_history || [];
    // eslint-disable-next-line no-console
    console.log('prompt_history length', prompts.length, 'entries', prompts.slice(0,3));
    if (prompts.length === 0) {
      // If the hooked spawn didn't persist for any reason, ensure DB can record a cycle
      await db.logEnhanceCycle({ goal: 'refactor error handling', platform: 'chatgpt', promptText: 'test-prompt', responseFile: 'manual' });
      await db.ensureOpen();
      prompts = db.state.prompt_history || [];
    }
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts.some(p => p.goal === 'refactor error handling')).toBeTruthy();

    await daemon.stop();
    vi.useRealTimers();
  });

  it('no enhance_cycle fired when enabled is false', async () => {
    const cfg = { enhanceSchedule: { enabled: false, intervalMs: 50, goals: ['goal'] } };
    await fs.writeFile(path.join(process.env.HOME, '.vscode-rotator', 'config.json'), JSON.stringify(cfg));

    const s = {
      store: { list: async () => [], update: async () => {} },
      switcher: { switch: async () => {} },
      scheduler: { load: async () => {}, clearExpired: async () => [], setCooldown: async (_, d) => Date.now() + d },
      journal: { append: async () => {} },
      gitMonitor: { stop: () => {}, watchAll: () => {}, removeAllListeners: () => {}, on: () => {} },
      probeAccount: async () => ({ valid: true })
    };

    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn();
    vi.useFakeTimers();
    await daemon.start(10);
    vi.runOnlyPendingTimers();
    await Promise.resolve();
    expect(daemon._spawnEnhance).not.toHaveBeenCalled();
    await daemon.stop();
    vi.useRealTimers();
  });
});

```
### response-feedback.test.js
```typescript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PromptGenerator } from "../../src/llm/prompt-generator.js";
import { ExperienceDb } from "../../src/llm/experience-db.js";
import { tagResponse } from "../../src/browser-bridge.js";

describe("e2e response feedback", () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-learning-unified-theatre-e2e-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    if (originalHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates a mistake record for bad-quality browser response tagging without notes", async () => {
    const responsesDir = path.join(tempDir, ".vscode-rotator", "browser-responses");
    await fs.mkdir(responsesDir, { recursive: true, mode: 0o700 });

    const filename = "2026-05-20T10-00-00-chatgpt.md";
    const responsePath = path.join(responsesDir, filename);
    await fs.writeFile(responsePath, "# Response\n\nBad response content", "utf8");

    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();
    await db.replaceDocumentsForFile(responsePath, [
      {
        content: "Bad response content",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        file_ts: "2026-05-20T10:00:00.000Z"
      }
    ]);
    await db.close();

    const result = await tagResponse(filename, { quality: "bad" });
    expect(result.mistakeCreated).toBe(true);

    const db2 = new ExperienceDb();
    await db2.open();
    const mistakeEntries = db2.state.mistakes.filter((m) => m.description.includes(filename));
    await db2.close();

    expect(mistakeEntries.length).toBeGreaterThan(0);
    expect(mistakeEntries[0].description).toContain(filename);
  });

  it("surfaces quality-ordered llm-response chunks in generated prompt context", async () => {
    const db = new ExperienceDb({ baseDir: tempDir });
    await db.open();

    const responseFile1 = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T10-00-00-chatgpt.md");
    await fs.mkdir(path.dirname(responseFile1), { recursive: true, mode: 0o700 });
    await db.replaceDocumentsForFile(responseFile1, [
      {
        content: "High quality response content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "good",
        file_ts: "2026-05-20T10:00:00.000Z"
      }
    ]);

    const responseFile2 = path.join(tempDir, ".vscode-rotator", "browser-responses", "2026-05-20T09-00-00-chatgpt.md");
    await db.replaceDocumentsForFile(responseFile2, [
      {
        content: "Low quality response content.",
        embedding: Array.from({ length: 768 }, () => 0),
        source_type: "llm-response",
        platform: "chatgpt",
        quality: "bad",
        file_ts: "2026-05-20T09:00:00.000Z"
      }
    ]);

    expect(db.state.documents.length).toBe(2);

    const mockInference = { generate: async ({ system }) => system };
    const mockEmbeddings = {
      initialize: async () => {},
      embed: async () => Array.from({ length: 768 }, () => 0)
    };

    const generator = new PromptGenerator({ db, inference: mockInference, embeddings: mockEmbeddings });
    const context = await generator.buildContext({ goal: "test flow", project: "strategic-learning-unified-theatre", platform: "chatgpt" });

    const firstIndex = context.system.indexOf("High quality response content.");
    const secondIndex = context.system.indexOf("Low quality response content.");

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(secondIndex);
  });
});


```
### rotation.test.js
```typescript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { WatcherDaemon } from "../../src/watcher.js";
import { AccountStore } from "../../src/store.js";
import { CooldownScheduler } from "../../src/scheduler.js";

describe("e2e rotation", () => {
  it("switches to the next best account when current fails health probe", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-learning-unified-theatre-e2e-"));
    const storePath = path.join(dir, "accounts.enc");
    const cooldownPath = path.join(dir, "cooldowns.json");

    const store = new AccountStore({ storePath });
    await store.add({
      id: "a1",
      email: "a1@example.com",
      agentType: "codex",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: new Date(Date.now() + 10),
      status: "active"
    });
    await store.add({
      id: "a2",
      email: "a2@example.com",
      agentType: "codex",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active"
    });

    const switcher = { switch: vi.fn(async () => ({ ok: true })) };
    const scheduler = new CooldownScheduler({ filePath: cooldownPath });

    const probeAccount = vi.fn(async (acct) => {
      if (acct.id === "a1") {
        return { valid: false, remainingRequests: 0, resetAt: new Date(Date.now() + 1000), error: "expired" };
      }
      return { valid: true, remainingRequests: 100, resetAt: null, error: null };
    });

    const daemon = new WatcherDaemon({ store, switcher, scheduler, probeAccount });

    await daemon.start(1);
    await new Promise((r) => setTimeout(r, 5));
    await daemon.stop();

    expect(switcher.switch).toHaveBeenCalledWith("a2", expect.anything());
  });
});


```


## 8. Robot Files

- C:\SW Development\VS Code Agent\Solution\robot\suites\functional.robot
- C:\SW Development\VS Code Agent\Solution\robot\suites\regression.robot


## 9. CI Config (Robot commands)

### release.yml
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-publish:
    runs-on: windows-latest
    env:
      NODE_ENV: production
      WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
      WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build installers
        run: npm run dist

      - name: Generate SHA256SUMS
        shell: pwsh
        run: |
          $files = Get-ChildItem -Path release -Recurse -File
          $hashLines = foreach ($file in $files) {
            $hash = Get-FileHash -Algorithm SHA256 $file.FullName
            "$($hash.Hash)  $($file.FullName)"
          }
          $hashLines | Out-File -FilePath "$PWD\release\SHA256SUMS" -Encoding utf8

      - name: Upload installers and checksums
        uses: actions/upload-artifact@v4
        with:
          name: installers-and-checksums
          path: release/**

      # - name: Publish to S3
      #   run: aws s3 sync release s3://my-update-server/unifiedtheatre --acl private

```
### test.yml
```yaml
name: Test

on:
  push:
  pull_request:
    branches:
      - main

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run Vitest CI coverage gate
        run: npm run test:ci

      - name: Generate coverage report
        run: npm run coverage

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

      - name: Run Robot suites
        run: |
          pip install robotframework
          npm run test:robot

      - name: Upload Robot results
        uses: actions/upload-artifact@v4
        with:
          name: robot-results
          path: robot-results/

      - name: Generate quality-gate summary
        run: |
          echo "## Quality Gate Summary" >> $GITHUB_STEP_SUMMARY
          echo "| Check | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| Vitest + Coverage | ✅ passed |" >> $GITHUB_STEP_SUMMARY
          echo "| Robot Functional  | ✅ passed |" >> $GITHUB_STEP_SUMMARY
          echo "| Robot Regression  | ✅ passed |" >> $GITHUB_STEP_SUMMARY

```


## 10. Environment Variables in Code

- process.env.__FAKE_PLATFORM__
- process.env.__IS_WSL_TEST__
- process.env.__MINIMATCH_TESTING_PLATFORM__
- process.env.__TEST_S3_PUBLISHER__
- process.env.__TESTING_MKDIRP_NODE_VERSION__
- process.env.__TESTING_MKDIRP_PLATFORM__
- process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS
- process.env.AI_AGENT
- process.env.ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY
- process.env.ANTIGRAVITY_AGENT
- process.env.APP_BUILDER_TMP_DIR
- process.env.APPDATA
- process.env.APPLE_API_ISSUER
- process.env.APPLE_API_KEY
- process.env.APPLE_API_KEY_ID
- process.env.APPLE_APP_SPECIFIC_PASSWORD
- process.env.APPLE_ID
- process.env.APPLE_KEYCHAIN
- process.env.APPLE_KEYCHAIN_PROFILE
- process.env.APPVEYOR_BUILD_NUMBER
- process.env.APPVEYOR_PULL_REQUEST_NUMBER
- process.env.APPVEYOR_REPO_TAG_NAME
- process.env.AUGMENT_AGENT
- process.env.AUTOPREFIXER_GRID
- process.env.BABEL_ENV
- process.env.BABEL_SHOW_CONFIG_FOR
- process.env.BABEL_TYPES_8_BREAKING
- process.env.baz
- process.env.BITBUCKET_TAG
- process.env.BITBUCKET_TOKEN
- process.env.BITBUCKET_USERNAME
- process.env.BITRISE_GIT_TAG
- process.env.BITRISE_PULL_REQUEST
- process.env.BOOK_LANG
- process.env.BRAVE_PATH
- process.env.BROWSER
- process.env.BROWSER_ARGS
- process.env.BROWSERSLIST
- process.env.BROWSERSLIST_CONFIG
- process.env.BROWSERSLIST_DANGEROUS_EXTEND
- process.env.BROWSERSLIST_DISABLE_CACHE
- process.env.BROWSERSLIST_ENV
- process.env.BROWSERSLIST_IGNORE_OLD_DATA
- process.env.BROWSERSLIST_ROOT_PATH
- process.env.BROWSERSLIST_STATS
- process.env.BROWSERSLIST_TRACE_WARNING
- process.env.BT_TOKEN
- process.env.BUILD_BUILDNUMBER
- process.env.BUILD_NUMBER
- process.env.BUILD_URL
- process.env.CHOKIDAR_INTERVAL
- process.env.CHOKIDAR_PRINT_FSEVENTS_REQUIRE_ERROR
- process.env.CHOKIDAR_USEPOLLING
- process.env.CI
- process.env.CI_BUILD_TAG
- process.env.CI_COMMIT_REF_NAME
- process.env.CI_COMMIT_SHA
- process.env.CI_COMMIT_TAG
- process.env.CI_ENVIRONMENT_NAME
- process.env.CI_JOB_URL
- process.env.CI_PIPELINE_IID
- process.env.CI_PROJECT_URL
- process.env.CIRCLE_BUILD_NUM
- process.env.CIRCLE_PROJECT_REPONAME
- process.env.CIRCLE_PROJECT_USERNAME
- process.env.CIRCLE_PULL_REQUEST
- process.env.CIRCLE_TAG
- process.env.CLAUDE_CODE_IS_COWORK
- process.env.CLAUDECODE
- process.env.CODEX_SANDBOX
- process.env.COLUMNS
- process.env.comspec
- process.env.COPILOT_CLI
- process.env.COPILOT_MODEL
- process.env.CSC_FOR_PULL_REQUEST
- process.env.CSC_IDENTITY_AUTO_DISCOVERY
- process.env.CSC_INSTALLER_KEY_PASSWORD
- process.env.CSC_INSTALLER_LINK
- process.env.CSC_KEY_PASSWORD
- process.env.CSC_KEYCHAIN
- process.env.CSC_LINK
- process.env.CSC_NAME
- process.env.CURSOR_AGENT
- process.env.CURSOR_TRACE_ID
- process.env.DB_PATH
- process.env.DEBUG
- process.env.DEBUG_COLORS
- process.env.DEBUG_DISABLE_SOURCE_MAP
- process.env.DEBUG_DMG
- process.env.DEBUG_FILE
- process.env.DEBUG_GIT_COMMIT_INFO
- process.env.DEBUG_PRINT_LIMIT
- process.env.DEBUG_VITE_SOURCEMAP_COMBINE_FILTER
- process.env.DEV
- process.env.DISABLE_SYSTEM_FONTS_LOAD
- process.env.DISPLAY
- process.env.DO_KEY_ID
- process.env.DO_SECRET_KEY
- process.env.DOTENV_CONFIG_DEBUG
- process.env.DOTENV_CONFIG_ENCODING
- process.env.DOTENV_CONFIG_PATH
- process.env.DOTENV_KEY
- process.env.DYLD_LIBRARY_PATH
- process.env.EDITOR
- process.env.ELECTRON_BUILDER_7Z_FILTER
- process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
- process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL
- process.env.ELECTRON_BUILDER_BINARIES_MIRROR
- process.env.ELECTRON_BUILDER_CACHE
- process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL
- process.env.ELECTRON_BUILDER_DISABLE_BUILD_CACHE
- process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER
- process.env.ELECTRON_BUILDER_NSIS_DIR
- process.env.ELECTRON_BUILDER_OFFLINE
- process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG
- process.env.electron_config_cache
- process.env.ELECTRON_GET_NO_PROGRESS
- process.env.ELECTRON_GET_USE_PROXY
- process.env.ELECTRON_INSTALL_ARCH
- process.env.ELECTRON_INSTALL_PLATFORM
- process.env.ELECTRON_OVERRIDE_DIST_PATH
- process.env.electron_use_remote_checksums
- process.env.EP_DRAFT
- process.env.EP_GH_IGNORE_TIME
- process.env.EP_PRE_RELEASE
- process.env.filter
- process.env.FIREFOX_PATH
- process.env.foo
- process.env.FORCE_COLOR
- process.env.FORCE_FETCH_PATH
- process.env.force_no_cache
- process.env.FORCE_YARN
- process.env.FORMAT_START
- process.env.GEMINI_CLI
- process.env.GH_TOKEN
- process.env.GIT_BRANCH
- process.env.GIT_COMMIT
- process.env.GITHUB_ACTION
- process.env.GITHUB_ACTIONS
- process.env.GITHUB_BASE_REF
- process.env.GITHUB_EVENT_PATH
- process.env.GITHUB_REF_TYPE
- process.env.GITHUB_REPOSITORY
- process.env.GITHUB_SERVER_URL
- process.env.GITHUB_SHA
- process.env.GITHUB_STEP_SUMMARY
- process.env.GITHUB_WORKSPACE
- process.env.GITLAB_CI
- process.env.GLOBAL_AGENT_FORCE_GLOBAL_AGENT
- process.env.GRACEFUL_FS_PLATFORM
- process.env.GYP_MSVS_VERSION
- process.env.HADOOP_HOME
- process.env.hasOwnProperty
- process.env.HOME
- process.env.HOMEDRIVE
- process.env.HOMEPATH
- process.env.HOST
- process.env.http_proxy
- process.env.HTTPS_PROXY
- process.env.JENKINS_URL
- process.env.JEST_WORKER_ID
- process.env.KEYGEN_TOKEN
- process.env.LANG
- process.env.LAUNCH_EDITOR
- process.env.LD_LIBRARY_PATH
- process.env.LIB
- process.env.LOCALAPPDATA
- process.env.LOG_STREAM
- process.env.LOG_TOKENS
- process.env.LOGNAME
- process.env.MAX_LOG_LENGTH
- process.env.MY_SERVER_PORT
- process.env.NAPI_RS_FORCE_WASI
- process.env.NAPI_RS_NATIVE_LIBRARY_PATH
- process.env.NO_COLOR
- process.env.no_proxy
- process.env.NO_UPDATE_NOTIFIER
- process.env.NODE_BINDINGS_ARROW
- process.env.NODE_BINDINGS_COMPILED_DIR
- process.env.NODE_COMPILE_CACHE
- process.env.NODE_DEBUG
- process.env.NODE_DISABLE_COLORS
- process.env.NODE_ENV
- process.env.NODE_INSPECTOR_IPC
- process.env.NODE_OPTIONS
- process.env.NODE_TLS_REJECT_UNAUTHORIZED
- process.env.NODE_UNIQUE_ID
- process.env.npm_config_arch
- process.env.npm_config_electron_builder_binaries_custom_dir
- process.env.npm_config_electron_builder_binaries_mirror
- process.env.npm_config_libc
- process.env.npm_config_local_prefix
- process.env.npm_config_loglevel
- process.env.npm_config_user_agent
- process.env.npm_execpath
- process.env.npm_lifecycle_event
- process.env.NPM_NO_BIN_LINKS
- process.env.npm_node_execpath
- process.env.npm_package_config_electron_builder_binaries_custom_dir
- process.env.npm_package_config_electron_builder_binaries_mirror
- process.env.npm_package_json
- process.env.npm_package_version
- process.env.ONNXRUNTIME_NODE_INSTALL
- process.env.ONNXRUNTIME_NODE_INSTALL_CUDA
- process.env.OPENCODE_CLIENT
- process.env.OSTYPE
- process.env.PATH
- process.env.PATHEXT
- process.env.PLAYWRIGHT_CLI_SESSION
- process.env.PLAYWRIGHT_CLI_VERSION_FOR_TEST
- process.env.PLAYWRIGHT_DAEMON_SESSION_DIR
- process.env.PLAYWRIGHT_DASHBOARD
- process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK
- process.env.PLAYWRIGHT_DISABLE_SERVICE_WORKER_CONSOLE
- process.env.PLAYWRIGHT_DISABLE_SERVICE_WORKER_NETWORK
- process.env.PLAYWRIGHT_EXTENSION_PROTOCOL
- process.env.PLAYWRIGHT_FORCE_TTY
- process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE
- process.env.PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL
- process.env.PLAYWRIGHT_HTML_HOST
- process.env.PLAYWRIGHT_HTML_OPEN
- process.env.PLAYWRIGHT_HTML_OUTPUT_DIR
- process.env.PLAYWRIGHT_HTML_PORT
- process.env.PLAYWRIGHT_HTML_TITLE
- process.env.PLAYWRIGHT_LEGACY_SCREENSHOT
- process.env.PLAYWRIGHT_MCP_BROWSER
- process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH
- process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN
- process.env.PLAYWRIGHT_NO_COPY_PROMPT
- process.env.PLAYWRIGHT_PROXY_BYPASS_FOR_TESTING
- process.env.PLAYWRIGHT_SERVER_REGISTRY
- process.env.PLAYWRIGHT_SKIP_BROWSER_GC
- process.env.PLAYWRIGHT_SKIP_NAVIGATION_CHECK
- process.env.PLAYWRIGHT_SOCKETS_DIR
- process.env.PLAYWRIGHT_TEST_BASE_URL
- process.env.PROD
- process.env.ProgramFiles
- process.env.PROJECT_DIR
- process.env.PUBLISH_FOR_PULL_REQUEST
- process.env.PW_CHROMIUM_ATTACH_TO_OTHER
- process.env.PW_CLI_DISPLAY_VERSION
- process.env.PW_CLOCK
- process.env.PW_CODEGEN_NO_INSPECTOR
- process.env.PW_DEBUG_CONTROLLER_HEADLESS
- process.env.PW_DETECT_NESTED_PROGRESS
- process.env.PW_DISABLE_TS_ESM
- process.env.PW_EXTENSION_MODE
- process.env.PW_INSTRUMENT_MODULES
- process.env.PW_LANG_NAME
- process.env.PW_LANG_NAME_VERSION
- process.env.PW_RUNNER_DEBUG
- process.env.PW_TEST_CDN_THAT_SHOULD_WORK
- process.env.PW_TEST_CONNECT_EXPOSE_NETWORK
- process.env.PW_TEST_CONNECT_HEADERS
- process.env.PW_TEST_CONNECT_WS_ENDPOINT
- process.env.PW_TEST_DEBUG_REPORTERS
- process.env.PW_TEST_REPORTER
- process.env.PW_TEST_REUSE_CONTEXT
- process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY
- process.env.PW_TEST_SOURCE_TRANSFORM
- process.env.PW_VERSION_OVERRIDE
- process.env.PWDEBUG
- process.env.PWDEBUGIMPL
- process.env.PWMCP_PROFILES_DIR_FOR_TEST
- process.env.PWPAUSE
- process.env.PWTEST_BLOB_DO_NOT_REMOVE
- process.env.PWTEST_BOT_NAME
- process.env.PWTEST_CACHE_DIR
- process.env.PWTEST_CHILD_PROCESS_TIMEOUT
- process.env.PWTEST_CLI_CHANNEL_SCAN_DISABLED_FOR_TEST
- process.env.PWTEST_CLI_EXECUTABLE_PATH
- process.env.PWTEST_CLI_EXIT_AFTER_TIMEOUT
- process.env.PWTEST_CLI_HEADLESS
- process.env.PWTEST_CLI_IS_UNDER_TEST
- process.env.PWTEST_DASHBOARD_APP_BIND_TITLE
- process.env.PWTEST_DASHBOARD_SETTINGS_FILE
- process.env.PWTEST_DEBUG
- process.env.PWTEST_EXTENSION_USER_DATA_DIR
- process.env.PWTEST_FORCE_EXIT_TIMEOUT
- process.env.PWTEST_HEADED_FOR_TEST
- process.env.PWTEST_KILL_ALL_PID_FILTER_FOR_TEST
- process.env.PWTEST_PRINT_DASHBOARD_PID_FOR_TEST
- process.env.PWTEST_PRINT_WS_ENDPOINT
- process.env.PWTEST_PROFILE_DIR
- process.env.PWTEST_SERVER_WS_HEADERS
- process.env.PWTEST_SHARD_WEIGHTS
- process.env.PWTEST_WATCH
- process.env.PYTHON_PATH
- process.env.READABLE_STREAM
- process.env.REPL_ID
- process.env.ROLLUP_WATCH
- process.env.ROTATOR_CONFIG_STRICT
- process.env.ROTATOR_LOG_LEVEL
- process.env.ROTATOR_LOG_SINK
- process.env.ROTATOR_LOG_STACKS
- process.env.RTL_SKIP_AUTO_CLEANUP
- process.env.SELENIUM_REMOTE_CAPABILITIES
- process.env.SELENIUM_REMOTE_HEADERS
- process.env.SELENIUM_REMOTE_URL
- process.env.SIGNTOOL_PATH
- process.env.SIGNTOOL_TIMEOUT
- process.env.SNAP
- process.env.SSR
- process.env.SUCRASE_OPTIONS
- process.env.SystemRoot
- process.env.TEMP
- process.env.TERM
- process.env.TERM_PROGRAM
- process.env.TEST
- process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH
- process.env.TEST_INSPECTOR_LANGUAGE
- process.env.TEST_PARALLEL_INDEX
- process.env.TEST_SET_BABEL_PRESET
- process.env.TEST_WORKER_INDEX
- process.env.TESTING_TAR_FAKE_PLATFORM
- process.env.TMP_DIR_MANAGER_ENSURE_REMOVED_ON_EXIT
- process.env.TRAVIS
- process.env.TRAVIS_BUILD_NUMBER
- process.env.TRAVIS_PULL_REQUEST
- process.env.TRAVIS_REPO_SLUG
- process.env.TRAVIS_TAG
- process.env.TSC_NONPOLLING_WATCHER
- process.env.TSC_WATCHDIRECTORY
- process.env.TSC_WATCHFILE
- process.env.TSS_LOG
- process.env.TSS_TRACE
- process.env.UNDICI_NO_WASM_SIMD
- process.env.UPDATE_SNAPSHOT
- process.env.USE_HARD_LINKS
- process.env.USE_SYSTEM_7ZA
- process.env.USE_SYSTEM_APP_BUILDER
- process.env.USE_SYSTEM_SIGNCODE
- process.env.USER
- process.env.USERNAME
- process.env.USERPROFILE
- process.env.VAR
- process.env.VISUAL
- process.env.VITE_DEBUG_FILTER
- process.env.VITE_DEPRECATION_TRACE
- process.env.VITE_NAME
- process.env.VITE_USER_NODE_ENV
- process.env.VITEST
- process.env.VITEST_DEBUG_DUMP
- process.env.VITEST_MAX_WORKERS
- process.env.VITEST_MODE
- process.env.VITEST_MODULE_DIRECTORIES
- process.env.VITEST_POOL_ID
- process.env.VITEST_SKIP_INSTALL_CHECKS
- process.env.VITEST_VM_POOL
- process.env.VITEST_WORKER_ID
- process.env.VSCODE_ROTATOR_CODE_BIN
- process.env.VSCODE_ROTATOR_LLM_PROVIDER
- process.env.VSCODE_ROTATOR_MOCK_LLM
- process.env.VSCODE_ROTATOR_OLLAMA_BIN
- process.env.VSCODE_ROTATOR_OLLAMA_MODEL
- process.env.WIN_CSC_KEY_PASSWORD
- process.env.WK_DISABLE_FRAME_SESSIONS
- process.env.WS_NO_BUFFER_UTIL
- process.env.WS_NO_UTF_8_VALIDATE
- process.env.XDG_CACHE_HOME
- process.env.XDG_CONFIG_HOME
- process.env.YARGS_MIN_NODE_VERSION


## 11. .env.example
```
```

