import { existsSync } from "fs";
import { loadDashboardSurface } from './dashboard-loader.js';
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
import {
  getProviderPolicy,
  applyPolicyToCandidates,
  resetProviderPolicy,
} from "../src/policies/provider-policy.js";
import { Gateway } from "../src/llm/gateway.js";
import { resetProviderHealth } from "../src/llm/provider-health.js";
import { resetProviderUsage } from "../src/llm/provider-usage.js";
import {
  resetRoutingHistory,
  getRoutingHistory,
} from "../src/llm/routing-history.js";

const ALL = ["groq", "gemini", "openai", "perplexity", "local"];

describe("Sprint 29 smoke tests — workspace policy overrides", () => {
  beforeEach(() => {
    resetProviderPolicy();
  });

  it("returns null when no override exists", () => {
    const result = getWorkspacePolicyOverride("ws-none");
    expect(result).toBeNull();
  });

  it("stores and retrieves a workspace policy override", () => {
    setWorkspacePolicyOverride("ws-1", { manualProvider: "openai" });
    const result = getWorkspacePolicyOverride("ws-1");
    expect(result).not.toBeNull();
    expect(result.policy.manualProvider).toBe("openai");
  });

  it("resolveWorkspacePolicyState returns global source when no override", () => {
    const result = resolveWorkspacePolicyState("ws-missing");
    expect(result.source).toBe("global");
  });

  it("resolveWorkspacePolicyState returns workspace source when override exists", () => {
    setWorkspacePolicyOverride("ws-2", { routingMode: "hybrid" });
    const result = resolveWorkspacePolicyState("ws-2");
    expect(result.source).toBe("workspace");
    expect(result.policy.routingMode).toBe("hybrid");
  });

  it("resolveWorkspacePolicyState merges with global policy", () => {
    const global = getProviderPolicy();
    setWorkspacePolicyOverride("ws-3", { manualProvider: "gemini" });
    const result = resolveWorkspacePolicyState("ws-3");
    expect(result.policy.manualProvider).toBe("gemini");
    expect(result.policy.allowedProviders).toEqual(global.allowedProviders);
  });

  it("clearWorkspacePolicyOverride removes the override", () => {
    setWorkspacePolicyOverride("ws-4", { manualProvider: "groq" });
    clearWorkspacePolicyOverride("ws-4");
    expect(getWorkspacePolicyOverride("ws-4")).toBeNull();
  });

  it("listWorkspacePolicyOverrides returns all stored overrides", () => {
    setWorkspacePolicyOverride("ws-5", { manualProvider: "openai" });
    setWorkspacePolicyOverride("ws-6", { routingMode: "local-only" });
    const list = listWorkspacePolicyOverrides();
    const ids = list.map((o) => o.workspaceId);
    expect(ids).toContain("ws-5");
    expect(ids).toContain("ws-6");
  });

  it("Sprint 28 applyPolicyToCandidates still works unchanged", () => {
    const result = applyPolicyToCandidates(ALL);
    expect(result).toHaveProperty("candidates");
    expect(result).toHaveProperty("policyReason");
  });
});

describe("Sprint 29 smoke tests — workspace context", () => {
  it("returns null when no context exists", () => {
    expect(buildRequestContextPrompt("ctx-none")).toBeNull();
  });

  it("saves and retrieves workspace context", () => {
    saveWorkspaceContext("ctx-1", {
      summary: "Provider routing project",
      tags: ["routing", "policy"],
      lastIntent: "coding",
    });
    const record = getWorkspaceContext("ctx-1");
    expect(record.workspaceId).toBe("ctx-1");
    expect(record.tags).toContain("routing");
  });

  it("buildRequestContextPrompt includes summary and tags", () => {
    saveWorkspaceContext("ctx-2", {
      summary: "Debugging failover logic",
      tags: ["debug", "failover"],
      lastIntent: "debugging",
    });
    const prompt = buildRequestContextPrompt("ctx-2");
    expect(prompt).toContain("Workspace context:");
    expect(prompt).toContain("failover");
    expect(prompt).toContain("debugging");
  });

  it("clearWorkspaceContext removes the context", () => {
    saveWorkspaceContext("ctx-3", { summary: "Temporary" });
    clearWorkspaceContext("ctx-3");
    expect(getWorkspaceContext("ctx-3")).toBeNull();
  });
});

describe("Sprint 29 smoke tests — gateway context injection", () => {
  beforeEach(() => {
    resetProviderHealth();
    resetProviderUsage();
    resetRoutingHistory();
  });

  it("gateway.ask() injects workspace context into prompt", async () => {
    saveWorkspaceContext("ws-ctx", {
      summary: "This workspace focuses on routing bugs.",
      tags: ["routing", "bugs"],
      lastIntent: "debugging",
    });

    const captured = [];
    const gw = new Gateway({
      providers: {
        local: {
          ask: async (req) => {
            captured.push(req.prompt);
            return {
              requestId: req.requestId,
              provider: "local",
              model: "local-test",
              outputText: "ok",
              finishReason: "stop",
              usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
              routingReasons: [],
              raw: {},
            };
          },
        },
      },
      defaultOrder: ["local"],
    });

    await gw.ask({
      requestId: "smoke-29-ctx",
      workspaceId: "ws-ctx",
      prompt: "Help me fix this",
      intent: "coding",
    });

    expect(captured[0]).toContain("Workspace context:");
    expect(captured[0]).toContain("routing bugs");
    expect(captured[0]).toContain("User request:");
    expect(captured[0]).toContain("Help me fix this");
  });

  it("gateway.ask() routes normally when no workspace context exists", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    const response = await gw.ask({
      requestId: "smoke-29-no-ctx",
      workspaceId: "ws-no-context",
      prompt: "explain sorting algorithms",
      intent: "coding",
    });
    expect(response.provider).toBe("local");
  });

  it("gateway routing history includes a decision for workspace request", async () => {
    const gw = new Gateway({ defaultOrder: ["local"] });
    await gw.ask({
      requestId: "smoke-29-history",
      workspaceId: "ws-history",
      prompt: "what is memoization",
    });
    const history = getRoutingHistory();
    expect(history.length).toBeGreaterThan(0);
  });
});

describe("Sprint 29 smoke tests — file existence", () => {
  it("workspace-policy.ts exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/policies/workspace-policy.ts")),
    ).toBe(true);
  });

  it("request-context.ts exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/memory/request-context.ts")),
    ).toBe(true);
  });

  it("workspace-handlers.cjs exists", () => {
    expect(
      existsSync(join(process.cwd(), "electron-ui/ipc/workspace-handlers.cjs")),
    ).toBe(true);
  });

  it("dashboard references workspacePolicy", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("workspacePolicy");
  });

  it("dashboard references workspaceContext", () => {
    const html = loadDashboardSurface();
    expect(html).toContain("workspaceContext");
  });
});
