import fs from "node:fs/promises";

import { resolveAuthPath } from "./paths.js";
import { SecretStore } from "./secret-store.js";

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function base64UrlDecode(input) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64").toString("utf8");
}

function parseJwtExp(token) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (typeof payload?.exp === "number") return new Date(payload.exp * 1000);
    return null;
  } catch {
    return null;
  }
}

function parseExpiresAt(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return new Date(n);
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function parseTokenLikeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function deriveHealthFromExpiry(expiry) {
  if (!expiry) {
    return { valid: false, remainingRequests: null, resetAt: null, error: "No expiry info" };
  }
  const now = Date.now();
  const valid = expiry.getTime() > now;
  return { valid, remainingRequests: null, resetAt: expiry, error: valid ? null : "Expired" };
}

export async function probeAccount(account, { secretStore } = {}) {
  try {
    if (account.agentType === "codex" || account.agentType === "vscode") {
      const p = await resolveAuthPath(account.agentType);
      if (await exists(p)) {
        const raw = await fs.readFile(p, "utf8");
        const json = parseTokenLikeJson(raw);
        if (json) {
          const exp = parseExpiresAt(json.expires_at ?? json.expiry ?? json.exp);
          if (exp) {
            const base = deriveHealthFromExpiry(exp);
            const remaining =
              typeof json.remainingRequests === "number"
                ? json.remainingRequests
                : typeof json.remaining === "number"
                  ? json.remaining
                  : null;
            const resetAt = parseExpiresAt(json.resetAt) ?? base.resetAt;
            return {
              valid: base.valid,
              remainingRequests: remaining,
              resetAt,
              error: base.error
            };
          }
        }
      }
    }

    const ss = secretStore ?? new SecretStore();
    const blob =
      typeof account?.authBlob === "string" && account.authBlob.length > 0
        ? account.authBlob
        : await ss.get(account.id);

    if (!blob) {
      return { valid: false, remainingRequests: null, resetAt: null, error: "Missing secret" };
    }

    const jwtExp = parseJwtExp(String(blob));
    if (jwtExp) return deriveHealthFromExpiry(jwtExp);

    const json = parseTokenLikeJson(String(blob));
    if (json) {
      const exp = parseExpiresAt(json.expires_at ?? json.expiry ?? json.exp);
      if (exp) return deriveHealthFromExpiry(exp);
    }

    return { valid: true, remainingRequests: null, resetAt: null, error: null };
  } catch (err) {
    return { valid: false, remainingRequests: null, resetAt: null, error: String(err?.message ?? err) };
  }
}
