import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  SecretStore,
  defaultProgressPath,
} from "../src/accounts/secret-store.js";
import { AccountStore } from "../src/accounts/store.js";

describe("SecretStore", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "secret-store-test-"));
  });

  afterEach(async () => {
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
});
