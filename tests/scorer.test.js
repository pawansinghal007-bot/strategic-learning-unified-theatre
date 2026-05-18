import { describe, expect, it } from "vitest";

import { pickBest, scoreAccount } from "../src/scorer.js";

function mkAccount(overrides) {
  return {
    id: "a",
    email: "a@example.com",
    agentType: "codex",
    authBlob: "x",
    cooldownUntil: null,
    lastUsed: null,
    status: "active",
    ...overrides
  };
}

describe("scoreAccount", () => {
  it("scores valid accounts higher than invalid", () => {
    const a = mkAccount({ id: "a" });
    const valid = scoreAccount(a, {
      valid: true,
      remainingRequests: 50,
      resetAt: null,
      error: null
    });
    const invalid = scoreAccount(a, {
      valid: false,
      remainingRequests: null,
      resetAt: null,
      error: "bad token"
    });
    expect(valid).toBeGreaterThan(invalid);
  });

  it("forces cooldown/retired accounts to be very low", () => {
    const now = Date.now();
    const cooldown = mkAccount({
      status: "cooldown",
      cooldownUntil: new Date(now + 60_000)
    });
    const retired = mkAccount({ status: "retired" });

    const h = { valid: true, remainingRequests: 100, resetAt: null, error: null };
    expect(scoreAccount(cooldown, h)).toBeLessThanOrEqual(0);
    expect(scoreAccount(retired, h)).toBeLessThanOrEqual(0);
  });
});

describe("pickBest", () => {
  it("throws when all accounts are on cooldown or retired", () => {
    const now = Date.now();
    const accounts = [
      mkAccount({ id: "a", status: "cooldown", cooldownUntil: new Date(now + 60_000) }),
      mkAccount({ id: "b", status: "retired" })
    ];
    const healthMap = new Map(
      accounts.map((a) => [a.id, { valid: true, remainingRequests: 100, resetAt: null, error: null }])
    );

    expect(() => pickBest(accounts, healthMap)).toThrow(/no eligible/i);
  });
});

