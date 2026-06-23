import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  SecretStore,
  defaultProgressPath,
  getSupervisorCredentials,
  setSupervisorCredentials,
} from "../src/accounts/secret-store.js";
import { AccountStore } from "../src/accounts/store.js";

describe("SecretStore", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "secret-store-test-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stores, reads, overwrites, and deletes secrets through the file fallback", async () => {
    const fallbackPath = path.join(tempDir, "secrets.enc");
    const store = new SecretStore({ fallbackPath });

    await store.set("acct-1", "first-secret");
    expect(await store.get("acct-1")).toBe("first-secret");

    await store.set("acct-1", "second-secret");
    expect(await store.get("acct-1")).toBe("second-secret");

    expect(await store.delete("acct-1")).toBe(true);
    expect(await store.get("acct-1")).toBeNull();
    expect(await store.delete("acct-1")).toBe(false);
  });

  it("falls back to encrypted file storage when the configured adapter throws", async () => {
    const adapter = {
      setPassword: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
      getPassword: vi.fn().mockRejectedValue(new Error("keychain unavailable")),
      deletePassword: vi
        .fn()
        .mockRejectedValue(new Error("keychain unavailable")),
    };
    const fallbackPath = path.join(tempDir, "fallback", "secrets.enc");
    const store = new SecretStore({ adapter, fallbackPath });

    await store.set("acct-2", "fallback-secret");

    expect(adapter.setPassword).toHaveBeenCalled();
    expect(store.usingFallback).toBe(true);
    expect(await store.get("acct-2")).toBe("fallback-secret");
    expect(await store.delete("acct-2")).toBe(true);
  });

  it("treats missing, empty, or corrupt fallback files as an empty store", async () => {
    const fallbackPath = path.join(tempDir, "secrets.enc");
    const store = new SecretStore({ fallbackPath });

    expect(await store.get("missing")).toBeNull();

    await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
    await fs.writeFile(fallbackPath, "", "utf8");
    expect(await store.get("empty")).toBeNull();

    await fs.writeFile(fallbackPath, "{not-json", "utf8");
    expect(await store.get("corrupt")).toBeNull();
  });

  it("migrates legacy auth blobs into the secret store", async () => {
    const storePath = path.join(tempDir, "accounts.enc");
    const accountStore = new AccountStore({ storePath });
    await accountStore.add({
      id: "acct-legacy",
      email: "legacy@example.com",
      agentType: "github",
      provider: "github",
      label: "Legacy",
      authBlob: "legacy-secret",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const secrets = new SecretStore({
      fallbackPath: path.join(tempDir, "secrets.enc"),
    });
    const migrated = await secrets.migrateLegacy({ storePath });
    const account = await accountStore.get("acct-legacy");

    expect(migrated).toBe(1);
    expect(await secrets.get("acct-legacy")).toBe("legacy-secret");
    expect(account.authBlob).toBeNull();
  });

  it("returns the default progress path under the user rotator directory", () => {
    const progressPath = defaultProgressPath();

    expect(progressPath).toContain(".vscode-rotator");
    expect(progressPath).toMatch(/PROGRESS\.md$/);
  });

  it("falls back to the HOME-based secrets path when no fallbackPath is provided", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    try {
      const store = new SecretStore();
      expect(store.fallbackPath).toBe(
        path.join(tempDir, ".vscode-rotator", "secrets.enc"),
      );
      expect(store.usingFallback).toBe(false);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("exercises get()'s own catch branch independently of set()", async () => {
    const adapter = {
      setPassword: vi.fn().mockResolvedValue(undefined),
      getPassword: vi.fn().mockRejectedValue(new Error("read failure")),
      deletePassword: vi.fn().mockResolvedValue(true),
    };
    const fallbackPath = path.join(tempDir, "get-catch", "secrets.enc");
    const store = new SecretStore({ adapter, fallbackPath });

    // set() succeeds through the original adapter, so it is NOT replaced yet.
    await store.set("acct-get", "value");
    expect(store.usingFallback).toBe(false);

    // get() must hit its own catch and swap to the file fallback here.
    const result = await store.get("acct-get");
    expect(adapter.getPassword).toHaveBeenCalled();
    expect(store.usingFallback).toBe(true);
    // The fallback file is fresh, so the value written via the original
    // adapter isn't visible there — this confirms the catch path ran.
    expect(result).toBeNull();
  });

  it("exercises delete()'s own catch branch independently of set()/get()", async () => {
    const adapter = {
      setPassword: vi.fn().mockResolvedValue(undefined),
      getPassword: vi.fn().mockResolvedValue("value"),
      deletePassword: vi.fn().mockRejectedValue(new Error("delete failure")),
    };
    const fallbackPath = path.join(tempDir, "delete-catch", "secrets.enc");
    const store = new SecretStore({ adapter, fallbackPath });

    await store.set("acct-del", "value");
    await store.get("acct-del");
    expect(store.usingFallback).toBe(false);

    const existed = await store.delete("acct-del");
    expect(adapter.deletePassword).toHaveBeenCalled();
    expect(store.usingFallback).toBe(true);
    expect(existed).toBe(false);
  });

  it("recovers from a failed rename and tolerates a chmod failure when saving", async () => {
    const fallbackPath = path.join(tempDir, "rename-retry", "secrets.enc");
    const store = new SecretStore({ fallbackPath });

    const realRename = fs.rename;
    vi.spyOn(fs, "rename")
      .mockImplementationOnce(() => Promise.reject(new Error("EBUSY: locked")))
      .mockImplementation((...args) => realRename(...args));
    vi.spyOn(fs, "chmod").mockRejectedValue(new Error("chmod not permitted"));

    await store.set("acct-3", "resilient-secret");

    expect(fs.rename).toHaveBeenCalledTimes(2);
    expect(await store.get("acct-3")).toBe("resilient-secret");
  });

  it("migrateLegacy skips accounts with no usable authBlob", async () => {
    const storePath = path.join(tempDir, "accounts-skip.enc");
    const accountStore = new AccountStore({ storePath });
    await accountStore.add({
      id: "acct-null-blob",
      email: "null@example.com",
      agentType: "github",
      provider: "github",
      label: "Null blob",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const secrets = new SecretStore({
      fallbackPath: path.join(tempDir, "secrets-skip.enc"),
    });
    const migrated = await secrets.migrateLegacy({ storePath });

    expect(migrated).toBe(0);
  });

  it("round-trips supervisor credentials through the default and named providers", async () => {
    const originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    try {
      await setSupervisorCredentials("token-default");
      expect(await getSupervisorCredentials()).toBe("token-default");

      await setSupervisorCredentials("token-custom", "custom-provider");
      expect(await getSupervisorCredentials("custom-provider")).toBe(
        "token-custom",
      );
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
