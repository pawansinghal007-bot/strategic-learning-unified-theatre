import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { encrypt, decrypt } from "../src/encrypt.js";
import { AccountStore } from "../src/store.js";

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
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-rotator-"));
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
      status: "active"
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
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-rotator-"));
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
      status: "active"
    });

    const updated = await store.update("acct_1", { status: "cooldown" });
    expect(updated.status).toBe("cooldown");

    const fetched = await store.get("acct_1");
    expect(fetched.status).toBe("cooldown");
  });
});
