import { existsSync } from "fs";
import { join } from "path";
import {
  listPolicyPresets,
  getPolicyPreset,
  isPolicyPresetName,
} from "../src/policies/policy-presets.js";
import { detectSensitiveTask } from "../src/policies/sensitive-task-rules.js";
import {
  getProviderPolicy,
  applyPolicyPreset,
  applyPolicyToCandidates,
  applyPolicyToCandidatesWithReason,
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

describe("Sprint 28 smoke tests — policy presets", () => {
  beforeEach(() => {
    resetProviderPolicy();
  });

  it("listPolicyPresets returns 5 presets", () => {
    const presets = listPolicyPresets();
    expect(presets.length).toBe(5);
  });

  it("isPolicyPresetName validates known preset names", () => {
    expect(isPolicyPresetName("coding")).toBe(true);
    expect(isPolicyPresetName("unknown")).toBe(false);
  });

  it("applyPolicyPreset private restricts to local only", () => {
    applyPolicyPreset("private");
    const result = applyPolicyToCandidatesWithReason(ALL);
    expect(result.candidates).toEqual(["local"]);
  });

  it("applyPolicyPreset coding pins groq", () => {
    applyPolicyPreset("coding");
    const result = applyPolicyToCandidatesWithReason(ALL);
    expect(result.candidates[0]).toBe("groq");
  });

  it("applyPolicyPreset research pins perplexity", () => {
    applyPolicyPreset("research");
    const result = applyPolicyToCandidatesWithReason(ALL);
    expect(result.candidates[0]).toBe("perplexity");
  });

  it("applyPolicyPreset enterprise excludes groq and perplexity", () => {
    applyPolicyPreset("enterprise");
    const result = applyPolicyToCandidatesWithReason(ALL);
    expect(result.candidates).not.toContain("groq");
    expect(result.candidates).not.toContain("perplexity");
  });

  it("activePreset is stored in policy state", () => {
    applyPolicyPreset("coding");
    const policy = getProviderPolicy();
    expect(policy.activePreset).toBe("coding");
  });

  it("policyReason is returned by applyPolicyToCandidates", () => {
    applyPolicyPreset("coding");
    const result = applyPolicyToCandidatesWithReason(ALL);
    expect(result.policyReason).toContain("coding");
  });
});

describe("Sprint 28 smoke tests — sensitive task detection", () => {
  it("detects PII pattern and forces local", () => {
    const result = detectSensitiveTask({
      requestId: "r",
      prompt: "my ssn is 123-45-6789",
    });
    expect(result.matched).toBe(true);
    expect(result.forceLocal).toBe(true);
  });

  it("detects credentials pattern and forces local", () => {
    const result = detectSensitiveTask({
      requestId: "r",
      prompt: "here is my API key",
    });
    expect(result.matched).toBe(true);
    expect(result.forceLocal).toBe(true);
  });

  it("detects finance pattern and restricts providers", () => {
    const result = detectSensitiveTask({
      requestId: "r",
      prompt: "analyze this bank statement",
    });
    expect(result.matched).toBe(true);
    expect(result.forceLocal).toBe(false);
    expect(result.approvedProvidersOnly).not.toBeNull();
    expect(result.approvedProvidersOnly).toContain("openai");
  });

  it("returns no match for benign prompt", () => {
    const result = detectSensitiveTask({
      requestId: "r",
      prompt: "explain how recursion works",
    });
    expect(result.matched).toBe(false);
    expect(result.forceLocal).toBe(false);
  });
});

describe("Sprint 28 smoke tests — gateway sensitive routing", () => {
  beforeEach(() => {
    resetProviderPolicy();
    resetProviderHealth();
    resetProviderUsage();
    resetRoutingHistory();
  });

  it("gateway.ask() forces local when prompt contains credentials", async () => {
    const gw = new Gateway();
    const response = await gw.ask({
      requestId: "smoke-28-creds",
      prompt: "here is my API key and password",
    });
    expect(response.provider).toBe("local");
  });

  it("gateway.ask() records routing decision with sensitive rule reason", async () => {
    const gw = new Gateway();
    await gw.ask({
      requestId: "smoke-28-reason",
      prompt: "my ssn is 123-45-6789",
    });
    const history = getRoutingHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].reason).toContain("local");
  });

  it("gateway.ask() routes normally for benign prompt", async () => {
    resetProviderPolicy();
    const gw = new Gateway({ defaultOrder: ["local"] });
    const response = await gw.ask({
      requestId: "smoke-28-benign",
      prompt: "explain how sorting algorithms work",
    });
    expect(response.provider).toBe("local");
  });
});

describe("Sprint 28 smoke tests — file existence", () => {
  it("policy-presets.ts exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/policies/policy-presets.ts")),
    ).toBe(true);
  });

  it("sensitive-task-rules.ts exists", () => {
    expect(
      existsSync(join(process.cwd(), "src/policies/sensitive-task-rules.ts")),
    ).toBe(true);
  });

  it("provider-policy-handlers.cjs exists", () => {
    expect(
      existsSync(
        join(process.cwd(), "electron-ui/ipc/provider-policy-handlers.cjs"),
      ),
    ).toBe(true);
  });

  it("dashboard references listPresets", () => {
    const { readFileSync } = require("fs");
    const html = readFileSync(
      join(process.cwd(), "src/ui/provider-dashboard.html"),
      "utf-8",
    );
    expect(html).toContain("listPresets");
  });
});
