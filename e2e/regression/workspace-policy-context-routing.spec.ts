import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type TestState = {
  root: string;
  home: string;
  stateDir: string;
  dbPath: string;
  enterpriseConfigPath: string;
  workspaceId: string;
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
  async waitForGovernanceReady(): Promise<void> {
    await this.expectReady();
    await this.waitForPreloadApi("workspacePolicy");
    await this.waitForPreloadApi("workspaceContext");
    await this.waitForPreloadApi("workspaceRouting");
  }
}

class WorkspacePage extends BasePage {
  async setPolicyOverride(workspaceId: string, policyPatch: Record<string, unknown>): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.workspacePolicy.set", workspaceId, policyPatch);
  }

  async getPolicyOverride(workspaceId: string): Promise<Record<string, any> | null> {
    return this.invokePreload<Record<string, any> | null>("window.workspacePolicy.get", workspaceId);
  }

  async listPolicyOverrides(): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>("window.workspacePolicy.list");
  }

  async resolveEffectivePolicy(workspaceId: string): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.workspacePolicy.resolve", workspaceId);
  }

  async setContext(workspaceId: string, payload: Record<string, unknown>): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.workspaceContext.set", workspaceId, payload);
  }

  async getContext(workspaceId: string): Promise<Record<string, any> | null> {
    return this.invokePreload<Record<string, any> | null>("window.workspaceContext.get", workspaceId);
  }

  async buildContextPrompt(workspaceId: string): Promise<string | null> {
    return this.invokePreload<string | null>("window.workspaceContext.buildPrompt", workspaceId);
  }
}

