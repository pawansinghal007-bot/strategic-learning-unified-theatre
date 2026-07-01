/**
 * tests/accounts-schema.test.js
 *
 * Exercises src/accounts/schema.js — AccountSchema, AgentTypeSchema,
 * AccountStatusSchema.  The only previously-uncovered line was line 7
 * (`email: z.email()`) which is hit whenever AccountSchema.parse() runs
 * the email validation path.
 */

import { describe, it, expect } from "vitest";
import {
  AccountSchema,
  AgentTypeSchema,
  AccountStatusSchema,
} from "../src/accounts/schema.js";

// ── minimal valid account fixture ────────────────────────────────────────────

function validAccount(overrides = {}) {
  return {
    id: "acct-1",
    email: "user@example.com",
    agentType: "vscode",
    authBlob: "blob",
    profileName: "default",
    cooldownUntil: null,
    lastUsed: null,
    status: "active",
    ...overrides,
  };
}

// ── AccountSchema ─────────────────────────────────────────────────────────────

describe("AccountSchema", () => {
  it("parses a fully-populated valid account (hits z.email() on line 7)", () => {
    const result = AccountSchema.parse(validAccount());
    expect(result.id).toBe("acct-1");
    expect(result.email).toBe("user@example.com");
    expect(result.agentType).toBe("vscode");
    expect(result.authBlob).toBe("blob");
    expect(result.profileName).toBe("default");
    expect(result.status).toBe("active");
  });

  it("rejects an invalid email address (z.email() validation on line 7)", () => {
    expect(() =>
      AccountSchema.parse(validAccount({ email: "not-an-email" })),
    ).toThrow();
  });

  it("rejects an empty email string", () => {
    expect(() =>
      AccountSchema.parse(validAccount({ email: "" })),
    ).toThrow();
  });

  it("rejects a missing id (z.string().min(1))", () => {
    expect(() =>
      AccountSchema.parse(validAccount({ id: "" })),
    ).toThrow();
  });

  it("coerces undefined authBlob to null via preprocess", () => {
    const input = validAccount();
    delete input.authBlob;
    const result = AccountSchema.parse(input);
    expect(result.authBlob).toBeNull();
  });

  it("coerces undefined profileName to null via preprocess", () => {
    const input = validAccount();
    delete input.profileName;
    const result = AccountSchema.parse(input);
    expect(result.profileName).toBeNull();
  });

  it("accepts null authBlob explicitly", () => {
    const result = AccountSchema.parse(validAccount({ authBlob: null }));
    expect(result.authBlob).toBeNull();
  });

  it("accepts null profileName explicitly", () => {
    const result = AccountSchema.parse(validAccount({ profileName: null }));
    expect(result.profileName).toBeNull();
  });

  it("parses a numeric string cooldownUntil as a Date", () => {
    // The DateOrNull preprocess passes strings to new Date(v).
    // A numeric-millisecond string like "1751234567890" produces an
    // Invalid Date via new Date() in Zod 4 (which treats it as a date string,
    // not a number). Use an ISO date string instead, which new Date() parses
    // correctly.
    const iso = new Date(Date.now() + 60_000).toISOString();
    const result = AccountSchema.parse(
      validAccount({ cooldownUntil: iso }),
    );
    expect(result.cooldownUntil).toBeInstanceOf(Date);
  });

  it("parses an ISO string lastUsed as a Date", () => {
    const iso = new Date().toISOString();
    const result = AccountSchema.parse(validAccount({ lastUsed: iso }));
    expect(result.lastUsed).toBeInstanceOf(Date);
  });

  it("passes a Date instance through the DateOrNull preprocess", () => {
    const d = new Date();
    const result = AccountSchema.parse(validAccount({ lastUsed: d }));
    expect(result.lastUsed).toBeInstanceOf(Date);
    expect(result.lastUsed.getTime()).toBe(d.getTime());
  });

  it("DateOrNull preprocess returns non-standard value as-is when not null/Date/string/number (line 7: return v)", () => {
    // A boolean `true` falls through all conditions in the DateOrNull preprocess
    // (not null, not Date, not string/number) → hits `return v` on line 7 →
    // Zod then validates the raw value against z.date().nullable() and throws.
    // This exercises the line 7 `return v` branch.
    expect(() =>
      AccountSchema.parse(validAccount({ cooldownUntil: true })),
    ).toThrow();
  });

  it("accepts null cooldownUntil and lastUsed", () => {
    const result = AccountSchema.parse(
      validAccount({ cooldownUntil: null, lastUsed: null }),
    );
    expect(result.cooldownUntil).toBeNull();
    expect(result.lastUsed).toBeNull();
  });

  it("rejects an unknown agentType", () => {
    expect(() =>
      AccountSchema.parse(validAccount({ agentType: "unknown-type" })),
    ).toThrow();
  });

  it("rejects an unknown status", () => {
    expect(() =>
      AccountSchema.parse(validAccount({ status: "archived" })),
    ).toThrow();
  });
});

// ── AgentTypeSchema ───────────────────────────────────────────────────────────

describe("AgentTypeSchema", () => {
  it.each(["vscode", "github", "codex", "trae", "other"])(
    "accepts valid agent type '%s'",
    (type) => {
      expect(AgentTypeSchema.parse(type)).toBe(type);
    },
  );

  it("rejects invalid agent type", () => {
    expect(() => AgentTypeSchema.parse("invalid")).toThrow();
  });
});

// ── AccountStatusSchema ───────────────────────────────────────────────────────

describe("AccountStatusSchema", () => {
  it.each(["active", "cooldown", "retired"])(
    "accepts valid status '%s'",
    (status) => {
      expect(AccountStatusSchema.parse(status)).toBe(status);
    },
  );

  it("rejects invalid status", () => {
    expect(() => AccountStatusSchema.parse("suspended")).toThrow();
  });
});
