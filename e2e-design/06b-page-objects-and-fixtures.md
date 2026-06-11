# Page Objects & Fixtures

## Page Object Conventions

- Page objects live in `e2e/page-objects/` and use `<surface>.page.ts` filenames.
- Each page object exports exactly one class named `<Surface>Page`, for example `AuditPage`.
- Specs import page objects only through fixtures. Specs should not construct page objects directly unless testing a page object itself.
- Page objects model user-visible surfaces:
  - `ShellPage` for app frame, navigation tabs, daemon status, and preload readiness.
  - `AccountsPage` for account list, add/capture, account switch, and active account display.
  - `BrowserPanePage` for embedded browser pane, platform tabs, capture status, and response list.
  - `WorkspacePage` for workspace policy overrides and workspace context.
  - `ApprovalsPage` for pending approval list and resolve actions.
  - `AuditPage` for audit table, verification badge, and export actions.
  - `QuotasPage` for quota policy form, usage meter, and enforcement state.
  - `RoutingPage` for routing history table, explanation rows, filters, and exports.
- Locators should prefer stable hooks in this order:
  - `data-testid`
  - accessible roles and names
  - `aria-label`
  - known placeholder text
  - tightly scoped CSS only inside a page-object method
- Page objects should expose behavior methods, not raw locator internals. Prefer `await audit.verifyIntegrity()` over `await audit.verifyButton.click()`.
- Public methods should wait for the observable result they cause. For example, `applyPreset()` should wait for the policy panel to show the new preset.
- Page objects may read preload APIs through helper methods when the UI has no reliable observable state, but they should prefer UI assertions first.
- Page objects must not seed filesystem state, delete data stores, launch Electron, or create accounts by direct store mutation. Those belong to fixtures and support helpers.
- Page objects should keep assertions light. They may provide `expectReady()` or `expectVisible()` convenience methods, while journey-specific assertions stay in specs.

## Base Page Object Template (fenced code block)

```ts
import { expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";

export interface PageObjectContext {
  page: Page;
  app?: ElectronApplication;
  testInfo?: {
    title: string;
    outputPath: (...segments: string[]) => string;
  };
}

export abstract class BasePage {
  protected readonly page: Page;
  protected readonly app?: ElectronApplication;
  protected readonly testInfo?: PageObjectContext["testInfo"];

  protected constructor(context: PageObjectContext) {
    this.page = context.page;
    this.app = context.app;
    this.testInfo = context.testInfo;
  }

  protected byTestId(id: string): Locator {
    return this.page.getByTestId(id);
  }

  protected byRole(
    role: Parameters<Page["getByRole"]>[0],
    options?: Parameters<Page["getByRole"]>[1],
  ): Locator {
    return this.page.getByRole(role, options);
  }

  protected async waitForPreloadApi(namespace: string): Promise<void> {
    await expect
      .poll(
        async () =>
          this.page.evaluate((name) => {
            const value = Reflect.get(window, name);
            return Boolean(value && typeof value === "object");
          }, namespace),
        { message: `wait for window.${namespace}` },
      )
      .toBe(true);
  }

  protected async invokePreload<T>(
    expression: string,
    ...args: unknown[]
  ): Promise<T> {
    return this.page.evaluate(
      ({ expression, args }) => {
        const fn = new Function(
          "args",
          `return (${expression})(...args);`,
        );
        return fn(args);
      },
      { expression, args },
    ) as Promise<T>;
  }

  async expectReady(): Promise<void> {
    await expect(this.page.locator("body")).toBeVisible();
  }
}

export class ExampleSurfacePage extends BasePage {
  readonly panel = this.byTestId("example-panel");
  readonly saveButton = this.byRole("button", { name: "Save" });

  constructor(context: PageObjectContext) {
    super(context);
  }

  async goto(): Promise<void> {
    await this.byRole("tab", { name: "Example" }).click();
    await expect(this.panel).toBeVisible();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await expect(this.byTestId("example-save-status")).toContainText("Saved");
  }
}
```

## Fixture Design

- Specs import from `e2e/fixtures/test.ts`:
  - `import { test, expect } from "../../fixtures/test";`