class RoutingPage extends BasePage {
  async listWorkspaceDecisions(workspaceId: string): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>("window.workspaceRouting.list", workspaceId, 10);
  }

  async workspaceAnalytics(workspaceId: string): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.workspaceRouting.analytics", workspaceId);
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function createIsolatedState(): Promise<TestState> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ut-e2e-j2-regression-"));
  const home = path.join(root, "home");
  const stateDir = path.join(root, "state");
  const dbPath = path.join(root, "db", "ai-memory.db");
  const enterpriseConfigPath = path.join(root, "enterprise-policy.json");
  const workspaceId = "workspace-policy-context-routing";
  const workspaceStoreDir = path.join(home, ".unified-ai-workspace");

  await fs.mkdir(path.join(home, ".vscode-rotator"), { recursive: true });
  await fs.mkdir(workspaceStoreDir, { recursive: true });
  await fs.mkdir(path.join(stateDir, ".vscode-rotator"), { recursive: true });
  await fs.mkdir(path.dirname(dbPath), { recursive: true });

  await writeJson(path.join(home, ".vscode-rotator", "config.json"), {
    watchedRepos: [],
    storagePaths: [],
    browserResponsesIngest: false,
    enhanceSchedule: null,
    captureSchedule: { enabled: false, intervalMs: 900000 },
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

  await writeJson(path.join(workspaceStoreDir, "provider-health.json"), {});
  await writeJson(path.join(workspaceStoreDir, "provider-usage.json"), {});
  await writeJson(path.join(workspaceStoreDir, "workspace-policy-overrides.json"), { overrides: [] });
  await writeJson(path.join(workspaceStoreDir, "workspace-context.json"), { workspaces: {} });
  await writeJson(path.join(workspaceStoreDir, "audit-log.json"), { events: [] });
  await writeJson(path.join(workspaceStoreDir, "workspace-approvals.json"), { approvals: [] });
  await writeJson(path.join(workspaceStoreDir, "workspace-quotas.json"), {
    policies: [],
    usage: [],
    notifications: [],
    lastDailyResetAt: null,
  });

  await writeJson(path.join(workspaceStoreDir, "routing-history.json"), [
    {
      id: "route-j2-002",
      requestId: "j2-req-002",
      workspaceId,
      provider: "local",
      model: "llama-test",
      intent: "security review",
      success: true,
      reason: "Workspace override selected local provider for repository-sensitive context.",
      latencyMs: 42,
      createdAt: 1780790402000,
      timestamp: 1780790402000,
    },
    {
      id: "route-j2-001",
      requestId: "j2-req-001",
      workspaceId,
      provider: "openai",
      model: "gpt-test",
      intent: "summarize architecture",
      success: true,
      reason: "Global cloud policy before workspace override.",
      latencyMs: 120,
      createdAt: 1780790401000,
      timestamp: 1780790401000,
    },
    {
      id: "route-other-workspace",
      requestId: "other-req-001",
      workspaceId: "unrelated-workspace",
      provider: "gemini",
      model: "gemini-test",
      intent: "unrelated",
      success: false,
      reason: "Must not appear in J2 workspace-scoped assertions.",
      latencyMs: 180,
      createdAt: 1780790400000,
      timestamp: 1780790400000,
    },
  ]);

  return { root, home, stateDir, dbPath, enterpriseConfigPath, workspaceId };
}

test.describe("J2 Workspace Policy & Context Routing regression", () => {
  let app: ElectronApplication;
  let mainWindow: Page;
  let state: TestState;
  let shellPage: ShellPage;
  let workspacePage: WorkspacePage;
  let routingPage: RoutingPage;

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
    shellPage = new ShellPage(mainWindow);
    workspacePage = new WorkspacePage(mainWindow);
    routingPage = new RoutingPage(mainWindow);
  });

  test.afterEach(async () => {
    await app?.close().catch(() => undefined);
    await fs.rm(state?.root, { recursive: true, force: true }).catch(() => undefined);
  });

  test("J2 applies workspace override, injects context, and scopes routing analytics @journey-j2 @electron", async () => {
    await shellPage.waitForGovernanceReady();

    const policyPatch = {
      routingMode: "hybrid",
      manualProvider: "local",
      allowedProviders: ["local", "openai"],
      blockedProviders: ["perplexity"],
    };

    const savedPolicy = await workspacePage.setPolicyOverride(state.workspaceId, policyPatch);
    expect(savedPolicy.result, "workspace policy override should be saved through the app API").toMatchObject({
    workspaceId: state.workspaceId,
    policy: policyPatch,
    updatedAt: expect.any(Number),
    });

    const storedPolicy = await workspacePage.getPolicyOverride(state.workspaceId);
    expect(storedPolicy).toMatchObject({
      workspaceId: state.workspaceId,
      policy: policyPatch,
    });

    const allOverrides = await workspacePage.listPolicyOverrides();
    expect(allOverrides.map((override) => override.workspaceId)).toEqual([state.workspaceId]);

    const effectivePolicy = await workspacePage.resolveEffectivePolicy(state.workspaceId);
    expect(effectivePolicy).toMatchObject({
      source: "workspace",
      workspaceId: state.workspaceId,
      policy: expect.objectContaining(policyPatch),
    });
    // features field not implemented in current policy model

    const context = await workspacePage.setContext(state.workspaceId, {
      summary: "Payments workspace: prefer local routing for code and security reviews.",
      tags: ["payments", "security", "routing"],
      lastIntent: "security review",
    });
    expect(context).toMatchObject({
      workspaceId: state.workspaceId,
      summary: expect.stringContaining("prefer local routing"),
      tags: ["payments", "security", "routing"],
      lastIntent: "security review",
      updatedAt: expect.any(Number),
    });

    const storedContext = await workspacePage.getContext(state.workspaceId);
    expect(storedContext).toMatchObject(context);

    const prompt = await workspacePage.buildContextPrompt(state.workspaceId);
    expect(prompt, "workspace context prompt should be suitable for injection").toContain("Workspace context:");
    expect(prompt).toContain("Payments workspace: prefer local routing");
    expect(prompt).toContain("Tags: payments, security, routing");
    expect(prompt).toContain("Last intent: security review");

    // The seeded history includes another workspace to prove the routing panel remains workspace-scoped.
    const decisions = await routingPage.listWorkspaceDecisions(state.workspaceId);
    expect(decisions).toHaveLength(2);
    expect(decisions.map((decision) => decision.workspaceId)).toEqual([
      state.workspaceId,
      state.workspaceId,
    ]);
    expect(decisions[0]).toMatchObject({
      requestId: "j2-req-002",
      provider: "local",
      reason: expect.stringContaining("Workspace override selected local provider"),
      success: true,
    });

    const analytics = await routingPage.workspaceAnalytics(state.workspaceId);
    expect(analytics.summary).toMatchObject({
      workspaceId: state.workspaceId,
      total: 2,
      successCount: 2,
      failureCount: 0,
      successRate: 100,
      avgLatencyMs: 81,
      providerCounts: {
        local: 1,
        openai: 1,
      },
    });
    expect(analytics.timeline[0]).toMatchObject({
      title: "Routed to local",
      detail: expect.stringContaining("security review"),
      severity: "info",
    });
    expect(analytics.trends.map((trend: Record<string, any>) => trend.provider).sort()).toEqual([
      "local",
      "openai",
    ]);
  });
});
