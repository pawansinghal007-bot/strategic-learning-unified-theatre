import { existsSync } from "fs";
import { join } from "path";
import {
  getWorkspacePolicyOverride,
  setWorkspacePolicyOverride,
  clearWorkspacePolicyOverride,
  listWorkspacePolicyOverrides,
  resolveWorkspacePolicyState,
} from "../src/policies/workspace-policy.js";
import {
  getWorkspaceContext,
  saveWorkspaceContext,
  clearWorkspaceContext,
  buildRequestContextPrompt,
} from "../src/memory/request-context.js";

const WS_ID = "sprint30-smoke-ws";
const CTX_ID = "sprint30-smoke-ctx";

describe("Sprint 30 smoke tests — workspace policy control plane", () => {
  beforeEach(() => {
    clearWorkspacePolicyOverride(WS_ID);
  });

  it("workspace-policy.ts exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/policies/workspace-policy.ts")),
    ).toBe(true);
  });

  it("resolveWorkspacePolicyState returns global source when no override", () => {
    const result = resolveWorkspacePolicyState(WS_ID);
    expect(result.source).toBe("global");
    expect(result.policy).toBeTruthy();
  });

  it("setWorkspacePolicyOverride persists and resolves as workspace source", () => {
    setWorkspacePolicyOverride(WS_ID, { routingMode: "hybrid" });
    const result = resolveWorkspacePolicyState(WS_ID);
    expect(result.source).toBe("workspace");
    expect(result.policy.routingMode).toBe("hybrid");
  });

  it("listWorkspacePolicyOverrides includes saved workspace", () => {
    setWorkspacePolicyOverride(WS_ID, { manualProvider: "openai" });
    const list = listWorkspacePolicyOverrides();
    const found = list.find((w) => w.workspaceId === WS_ID);
    expect(found).toBeDefined();
  });

  it("clearWorkspacePolicyOverride restores global source", () => {
    setWorkspacePolicyOverride(WS_ID, { routingMode: "local-only" });
    clearWorkspacePolicyOverride(WS_ID);
    const result = resolveWorkspacePolicyState(WS_ID);
    expect(result.source).toBe("global");
  });
});

describe("Sprint 30 smoke tests — workspace context control plane", () => {
  beforeEach(() => {
    clearWorkspaceContext(CTX_ID);
  });

  it("request-context.ts exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/memory/request-context.ts")),
    ).toBe(true);
  });

  it("saveWorkspaceContext and getWorkspaceContext round-trip", () => {
    saveWorkspaceContext(CTX_ID, {
      summary: "Sprint 30 consolidation context",
      tags: ["smoke", "sprint30"],
      lastIntent: "testing",
    });
    const ctx = getWorkspaceContext(CTX_ID);
    expect(ctx).not.toBeNull();
    expect(ctx.summary).toContain("Sprint 30");
    expect(ctx.tags).toContain("smoke");
  });

  it("buildRequestContextPrompt returns formatted prompt string", () => {
    saveWorkspaceContext(CTX_ID, {
      summary: "Provider routing workspace",
      tags: ["routing"],
    });
    const prompt = buildRequestContextPrompt(CTX_ID);
    expect(prompt).not.toBeNull();
    expect(prompt).toContain("Workspace context:");
    expect(prompt).toContain("Provider routing workspace");
  });

  it("buildRequestContextPrompt returns null when no context exists", () => {
    const prompt = buildRequestContextPrompt("nonexistent-ws-sprint30");
    expect(prompt).toBeNull();
  });

  it("clearWorkspaceContext removes the context", () => {
    saveWorkspaceContext(CTX_ID, { summary: "to be cleared" });
    clearWorkspaceContext(CTX_ID);
    const ctx = getWorkspaceContext(CTX_ID);
    expect(ctx).toBeNull();
  });
});

describe("Sprint 30 smoke tests — IPC file existence and channel coverage", () => {
  it("workspace-handlers.cjs exists", () => {
    expect(
      existsSync(join(process.cwd(), "electron-ui/ipc/workspace-handlers.cjs")),
    ).toBe(true);
  });

  it("workspace-handlers.cjs contains workspacePolicy:resolve", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspacePolicy:resolve");
  });

  it("workspace-handlers.cjs contains workspaceContext:prompt", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync(
      join(process.cwd(), "electron-ui/ipc/workspace-handlers.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceContext:prompt");
  });

  it("preload.cjs exposes workspacePolicy.resolve", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspacePolicy:resolve");
  });

  it("preload.cjs exposes workspaceContext.buildPrompt", () => {
    const { readFileSync } = require("fs");
    const content = readFileSync(
      join(process.cwd(), "electron-ui/preload.cjs"),
      "utf-8",
    );
    expect(content).toContain("workspaceContext:prompt");
  });

  it("dashboard references workspacePolicy.resolve", () => {
    const { readFileSync } = require("fs");
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("workspacePolicy");
    expect(html).toContain("resolve");
  });

  it("dashboard references workspaceContext.buildPrompt", () => {
    const { readFileSync } = require("fs");
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("buildPrompt");
  });

  it("llm-workspace.ts exists", () => {
    expect(existsSync(join(process.cwd(), "src/cli/llm-workspace.ts"))).toBe(
      true,
    );
  });
});