- Fixture composition should be layered from infrastructure to domain:
  - `isolatedState` creates per-test `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, enterprise config path, and output paths.
  - `seedData` writes base config, enterprise policy, empty `.unified-ai-workspace` stores, and any journey-specific static fixtures.
  - `electronApp` launches Electron with the isolated environment and closes it after the test.
  - `mainWindow` resolves the first Electron window and waits for preload readiness.
  - Page object fixtures compose on `mainWindow`: `shellPage`, `accountsPage`, `browserPanePage`, `workspacePage`, `approvalsPage`, `auditPage`, `quotasPage`, `routingPage`.
- `isolatedState` should be test-scoped, not worker-scoped, for journeys that mutate persistent stores.
- A worker-scoped `runRoot` may exist, but every test gets its own child directory under it.
- `seedData` accepts an optional scenario name or journey id, such as `j1`, `j3`, or `quota-block`.
- `electronApp` should set:
  - `HOME`
  - `DB_PATH`
  - `ROTATOR_STATE_DIR`
  - `UNIFIED_THEATRE_ENTERPRISE_CONFIG`
  - `VSCODE_ROTATOR_MOCK_LLM=1`
  - `NODE_OPTIONS=--max-old-space-size=8192`
  - `NODE_ENV=test` unless running with Vite dev server
  - `ROTATOR_LOG_LEVEL`
  - `ROTATOR_LOG_SINK`
- Fixture teardown order should close UI processes before filesystem cleanup:
  - page objects complete
  - `mainWindow` releases references
  - `electronApp.close()`
  - kill test-owned daemon PID if present
  - copy failure artifacts if requested
  - remove test-owned state
- Fixtures should expose helpers, not implementation details:
  - `paths.vscodeRotator("config.json")`
  - `paths.workspaceStore("audit-log.json")`
  - `seed.accounts([...])`
  - `reset.full()`
  - `ipc.invoke("accounts:list")`

## Helper Utilities

- `support/env.ts`
  - Build the isolated env object for Electron launch.
  - Normalize `E2E_ROOT`, `HOME`, `DB_PATH`, `ROTATOR_STATE_DIR`, and `UNIFIED_THEATRE_ENTERPRISE_CONFIG`.
  - Validate that the test is not pointing at the real home directory.
- `support/paths.ts`
  - Provide path builders for `$HOME/.vscode-rotator`, `$HOME/.unified-ai-workspace`, browser profiles, browser responses, SQLite DB, daemon PID, and Electron artifacts.
  - Keep path construction centralized so tests do not duplicate store locations.
- `support/seed.ts`
  - Seed base app config and enterprise policy.
  - Seed empty provider health/usage, routing history, audit, approvals, quotas, and workspace policy stores.
  - Seed browser selector overrides and sanitized Playwright storage-state fixtures.
  - Seed accounts through the app's store APIs, not by writing encrypted files manually.
  - Seed captured responses, routing decisions, quota usage, and audit events for journey-specific tests.
- `support/reset.ts`
  - Reset per-test stores by deleting only test-owned directories.
  - Clear Electron cache at `/tmp/strategic-learning-unified-theatre-cache`.
  - Kill a test-owned daemon from its PID file.
  - Preserve failure artifacts before deletion.
- `support/auth.ts`
  - Create test account records and test secrets through `AccountStore` and `SecretStore`.
  - Provide fake VS Code auth targets under isolated `HOME`.
  - Provide sanitized browser storage-state copy helpers for platform-login tests.
  - Avoid real OS keychain cleanup by using fallback/test-only stores where possible.
- `support/ipc.ts`
  - Invoke preload APIs from the renderer safely, for example `window.rotator.accounts.list()`.
  - Wrap governance namespaces: `providerPolicy`, `workspacePolicy`, `workspaceApproval`, `workspaceQuota`, `workspaceRouting`, `audit`.
  - Capture IPC errors with channel name, payload summary, and renderer console logs.
- `support/waits.ts`
  - Wait for Electron first window and renderer readiness.
  - Wait for `window.rotator` and governance namespaces.
  - Wait for daemon status badge, capture completion, routing history write, audit verification result, quota usage updates, and file creation.
  - Prefer `expect.poll` on observable app state over fixed sleeps.
- `support/electron.ts`
  - Launch Electron main process from `electron-ui/main.cjs`.
  - Optionally pass `VITE_DEV_SERVER_URL` when the Vite dev server project is enabled.
  - Collect main-process console, renderer console, and crash events into test artifacts.
- `support/selectors.ts`
  - Centralize recommended `data-testid` names from `04a-selectors-and-hooks.md`.
  - Provide fallback role/name locators for surfaces that do not yet expose test ids.
- `support/assertions.ts`
  - Shared assertions for persisted JSON shape, audit hash-chain status, routing row content, quota state, and captured response files.
  - Keep domain assertions here when more than one journey needs them.
