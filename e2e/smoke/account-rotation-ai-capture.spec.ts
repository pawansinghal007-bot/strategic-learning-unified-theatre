import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// AccountStore seeding done via IPC

type TestState = {
  root: string;
  home: string;
  stateDir: string;
  dbPath: string;
  enterpriseConfigPath: string;
  authPath: string;
  responseFilename: string;
};

type SeededAccount = {
  id: string;
  email: string;
  agentType: "codex";
  profileName: string;
};

class BasePage {
  constructor(protected readonly page: Page) {}

  async expectReady(): Promise<void> {
    await expect(this.page.locator("body")).toBeVisible();
  }

  protected async waitForPreloadApi(namespace: string): Promise<void> {
    await expect
      .poll(
        async () =>
          this.page.evaluate((name) => {
            const value = Reflect.get(window, name);
            return Boolean(value && typeof value === "object");
          }, namespace),
        { message: `window.${namespace} should be available` },
      )
      .toBe(true);
  }

  protected async invokePreload<T>(expression: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(
      ({ expression, args }) => {
        const fn = new Function("args", `return (${expression})(...args);`);
        return fn(args);
      },
      { expression, args },
    ) as Promise<T>;
  }
}

class ShellPage extends BasePage {
  async waitForAppReady(): Promise<void> {
    await this.expectReady();
    await this.waitForPreloadApi("rotator");
  }

  async appVersion(): Promise<string> {
    return this.invokePreload<string>("window.rotator.app.version");
  }

  async config(): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.rotator.config.get");
  }

  async daemonStatus(): Promise<{ running: boolean }> {
    return this.invokePreload<{ running: boolean }>("window.rotator.daemon.status");
  }
}

class AccountsPage extends BasePage {
  async listAccounts(): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>("window.rotator.accounts.list");
  }

  async listAccountDetails(): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>("window.rotator.accounts.listDetails");
  }
}

class BrowserPanePage extends BasePage {
  async listResponses(platform: string): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>(
      "window.rotator.browser.listResponses",
      { platform, limit: 5 },
    );
  }

  async getResponse(filename: string): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.rotator.browser.getResponse", filename);
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function createIsolatedState(): Promise<TestState> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ut-e2e-j1-smoke-"));
  const home = path.join(root, "home");
  const stateDir = path.join(root, "state");
  const dbPath = path.join(root, "db", "ai-memory.db");
  const enterpriseConfigPath = path.join(root, "enterprise-policy.json");
  const authPath = path.join(home, ".codex", "auth.json");
  const responseFilename = "2026-06-07T00-00-00-chatgpt.md";

  await fs.mkdir(path.join(home, ".vscode-rotator", "browser-responses"), { recursive: true });
  await fs.mkdir(path.join(home, ".unified-ai-workspace"), { recursive: true });
  await fs.mkdir(path.join(stateDir, ".vscode-rotator"), { recursive: true });
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.mkdir(path.dirname(authPath), { recursive: true });

  await writeJson(path.join(home, ".vscode-rotator", "config.json"), {
    watchedRepos: [],
    storagePaths: [],
    browserResponsesIngest: false,
    enhanceSchedule: null,
    authPaths: {
      codex: authPath,
    },
    captureSchedule: {
      enabled: false,
      intervalMs: 900000,
    },
    policy: {
      apiVersion: "1",
      pluginSearchPaths: [],
      features: {
        localDbEnabled: true,
        browserCaptureEnabled: true,
        llmCommandsEnabled: true,
      },
    },
    browserPaths: {},
    platformTriggers: {},
  });

  await writeJson(enterpriseConfigPath, {
    policy: {
      apiVersion: "1",
      pluginSearchPaths: [],
      features: {
        localDbEnabled: true,
        browserCaptureEnabled: true,
        llmCommandsEnabled: true,
      },
    },
  });

  await writeJson(path.join(home, ".unified-ai-workspace", "provider-health.json"), {});
  await writeJson(path.join(home, ".unified-ai-workspace", "provider-usage.json"), {});
  await writeJson(path.join(home, ".unified-ai-workspace", "routing-history.json"), []);
  await writeJson(path.join(home, ".unified-ai-workspace", "workspace-policy-overrides.json"), {
    overrides: [],
  });
  await writeJson(path.join(home, ".unified-ai-workspace", "audit-log.json"), { events: [] });
  await writeJson(path.join(home, ".unified-ai-workspace", "workspace-approvals.json"), {
    approvals: [],
  });
  await writeJson(path.join(home, ".unified-ai-workspace", "workspace-quotas.json"), {
    policies: [],
    usage: [],
    notifications: [],
    lastDailyResetAt: null,
  });

  await fs.writeFile(
    path.join(home, ".vscode-rotator", "browser-responses", responseFilename),
    [
      "# ChatGPT Capture",
      "",
      "Prompt: Explain account rotation smoke coverage.",
      "",
      "Response: Seeded J1 capture marker for Playwright.",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    root,
    home,
    stateDir,
    dbPath,
    enterpriseConfigPath,
    authPath,
    responseFilename,
  };
}

