import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("../src/llm/local-llm.js", () => ({
  getLocalLlmStatus: vi.fn(),
}));

const mockAccounts = [];
const mockSecrets = new Map();
let forceListError = false;

vi.mock("../src/accounts/store.js", () => ({
  AccountStore: class {
    async list() {
      if (forceListError) {
        throw new Error("store list failed");
      }
      return mockAccounts.map((account) => ({ ...account }));
    }
  },
}));

vi.mock("../src/accounts/secret-store.js", () => ({
  SecretStore: class {
    async get(id) {
      return mockSecrets.get(id) ?? null;
    }

    async set(id, value) {
      mockSecrets.set(id, value);
    }
  },
}));

// Controls the path that resolveAuthPath resolves to, so
// probeAccountFromAuthPath's real-file flow can be exercised deterministically.
let mockResolvedAuthPath = null;
vi.mock("../src/internal/paths.js", () => ({
  resolveAuthPath: vi.fn(async () => mockResolvedAuthPath),
}));

vi.mock("../src/internal/config.js", () => ({
  loadConfig: vi.fn(),
}));

import { resolveAuthPath } from "../src/internal/paths.js";
import { loadConfig } from "../src/internal/config.js";
import { getLocalLlmStatus } from "../src/llm/local-llm.js";
import {
  AccountHealthStatus,
  DaemonHealthStatus,
  LocalLlmHealthStatus,
  probeAccount,
  computeAccountHealth,
  computeDaemonHealth,
  computeLocalLlmHealth,
  getSystemHealth,
} from "../src/accounts/health.js";

function token(expOffsetMs, extra = {}) {
  return JSON.stringify({
    expires_at: new Date(Date.now() + expOffsetMs).toISOString(),
    ...extra,
  });
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
    ...patch,
  };
}

function base64Url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function makeJwt(payload) {
  return `${base64Url({ alg: "none" })}.${base64Url(payload)}.signature`;
}

