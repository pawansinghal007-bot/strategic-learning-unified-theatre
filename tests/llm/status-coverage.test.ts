/**
 * status-coverage.test.ts
 *
 * Targets uncovered lines in src/llm/status.ts:
 *   23 — recoversInMinutes calculation:
 *          • rec.recoversAt is set + diffMs > 0 → returns Math.round(diffMs / 60000)
 *          • rec.recoversAt is set + diffMs <= 0  → returns 0
 *        Both branches are tested here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock provider-health, provider-usage to control what the status module sees
// ---------------------------------------------------------------------------
vi.mock("../../src/llm/provider-health.js", () => ({
  getProviderHealthSnapshot: vi.fn(() => []),
  isProviderAvailable: vi.fn(() => true),
  resetProviderHealth: vi.fn(),
}));

vi.mock("../../src/llm/provider-usage.js", () => ({
  getProviderUsage: vi.fn(() => []),
  resetProviderUsage: vi.fn(),
}));

import {
  getProviderStatus,
  resetProviderStatus,
  resetAllProviderTelemetry,
} from "../../src/llm/status.js";
import {
  getProviderHealthSnapshot,
  isProviderAvailable,
  resetProviderHealth,
} from "../../src/llm/provider-health.js";
import {
  getProviderUsage,
  resetProviderUsage,
} from "../../src/llm/provider-usage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setHealthSnapshot(records: any[]) {
  vi.mocked(getProviderHealthSnapshot).mockReturnValue(records);
}

function setUsageRows(rows: any[]) {
  vi.mocked(getProviderUsage).mockReturnValue(rows);
}

function setProviderAvailable(available: boolean) {
  vi.mocked(isProviderAvailable).mockReturnValue(available);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProviderHealthSnapshot).mockReturnValue([]);
  vi.mocked(getProviderUsage).mockReturnValue([]);
  vi.mocked(isProviderAvailable).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// recoversInMinutes — line 23
// ---------------------------------------------------------------------------
describe("getProviderStatus — recoversInMinutes calculation (line 23)", () => {
  it("returns positive minutes when recoversAt is in the future", () => {
    const futureMs = Date.now() + 30 * 60 * 1000; // 30 min from now
    setHealthSnapshot([
      {
        provider: "groq",
        state: "temporarily_down",
        reason: "Timeout",
        since: Date.now() - 1000,
        recoversAt: futureMs,
      },
    ]);

    const statuses = getProviderStatus();
    const groqStatus = statuses.find((s) => s.name === "groq");

    expect(groqStatus).toBeDefined();
    expect(typeof groqStatus!.recoversInMinutes).toBe("number");
    expect(groqStatus!.recoversInMinutes).toBeGreaterThan(0);
    // Should be ~30 minutes (within rounding tolerance)
    expect(groqStatus!.recoversInMinutes).toBeGreaterThanOrEqual(29);
    expect(groqStatus!.recoversInMinutes).toBeLessThanOrEqual(31);
  });

  it("returns 0 when recoversAt is exactly now (diffMs === 0)", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    setHealthSnapshot([
      {
        provider: "groq",
        state: "temporarily_down",
        reason: "Timeout",
        since: now - 5 * 60 * 1000,
        recoversAt: now, // exactly now → diffMs = 0 → recoversInMinutes = 0
      },
    ]);

    const statuses = getProviderStatus();
    const groqStatus = statuses.find((s) => s.name === "groq");

    expect(groqStatus!.recoversInMinutes).toBe(0);
  });

  it("returns 0 when recoversAt is in the past (diffMs < 0, line 23 branch)", () => {
    const pastMs = Date.now() - 10 * 60 * 1000; // 10 min ago
    setHealthSnapshot([
      {
        provider: "openai",
        state: "temporarily_down",
        reason: "503",
        since: Date.now() - 15 * 60 * 1000,
        recoversAt: pastMs, // already passed → diffMs < 0 → 0
      },
    ]);

    const statuses = getProviderStatus();
    const openaiStatus = statuses.find((s) => s.name === "openai");

    expect(openaiStatus!.recoversInMinutes).toBe(0);
  });

  it("returns null when rec is undefined (no health record for provider)", () => {
    setHealthSnapshot([]); // no records

    const statuses = getProviderStatus();
    const groqStatus = statuses.find((s) => s.name === "groq");

    expect(groqStatus!.recoversInMinutes).toBeNull();
  });

  it("returns null when rec.recoversAt is undefined", () => {
    setHealthSnapshot([
      {
        provider: "gemini",
        state: "auth_error",
        reason: "Bad key",
        since: Date.now(),
        recoversAt: undefined, // no recoversAt → recoversInMinutes stays null
      },
    ]);

    const statuses = getProviderStatus();
    const geminiStatus = statuses.find((s) => s.name === "gemini");

    expect(geminiStatus!.recoversInMinutes).toBeNull();
  });

  it("correctly rounds fractional minutes", () => {
    const diffMs = 90500; // 1.508... minutes → rounds to 2
    const futureMs = Date.now() + diffMs;
    setHealthSnapshot([
      {
        provider: "groq",
        state: "temporarily_down",
        reason: "Lag",
        since: Date.now() - 1000,
        recoversAt: futureMs,
      },
    ]);

    const statuses = getProviderStatus();
    const groqStatus = statuses.find((s) => s.name === "groq");

    // Math.round(90500 / 60000) = Math.round(1.508) = 2
    expect(groqStatus!.recoversInMinutes).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getProviderStatus — full shape of returned objects
// ---------------------------------------------------------------------------
describe("getProviderStatus — returned object shape", () => {
  it("returns all 5 known providers", () => {
    const statuses = getProviderStatus();
    const names = statuses.map((s) => s.name);
    expect(names).toContain("groq");
    expect(names).toContain("gemini");
    expect(names).toContain("openai");
    expect(names).toContain("perplexity");
    expect(names).toContain("local");
  });

  it("includes usage fields from getProviderUsage", () => {
    setUsageRows([
      {
        provider: "groq",
        requestCount: 10,
        successCount: 9,
        failureCount: 1,
        totalTokens: 5000,
        estimatedCostUsd: 0.25,
      },
    ]);

    const statuses = getProviderStatus();
    const groqStatus = statuses.find((s) => s.name === "groq");

    expect(groqStatus!.requestCount).toBe(10);
    expect(groqStatus!.successCount).toBe(9);
    expect(groqStatus!.failureCount).toBe(1);
    expect(groqStatus!.totalTokens).toBe(5000);
    expect(groqStatus!.estimatedCostUsd).toBe(0.25);
  });

  it("defaults to 0 for usage fields when no usage row exists", () => {
    setUsageRows([]);
    const statuses = getProviderStatus();
    for (const status of statuses) {
      expect(status.requestCount).toBe(0);
      expect(status.successCount).toBe(0);
      expect(status.failureCount).toBe(0);
      expect(status.totalTokens).toBe(0);
      expect(status.estimatedCostUsd).toBe(0);
    }
  });

  it("sets state to 'unknown' when no health record exists for provider", () => {
    setHealthSnapshot([]);
    const statuses = getProviderStatus();
    for (const status of statuses.filter((s) => s.name !== "local")) {
      expect(status.state).toBe("unknown");
    }
  });

  it("sets available=false when isProviderAvailable returns false", () => {
    setProviderAvailable(false);
    const statuses = getProviderStatus();
    for (const status of statuses) {
      // available = hasKey && isProviderAvailable()
      // For local, hasKey=true always; for others, depends on env API keys
      // Since isProviderAvailable is mocked to false, available should be false
      expect(status.available).toBe(false);
    }
  });

  it("sets hasKey=true for local provider (no API key required)", () => {
    const statuses = getProviderStatus();
    const localStatus = statuses.find((s) => s.name === "local");
    expect(localStatus!.hasKey).toBe(true);
  });

  it("includes reason from health record", () => {
    setHealthSnapshot([
      {
        provider: "openai",
        state: "auth_error",
        reason: "Invalid API key",
        since: Date.now(),
        recoversAt: undefined,
      },
    ]);

    const statuses = getProviderStatus();
    const openaiStatus = statuses.find((s) => s.name === "openai");
    expect(openaiStatus!.reason).toBe("Invalid API key");
    expect(openaiStatus!.state).toBe("auth_error");
  });
});

// ---------------------------------------------------------------------------
// resetProviderStatus
// ---------------------------------------------------------------------------
describe("resetProviderStatus", () => {
  it("delegates to resetProviderHealth with the given provider", () => {
    resetProviderStatus("groq");
    expect(vi.mocked(resetProviderHealth)).toHaveBeenCalledWith("groq");
  });

  it("can be called with undefined to reset all", () => {
    resetProviderStatus(undefined as any);
    expect(vi.mocked(resetProviderHealth)).toHaveBeenCalledWith(undefined);
  });
});

// ---------------------------------------------------------------------------
// resetAllProviderTelemetry
// ---------------------------------------------------------------------------
describe("resetAllProviderTelemetry", () => {
  it("calls both resetProviderHealth and resetProviderUsage", () => {
    resetAllProviderTelemetry("gemini");
    expect(vi.mocked(resetProviderHealth)).toHaveBeenCalledWith("gemini");
    expect(vi.mocked(resetProviderUsage)).toHaveBeenCalledWith("gemini");
  });
});
