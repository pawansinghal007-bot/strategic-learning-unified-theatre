# Folder Structure & Config

## Annotated Directory Tree

```text
playwright.config.ts                         # Root Playwright config; keeps CLI defaults discoverable.
e2e/
  README.md                                  # How to run, debug, seed, and clean the E2E suite.
  specs/                                     # Playwright test specs only; grouped by critical journey.
    j1-account-rotation-capture/
      account-rotation.spec.ts               # J1: account switch, daemon state, capture surface.
      browser-capture.spec.ts                # J1: embedded browser capture and response retrieval.
    j2-workspace-policy-routing/
      workspace-policy.spec.ts               # J2: workspace overrides and effective policy.
      context-routing.spec.ts                # J2: workspace context and routing decision effects.
    j3-approval-audit/
      approval-flow.spec.ts                  # J3: approval request/resolve workflow.
      audit-integrity.spec.ts                # J3: audit list, verify, and export behavior.
    j4-quota-governance/
      quota-policy.spec.ts                   # J4: quota setup, usage, alert/fallback/block states.
    j5-routing-review/
      routing-history.spec.ts                # J5: recent decisions, explanations, filters.
    smoke/
      app-startup.spec.ts                    # Fast app boot, preload availability, basic navigation.
  fixtures/                                  # Playwright fixtures that expose app, page, paths, and seeds.
    electron-app.fixture.ts                  # Launches Electron main process with isolated env.
    isolated-state.fixture.ts                # Creates per-test HOME/DB_PATH/ROTATOR_STATE_DIR.
    journey-data.fixture.ts                  # Seeds accounts, policies, quotas, captures, routing data.
    test.ts                                  # Re-export of Playwright test with all project fixtures.
  support/                                   # Test runtime support, not assertions.
    global-setup.ts                          # Creates run root and verifies build/prerequisites.
    global-teardown.ts                       # Removes run root and test-owned caches/artifacts.
    env.ts                                   # Env var normalization and required-path helpers.
    paths.ts                                 # E2E path builders for .vscode-rotator and workspace stores.
    seed.ts                                  # Seed writers for config, enterprise policy, JSON stores.
    reset.ts                                 # Per-test reset/cleanup helpers.
    electron.ts                              # Electron launch/wait helpers and app lifecycle utilities.
    selectors.ts                             # Stable selector constants and preload API probes.
    assertions.ts                            # Shared custom expectations for app state and files.
  page-objects/                              # UI-level actions and queries; no filesystem seeding here.
    shell.page.ts                            # App frame, nav, health, common waits.
    browser-pane.page.ts                     # Embedded browser pane controls and capture indicators.
    accounts.page.ts                         # Account list/capture/switch UI flows.
    workspace.page.ts                        # Workspace policy/context panels.
    approvals.page.ts                        # Approval queue and resolution UI.
    audit.page.ts                            # Audit list, verify, export UI.
    quotas.page.ts                           # Quota policy and usage UI.
    routing.page.ts                          # Routing history/explanation UI.
  data/                                      # Static checked-in seed fixtures only.
    config/
      base-config.json                       # Minimal clean config from reset strategy.
      enterprise-policy.json                 # Default test enterprise override.
    browser/
      selector-overrides.json                # Test selector overrides for brittle platform DOM.
      storage-state.chatgpt.json             # Optional sanitized storage-state fixture.
    captures/
      chatgpt-response.md                    # Representative captured response markdown.
      thread-response.md                     # Representative thread capture markdown.
    policies/
      workspace-policy.json                  # Workspace override fixture.
      quota-policy.json                      # Quota policy fixture.
  artifacts/                                 # Gitignored local output copied from failed runs.
    .gitkeep
```

## Folder Responsibilities

- `e2e/specs/` contains only Playwright specs. Each journey folder maps directly to the journey IDs in `03-critical-journeys.md`.
- `e2e/specs/smoke/` is for the smallest app-start checks: boot, preload API availability, and first-screen readiness.
- `e2e/fixtures/` owns Playwright fixture composition. Specs import `test` and `expect` from `e2e/fixtures/test.ts`, not from `@playwright/test` directly.
- `e2e/support/` owns runtime mechanics: isolated state, seed/reset/teardown, Electron launch, path construction, and shared assertion helpers.
- `e2e/page-objects/` owns UI interactions only. Page objects should not create seed files or mutate test state outside the app UI/API they are modeling.
- `e2e/data/` contains static, sanitized fixtures that can be safely committed. Dynamic per-test data belongs under the temporary run root, not here.
- `e2e/artifacts/` is a local landing zone for failure artifacts that are intentionally preserved after teardown; it should stay gitignored except for `.gitkeep`.
- `playwright.config.ts` stays at the repo root so standard commands like `npx playwright test` work without extra flags.

## Naming Conventions

