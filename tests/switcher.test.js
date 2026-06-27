import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { atomicWriteFile, SwitcherService } from "../src/accounts/switcher.js";
import { AccountStore } from "../src/accounts/store.js";

describe("atomicWriteFile", () => {
  it("writes full content to destination", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-atomic-"),
    );
    const target = path.join(dir, "auth.json");
    await atomicWriteFile(target, "hello");
    expect(await fs.readFile(target, "utf8")).toBe("hello");
  });
});

describe("SwitcherService", () => {
  it("dry-run returns a plan without writing", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-switcher-"),
    );
    const storePath = path.join(dir, "accounts.enc");
    const authPath = path.join(dir, "auth.json");

    const store = new AccountStore({ storePath });
    await store.add({
      id: "acct_1",
      email: "a@example.com",
      agentType: "codex",
      authBlob: "AUTH_BLOB",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: {
        async findProcesses() {
          return [];
        },
        async gracefulClose() {},
        async launchWithProfile() {},
      },
      lockBaseDir: dir,
    });

    const plan = await svc.switch("acct_1", { dryRun: true });
    expect(plan.authPath).toBe(authPath);
    await expect(fs.readFile(authPath, "utf8")).rejects.toThrow();
  }, 15000); // Increased timeout: SecretStore initialization can take time
});

// ─── atomicWriteFile: rename-fallback path (lines 43-46) ─────────────────────

describe("atomicWriteFile rename-fallback", () => {
  it("falls back to unlink+rename when first rename throws", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "switcher-rename-"));
    const target = path.join(dir, "auth.json");
    await fs.writeFile(target, "old content");

    const origRename = fs.rename.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (src, dst) => {
      renameCount++;
      if (renameCount === 1)
        throw Object.assign(new Error("cross-device"), { code: "EXDEV" });
      return origRename(src, dst);
    });

    await atomicWriteFile(target, "new content");
    expect(await fs.readFile(target, "utf8")).toBe("new content");
    expect(renameCount).toBe(2);

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("unlink failure inside fallback is swallowed, rename still proceeds", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "switcher-unlink-"));
    const target = path.join(dir, "auth.json");

    const origRename = fs.rename.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (src, dst) => {
      renameCount++;
      if (renameCount === 1) throw new Error("rename failed");
      return origRename(src, dst);
    });
    vi.spyOn(fs, "unlink").mockRejectedValue(new Error("unlink failed"));

    await atomicWriteFile(target, "content");
    expect(await fs.readFile(target, "utf8")).toBe("content");

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ─── SwitcherService full switch (non-dryRun) ────────────────────────────────

function makeVscode({ pids = [] } = {}) {
  return {
    findProcesses: vi.fn().mockResolvedValue(pids),
    gracefulClose: vi.fn().mockResolvedValue(undefined),
    launchWithProfile: vi.fn().mockResolvedValue(undefined),
  };
}

async function makeStore(dir, overrides = {}) {
  const { AccountStore: AS } = await import("../src/accounts/store.js");
  const storePath = path.join(dir, "accounts.enc");
  const store = new AS({ storePath });
  await store.add({
    id: "acct_1",
    email: "a@example.com",
    agentType: "vscode",
    authBlob: null,
    profileName: null,
    cooldownUntil: null,
    lastUsed: null,
    status: "active",
    ...overrides,
  });
  return store;
}

describe("SwitcherService.switch — non-dryRun paths", () => {
  it("writes auth file using secretStore.get when account.authBlob is null", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-nodry-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir);
    const vscode = makeVscode();

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "get").mockResolvedValue("secret-blob");
    vi.spyOn(SecretStore.prototype, "set").mockResolvedValue(undefined);

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: vscode,
      lockBaseDir: dir,
    });

    await svc.switch("acct_1");
    expect(await fs.readFile(authPath, "utf8")).toBe("secret-blob");
    expect(vscode.launchWithProfile).toHaveBeenCalledWith("acct_1");

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);

  it("migrates legacy authBlob from account to secretStore then clears it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-legacy-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir, { authBlob: "legacy-blob" });
    const vscode = makeVscode();

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "set").mockResolvedValue(undefined);
    vi.spyOn(SecretStore.prototype, "get").mockResolvedValue("legacy-blob");

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: vscode,
      lockBaseDir: dir,
    });

    await svc.switch("acct_1");
    expect(SecretStore.prototype.set).toHaveBeenCalledWith(
      "acct_1",
      "legacy-blob",
    );
    expect(await fs.readFile(authPath, "utf8")).toBe("legacy-blob");

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);

  it("store.update failure during authBlob migration is swallowed (best effort)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-migrate-err-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir, { authBlob: "legacy-blob" });
    const vscode = makeVscode();

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "set").mockResolvedValue(undefined);
    vi.spyOn(SecretStore.prototype, "get").mockResolvedValue("legacy-blob");

    // Only reject the FIRST update call (authBlob: null migration);
    // the second call (lastUsed) must succeed for switch to complete
    let updateCount = 0;
    vi.spyOn(store, "update").mockImplementation(async (...args) => {
      updateCount++;
      if (updateCount === 1) throw new Error("update failed");
    });

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: vscode,
      lockBaseDir: dir,
    });

    await expect(svc.switch("acct_1")).resolves.toBeDefined();

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);

  it("throws 'Missing auth blob' when secretStore.get returns null", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-noauth-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir);
    const vscode = makeVscode();

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "get").mockResolvedValue(null);

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: vscode,
      lockBaseDir: dir,
    });

    await expect(svc.switch("acct_1")).rejects.toThrow("Missing auth blob");

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);

  it("calls gracefulClose for each running VS Code pid", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-pids-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir);
    const vscode = makeVscode({ pids: [1001, 1002] });

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "get").mockResolvedValue("blob");

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: vscode,
      lockBaseDir: dir,
    });

    await svc.switch("acct_1");
    expect(vscode.gracefulClose).toHaveBeenCalledWith(1001);
    expect(vscode.gracefulClose).toHaveBeenCalledWith(1002);

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);

  it("emit.fail is called and error is rethrown when switch throws (line 64)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-fail-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir);

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "get").mockRejectedValue(
      new Error("secret error"),
    );

    const steps = [];
    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: makeVscode(),
      lockBaseDir: dir,
    });

    await expect(
      svc.switch("acct_1", { onStep: (evt) => steps.push(evt) }),
    ).rejects.toThrow("secret error");

    expect(steps.some((s) => s.phase === "fail")).toBe(true);

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);

  it("no onStep handler does not throw (optional chaining safety)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sw-noop-"));
    const authPath = path.join(dir, "auth.json");
    const store = await makeStore(dir);

    const { SecretStore } = await import("../src/accounts/secret-store.js");
    vi.spyOn(SecretStore.prototype, "get").mockResolvedValue("blob");

    const svc = new SwitcherService({
      store,
      resolveAuthPath: () => authPath,
      vscodeController: makeVscode(),
      lockBaseDir: dir,
    });

    await expect(svc.switch("acct_1")).resolves.toBeDefined();

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  }, 15000);
});
