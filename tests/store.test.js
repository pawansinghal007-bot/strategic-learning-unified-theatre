import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { encrypt, decrypt } from "../src/encrypt.js";
import { AccountStore } from "../src/accounts/store.js";

describe("encrypt/decrypt", () => {
  it("round-trips plaintext", () => {
    const plaintext = JSON.stringify({ hello: "world" });
    const blob = encrypt(plaintext);
    const decrypted = decrypt(blob);
    expect(decrypted).toBe(plaintext);
  });

  it("uses random iv (ciphertext differs across calls)", () => {
    const plaintext = "same input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe("AccountStore", () => {
  it("adds, lists, and removes accounts with persistence", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-"),
    );
    const storePath = path.join(dir, "accounts.enc");

    const store1 = new AccountStore({ storePath });
    await store1.add({
      id: "acct_1",
      email: "a@example.com",
      agentType: "vscode",
      authBlob: "blob",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const listed1 = await store1.list();
    expect(listed1).toHaveLength(1);
    expect(listed1[0].email).toBe("a@example.com");

    const store2 = new AccountStore({ storePath });
    const listed2 = await store2.list();
    expect(listed2).toHaveLength(1);
    expect(listed2[0].id).toBe("acct_1");

    await store2.remove("acct_1");
    expect(await store2.list()).toHaveLength(0);
  });

  it("updates an account by id", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-"),
    );
    const storePath = path.join(dir, "accounts.enc");

    const store = new AccountStore({ storePath });
    await store.add({
      id: "acct_1",
      email: "a@example.com",
      agentType: "vscode",
      authBlob: "blob",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const updated = await store.update("acct_1", { status: "cooldown" });
    expect(updated.status).toBe("cooldown");

    const fetched = await store.get("acct_1");
    expect(fetched.status).toBe("cooldown");
  });

  // ── get(): throws when account not found (line 62) ────────────────────────

  it("get() throws 'Account not found' when id does not exist (line 62)", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-get-"),
    );
    const storePath = path.join(dir, "accounts.enc");
    const store = new AccountStore({ storePath });

    // Store is empty — get() must throw
    await expect(store.get("nonexistent-id")).rejects.toThrow(
      "Account not found: nonexistent-id",
    );
  });

  it("get() throws after an account is removed (line 62 — store not empty but id absent)", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-get2-"),
    );
    const storePath = path.join(dir, "accounts.enc");
    const store = new AccountStore({ storePath });

    await store.add({
      id: "acct_exists",
      email: "b@example.com",
      agentType: "github",
      authBlob: "blob",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });
    await store.remove("acct_exists");

    await expect(store.get("acct_exists")).rejects.toThrow(
      "Account not found: acct_exists",
    );
  });

  it("add() throws 'Account already exists' when id is duplicate (line 62 of add)", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-dup-"),
    );
    const storePath = path.join(dir, "accounts.enc");
    const store = new AccountStore({ storePath });

    const acct = {
      id: "acct_dup",
      email: "c@example.com",
      agentType: "vscode",
      authBlob: "blob",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    };

    await store.add(acct);
    await expect(store.add(acct)).rejects.toThrow(
      "Account already exists: acct_dup",
    );
  });

  // ── #save(): EXDEV rename fallback (lines 133-136) ────────────────────────

  it("#save() falls back to unlink+rename when first rename throws EXDEV (lines 133-136)", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-save-"),
    );
    const storePath = path.join(dir, "accounts.enc");
    const store = new AccountStore({ storePath });

    // First write — creates the file cleanly
    await store.add({
      id: "acct_1",
      email: "a@example.com",
      agentType: "vscode",
      authBlob: "blob",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    // Now spy on rename: first call throws EXDEV, second call uses real impl
    const realRename = fs.rename.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (src, dst) => {
      renameCount++;
      if (renameCount === 1) {
        throw Object.assign(new Error("cross-device link"), { code: "EXDEV" });
      }
      return realRename(src, dst);
    });

    // This triggers another #save() — the rename fallback path must run
    await store.update("acct_1", { status: "cooldown" });

    expect(renameCount).toBe(2);

    // Data must be intact after the fallback rename
    const store2 = new AccountStore({ storePath });
    const fetched = await store2.get("acct_1");
    expect(fetched.status).toBe("cooldown");

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("#save() swallows unlink failure inside the fallback (lines 133-136)", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-unlink-"),
    );
    const storePath = path.join(dir, "accounts.enc");
    const store = new AccountStore({ storePath });

    await store.add({
      id: "acct_2",
      email: "c@example.com",
      agentType: "codex",
      authBlob: "blob2",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const realRename = fs.rename.bind(fs);
    let renameCount = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (src, dst) => {
      renameCount++;
      if (renameCount === 1) throw new Error("rename failed");
      return realRename(src, dst);
    });
    vi.spyOn(fs, "unlink").mockRejectedValue(new Error("unlink failed"));

    // Should not throw even though unlink fails inside the catch
    await expect(
      store.update("acct_2", { status: "retired" }),
    ).resolves.toBeDefined();

    expect(renameCount).toBe(2);

    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });
});


// ── Targeted coverage gap tests ───────────────────────────────────────────
// Covers: store.js lines 9 (os.homedir() fallback), 73-82 (remove()),
//         97-105 (#load() empty-file + decrypt branches)