async function seedAccount(state: TestState, page: import("@playwright/test").Page): Promise<SeededAccount> {
  const account: SeededAccount = {
    id: "j1-codex-primary",
    email: "j1-codex-primary@example.test",
    agentType: "codex",
    profileName: "j1-smoke-profile",
  };

    // Seed account via IPC
  await page.evaluate(async (acc) => {
    await (window as any).rotator.accounts.add({
      ...acc,
      authBlob: "test-auth-blob-j1-smoke",
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });
  }, account);
  return account;
}

test.describe("J1 Account Rotation & AI Capture smoke", () => {
  let app: ElectronApplication;
  let mainWindow: Page;
  let state: TestState;
  let account: SeededAccount;
  let shellPage: ShellPage;
  let accountsPage: AccountsPage;
  let browserPanePage: BrowserPanePage;

  test.beforeEach(async () => {
    state = await createIsolatedState();

    app = await electron.launch({
      args: [path.join(process.cwd(), "electron-ui", "main.cjs")],
      env: {
        ...process.env,
        HOME: state.home,
        DB_PATH: state.dbPath,
        ROTATOR_STATE_DIR: state.stateDir,
        UNIFIED_THEATRE_ENTERPRISE_CONFIG: state.enterpriseConfigPath,
        VSCODE_ROTATOR_MOCK_LLM: "1",
        NODE_ENV: "test",
        NODE_OPTIONS: "--max-old-space-size=8192",
        ROTATOR_LOG_LEVEL: "info",
        ROTATOR_LOG_SINK: "stdout",
      },
    });

    mainWindow = await app.firstWindow();
    account = await seedAccount(state, mainWindow);
    shellPage = new ShellPage(mainWindow);
    accountsPage = new AccountsPage(mainWindow);
    browserPanePage = new BrowserPanePage(mainWindow);
  });

  test.afterEach(async () => {
    await app?.close().catch(() => undefined);
    await fs.rm(state?.root, { recursive: true, force: true }).catch(() => undefined);
  });

  test("J1 shows seeded account state and captured ChatGPT response @smoke @journey-j1 @electron", async () => {
    await shellPage.waitForAppReady();

    const version = await shellPage.appVersion();
    expect(version, "app version should be exposed through preload IPC").toMatch(/\S+/);

    const config = await shellPage.config();
    expect(config.policy.features).toMatchObject({
      localDbEnabled: true,
      browserCaptureEnabled: true,
      llmCommandsEnabled: true,
    });
    expect(config.browserResponsesIngest).toBe(false);

    const daemon = await shellPage.daemonStatus();
    expect(daemon, "daemon status should be readable without throwing").toEqual({
      running: expect.any(Boolean),
    });

    const accounts = await accountsPage.listAccounts();
    expect(accounts, "exactly one seeded account should be visible").toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: account.id,
      email: account.email,
      agentType: account.agentType,
      status: "active",
      profileName: account.profileName,
    });
    expect(accounts[0].authBlob, "account list must not expose raw auth material").toBeNull();

    const details = await accountsPage.listAccountDetails();
    const detail = details.find((candidate) => candidate.id === account.id);
    expect(detail, "seeded account should have a detail record").toBeTruthy();
    expect(detail).toMatchObject({
      id: account.id,
      email: account.email,
      authPath: state.authPath,
      authPathExists: false,
      supportsVsCodeAuth: true,
    });

    // This uses a seeded markdown capture instead of an external AI site so the smoke test is deterministic.
    const responses = await browserPanePage.listResponses("chatgpt");
    expect(responses.map((response) => response.filename)).toContain(state.responseFilename);

    const listed = responses.find((response) => response.filename === state.responseFilename);
    expect(listed).toMatchObject({
      filename: state.responseFilename,
      content: expect.stringContaining("Seeded J1 capture marker"),
    });
    expect(listed?.filepath).toContain(path.join(".vscode-rotator", "browser-responses"));

    const response = await browserPanePage.getResponse(state.responseFilename);
    expect(response).toMatchObject({
      filename: state.responseFilename,
      filepath: listed?.filepath,
      size: expect.any(Number),
      content: expect.stringContaining("Prompt: Explain account rotation smoke coverage."),
    });
    expect(response.size).toBeGreaterThan(40);
  });
});
