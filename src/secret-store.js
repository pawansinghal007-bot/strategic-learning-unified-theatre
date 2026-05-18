import os from "node:os";
import path from "node:path";

import { AccountStore } from "./store.js";

const SERVICE = "vscode-rotator";

export class SecretStore {
  constructor({ adapter } = {}) {
    this.adapter = adapter ?? null;
  }

  async #ensureAdapter() {
    if (this.adapter) return this.adapter;
    let keytar;
    try {
      keytar = await import("keytar");
    } catch (err) {
      throw new Error(
        "keytar is required for OS secret storage. Install build prerequisites for native modules and reinstall."
      );
    }
    this.adapter = keytar;
    return this.adapter;
  }

  async set(accountId, blob) {
    const adapter = await this.#ensureAdapter();
    await adapter.setPassword(SERVICE, String(accountId), String(blob));
  }

  async get(accountId) {
    const adapter = await this.#ensureAdapter();
    return await adapter.getPassword(SERVICE, String(accountId));
  }

  async delete(accountId) {
    const adapter = await this.#ensureAdapter();
    return await adapter.deletePassword(SERVICE, String(accountId));
  }

  async migrateLegacy({ storePath } = {}) {
    const store = new AccountStore({ storePath });
    const accounts = await store.list();
    let migrated = 0;
    for (const acct of accounts) {
      if (typeof acct.authBlob === "string" && acct.authBlob.length > 0) {
        await this.set(acct.id, acct.authBlob);
        await store.update(acct.id, { authBlob: null });
        migrated++;
      }
    }
    return migrated;
  }
}

export function defaultProgressPath() {
  return path.join(os.homedir(), ".vscode-rotator", "PROGRESS.md");
}

