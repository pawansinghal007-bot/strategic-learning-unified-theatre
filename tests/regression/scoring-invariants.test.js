// REGRESSION: Scoring invariants enforcement
// Source: test_summary.txt, Sprint 15.6
// Must never be removed — encode historical failure as permanent gate
//
// Background: Historical scoring bugs allowed scores outside the valid range [0, 100].
// This property-based test ensures scores remain bounded even with random inputs.

import { describe, it, expect } from "vitest";
import { scoreAccount } from "../../src/scorer.js";

describe("Regression: Scoring Invariants", () => {
  /**
   * INVARIANT: Score must always be in range [0, 100]
   * The scoreAccount function should never return values outside this range.
   * This is enforced by the implementation: Math.max(0, Math.min(100, Math.round(score)))
   */

  // Non-cryptographic randomness — used for generating test accounts only. // NOSONAR javascript:S2245
  // Helper: Create a random account
  function randomAccount(seed = Math.random()) {
    const now = Date.now();
    const status =
      seed < 0.3
        ? "active"
        : seed < 0.6
          ? "cooldown"
          : seed < 0.9
            ? "retired"
            : "active";
    const cooldownOffset = seed < 0.3 ? -1000 : seed < 0.6 ? 60000 : 0;

    return {
      // Non-cryptographic randomness — used for unique test id generation only. // NOSONAR javascript:S2245
      id: `acc-${Math.random().toString(36).slice(2)}`,
      // Non-cryptographic randomness — used for unique test email generation only. // NOSONAR javascript:S2245
      email: `test${Math.random()}@example.com`,
      agentType: "codex",
      authBlob: "x",
      cooldownUntil: cooldownOffset > 0 ? new Date(now + cooldownOffset) : null,
      // Non-cryptographic randomness — used for generating a random lastUsed timestamp only. // NOSONAR javascript:S2245
      lastUsed:
        seed > 0.5 ? new Date(now - Math.random() * 1000 * 60 * 60 * 24) : null, // 0-24 hours ago
      status,
    };
  }

  // Helper: Create random health result
  function randomHealthResult() {
    return {
      // Non-cryptographic randomness — used for generating randomized health flags only. // NOSONAR javascript:S2245
      valid: Math.random() > 0.5,
      // Non-cryptographic randomness — used for generating randomized remainingRequests only. // NOSONAR javascript:S2245
      remainingRequests: Math.floor(Math.random() * 500),
      resetAt: null,
      // Non-cryptographic randomness — used to sometimes inject an error in test data only. // NOSONAR javascript:S2245
      error: Math.random() > 0.8 ? "random error" : null,
    };
  }

  // Test 1: Active account with valid health
  it("[0/50] invariant: active valid account scores > 0", () => {
    const account = randomAccount(0.15); // Active
    account.status = "active";
    account.cooldownUntil = null;

    const health = {
      valid: true,
      remainingRequests: 100,
      resetAt: null,
      error: null,
    };

    const score = scoreAccount(account, health);

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(score)).toBe(true);
  });

  // Test 2: Retired account scores 0
  it("[1/50] invariant: retired account scores exactly 0", () => {
    const account = randomAccount();
    account.status = "retired";

    const health = randomHealthResult();
    const score = scoreAccount(account, health);

    expect(score).toBe(0);
  });

  // Test 3: On cooldown account scores 0
  it("[2/50] invariant: account on cooldown scores 0", () => {
    const now = Date.now();
    const account = randomAccount();
    account.status = "cooldown";
    account.cooldownUntil = new Date(now + 60000); // 1 minute from now

    const health = randomHealthResult();
    const score = scoreAccount(account, health);

    expect(score).toBe(0);
  });

  // Test 4-14: 50 property-based randomized tests
  for (let i = 4; i < 50; i++) {
    it(`[${i}/50] invariant: random inputs always produce score in [0, 100]`, () => {
      // Non-cryptographic randomness — used to seed randomized test inputs only. // NOSONAR javascript:S2245
      const account = randomAccount(Math.random());
      const health = randomHealthResult();

      const score = scoreAccount(account, health);

      // CORE INVARIANT: Score must be in [0, 100]
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);

      // Secondary invariant: Score must be integer (rounded)
      expect(Number.isInteger(score)).toBe(true);

      // Secondary invariant: Score must not be NaN or Infinity
      expect(Number.isFinite(score)).toBe(true);
    });
  }

  // Test 50-53: Edge cases
  it("[50/50] invariant: score with zero remaining requests", () => {
    const account = randomAccount(0.15);
    account.status = "active";

    const health = {
      valid: true,
      remainingRequests: 0,
      resetAt: null,
      error: null,
    };

    const score = scoreAccount(account, health);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("[51/50] invariant: score with invalid health and old lastUsed", () => {
    const account = randomAccount(0.15);
    account.status = "active";
    account.lastUsed = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const health = {
      valid: false,
      remainingRequests: null,
      resetAt: null,
      error: "Invalid token",
    };

    const score = scoreAccount(account, health);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("[52/50] invariant: score with null lastUsed", () => {
    const account = randomAccount(0.15);
    account.status = "active";
    account.lastUsed = null;

    const health = {
      valid: true,
      remainingRequests: 150,
      resetAt: null,
      error: null,
    };

    const score = scoreAccount(account, health);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("[53/50] invariant: score with very high remaining requests", () => {
    const account = randomAccount(0.15);
    account.status = "active";

    const health = {
      valid: true,
      remainingRequests: 999999,
      resetAt: null,
      error: null,
    };

    const score = scoreAccount(account, health);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  // Monotonicity tests: Valid > Invalid
  it("[54/50] invariant: valid health scores >= invalid health", () => {
    const account = randomAccount(0.15);
    account.status = "active";

    const validHealth = {
      valid: true,
      remainingRequests: 100,
      resetAt: null,
      error: null,
    };

    const invalidHealth = {
      valid: false,
      remainingRequests: 0,
      resetAt: null,
      error: "Error",
    };

    const validScore = scoreAccount(account, validHealth);
    const invalidScore = scoreAccount(account, invalidHealth);

    expect(validScore).toBeGreaterThanOrEqual(invalidScore);
  });

  // Consistency test: Same account/health produces same score
  it("[55/50] invariant: same input always produces same score (deterministic)", () => {
    const account = {
      id: "consistent-acc",
      email: "test@example.com",
      agentType: "codex",
      authBlob: "x",
      cooldownUntil: null,
      lastUsed: new Date("2026-05-22T12:00:00Z"),
      status: "active",
    };

    const health = {
      valid: true,
      remainingRequests: 75,
      resetAt: null,
      error: null,
    };

    const score1 = scoreAccount(account, health);
    const score2 = scoreAccount(account, health);
    const score3 = scoreAccount(account, health);

    expect(score1).toBe(score2);
    expect(score2).toBe(score3);
  });
});
