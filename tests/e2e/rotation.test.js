import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { WatcherDaemon } from "../../src/watcher.js";
import { AccountStore } from "../../src/store.js";
import { CooldownScheduler } from "../../src/scheduler.js";

describe("e2e rotation", () => {
  it("switches to the next best account when current fails health probe", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-rotator-e2e-"));
    const storePath = path.join(dir, "accounts.enc");
    const cooldownPath = path.join(dir, "cooldowns.json");

    const store = new AccountStore({ storePath });
    await store.add({
      id: "a1",
      email: "a1@example.com",
      agentType: "codex",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: new Date(Date.now() + 10),
      status: "active"
    });
    await store.add({
      id: "a2",
      email: "a2@example.com",
      agentType: "codex",
      authBlob: null,
      profileName: null,
      cooldownUntil: null,
      lastUsed: null,
      status: "active"
    });

    const switcher = { switch: vi.fn(async () => ({ ok: true })) };
    const scheduler = new CooldownScheduler({ filePath: cooldownPath });

    const probeAccount = vi.fn(async (acct) => {
      if (acct.id === "a1") {
        return { valid: false, remainingRequests: 0, resetAt: new Date(Date.now() + 1000), error: "expired" };
      }
      return { valid: true, remainingRequests: 100, resetAt: null, error: null };
    });

    const daemon = new WatcherDaemon({ store, switcher, scheduler, probeAccount });

    await daemon.start(1);
    await new Promise((r) => setTimeout(r, 5));
    await daemon.stop();

    expect(switcher.switch).toHaveBeenCalledWith("a2", expect.anything());
  });
});

