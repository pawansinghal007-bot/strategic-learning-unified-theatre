import fs from "node:fs/promises";
import path from "node:path";

import { AccountStore } from "./store.js";
import { acquireLock, releaseLock } from "../lock.js";
import { resolveAuthPath as defaultResolveAuthPath } from "../internal/paths.js";
import { SecretStore } from "./secret-store.js";
import * as defaultVSCodeController from "../vscode.js";

async function ensureDir(p) {
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
}

async function tryFsyncDir(dirPath) {
  let handle = null;
  try {
    handle = await fs.open(dirPath, "r");
    await handle.sync();
  } catch {
  } finally {
    try {
      await handle?.close();
    } catch {}
  }
}

export async function atomicWriteFile(targetPath, contents) {
  await ensureDir(targetPath);
  const dir = path.dirname(targetPath);
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;

  const handle = await fs.open(tmpPath, "w", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await fs.rename(tmpPath, targetPath);
  } catch {
    try {
      await fs.unlink(targetPath);
    } catch {}
    await fs.rename(tmpPath, targetPath);
  }

  await tryFsyncDir(dir);
}

function createEmitter(onStep) {
  return {
    start(message) {
      onStep?.({ phase: "start", message });
    },
    success(message) {
      onStep?.({ phase: "success", message });
    },
    skip(message) {
      onStep?.({ phase: "skip", message });
    },
    fail(message) {
      onStep?.({ phase: "fail", message });
    },
  };
}

export class SwitcherService {
  constructor({ store, resolveAuthPath, vscodeController, lockBaseDir } = {}) {
    this.store = store ?? new AccountStore();
    this.resolveAuthPath = resolveAuthPath ?? defaultResolveAuthPath;
    this.vscode = vscodeController ?? defaultVSCodeController;
    this.lockBaseDir = lockBaseDir;
  }

  async switch(accountId, { dryRun = false, onStep } = {}) {
    const emit = createEmitter(onStep);
    let lockName = "switch";

    try {
      emit.start("Acquiring lock");
      await acquireLock(lockName, { baseDir: this.lockBaseDir });
      emit.success("Lock acquired");

      emit.start("Loading account");
      const account = await this.store.get(accountId);
      emit.success("Account loaded");

      emit.start("Resolving auth path");
      const authPath = await this.resolveAuthPath(account.agentType, {
        profileName: account.profileName ?? account.id,
      });
      emit.success("Auth path resolved");

      const plan = {
        accountId,
        agentType: account.agentType,
        authPath,
        profileName: account.profileName ?? account.id,
      };

      if (dryRun) {
        emit.skip("Dry-run: no files written and VS Code not restarted");
        return plan;
      }

      emit.start("Resolving auth secret");
      const secretStore = new SecretStore();
      let authBlob = null;

      if (typeof account.authBlob === "string" && account.authBlob.length > 0) {
        authBlob = account.authBlob;
        await secretStore.set(accountId, authBlob);
        try {
          await this.store.update(accountId, { authBlob: null });
        } catch {
          // Best effort: migrate the legacy auth blob into the secure store.
        }
      } else {
        authBlob = await secretStore.get(accountId);
      }

      if (!authBlob) {
        throw new Error("Missing auth blob for account");
      }
      emit.success("Auth secret resolved");

      emit.start("Writing auth file");
      await atomicWriteFile(authPath, authBlob);
      emit.success("Auth file written");

      emit.start("Closing VS Code");
      const pids = await this.vscode.findProcesses();
      for (const pid of pids) {
        await this.vscode.gracefulClose(pid);
      }
      emit.success("VS Code closed");

      emit.start("Launching VS Code");
      await this.vscode.launchWithProfile(plan.profileName);
      emit.success("VS Code launched");

      emit.start("Updating account lastUsed");
      await this.store.update(accountId, { lastUsed: new Date() });
      emit.success("Account updated");

      return plan;
    } catch (err) {
      emit.fail(String(err?.message ?? err));
      throw err;
    } finally {
      try {
        await releaseLock(lockName, { baseDir: this.lockBaseDir });
      } catch {}
    }
  }
}