- Spec files use `<behavior>.spec.ts`, for example `quota-policy.spec.ts`.
- Journey folders use `j<id>-<kebab-name>` and mirror the critical journey ID: `j1-account-rotation-capture`.
- Fixture files use `<domain>.fixture.ts`; the fixture aggregator is always `fixtures/test.ts`.
- Page objects use `<surface>.page.ts` and export a class named `<Surface>Page`.
- Support modules use concise noun names: `env.ts`, `paths.ts`, `seed.ts`, `reset.ts`.
- Static data files use kebab-case and include their domain when useful: `storage-state.chatgpt.json`, `base-config.json`.
- Test titles should start with the journey ID when they belong to a journey, for example `J3 records approval resolution in the audit log`.
- Tags should be Playwright annotations in titles or metadata:
  - `@smoke` for app boot and preload checks
  - `@journey-j1` through `@journey-j5` for critical journey coverage
  - `@electron` for tests that launch the Electron shell
  - `@external-browser` for tests that launch Playwright-managed browser contexts
  - `@destructive` for tests that intentionally exercise reset, teardown, or corruption paths inside the isolated run root

## playwright.config.ts (fenced code block)

```ts
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";
import path from "node:path";

const isCi = Boolean(process.env.CI);
const repoRoot = __dirname;
const e2eRoot = path.join(repoRoot, "e2e");
const runRoot =
  process.env.E2E_ROOT ||
  path.join("/tmp", "unified-theatre-e2e", `playwright-${process.pid}`);

const useViteDevServer = process.env.E2E_USE_VITE === "1";

const config: PlaywrightTestConfig = defineConfig({
  testDir: path.join(e2eRoot, "specs"),
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/*.unit.spec.ts", "**/*.vitest.spec.ts"],
  outputDir: path.join(repoRoot, "test-results", "e2e"),
  snapshotDir: path.join(e2eRoot, "__snapshots__"),

  globalSetup: path.join(e2eRoot, "support", "global-setup.ts"),
  globalTeardown: path.join(e2eRoot, "support", "global-teardown.ts"),

  fullyParallel: false,
  workers: isCi ? 1 : Number(process.env.E2E_WORKERS || 1),
  retries: isCi ? 2 : 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },

  forbidOnly: isCi,
  preserveOutput: "failures-only",
  reportSlowTests: {
    max: 10,
    threshold: 30_000,
  },

  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(repoRoot, "playwright-report", "e2e"), open: "never" }],
    ["json", { outputFile: path.join(repoRoot, "test-results", "e2e-results.json") }],
    ...(isCi ? [["github"] as const] : []),
  ],

  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: isCi ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: true,
  },

  metadata: {
    repoRoot,
    e2eRoot,
    runRoot,
    defaultHome: path.join(runRoot, "home"),
    defaultStateDir: path.join(runRoot, "state"),
    defaultDbPath: path.join(runRoot, "db", "ai-memory.db"),
    defaultEnterpriseConfig: path.join(runRoot, "enterprise-policy.json"),
  },

  webServer: useViteDevServer
    ? {
        command: "npm run ui:dev -- --host 127.0.0.1",
        url: process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173",
        reuseExistingServer: !isCi,
        timeout: 120_000,
        env: {
          ...process.env,
          NODE_ENV: "development",
        },
      }
    : undefined,

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      teardown: "teardown",
    },
    {
      name: "teardown",
      testMatch: /.*\.teardown\.ts/,
    },
    {
      name: "electron",
      testIgnore: [/.*\.setup\.ts/, /.*\.teardown\.ts/],
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        channel: undefined,
        viewport: { width: 1440, height: 960 },
        launchOptions: {
          env: {
            ...process.env,
            HOME: process.env.HOME || path.join(runRoot, "home"),
            ROTATOR_STATE_DIR:
              process.env.ROTATOR_STATE_DIR || path.join(runRoot, "state"),
            DB_PATH:
              process.env.DB_PATH || path.join(runRoot, "db", "ai-memory.db"),
            UNIFIED_THEATRE_ENTERPRISE_CONFIG:
              process.env.UNIFIED_THEATRE_ENTERPRISE_CONFIG ||
              path.join(runRoot, "enterprise-policy.json"),
            VSCODE_ROTATOR_MOCK_LLM:
              process.env.VSCODE_ROTATOR_MOCK_LLM || "1",
            NODE_OPTIONS:
              process.env.NODE_OPTIONS || "--max-old-space-size=8192",
            NODE_ENV: useViteDevServer ? "development" : "test",
            VITE_DEV_SERVER_URL: useViteDevServer
              ? process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173"
              : process.env.VITE_DEV_SERVER_URL,
            ROTATOR_LOG_LEVEL: process.env.ROTATOR_LOG_LEVEL || "info",
            ROTATOR_LOG_SINK: process.env.ROTATOR_LOG_SINK || "stdout",
          },
        },
      },
    },
  ],
});

export default config;
```
