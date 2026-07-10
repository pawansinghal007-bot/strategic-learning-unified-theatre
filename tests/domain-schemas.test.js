/**
 * Tests for src/domain/schemas.js
 * Focused on the exported parseAppConfig function (line 107).
 */

import { describe, it, expect } from "vitest";
import { parseAppConfig } from "../src/domain/schemas.js";

describe("parseAppConfig", () => {
  it("returns top-level defaults when called with an empty object", () => {
    const result = parseAppConfig({});

    // Concrete assertions on top-level default values
    expect(result.watchedRepos).toEqual([]);
    expect(result.gitPollIntervalMs).toBe(30000);
    expect(result.storagePaths).toEqual([]);
    expect(result.storageIndexMaxAgeDays).toBe(30);
    expect(result.browserResponsesIngest).toBe(true);
    expect(result.enhanceSchedule).toBeNull();
    expect(result.browserPaths).toEqual({});
    expect(result.platformTriggers).toEqual({});
  });

  it("applies nested VscodeLearnConfigSchema defaults when vscodeLearn is supplied as {}", () => {
    const result = parseAppConfig({ vscodeLearn: {} });

    expect(result.vscodeLearn.enabled).toBe(false);
    expect(result.vscodeLearn.stagedSignalsDir).toBeNull();
    expect(result.vscodeLearn.maxSignalAgeDays).toBe(30);
    expect(result.vscodeLearn.flushIntervalMs).toBe(30000);
    expect(result.vscodeLearn.debounceMs).toBe(600000);
    expect(result.vscodeLearn.maxFileSizeBytes).toBe(102400);
    expect(result.vscodeLearn.captureSources).toEqual([
      "diagnostic",
      "editor",
      "task",
      "git",
    ]);
  });

  it("applies nested CaptureScheduleSchema defaults when captureSchedule is supplied as {}", () => {
    const result = parseAppConfig({ captureSchedule: {} });

    expect(result.captureSchedule.enabled).toBe(false);
    expect(result.captureSchedule.intervalMs).toBe(15 * 60 * 1000);
  });

  it("preserves supplied values over defaults", () => {
    const result = parseAppConfig({
      watchedRepos: ["/repo/a", "/repo/b"],
      gitPollIntervalMs: 5000,
      browserResponsesIngest: false,
      platformTriggers: { chatgpt: "chatgpt" },
    });

    expect(result.watchedRepos).toEqual(["/repo/a", "/repo/b"]);
    expect(result.gitPollIntervalMs).toBe(5000);
    expect(result.browserResponsesIngest).toBe(false);
    expect(result.platformTriggers).toEqual({ chatgpt: "chatgpt" });
  });

  it("throws a ZodError when a field has the wrong type", () => {
    // gitPollIntervalMs must be a positive number — a string is invalid
    expect(() =>
      parseAppConfig({ gitPollIntervalMs: "not-a-number" }),
    ).toThrow();
  });
});
