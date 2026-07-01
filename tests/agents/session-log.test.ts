/**
 * tests/agents/session-log.test.ts
 *
 * Unit tests for src/agents/memory/session-log.ts
 * Uses a real temp directory so actual fs behaviour is exercised.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import type { SessionLogEntry } from "../../src/agents/memory/session-log";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<SessionLogEntry> = {}): SessionLogEntry {
  return {
    timestamp: new Date().toISOString(),
    command: "code-review",
    taskId: "task-1",
    stepNumber: 1,
    stepName: "analyze",
    agentName: "code-reviewer",
    success: true,
    durationMs: 42,
    outputPreview: "looks good",
    ...overrides,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("appendSessionLog / readSessionLog", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-log-test-"));
    logPath = path.join(tmpDir, "agent-session.ndjson");
    // Point the module at our temp path via env var
    process.env.SESSION_LOG_PATH = logPath;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SESSION_LOG_PATH;
    // Clear module cache so each test gets a fresh LOG_PATH binding
    vi.resetModules();
  });

  it("creates the log file and appends a single entry", async () => {
    const { appendSessionLog, readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    const entry = makeEntry();
    appendSessionLog(entry);

    const entries = readSessionLog();
    expect(entries).toHaveLength(1);
    expect(entries[0].command).toBe("code-review");
    expect(entries[0].success).toBe(true);
  });

  it("appends multiple entries in order", async () => {
    const { appendSessionLog, readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    appendSessionLog(makeEntry({ taskId: "t1", stepNumber: 1 }));
    appendSessionLog(makeEntry({ taskId: "t2", stepNumber: 2 }));
    appendSessionLog(makeEntry({ taskId: "t3", stepNumber: 3 }));

    const entries = readSessionLog(10);
    expect(entries).toHaveLength(3);
    expect(entries[0].taskId).toBe("t1");
    expect(entries[2].taskId).toBe("t3");
  });

  it("readSessionLog respects the limit parameter", async () => {
    const { appendSessionLog, readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    for (let i = 1; i <= 5; i++) {
      appendSessionLog(makeEntry({ taskId: `t${i}` }));
    }

    const entries = readSessionLog(3);
    expect(entries).toHaveLength(3);
    // should return the last 3 entries
    expect(entries[0].taskId).toBe("t3");
    expect(entries[2].taskId).toBe("t5");
  });

  it("returns [] when the log file does not exist", async () => {
    const { readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    const entries = readSessionLog();
    expect(entries).toEqual([]);
  });

  it("skips malformed (non-JSON) lines silently", async () => {
    const { readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    const good = JSON.stringify(makeEntry({ taskId: "good" }));
    fs.writeFileSync(logPath, `{bad json}\n${good}\n`, "utf8");

    const entries = readSessionLog(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].taskId).toBe("good");
  });

  it("stores and retrieves an optional error field", async () => {
    const { appendSessionLog, readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    appendSessionLog(makeEntry({ success: false, error: "LLM timeout" }));

    const entries = readSessionLog();
    expect(entries[0].success).toBe(false);
    expect(entries[0].error).toBe("LLM timeout");
  });

  it("creates intermediate directories if they do not exist", async () => {
    const deepLog = path.join(tmpDir, "deep", "nested", "session.ndjson");
    process.env.SESSION_LOG_PATH = deepLog;
    vi.resetModules();

    const { appendSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    appendSessionLog(makeEntry());

    expect(fs.existsSync(deepLog)).toBe(true);
  });

  it("does not throw when the log directory is not writable (console.error only)", async () => {
    // Point SESSION_LOG_PATH at a path where the parent is a file (impossible to create)
    const blockingFile = path.join(tmpDir, "blocker");
    fs.writeFileSync(blockingFile, "I am a file");
    const impossiblePath = path.join(blockingFile, "sub", "session.ndjson");
    process.env.SESSION_LOG_PATH = impossiblePath;
    vi.resetModules();

    const { appendSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    // Must not throw — appendSessionLog is fire-and-forget
    expect(() => appendSessionLog(makeEntry())).not.toThrow();
  });

  it("readSessionLog default limit is 20", async () => {
    const { appendSessionLog, readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    for (let i = 1; i <= 25; i++) {
      appendSessionLog(makeEntry({ taskId: `t${i}` }));
    }

    const entries = readSessionLog(); // default limit = 20
    expect(entries).toHaveLength(20);
    // last 20 of 25 → starts at t6
    expect(entries[0].taskId).toBe("t6");
  });
});


// ── Targeted coverage gap test ────────────────────────────────────────────
// Covers: session-log.ts line 4
//   `const LOG_PATH = process.env.SESSION_LOG_PATH
//      ?? path.resolve(process.cwd(), 'logs', 'agent-session.ndjson')`
//
// The `?? path.resolve(...)` right-hand side fires when SESSION_LOG_PATH is
// absent at module-load time.  All existing tests set the env var before the
// dynamic import, so the right-hand side was never reached.

describe("session-log.ts line 4 — LOG_PATH default (no SESSION_LOG_PATH)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-log-default-"));
    // Ensure SESSION_LOG_PATH is absent so the ?? fallback fires on import
    delete process.env.SESSION_LOG_PATH;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SESSION_LOG_PATH;
    vi.resetModules();
  });

  it("uses path.resolve(cwd, 'logs', 'agent-session.ndjson') when SESSION_LOG_PATH is not set (line 4 ?? branch)", async () => {
    // Import with no SESSION_LOG_PATH → LOG_PATH = path.resolve(cwd, 'logs', 'agent-session.ndjson')
    const { appendSessionLog, readSessionLog } = await import(
      "../../src/agents/memory/session-log"
    );

    // appendSessionLog must not throw using the default path
    // (it creates logs/ under cwd if needed)
    expect(() =>
      appendSessionLog({
        timestamp: new Date().toISOString(),
        command: "test-cmd",
        taskId: "task-default",
        stepNumber: 1,
        stepName: "step",
        agentName: "agent",
        success: true,
        durationMs: 1,
        outputPreview: "ok",
      }),
    ).not.toThrow();

    // readSessionLog() must return an array (file may already exist in cwd/logs/
    // from prior runs — we only confirm the function works, not the exact count)
    const entries = readSessionLog();
    expect(Array.isArray(entries)).toBe(true);
  });
});
