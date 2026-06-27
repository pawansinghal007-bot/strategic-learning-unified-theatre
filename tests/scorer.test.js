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
    ...overrides,
  };
}

describe("scoreAccount", () => {
  it("scores valid accounts higher than invalid", () => {
    const a = mkAccount({ id: "a" });
    const valid = scoreAccount(a, {
      valid: true,
      remainingRequests: 50,
      resetAt: null,
      error: null,
    });
    const invalid = scoreAccount(a, {
      valid: false,
      remainingRequests: null,
      resetAt: null,
      error: "bad token",
    });
    expect(valid).toBeGreaterThan(invalid);
  });

  it("forces cooldown/retired accounts to be very low", () => {
    const now = Date.now();
    const cooldown = mkAccount({
      status: "cooldown",
      cooldownUntil: new Date(now + 60_000),
    });
    const retired = mkAccount({ status: "retired" });

    const h = {
      valid: true,
      remainingRequests: 100,
      resetAt: null,
      error: null,
    };
    expect(scoreAccount(cooldown, h)).toBeLessThanOrEqual(0);
    expect(scoreAccount(retired, h)).toBeLessThanOrEqual(0);
  });

  it("accepts Date objects for lastUsed and cooldownUntil", () => {
    const now = Date.now();
    const dateAccount = mkAccount({
      id: "date-account",
      lastUsed: new Date(now - 1000),
    });
    const cooldownDateAccount = mkAccount({
      id: "cooldown-date-account",
      status: "active",
      cooldownUntil: new Date(now + 60_000),
    });

    expect(
      scoreAccount(dateAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(100);
    expect(
      scoreAccount(cooldownDateAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(0);
  });

  it("handles string dates and invalid dates for lastUsed/cooldownUntil", () => {
    const now = Date.now();
    const stringDateAccount = mkAccount({
      id: "string-date",
      lastUsed: new Date(now - 60 * 60 * 1000).toISOString(),
    });
    const dateObjectAccount = mkAccount({
      id: "date-object",
      lastUsed: new Date(now - 60 * 60 * 1000),
    });
    const invalidDateAccount = mkAccount({
      id: "invalid-date",
      lastUsed: "not-a-date",
    });
    const cooldownStringAccount = mkAccount({
      id: "cooldown-string",
      status: "active",
      cooldownUntil: new Date(now + 60_000).toISOString(),
    });
    const cooldownDateAccount = mkAccount({
      id: "cooldown-date",
      status: "active",
      cooldownUntil: new Date(now + 60_000),
    });

    expect(
      scoreAccount(stringDateAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(99);

    expect(
      scoreAccount(dateObjectAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(99);

    expect(
      scoreAccount(invalidDateAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(80);

    expect(
      scoreAccount(cooldownStringAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(0);

    expect(
      scoreAccount(cooldownDateAccount, {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      }),
    ).toBe(0);
  });
});

describe("pickBest", () => {
  it("throws when all accounts are on cooldown or retired", () => {
    const now = Date.now();
    const accounts = [
      mkAccount({
        id: "a",
        status: "cooldown",
        cooldownUntil: new Date(now + 60_000),
      }),
      mkAccount({ id: "b", status: "retired" }),
    ];
    const healthMap = new Map(
      accounts.map((a) => [
        a.id,
        { valid: true, remainingRequests: 100, resetAt: null, error: null },
      ]),
    );

    expect(() => pickBest(accounts, healthMap)).toThrow(/no eligible/i);
  });

  it("selects the best eligible account when healthMap is a Map", () => {
    const now = Date.now();
    const a = mkAccount({ id: "a", lastUsed: "not-a-date" });
    const b = mkAccount({
      id: "b",
      lastUsed: new Date(now - 60 * 60 * 1000).toISOString(),
    });
    const healthMap = new Map([
      [
        "a",
        { valid: false, remainingRequests: 0, resetAt: null, error: "bad" },
      ],
      [
        "b",
        { valid: true, remainingRequests: 100, resetAt: null, error: null },
      ],
    ]);

    expect(pickBest([a, b], healthMap).id).toBe("b");
  });

  it("selects the best eligible account when healthMap is a plain object and missing health defaults to invalid", () => {
    const now = Date.now();
    const a = mkAccount({
      id: "a",
      lastUsed: new Date(now - 60 * 60 * 1000).toISOString(),
    });
    const b = mkAccount({ id: "b", lastUsed: "not-a-date" });
    const healthMap = {
      a: { valid: true, remainingRequests: 100, resetAt: null, error: null },
    };

    expect(pickBest([a, b], healthMap).id).toBe("a");
  });
});
