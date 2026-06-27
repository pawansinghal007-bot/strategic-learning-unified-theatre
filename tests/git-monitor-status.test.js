/**
 * tests/git-monitor-status.test.js
 * Covers GitMonitor.status() lines 66-85 using the __setExecFileAsync seam.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitMonitor, __setExecFileAsync } from "../src/internal/git-monitor.js";

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

describe("GitMonitor.status() (lines 66-85)", () => {
  let monitor;

  beforeEach(() => {
    __setExecFileAsync(execFileAsync);
    monitor = new GitMonitor();
    execFileAsync.mockReset();
  });

  afterEach(() => {
    monitor.stop();
  });

  it("returns parsed summary, stash count and lastCommit (lines 66-85)", async () => {
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

  it("sets stashed=0 when git stash list throws (line 75-76)", async () => {
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

  it("uses fallback lastCommit when log line is unparseable (lines 85-89)", async () => {
    setupExecFileAsync({
      status: { stdout: "## main\n" },
      stash: { stdout: "" },
      log: { stdout: "only|two\n" },
    });

    const s = await monitor.status("/fake/repo");
    expect(s.lastCommit).toEqual({ sha: "", msg: "", date: null });
  });
});