describe("store.js coverage gaps", () => {
  let dir;
  let storePath;

  beforeEach(async () => {
    dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "store-gap-test-"),
    );
    storePath = path.join(dir, "accounts.enc");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  // ── line 9: defaultStorePath() os.homedir() fallback ─────────────────────

  it("uses os.homedir() when HOME is unset (line 9: process.env.HOME || os.homedir())", () => {
    const origHome = process.env.HOME;
    delete process.env.HOME;
    try {
      // Constructing with no storePath triggers defaultStorePath()
      const store = new AccountStore();
      expect(store.storePath).toContain(".vscode-rotator");
      expect(store.storePath).toContain("accounts.enc");
    } finally {
      if (origHome !== undefined) process.env.HOME = origHome;
    }
  });

  // ── lines 73-82: remove() ─────────────────────────────────────────────────

  it("remove() deletes an account and returns a copy of the removed record (lines 73-82)", async () => {
    const store = new AccountStore({ storePath });
    await store.add({
      id: "remove-me",
      email: "r@example.com",
      agentType: "vscode",
      authBlob: "blob",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const removed = await store.remove("remove-me");

    expect(removed.id).toBe("remove-me");
    expect(removed.email).toBe("r@example.com");
    expect(await store.list()).toHaveLength(0);
  });

  it("remove() throws 'Account not found' when id is absent (line 73: idx === -1)", async () => {
    const store = new AccountStore({ storePath });

    await expect(store.remove("ghost-id")).rejects.toThrow(
      "Account not found: ghost-id",
    );
  });

  it("remove() persists the deletion so a new store instance sees the change (lines 75-77)", async () => {
    const store = new AccountStore({ storePath });
    await store.add({
      id: "persist-remove",
      email: "p@example.com",
      agentType: "github",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    await store.remove("persist-remove");

    const store2 = new AccountStore({ storePath });
    await expect(store2.get("persist-remove")).rejects.toThrow(
      "Account not found: persist-remove",
    );
  });

  // ── lines 97-105: #load() empty-file and full decrypt branches ────────────

  it("#load() returns empty accounts when the store file exists but is empty (line 97)", async () => {
    // Write an empty file at storePath — #load() must hit the `!raw.trim()` branch
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, "   ", "utf8"); // whitespace-only → trim() is ""

    const store = new AccountStore({ storePath });
    const accounts = await store.list();

    expect(accounts).toEqual([]);
  });

  it("#load() decrypts and parses persisted accounts (lines 100-105)", async () => {
    // Write then reload via a fresh instance — exercises the full decrypt path
    const store = new AccountStore({ storePath });
    await store.add({
      id: "decrypt-test",
      email: "d@example.com",
      agentType: "codex",
      authBlob: "secret",
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    // Fresh instance — must decrypt from disk (lines 100-105)
    const store2 = new AccountStore({ storePath });
    const list = await store2.list();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("decrypt-test");
  });

  it("#load() returns empty accounts when json.accounts is not an array (line 105 false branch)", async () => {
    // Write a valid encrypted blob where `accounts` is not an array
    const { encrypt } = await import("../src/encrypt.js");
    const payload = JSON.stringify({ version: 1, accounts: null });
    const blob = encrypt(payload);
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(blob), { mode: 0o600 });

    const store = new AccountStore({ storePath });
    const accounts = await store.list();

    // Array.isArray(null) is false → falls through to [] (line 105)
    expect(accounts).toEqual([]);
  });

  it("update() throws 'Account not found' when id is absent (line 82: idx === -1)", async () => {
    const store = new AccountStore({ storePath });

    await expect(store.update("no-such-id", { status: "cooldown" })).rejects.toThrow(
      "Account not found: no-such-id",
    );
  });

  it("serializeAccount handles null cooldownUntil and lastUsed (branch lines 15-19)", async () => {
    const store = new AccountStore({ storePath });
    await store.add({
      id: "serial-null",
      email: "s@example.com",
      agentType: "trae",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active",
    });

    const store2 = new AccountStore({ storePath });
    const [acct] = await store2.list();
    expect(acct.cooldownUntil).toBeNull();
    expect(acct.lastUsed).toBeNull();
  });

  it("serializeAccount serializes non-null cooldownUntil and lastUsed as ISO strings (branch lines 15-19 truthy branch)", async () => {
    const store = new AccountStore({ storePath });
    const now = new Date();
    await store.add({
      id: "serial-dates",
      email: "d@example.com",
      agentType: "trae",
      authBlob: null,
      profileName: null,
      cooldownUntil: now,
      lastUsed: now,
      status: "active",
    });

    const store2 = new AccountStore({ storePath });
    const [acct] = await store2.list();
    // Dates survive round-trip through serialization
    expect(acct.cooldownUntil).toBeTruthy();
    expect(acct.lastUsed).toBeTruthy();
  });

  it("#load() defaults version to 1 when json.version is absent (line 104: json.version ?? 1)", async () => {
    // Write an encrypted blob with no `version` field → triggers `?? 1` fallback
    const { encrypt } = await import("../src/encrypt.js");
    const payload = JSON.stringify({ accounts: [] }); // no version key
    const blob = encrypt(payload);
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(blob), { mode: 0o600 });

    const store = new AccountStore({ storePath });
    // list() calls #load() which must hit the `json.version ?? 1` right-hand side
    const accounts = await store.list();
    expect(accounts).toEqual([]);
  });
});
