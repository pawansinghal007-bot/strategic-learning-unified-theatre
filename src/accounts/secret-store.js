import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { decrypt, encrypt } from "../encrypt.js";
import { AccountStore } from "./store.js";

const SERVICE = "strategic-learning-unified-theatre";

class FileSecretAdapter {
  constructor(filePath) {
    this.filePath = filePath;
  }

  key(service, accountId) {
    return `${service}:${accountId}`;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      if (!raw.trim()) return {};
      return JSON.parse(decrypt(JSON.parse(raw)));
    } catch {
      return {};
    }
  }

  async save(data) {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(encrypt(JSON.stringify(data))), {
      mode: 0o600,
    });
    try {
      await fs.rename(tmpPath, this.filePath);
    } catch {
      try {
        await fs.unlink(this.filePath);
      } catch {}
      await fs.rename(tmpPath, this.filePath);
    }
    try {
      await fs.chmod(this.filePath, 0o600);
    } catch {}
  }

  async setPassword(service, accountId, blob) {
    const data = await this.load();
    data[this.key(service, accountId)] = String(blob);
    await this.save(data);
  }

  async getPassword(service, accountId) {
    const data = await this.load();
    return data[this.key(service, accountId)] ?? null;
  }

  async deletePassword(service, accountId) {
    const data = await this.load();
    const key = this.key(service, accountId);
    const existed = Object.hasOwn(data, key);
    delete data[key];
    await this.save(data);
    return existed;
  }
}

export class SecretStore {
  constructor({ adapter, fallbackPath } = {}) {
    this.adapter = adapter ?? null;
    this.fallbackPath =
      fallbackPath ??
      path.join(
        process.env.HOME || os.homedir(),
        ".vscode-rotator",
        "secrets.enc",
      );
    this.usingFallback = false;
  }

  async #ensureAdapter() {
    if (this.adapter) return this.adapter;
    try {
      const keytar = (await import("keytar")).default;
      this.adapter = keytar;
    } catch {
      this.usingFallback = true;
      this.adapter = new FileSecretAdapter(this.fallbackPath);
    }
    return this.adapter;
  }

  #fallbackAdapter() {
    this.usingFallback = true;
    this.adapter = new FileSecretAdapter(this.fallbackPath);
    return this.adapter;
  }

  async set(accountId, blob) {
    const adapter = await this.#ensureAdapter();
    try {
      await adapter.setPassword(SERVICE, String(accountId), String(blob));
    } catch {
      await this.#fallbackAdapter().setPassword(
        SERVICE,
        String(accountId),
        String(blob),
      );
    }
  }

  async get(accountId) {
    const adapter = await this.#ensureAdapter();
    try {
      return await adapter.getPassword(SERVICE, String(accountId));
    } catch {
      return await this.#fallbackAdapter().getPassword(
        SERVICE,
        String(accountId),
      );
    }
  }

  async delete(accountId) {
    const adapter = await this.#ensureAdapter();
    try {
      return await adapter.deletePassword(SERVICE, String(accountId));
    } catch {
      return await this.#fallbackAdapter().deletePassword(
        SERVICE,
        String(accountId),
      );
    }
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
  return path.join(
    process.env.HOME || os.homedir(),
    ".vscode-rotator",
    "PROGRESS.md",
  );
}

export async function getSupervisorCredentials(provider = "default") {
  const store = new SecretStore();
  return await store.get("supervisor_token_" + provider);
}

export async function setSupervisorCredentials(token, provider = "default") {
  const store = new SecretStore();
  await store.set("supervisor_token_" + provider, token);
}
