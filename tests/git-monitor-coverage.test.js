/**
 * tests/git-monitor-coverage.test.js
 * Covers lines 61-148 of GitMonitor using the __setExecFileAsync seam.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GitMonitor,
  __setExecFileAsync,
  parseStatusSummary,
  parseLastCommitLine,
} from "../src/internal/git-monitor.js";

const execFileAsync = vi.fn();

function setupExecFileAsync(responses) {
  execFileAsync.mockImplementation((_cmd, args) => {
    const sub = args[0];
    const entry = responses[sub];
    if (!entry)
      return Promise.reject(new Error(`Unexpected subcommand: ${sub}`));
    if (entry.error) return Promise.reject(entry.error);
    return Promise.resolve({ stdout: entry.stdout ?? "", stderr: "" });
  });
}

describe("GitMonitor class", () => {
  let monitor;

  beforeEach(() => {
    __setExecFileAsync(execFileAsync);
    monitor = new GitMonitor();
    vi.useFakeTimers();
    execFileAsync.mockReset();
  });

  afterEach(() => {
    monitor.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("status() returns parsed summary, stash count and last commit (lines 61-99)", async () => {
    setupExecFileAsync({
      status: { stdout: "## main...origin/main [ahead 1]\n M src/foo.js\n" },
      stash: { stdout: "stash@{0}: one\nstash@{1}: two\n" },
      log: {
        stdout:
          "abc1234567890123456789012345678901234567890|Fix thing|2024-01-15 10:00:00 +0000\n",
      },
    });

    const s = await monitor.status("/fake/repo");
    expect(s.branch).toBe("main");
    expect(s.ahead).toBe(1);
    expect(s.uncommitted).toBe(1);
    expect(s.stashed).toBe(2);
    expect(s.lastCommit.msg).toBe("Fix thing");
  });

  it("status() sets stashed=0 when git stash list throws (line 76)", async () => {
    setupExecFileAsync({
      status: { stdout: "## main\n" },
      stash: { error: new Error("stash unavailable") },
      log: {
        stdout:
          "abc1234567890123456789012345678901234567890|msg|2024-01-15 10:00:00 +0000\n",
      },
    });

    const s = await monitor.status("/fake/repo");
    expect(s.stashed).toBe(0);
  });

  it("status() uses fallback lastCommit when log line has too few parts (lines 85-89)", async () => {
    setupExecFileAsync({
      status: { stdout: "## main\n" },
      stash: { stdout: "" },
      log: { stdout: "only|two\n" },
    });

    const s = await monitor.status("/fake/repo");
    expect(s.lastCommit).toEqual({ sha: "", msg: "", date: null });
  });

  it("hasUncommitted() returns true when uncommitted > 0 (line 103)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 1,
      ahead: 0,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    expect(await monitor.hasUncommitted("/repo")).toBe(true);
  });

  it("hasUncommitted() returns false when uncommitted === 0 (line 103)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 0,
      ahead: 0,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    expect(await monitor.hasUncommitted("/repo")).toBe(false);
  });

  it("hasPendingPush() returns true when ahead > 0 (line 108)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 0,
      ahead: 2,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    expect(await monitor.hasPendingPush("/repo")).toBe(true);
  });

  it("hasPendingPush() returns false when ahead === 0 (line 108)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 0,
      ahead: 0,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    expect(await monitor.hasPendingPush("/repo")).toBe(false);
  });

  it("watchAll() treats non-array repoPaths as empty repos (line 112)", () => {
    monitor.watchAll("not-an-array", 2000);
    expect(monitor.timer).not.toBeNull();
  });

  it("watchAll() filters non-string entries from repoPaths (line 112)", () => {
    monitor.watchAll(["/valid", 42, null, "/also-valid"], 1000);
    expect(monitor.timer).not.toBeNull();
  });

  it("watchAll() defaults interval to 1000ms when intervalMs is 0 (line 113)", () => {
    monitor.watchAll([], 0);
    expect(monitor.timer).not.toBeNull();
  });

  it("watchAll() clears existing timer before starting a new one (line 136)", () => {
    monitor.watchAll([], 5000);
    const first = monitor.timer;
    monitor.watchAll([], 5000);
    expect(monitor.timer).not.toBeNull();
    expect(monitor.timer).not.toBe(first);
  });

  it("watchAll() tick emits warn with 'uncommitted changes' (lines 120-122)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 1,
      ahead: 0,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    const warnings = [];
    monitor.on("warn", (w) => warnings.push(w));
    monitor.watchAll(["/repo"], 1000);
    await vi.runOnlyPendingTimersAsync();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe("uncommitted changes");
    expect(warnings[0].repoPath).toBe("/repo");
  });

  it("watchAll() tick emits warn with 'pending push' when ahead > 0 (line 123)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 0,
      ahead: 2,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    const warnings = [];
    monitor.on("warn", (w) => warnings.push(w));
    monitor.watchAll(["/repo"], 1000);
    await vi.runOnlyPendingTimersAsync();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toBe("pending push");
  });

  it("watchAll() tick emits no warn when repo is clean (line 119)", async () => {
    vi.spyOn(monitor, "status").mockResolvedValue({
      uncommitted: 0,
      ahead: 0,
      behind: 0,
      branch: "main",
      stashed: 0,
      lastCommit: {},
    });
    const warnings = [];
    monitor.on("warn", (w) => warnings.push(w));
    monitor.watchAll(["/repo"], 1000);
    await vi.runOnlyPendingTimersAsync();
    expect(warnings).toHaveLength(0);
  });

  it("watchAll() tick emits warn with error reason when status() throws (lines 127-131)", async () => {
    vi.spyOn(monitor, "status").mockRejectedValue(new Error("git not found"));
    const warnings = [];
    monitor.on("warn", (w) => warnings.push(w));
    monitor.watchAll(["/bad-repo"], 1000);
    await vi.runOnlyPendingTimersAsync();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].status).toBeNull();
    expect(warnings[0].reason).toBe("git not found");
  });

  it("stop() clears the interval timer (lines 145-148)", () => {
    monitor.watchAll([], 2000);
    expect(monitor.timer).not.toBeNull();
    monitor.stop();
    expect(monitor.timer).toBeNull();
  });

  it("stop() is a no-op when timer is already null (line 145)", () => {
    expect(monitor.timer).toBeNull();
    expect(() => monitor.stop()).not.toThrow();
    expect(monitor.timer).toBeNull();
  });

  // ---- parseStatusSummary edge cases (branch coverage) ----

  it("parseStatusSummary empty string hits lines[0] ?? '' fallback (BRDA:17,0,1,0)", () => {
    const s = parseStatusSummary("");
    expect(s.branch).toBe("");
    expect(s.uncommitted).toBe(0);
  });

  it("parseStatusSummary '## ' hits parts[0] ?? '' fallback (BRDA:24,1,1,0)", () => {
    const s = parseStatusSummary("## \n");
    expect(s.branch).toBe("");
    expect(s.uncommitted).toBe(0);
  });

  it("parseStatusSummary with '[' but no ']' hits indexOf -1 path (BRDA:28,3,1,0)", () => {
    const s = parseStatusSummary("## main [no-closing-bracket\n M file.js\n");
    expect(s.branch).toBe("main");
    expect(s.ahead).toBe(0);
    expect(s.behind).toBe(0);
    expect(s.uncommitted).toBe(1);
  });

  it("parseStatusSummary non-## line hits branch ?? '' fallback (BRDA:42,7,1,0)", () => {
    const s = parseStatusSummary("M file.js\n D other.ts\n");
    expect(s.branch).toBe("");
    expect(s.uncommitted).toBe(2);
  });

  // ---- parseLastCommitLine edge cases (branch coverage) ----

  it("parseLastCommitLine(null) hits String(line ?? '') fallback (BRDA:50,9,1,0)", () => {
    const r = parseLastCommitLine(null);
    expect(r).toBeNull();
  });

  it("parseLastCommitLine short line hits parts.length < 3 (BRDA:51,10,1,0)", () => {
    const r = parseLastCommitLine("only|two");
    expect(r).toBeNull();
  });

  it("parseLastCommitLine invalid date hits Number.isFinite false path (BRDA:52,11,1,0)", () => {
    const r = parseLastCommitLine("abc123|Fix thing|not-a-date");
    expect(r.sha).toBe("abc123");
    expect(r.msg).toBe("Fix thing");
    expect(r.date).toBeNull();
  });
});
