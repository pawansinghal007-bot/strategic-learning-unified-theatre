/**
 * tests/agents/tool-call-measurement-log.test.ts
 *
 * Unit tests for src/agents/tool-call-measurement-log.ts
 *
 * Uncovered lines targeted:
 *   14 — detectSource(): UNIFIED_AI_ENV env-var branch returns the env value directly.
 *   49 — recordToolCallForMeasurement(): eviction branch — when store exceeds
 *         MAX_ENTRIES (2000) the oldest entries are sliced off and only the
 *         newest 2000 are retained.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock storage so tests never touch the filesystem
// ---------------------------------------------------------------------------
let storedData: { entries: any[] } = { entries: [] };

vi.mock("../../src/llm/storage.js", () => ({
  readJsonFile: vi.fn((_file: string, defaultVal: any) =>
    storedData.entries.length > 0
      ? { entries: [...storedData.entries] }
      : defaultVal,
  ),
  writeJsonFile: vi.fn((_file: string, value: any) => {
    storedData = { entries: [...value.entries] };
  }),
}));

import {
  detectSource,
  recordToolCallForMeasurement,
} from "../../src/agents/tool-call-measurement-log.js";
import { readJsonFile, writeJsonFile } from "../../src/llm/storage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_ENTRY = {
  toolName: "read-file",
  args: { path: "src/foo.ts" },
  classification: "path-like" as const,
  skippedGatewayAsk: false,
};

beforeEach(() => {
  storedData = { entries: [] };
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.UNIFIED_AI_ENV;
  delete process.env.CI;
  // VITEST is always set during test runs; do not delete it here
});

// ---------------------------------------------------------------------------
// detectSource — line 14: explicit UNIFIED_AI_ENV override
// ---------------------------------------------------------------------------
describe("detectSource", () => {
  it("returns the UNIFIED_AI_ENV value directly when the env-var is set (line 14)", () => {
    // Covers the `if (env) return env` branch (line 14).
    process.env.UNIFIED_AI_ENV = "dev";
    expect(detectSource()).toBe("dev");
  });

  it('returns "production" as the UNIFIED_AI_ENV override regardless of VITEST', () => {
    // Even though VITEST is set, UNIFIED_AI_ENV takes priority.
    process.env.UNIFIED_AI_ENV = "production";
    expect(detectSource()).toBe("production");
  });

  it('returns "test" when VITEST is set and UNIFIED_AI_ENV is not set', () => {
    // VITEST env var is already set by the test runner.
    delete process.env.UNIFIED_AI_ENV;
    expect(detectSource()).toBe("test");
  });

  it('returns "ci" when CI is set and UNIFIED_AI_ENV is not set (line 15)', () => {
    // VITEST takes priority over CI — to test the CI branch we need to
    // temporarily clear VITEST. We restore it in afterEach via the env cleanup.
    delete process.env.UNIFIED_AI_ENV;
    const savedVitest = process.env.VITEST;
    delete process.env.VITEST;
    process.env.CI = "true";
    try {
      expect(detectSource()).toBe("ci");
    } finally {
      // Always restore VITEST so subsequent tests run correctly.
      if (savedVitest !== undefined) process.env.VITEST = savedVitest;
      delete process.env.CI;
    }
  });

  it('returns "production" as final fallback when no env vars are set (line 17)', () => {
    // Covers the final `return "production"` branch — requires UNIFIED_AI_ENV,
    // CI, and VITEST to all be unset.
    delete process.env.UNIFIED_AI_ENV;
    delete process.env.CI;
    const savedVitest = process.env.VITEST;
    delete process.env.VITEST;
    try {
      expect(detectSource()).toBe("production");
    } finally {
      if (savedVitest !== undefined) process.env.VITEST = savedVitest;
    }
  });
});

// ---------------------------------------------------------------------------
// recordToolCallForMeasurement — line 49: eviction when entries > MAX_ENTRIES
// ---------------------------------------------------------------------------
describe("recordToolCallForMeasurement", () => {
  it("keeps only the most recent 2000 entries when the log exceeds MAX_ENTRIES (line 49)", () => {
    // Pre-fill storedData with 2000 entries — the max allowed.
    storedData = {
      entries: Array.from({ length: 2000 }, (_, i) => ({
        toolName: "old-tool",
        args: { i: String(i) },
        classification: "synthesis",
        skippedGatewayAsk: false,
        source: "test",
        timestamp: i,
      })),
    };

    // Adding one more entry pushes the count to 2001, triggering eviction.
    recordToolCallForMeasurement(BASE_ENTRY);

    // writeJsonFile should have been called with exactly 2000 entries.
    const calls = vi.mocked(writeJsonFile).mock.calls;
    expect(calls.length).toBe(1);
    const saved: { entries: any[] } = calls[0][1] as any;
    expect(saved.entries.length).toBe(2000);

    // The oldest entry (timestamp 0) must have been dropped.
    expect(saved.entries.find((e: any) => e.timestamp === 0)).toBeUndefined();

    // The newest entry must be the one we just recorded.
    const last = saved.entries[saved.entries.length - 1];
    expect(last.toolName).toBe("read-file");
    expect(last.classification).toBe("path-like");
    expect(last.source).toBe("test");
  });

  it("does not evict when entries are within MAX_ENTRIES limit", () => {
    recordToolCallForMeasurement(BASE_ENTRY);

    const calls = vi.mocked(writeJsonFile).mock.calls;
    expect(calls.length).toBe(1);
    const saved: { entries: any[] } = calls[0][1] as any;
    expect(saved.entries.length).toBe(1);
    expect(saved.entries[0].toolName).toBe("read-file");
  });

  it("silently swallows storage errors and does not throw (best-effort guarantee)", () => {
    vi.mocked(readJsonFile).mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    // Must not propagate — the function guarantees best-effort logging only.
    expect(() => recordToolCallForMeasurement(BASE_ENTRY)).not.toThrow();
    // writeJsonFile must NOT have been called since readJsonFile threw.
    expect(vi.mocked(writeJsonFile)).not.toHaveBeenCalled();
  });
});
