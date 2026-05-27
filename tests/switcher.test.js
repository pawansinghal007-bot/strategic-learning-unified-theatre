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
