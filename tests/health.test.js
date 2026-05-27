import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/llm/local-llm.js", () => ({
  getLocalLlmStatus: vi.fn()
}));

const mockAccounts = [];
const mockSecrets = new Map();

vi.mock("../src/accounts/store.js", () => ({
  AccountStore: class {
    async list() {
      return mockAccounts.map((account) => ({ ...account }));
    }
  }
}));

vi.mock("../src/accounts/secret-store.js", () => ({
  SecretStore: class {
    async get(id) {
      return mockSecrets.get(id) ?? null;
    }

    async set(id, value) {
      mockSecrets.set(id, value);
    }
  }
}));

import { getLocalLlmStatus } from "../src/llm/local-llm.js";
import {
  AccountHealthStatus,
  DaemonHealthStatus,
  LocalLlmHealthStatus,
  computeAccountHealth,
  computeDaemonHealth,
  computeLocalLlmHealth,
  getSystemHealth
} from "../src/accounts/health.js";

function token(expOffsetMs) {
  return JSON.stringify({ expires_at: new Date(Date.now() + expOffsetMs).toISOString() });
}

function account(id, patch = {}) {
  return {
    id,
    email: `${id}@example.com`,
    agentType: "trae",
    authBlob: null,
    profileName: null,
    cooldownUntil: null,
    lastUsed: null,
    status: "active",
    ...patch
  };
}

describe("health aggregators", () => {
  let originalHome;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-health-"));
    mockAccounts.length = 0;
    mockSecrets.clear();
    getLocalLlmStatus.mockReset();
    getLocalLlmStatus.mockResolvedValue({
      available: true,
      modelDir: path.join(process.env.HOME, ".vscode-rotator", "models"),
      models: ["tinyllama"],
      ollamaAvailable: false
    });
  });

  afterEach(() => {
    if (originalHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it("getSystemHealth returns the machine-readable health surface", async () => {
    const health = await getSystemHealth();

    expect(health).toEqual({
      ts: expect.any(String),
      account: expect.any(Object),
      daemon: expect.any(Object),
      localLlm: expect.any(Object)
    });
  });

  it("computeAccountHealth returns summary counts", async () => {
    mockAccounts.push(
      account("ok"),
      account("cooling", {
        status: "cooldown",
        cooldownUntil: new Date(Date.now() + 60_000)
      }),
      account("exhausted"),
      account("error")
    );
    mockSecrets.set("ok", token(60_000));
    mockSecrets.set("cooling", token(60_000));
    mockSecrets.set("exhausted", JSON.stringify({
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      remainingRequests: 0
    }));

    const health = await computeAccountHealth();

    expect(health.status).toBe(AccountHealthStatus.ERROR);
    expect(health.summary).toEqual({
      total: 4,
      ok: 1,
      coolingDown: 1,
      exhausted: 1,
      error: 1
    });
  });

  it("computeDaemonHealth returns a daemon enum status", async () => {
    const health = await computeDaemonHealth();

    expect([
      DaemonHealthStatus.OK,
      DaemonHealthStatus.DEGRADED,
      DaemonHealthStatus.NOT_MONITORING
    ]).toContain(health.status);
  });

  it("computeLocalLlmHealth maps raw status to enum values", async () => {
    getLocalLlmStatus.mockResolvedValueOnce({
      status: "ready",
      modelDir: "models",
      models: ["a"]
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.READY
    });

    getLocalLlmStatus.mockResolvedValueOnce({
      status: "degraded",
      modelDir: "models",
      models: []
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.DEGRADED
    });

    getLocalLlmStatus.mockResolvedValueOnce({
      status: "unavailable",
      modelDir: null,
      models: []
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.UNAVAILABLE
    });
  });
});