describe("health aggregators", () => {
  let originalHome;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    process.env.HOME = await fs.mkdtemp(
      path.join(os.tmpdir(), "rotator-health-"),
    );
    mockAccounts.length = 0;
    mockSecrets.clear();
    forceListError = false;
    mockResolvedAuthPath = null;

    getLocalLlmStatus.mockReset();
    getLocalLlmStatus.mockResolvedValue({
      available: true,
      modelDir: path.join(process.env.HOME, ".vscode-rotator", "models"),
      models: ["tinyllama"],
      ollamaAvailable: false,
    });

    resolveAuthPath.mockReset();
    resolveAuthPath.mockImplementation(async () => mockResolvedAuthPath);

    loadConfig.mockReset();
    loadConfig.mockResolvedValue({ watchedRepos: [] });
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
      localLlm: expect.any(Object),
    });
  });

  it("computeAccountHealth returns summary counts", async () => {
    mockAccounts.push(
      account("ok"),
      account("cooling", {
        status: "cooldown",
        cooldownUntil: new Date(Date.now() + 60_000),
      }),
      account("exhausted"),
      account("error"),
    );
    mockSecrets.set("ok", token(60_000));
    mockSecrets.set("cooling", token(60_000));
    mockSecrets.set(
      "exhausted",
      JSON.stringify({
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        remainingRequests: 0,
      }),
    );

    const health = await computeAccountHealth();

    expect(health.status).toBe(AccountHealthStatus.ERROR);
    expect(health.summary).toEqual({
      total: 4,
      ok: 1,
      coolingDown: 1,
      exhausted: 1,
      error: 1,
    });
  });

  it("computeDaemonHealth returns a daemon enum status", async () => {
    const health = await computeDaemonHealth();

    expect([
      DaemonHealthStatus.OK,
      DaemonHealthStatus.DEGRADED,
      DaemonHealthStatus.NOT_MONITORING,
    ]).toContain(health.status);
  });

  it("computeLocalLlmHealth maps raw status to enum values", async () => {
    getLocalLlmStatus.mockResolvedValueOnce({
      status: "ready",
      modelDir: "models",
      models: ["a"],
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.READY,
    });

    getLocalLlmStatus.mockResolvedValueOnce({
      status: "degraded",
      modelDir: "models",
      models: [],
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.DEGRADED,
    });

    getLocalLlmStatus.mockResolvedValueOnce({
      status: "unavailable",
      modelDir: null,
      models: [],
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.UNAVAILABLE,
    });
  });

  // ── mapLocalLlmStatus: availability-based fallback branches ──────────────

  it("computeLocalLlmHealth falls back to DEGRADED when only ollama is available", async () => {
    getLocalLlmStatus.mockResolvedValueOnce({
      available: false,
      ollamaAvailable: true,
      models: [],
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.DEGRADED,
    });
  });

  it("computeLocalLlmHealth falls back to UNAVAILABLE when nothing is available", async () => {
    getLocalLlmStatus.mockResolvedValueOnce({
      available: false,
      ollamaAvailable: false,
      models: [],
    });
    await expect(computeLocalLlmHealth()).resolves.toMatchObject({
      status: LocalLlmHealthStatus.UNAVAILABLE,
    });
  });

  it("derives modelDir from modelPath when modelDir is absent (lines 404-405, 410)", async () => {
    getLocalLlmStatus.mockResolvedValueOnce({
      status: "ready",
      modelPath: "/opt/models/tinyllama/model.bin",
      models: ["tinyllama"],
    });

    const result = await computeLocalLlmHealth();

    expect(result.modelDir).toBe("/opt/models/tinyllama");
  });

  it("defaults models to an empty array when the field is absent (line 409)", async () => {
    getLocalLlmStatus.mockResolvedValueOnce({
      status: "ready",
      // no `models` field at all
    });

    const result = await computeLocalLlmHealth();

    expect(result.models).toEqual([]);
  });

  // ── probeAccount: direct unit tests for branches computeAccountHealth
  //    can't reach because probeAccount never throws on its own ──────────────

  describe("probeAccount()", () => {
    it("returns an error health object when an internal step throws (line 107)", async () => {
      const throwingStore = {
        get: async () => {
          throw new Error("secret store exploded");
        },
        set: async () => {},
      };

      const result = await probeAccount(account("explode"), {
        secretStore: throwingStore,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("secret store exploded");
    });

    it("reads health directly from the auth file for codex/vscode/github agents (lines 33, 121-130)", async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-authfile-"));
      const filePath = path.join(dir, "auth.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          remainingRequests: 5,
        }),
        "utf8",
      );
      mockResolvedAuthPath = filePath;

      const result = await probeAccount(
        account("codex-acct", { agentType: "codex" }),
      );

      expect(resolveAuthPath).toHaveBeenCalled();
      expect(result.valid).toBe(true);
      expect(result.remainingRequests).toBe(5);
    });

    it("falls through to the secret store when the resolved auth path doesn't exist", async () => {
      mockResolvedAuthPath = path.join(
        os.tmpdir(),
        "definitely-does-not-exist-auth.json",
      );
      mockSecrets.set("vscode-acct", token(60_000));

      const result = await probeAccount(
        account("vscode-acct", { agentType: "vscode" }),
      );

      expect(result.valid).toBe(true);
    });

    it("caches a freshly-provided authBlob into the secret store (line 142)", async () => {
      const acct = account("fresh-blob", { authBlob: token(60_000) });

      expect(mockSecrets.has("fresh-blob")).toBe(false);
      const result = await probeAccount(acct);

      expect(result.valid).toBe(true);
      expect(mockSecrets.get("fresh-blob")).toBe(acct.authBlob);
    });

    it("falls back to default health when a JWT has no numeric exp (lines 51, 74)", async () => {
      const jwt = makeJwt({ foo: "bar" }); // no `exp` field
      const acct = account("jwt-no-exp", { authBlob: jwt });

      const result = await probeAccount(acct);

      // parseJwtExp returns null (no numeric exp); parseTokenLikeJson then
      // fails to JSON.parse the raw JWT string (it has dots, not valid JSON),
      // so probeTokenJson(null) is null too, hitting the final default.
      expect(result).toEqual({
        valid: true,
        remainingRequests: null,
        resetAt: null,
        error: null,
      });
    });

    it("treats a non-Date/number/string expiry value as unparseable (line 67)", async () => {
      const acct = account("weird-expiry", {
        authBlob: JSON.stringify({ expires_at: true }),
      });

      const result = await probeAccount(acct);

      expect(result).toEqual({
        valid: true,
        remainingRequests: null,
        resetAt: null,
        error: null,
      });
    });

    it("derives expiry directly from a JWT's numeric exp claim (lines 50, 162)", async () => {
      const futureSeconds = Math.floor((Date.now() + 60_000) / 1000);
      const jwt = makeJwt({ exp: futureSeconds });
      const acct = account("jwt-with-exp", { authBlob: jwt });

      const result = await probeAccount(acct);

      expect(result.valid).toBe(true);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it("reports an expired token as invalid with an 'Expired' error (line 96 false branch)", async () => {
      const acct = account("expired-token", {
        authBlob: JSON.stringify({
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      });

      const result = await probeAccount(acct);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Expired");
    });

    it("accepts a numeric (non-string) expires_at value (line 60)", async () => {
      const acct = account("numeric-expiry", {
        authBlob: JSON.stringify({ expires_at: Date.now() + 60_000 }),
      });

      const result = await probeAccount(acct);

      expect(result.valid).toBe(true);
    });

    it("accepts a numeric string expires_at value (line 63)", async () => {
      const acct = account("numeric-string-expiry", {
        authBlob: JSON.stringify({ expires_at: String(Date.now() + 60_000) }),
      });

      const result = await probeAccount(acct);

      expect(result.valid).toBe(true);
    });

    it("falls back to the singular 'remaining' field when 'remainingRequests' is absent (line 178/180)", async () => {
      const acct = account("singular-remaining", {
        authBlob: JSON.stringify({
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          remaining: 3,
        }),
      });

      const result = await probeAccount(acct);

      expect(result.remainingRequests).toBe(3);
    });

    it("prefers an explicit resetAt field over the expiry-derived one (line 182-184)", async () => {
      const explicitReset = new Date(Date.now() + 120_000).toISOString();
      const acct = account("explicit-reset", {
        authBlob: JSON.stringify({
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          resetAt: explicitReset,
        }),
      });

      const result = await probeAccount(acct);

      expect(result.resetAt.toISOString()).toBe(explicitReset);
    });

    it("falls back to String(err) when a thrown value has no .message (line 114)", async () => {
      const throwingStore = {
        get: async () => {
          // eslint-disable-next-line no-throw-literal
          throw "raw string failure";
        },
        set: async () => {},
      };

      const result = await probeAccount(account("string-throw"), {
        secretStore: throwingStore,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("raw string failure");
    });
  });

  // ── computeAccountHealth: catch blocks and EXHAUSTED/COOLING_DOWN-only
  //    summarization branches ───────────────────────────────────────────────

  describe("computeAccountHealth() error and summarization branches", () => {
    it("returns an ERROR summary when the account store itself fails to list (lines 309-310)", async () => {
      forceListError = true;

      const health = await computeAccountHealth();

      expect(health.status).toBe(AccountHealthStatus.ERROR);
      expect(health.summary.error).toBe(1);
      expect(health.summary.errorMessage).toContain("store list failed");
    });

    it("records a per-account error when classification itself throws (lines 287-293)", async () => {
      // New Date(Symbol(...)) throws a TypeError, which is exactly what
      // classifyAccount triggers when given a truthy, non-Date cooldownUntil
      // that can't be coerced — exercising the per-account inner catch.
      const acct = account("classify-throws", {
        cooldownUntil: Symbol("boom"),
      });
      mockAccounts.push(acct);
      mockSecrets.set("classify-throws", token(60_000));

      const health = await computeAccountHealth();

      const entry = health.accounts.find((a) => a.id === "classify-throws");
      expect(entry.healthStatus).toBe(AccountHealthStatus.ERROR);
      expect(entry.error).toBeTruthy();
    });

    it("falls back to String(err) in the per-account catch when the thrown value has no .message (line 294)", async () => {
      // An object whose valueOf() throws a plain string makes `new Date(...)`
      // propagate that plain string (not an Error), exercising the `?? err`
      // fallback in computeAccountHealth's inner catch.
      const acct = account("classify-throws-nonerror", {
        cooldownUntil: {
          valueOf() {
            // eslint-disable-next-line no-throw-literal
            throw "raw classify failure";
          },
        },
      });
      mockAccounts.push(acct);
      mockSecrets.set("classify-throws-nonerror", token(60_000));

      const health = await computeAccountHealth();

      const entry = health.accounts.find(
        (a) => a.id === "classify-throws-nonerror",
      );
      expect(entry.healthStatus).toBe(AccountHealthStatus.ERROR);
      expect(entry.error).toBe("raw classify failure");
    });

    it("returns a clean empty summary when there are no accounts at all (line 324)", async () => {
      const health = await computeAccountHealth();

      expect(health.status).toBe(AccountHealthStatus.OK);
      expect(health.accounts).toEqual([]);
      expect(health.summary).toEqual({
        total: 0,
        ok: 0,
        coolingDown: 0,
        exhausted: 0,
        error: 0,
      });
    });

    it("summarizes as EXHAUSTED when no account is in error (lines 258-261)", async () => {
      mockAccounts.push(account("ok"), account("exhausted"));
      mockSecrets.set("ok", token(60_000));
      mockSecrets.set(
        "exhausted",
        JSON.stringify({
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          remainingRequests: 0,
        }),
      );

      const health = await computeAccountHealth();

      expect(health.status).toBe(AccountHealthStatus.EXHAUSTED);
    });

    it("summarizes as COOLING_DOWN when no account is in error or exhausted (lines 265-268)", async () => {
      mockAccounts.push(
        account("ok"),
        account("cooling", {
          status: "cooldown",
          cooldownUntil: new Date(Date.now() + 60_000),
        }),
      );
      mockSecrets.set("ok", token(60_000));
      mockSecrets.set("cooling", token(60_000));

      const health = await computeAccountHealth();

      expect(health.status).toBe(AccountHealthStatus.COOLING_DOWN);
    });
  });

  // ── computeDaemonHealth: pid file + config catch branches ─────────────────

  describe("computeDaemonHealth() pid and config branches", () => {
    async function writeDaemonPid(pid) {
      const baseDir = path.join(process.env.HOME, ".vscode-rotator");
      await fs.mkdir(baseDir, { recursive: true });
      await fs.writeFile(path.join(baseDir, "daemon.pid"), String(pid), "utf8");
    }

    it("reports OK when the pid is alive, config loads, and repos are watched (lines 204-205, 213-215)", async () => {
      await writeDaemonPid(process.pid);
      loadConfig.mockResolvedValueOnce({ watchedRepos: ["/repo1"] });

      const health = await computeDaemonHealth();

      expect(health.pid).toBe(process.pid);
      expect(health.status).toBe(DaemonHealthStatus.OK);
    });

    it("reports DEGRADED when the stored pid is not alive (lines 204-205, 216-217)", async () => {
      // A pid this large is virtually guaranteed not to correspond to a
      // live process.
      await writeDaemonPid(999999999);
      loadConfig.mockResolvedValueOnce({ watchedRepos: ["/repo1"] });

      const health = await computeDaemonHealth();

      expect(health.pid).toBe(999999999);
      expect(health.status).toBe(DaemonHealthStatus.DEGRADED);
    });

    it("treats unparseable pid file content as no pid, without throwing (line 208 false branch)", async () => {
      await writeDaemonPid("not-a-number");
      loadConfig.mockResolvedValueOnce({ watchedRepos: ["/repo1"] });

      const health = await computeDaemonHealth();

      expect(health.pid).toBeNull();
      expect(health.status).toBe(DaemonHealthStatus.DEGRADED);
    });

    it("is DEGRADED when the pid is alive but config fails to load (line 358 combo)", async () => {
      await writeDaemonPid(process.pid);
      loadConfig.mockRejectedValueOnce(new Error("config broken"));

      const health = await computeDaemonHealth();

      // activeDaemonStatus's `pidAlive && configLoaded` is evaluated with
      // pidAlive=true, configLoaded=false here — a combo no other test
      // exercises. watchedReposCount stays 0 since loadConfig threw, so the
      // final status still ends up NOT_MONITORING, but the branch itself ran.
      expect(health.watchedReposCount).toBe(0);
      expect(health.status).toBe(DaemonHealthStatus.NOT_MONITORING);
    });

    it("still returns a result when loadConfig throws (line 350)", async () => {
      loadConfig.mockRejectedValueOnce(new Error("config broken"));

      const health = await computeDaemonHealth();

      // watchedReposCount stays at its 0 default since the assignment never
      // runs, so the final status falls through to NOT_MONITORING — but the
      // important thing is the catch block ran without crashing.
      expect(health.status).toBe(DaemonHealthStatus.NOT_MONITORING);
      expect(health.watchedReposCount).toBe(0);
    });
  });
});
