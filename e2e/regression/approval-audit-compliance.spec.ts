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
  async waitForComplianceReady(): Promise<void> {
    await this.expectReady();
    await this.waitForPreloadApi("workspacePolicy");
    await this.waitForPreloadApi("workspaceApproval");
    await this.waitForPreloadApi("audit");
  }
}

class WorkspacePage extends BasePage {
  async requestSensitivePolicyChange(
    workspaceId: string,
    policyPatch: Record<string, unknown>,
    requestedBy: string,
  ): Promise<Record<string, any>> {
    // Sensitive routing changes are expected to create a pending approval request.
    return this.invokePreload<Record<string, any>>(
      "window.workspacePolicy.set",
      workspaceId,
      policyPatch,
      requestedBy,
    );
  }
}

class ApprovalsPage extends BasePage {
  async listPending(workspaceId: string): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>(
      "window.workspaceApproval.list",
      workspaceId,
      "pending",
    );
  }

  async resolve(
    approvalId: string,
    status: "approved" | "rejected",
    reviewedBy: string,
    reviewNote: string,
  ): Promise<Record<string, any> | null> {
    return this.invokePreload<Record<string, any> | null>(
      "window.workspaceApproval.resolve",
      approvalId,
      status,
      reviewedBy,
      reviewNote,
    );
  }
}

class AuditPage extends BasePage {
  async listForWorkspace(workspaceId: string): Promise<Array<Record<string, any>>> {
    return this.invokePreload<Array<Record<string, any>>>("window.audit.list", 20, { workspaceId });
  }

  async verify(): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.audit.verify");
  }

  async exportJson(workspaceId: string): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.audit.exportJson", { workspaceId });
  }

  async exportHtml(workspaceId: string): Promise<Record<string, any>> {
    return this.invokePreload<Record<string, any>>("window.audit.exportHtmlReport", { workspaceId });
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function createIsolatedState(): Promise<TestState> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ut-e2e-j3-regression-"));
  const home = path.join(root, "home");
  const stateDir = path.join(root, "state");
  const dbPath = path.join(root, "db", "ai-memory.db");
  const enterpriseConfigPath = path.join(root, "enterprise-policy.json");
  const workspaceId = "approval-audit-compliance";
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
  await writeJson(path.join(workspaceStoreDir, "routing-history.json"), []);
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

  return { root, home, stateDir, dbPath, enterpriseConfigPath, workspaceId };
}

test.describe("J3 Approval & Audit Compliance regression", () => {
  let app: ElectronApplication;
  let mainWindow: Page;
  let state: TestState;
  let shellPage: ShellPage;
  let workspacePage: WorkspacePage;
  let approvalsPage: ApprovalsPage;
  let auditPage: AuditPage;

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
    approvalsPage = new ApprovalsPage(mainWindow);
    auditPage = new AuditPage(mainWindow);
  });

  test.afterEach(async () => {
    await app?.close().catch(() => undefined);
    await fs.rm(path.join(process.cwd(), `audit-log-${state?.workspaceId}.json`), { force: true }).catch(() => undefined);
    await fs.rm(path.join(process.cwd(), `audit-log-${state?.workspaceId}.html`), { force: true }).catch(() => undefined);
    await fs.rm(state?.root, { recursive: true, force: true }).catch(() => undefined);
  });

  test("J3 requires approval for sensitive policy changes and exports verified audit evidence @journey-j3 @electron", async () => {
    await shellPage.waitForComplianceReady();

    const requestedBy = "policy-owner@example.test";
    const reviewedBy = "compliance-reviewer@example.test";
    const policyPatch = {
      routingMode: "local-only",
      manualProvider: "local",
      blockedProviders: ["openai", "gemini"],
    };

    const requestResult = await workspacePage.requestSensitivePolicyChange(
      state.workspaceId,
      policyPatch,
      requestedBy,
    );
    expect(requestResult.result, "sensitive policy patch should still persist as the requested change").toMatchObject({
      workspaceId: state.workspaceId,
      policy: policyPatch,
    });
    expect(requestResult.approval, "sensitive policy patch should create an approval request").toMatchObject({
      workspaceId: state.workspaceId,
      status: "pending",
      policyChange: policyPatch,
    });

    const pending = await approvalsPage.listPending(state.workspaceId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: requestResult.approval.id,
      workspaceId: state.workspaceId,
      status: "pending",
      policyChange: policyPatch,
      reviewedBy: null,
    });

    const resolved = await approvalsPage.resolve(
      pending[0].id,
      "approved",
      reviewedBy,
      "Approved because the workspace contains regulated code.",
    );
    expect(resolved).toMatchObject({
      id: pending[0].id,
      workspaceId: state.workspaceId,
      status: "approved",
      reviewedBy,
      reviewNote: "Approved because the workspace contains regulated code.",
      policyChange: policyPatch,
    });

    const afterResolution = await approvalsPage.listPending(state.workspaceId);
    expect(afterResolution, "resolved approvals should leave the pending queue").toEqual([]);

    const auditEvents = await auditPage.listForWorkspace(state.workspaceId);
    expect(auditEvents.map((event) => event.action)).toEqual([
      "workspaceApproval.approved",
      "workspaceApproval.requested",
      "workspacePolicy.set",
    ]);
    expect(auditEvents[0]).toMatchObject({
      action: "workspaceApproval.approved",
      actor: { type: "renderer", id: reviewedBy },
      targetType: "workspaceApproval",
      workspaceId: state.workspaceId,
      details: {
        approvalId: pending[0].id,
        reviewNote: "Approved because the workspace contains regulated code.",
        policyChange: policyPatch,
      },
    });

    const verification = await auditPage.verify();
    expect(verification).toEqual({
      ok: true,
      checked: 3,
      failedAtSeq: null,
      reason: null,
      expectedHash: null,
      actualHash: null,
    });

    const jsonExport = await auditPage.exportJson(state.workspaceId);
    expect(jsonExport).toMatchObject({
      ok: true,
      format: "json",
      count: 3,
      verification: { ok: true, checked: 3 },
    });
    expect(jsonExport.filePath).toBe(path.join(process.cwd(), `audit-log-${state.workspaceId}.json`));

    const exportedJson = JSON.parse(await fs.readFile(jsonExport.filePath, "utf8"));
    expect(exportedJson).toMatchObject({
      filter: { workspaceId: state.workspaceId },
      verification: { ok: true, checked: 3 },
      count: 3,
    });
    expect(exportedJson.events.map((event: Record<string, any>) => event.action)).toEqual([
      "workspacePolicy.set",
      "workspaceApproval.requested",
      "workspaceApproval.approved",
    ]);

    const htmlExport = await auditPage.exportHtml(state.workspaceId);
    expect(htmlExport).toMatchObject({
      ok: true,
      format: "html",
      count: 3,
      verification: { ok: true, checked: 3 },
    });
    expect(htmlExport.filePath).toBe(path.join(process.cwd(), `audit-log-${state.workspaceId}.html`));

    // HTML export is checked for business evidence, not snapshot text, to avoid brittle markup coupling.
    const exportedHtml = await fs.readFile(htmlExport.filePath, "utf8");
    expect(exportedHtml).toContain("Audit Log Report");
    expect(exportedHtml).toContain("Integrity:");
    expect(exportedHtml).toContain("PASS");
    expect(exportedHtml).toContain("workspaceApproval.approved");
    expect(exportedHtml).toContain(state.workspaceId);
  });
});
