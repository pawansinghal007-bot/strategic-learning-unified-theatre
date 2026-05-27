import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { decrypt, encrypt } from "../encrypt.js";
import { AccountSchema } from "./schema.js";

function defaultStorePath() {
  return path.join(os.homedir(), ".vscode-rotator", "accounts.enc");
}

function serializeAccount(account) {
  return {
    ...account,
    cooldownUntil: account.cooldownUntil
      ? account.cooldownUntil.toISOString()
      : null,
    lastUsed: account.lastUsed ? account.lastUsed.toISOString() : null,
  };
}

function deserializeAccount(raw) {
  const parsed = AccountSchema.parse(raw);
  return {
    ...parsed,
    cooldownUntil: parsed.cooldownUntil ?? null,
    lastUsed: parsed.lastUsed ?? null,
  };
}

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export class AccountStore {
  constructor({ storePath } = {}) {
    this.storePath = storePath ?? defaultStorePath();
  }

  async list() {
    const data = await this.#load();
    return data.accounts.map((a) => ({ ...a }));
  }

  async get(id) {
    const data = await this.#load();
    const acct = data.accounts.find((a) => a.id === id);
    if (!acct) throw new Error(`Account not found: ${id}`);
    return { ...acct };
  }

  async add(account) {
    const data = await this.#load();
    const parsed = deserializeAccount(account);

    if (data.accounts.some((a) => a.id === parsed.id)) {
      throw new Error(`Account already exists: ${parsed.id}`);
    }

    data.accounts.push(parsed);
    await this.#save(data);
    return { ...parsed };
  }

  async remove(id) {
    const data = await this.#load();
    const idx = data.accounts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account not found: ${id}`);
    const [removed] = data.accounts.splice(idx, 1);
    await this.#save(data);
    return { ...removed };
  }

  async update(id, patch) {
    const data = await this.#load();
    const idx = data.accounts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Account not found: ${id}`);

    const merged = { ...data.accounts[idx], ...patch, id };
    const parsed = deserializeAccount(merged);
    data.accounts[idx] = parsed;

    await this.#save(data);
    return { ...parsed };
  }

  async #load() {
    const exists = await pathExists(this.storePath);
    if (!exists) return { version: 1, accounts: [] };

    const raw = await fs.readFile(this.storePath, "utf8");
    if (!raw.trim()) return { version: 1, accounts: [] };

    const parsedBlob = JSON.parse(raw);
    const plaintext = decrypt(parsedBlob);
    const json = JSON.parse(plaintext);

    return {
      version: Number(json.version ?? 1),
      accounts: Array.isArray(json.accounts)
        ? json.accounts.map(deserializeAccount)
        : [],
    };
  }

  async #save(data) {
    const dir = path.dirname(this.storePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    const payload = JSON.stringify(
      {
        version: 1,
        accounts: data.accounts.map(serializeAccount),
      },
      null,
      2,
    );

    const blob = encrypt(payload);
    const tmpPath = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    const serializedBlob = JSON.stringify(blob);

    await fs.writeFile(tmpPath, serializedBlob, { mode: 0o600 });

    try {
      await fs.rename(tmpPath, this.storePath);
    } catch {
      try {
        await fs.unlink(this.storePath);
      } catch {}
      await fs.rename(tmpPath, this.storePath);
    }

    try {
      await fs.chmod(this.storePath, 0o600);
    } catch {}
  }
}
