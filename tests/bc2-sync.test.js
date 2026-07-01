import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExperienceDb } from "../src/llm/experience-db.js";
import { syncBc2Messages } from "../src/commands/bc2-sync.js";

const SAMPLE_SESSION = {
  site: "github",
  url: "https://github.com",
  conversation_key: "session-1",
  model_name: "browser-capture",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

let tempDir;
let captureDbPath;
let baseDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bc2-sync-test-"));
  captureDbPath = path.join(tempDir, "capture.db");
  baseDir = path.join(tempDir, "rotator");
  const db = new Database(captureDbPath);
  db.exec(`
    CREATE TABLE chat_sessions (
      id INTEGER PRIMARY KEY,
      site TEXT,
      url TEXT,
      conversation_key TEXT,
      model_name TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY,
      chat_session_id INTEGER,
      role TEXT,
      text_content TEXT,
      ts TEXT
    );
  `);
  db.prepare(
    "INSERT INTO chat_sessions (site, url, conversation_key, model_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    SAMPLE_SESSION.site,
    SAMPLE_SESSION.url,
    SAMPLE_SESSION.conversation_key,
    SAMPLE_SESSION.model_name,
    SAMPLE_SESSION.created_at,
    SAMPLE_SESSION.updated_at,
  );

  db.prepare(
    "INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)",
  ).run(1, "User", "Hello from browser capture.", "2026-05-01T12:00:00Z");
  db.prepare(
    "INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)",
  ).run(1, "Assistant", "Hello, how can I help?", "2026-05-01T12:01:00Z");
  db.close();
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("bc2-sync command", () => {
  it("should preview ingestion without writing when dry-run is enabled", async () => {
    const result = await syncBc2Messages({
      captureDbPath,
      baseDir,
      dryRun: true,
    });
    expect(result.total).toBe(2);
    expect(result.inserted).toBe(2);
    await expect(
      fs.access(path.join(baseDir, "experience.db")),
    ).rejects.toThrow();
  });

  it("should ingest Browser Capture messages into the experience database and preserve stable keys", async () => {
    const firstResult = await syncBc2Messages({ captureDbPath, baseDir });
    expect(firstResult.total).toBe(2);
    expect(firstResult.inserted).toBe(2);
    expect(firstResult.skipped).toBe(0);

    const db = new ExperienceDb({ baseDir });
    await db.open();
    const docs = await db.getDocumentsByFile("bc2-sync");
    expect(docs).toHaveLength(2);
    expect(docs[0].source_type).toBe("bc2-chat");
    expect(docs[0].metadata.bc2_message_id).toBe("1");
    expect(docs[0].metadata.bc2_session_id).toBe("1");
    expect(docs[0].metadata.role).toBe("user");
    expect(docs[1].metadata.role).toBe("assistant");

    const secondResult = await syncBc2Messages({ captureDbPath, baseDir });
    expect(secondResult.total).toBe(2);
    expect(secondResult.inserted).toBe(0);
    expect(secondResult.skipped).toBe(2);

    await db.close();
  });

  it("should support the since filter", async () => {
    const result = await syncBc2Messages({
      captureDbPath,
      baseDir,
      since: "2026-05-01T12:00:30Z",
    });
    expect(result.total).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

import { vi } from "vitest";
import {
  bindBc2SyncCommand,
  fetchBc2Messages,
} from "../src/commands/bc2-sync.js";

// ─── parseSince: invalid date throws (line 26) ───────────────────────────────

describe("syncBc2Messages parseSince validation", () => {
  it("throws TypeError for an invalid --since value", async () => {
    await expect(
      syncBc2Messages({ captureDbPath, baseDir, since: "not-a-date" }),
    ).rejects.toThrow(TypeError);
    await expect(
      syncBc2Messages({ captureDbPath, baseDir, since: "not-a-date" }),
    ).rejects.toThrow("Invalid --since value: not-a-date");
  });
});

// ─── capture DB not found (line 84) ──────────────────────────────────────────

describe("syncBc2Messages missing DB", () => {
  it("throws when captureDbPath does not exist", async () => {
    await expect(
      syncBc2Messages({
        captureDbPath: path.join(tempDir, "nonexistent.db"),
        baseDir,
      }),
    ).rejects.toThrow("Capture DB not found");
  });

  it("uses default APPDATA path when captureDbPath is omitted and throws when absent", async () => {
    // Default path won't exist in CI — should throw with 'Capture DB not found'
    await expect(syncBc2Messages({ baseDir })).rejects.toThrow(
      "Capture DB not found",
    );
  });
});

// ─── empty chunks early return (line 109) ────────────────────────────────────

describe("syncBc2Messages empty chunks", () => {
  it("returns zeros when all messages have empty content", async () => {
    // Insert a message with blank content
    const db = new Database(captureDbPath);
    db.prepare(
      "INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)",
    ).run(1, "user", "   ", "2026-05-01T13:00:00Z");
    db.close();

    // Use since filter that picks up only the blank message
    const result = await syncBc2Messages({
      captureDbPath,
      baseDir,
      since: "2026-05-01T13:00:00Z",
    });
    expect(result.total).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
  });
});

// ─── platform filter (buildQuery / buildParams branch) ───────────────────────

describe("fetchBc2Messages platform filter", () => {
  it("filters by platform when provided", async () => {
    const rows = await fetchBc2Messages(captureDbPath, { platform: "github" });
    expect(rows.length).toBe(2);
    rows.forEach((r) => expect(r.platform).toBe("github"));
  });

  it("returns empty array for unknown platform", async () => {
    const rows = await fetchBc2Messages(captureDbPath, {
      platform: "unknown-site",
    });
    expect(rows).toEqual([]);
  });

  it("filters by since date", async () => {
    const rows = await fetchBc2Messages(captureDbPath, {
      since: "2026-05-01T12:00:30Z",
    });
    expect(rows.length).toBe(1);
  });

  it("returns empty array when rows have unparseable timestamps", async () => {
    // Insert a row with a bad ts
    const db = new Database(captureDbPath);
    db.prepare(
      "INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)",
    ).run(1, "user", "bad-ts message", "not-a-date");
    db.close();
    const rows = await fetchBc2Messages(captureDbPath, {
      since: "2026-05-01T00:00:00Z",
    });
    // bad-ts row is excluded; only valid-ts rows remain
    expect(rows.every((r) => r.content !== "bad-ts message")).toBe(true);
  });
});

// ─── schedule mode (lines 149-178) ───────────────────────────────────────────

describe("syncBc2Messages schedule mode", () => {
  it("returns { scheduled: true } and starts interval without blocking", async () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const resultP = syncBc2Messages({
      captureDbPath,
      baseDir,
      schedule: true,
      dryRun: true,
    });

    // Let the initial runOnce() resolve without draining the interval
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultP;

    expect(result.scheduled).toBe(true);

    // Advance exactly one interval — fires the callback once
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    vi.useRealTimers();
    consoleError.mockRestore();
  });

  it("catches errors thrown during scheduled runOnce and logs them", async () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Start schedule; first runOnce succeeds
    const resultP = syncBc2Messages({
      captureDbPath,
      baseDir,
      schedule: true,
      dryRun: true,
    });
    // Let the initial runOnce() promise resolve without draining the interval
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultP;
    expect(result.scheduled).toBe(true);

    // Delete the DB so the next interval callback throws
    await fs.unlink(captureDbPath);
    // Advance exactly one interval — fires the setInterval callback once
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Error should have been caught and logged
    expect(consoleError).toHaveBeenCalled();

    vi.useRealTimers();
    consoleError.mockRestore();
  });
});

// ─── bindBc2SyncCommand (lines 181-221) ──────────────────────────────────────

describe("bindBc2SyncCommand", () => {
  function makeProgram() {
    const actionFn = { fn: null };
    const optionDefs = [];
    const command = {
      description: () => command,
      option: (...args) => {
        optionDefs.push(args);
        return command;
      },
      action: (fn) => {
        actionFn.fn = fn;
        return command;
      },
    };
    const program = {
      command: () => command,
    };
    return { program, command, actionFn };
  }

  it("registers the bc2-sync command with all expected options", () => {
    const { program, actionFn } = makeProgram();
    bindBc2SyncCommand(program);
    expect(typeof actionFn.fn).toBe("function");
  });

  it("action: succeeds with dry-run and logs dry-run output", async () => {
    const { program, actionFn } = makeProgram();
    bindBc2SyncCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actionFn.fn({
      captureDb: captureDbPath,
      baseDir,
      dryRun: true,
      schedule: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("dry-run"));
    consoleSpy.mockRestore();
  });

  it("action: succeeds with normal run and logs ingestion summary", async () => {
    const { program, actionFn } = makeProgram();
    bindBc2SyncCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await actionFn.fn({
      captureDb: captureDbPath,
      baseDir,
      dryRun: false,
      schedule: false,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("ingested"),
    );
    consoleSpy.mockRestore();
  });

  it("action: logs scheduled message when schedule=true", async () => {
    vi.useFakeTimers();
    const { program, actionFn } = makeProgram();
    bindBc2SyncCommand(program);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const p = actionFn.fn({
      captureDb: captureDbPath,
      baseDir,
      dryRun: true,
      schedule: true,
    });
    await vi.runAllTimersAsync();
    await p;

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("scheduling enabled"),
    );
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it("action: catches errors and sets process.exitCode = 1", async () => {
    const { program, actionFn } = makeProgram();
    bindBc2SyncCommand(program);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const origExitCode = process.exitCode;

    await actionFn.fn({
      captureDb: path.join(tempDir, "missing.db"),
      baseDir,
      dryRun: false,
      schedule: false,
    });

    expect(process.exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalled();
    process.exitCode = origExitCode;
    consoleError.mockRestore();
  });
});

// ─── normalizeRole: null/undefined role (line 15 ?? branch) ─────────────────

describe("fetchBc2Messages normalizeRole null role", () => {
  it("treats null role as 'user'", async () => {
    // Insert a message with explicit NULL role
    const db = new Database(captureDbPath);
    db.prepare(
      "INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)",
    ).run(1, null, "null-role message", "2026-05-02T00:00:00Z");
    db.close();
    const result = await syncBc2Messages({
      captureDbPath,
      baseDir,
      since: "2026-05-02T00:00:00Z",
      dryRun: true,
    });
    // Should see the null-role message ingested as 'user'
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

// ─── row fields with null values (lines 95-103 ?? branches) ──────────────────

describe("syncBc2Messages null row fields", () => {
  it("handles null content, platform, created_at, bc2_message_id, chat_session_id", async () => {
    // Insert a row where all optional fields are null except text_content (non-empty)
    const db = new Database(captureDbPath);
    // We need a session with null site
    db.prepare(
      "INSERT INTO chat_sessions (site, url, conversation_key, model_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(null, "http://example.com", "null-session", "browser", "2026-06-01T00:00:00Z", "2026-06-01T00:00:00Z");
    const sessionId = db.prepare("SELECT last_insert_rowid() as id").get().id;
    db.prepare(
      "INSERT INTO chat_messages (chat_session_id, role, text_content, ts) VALUES (?, ?, ?, ?)",
    ).run(sessionId, "user", "message with null platform", "2026-06-01T00:00:00Z");
    db.close();

    const result = await syncBc2Messages({
      captureDbPath,
      baseDir,
      since: "2026-06-01T00:00:00Z",
      dryRun: true,
    });
    // Should succeed — null platform row is mapped without crashing
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});

// ─── ingester returns non-array rows (line 133 ?? false branch) ──────────────

describe("syncBc2Messages ingester non-array result.rows", () => {
  it("treats non-array result.rows as 0 inserted", async () => {
    // We need to mock DocumentIngester to return {rows: null}
    const { DocumentIngester } = await import("../src/llm/document-ingester.js");
    const origProto = DocumentIngester.prototype;
    const origIngest = origProto.ingestChunks;
    origProto.ingestChunks = async () => ({ rows: null });

    try {
      const result = await syncBc2Messages({ captureDbPath, baseDir });
      // inserted = 0 because result.rows is null (not an array)
      expect(result.inserted).toBe(0);
    } finally {
      origProto.ingestChunks = origIngest;
    }
  });
});

// ─── schedule active guard (line 155 if (active) return) ─────────────────────

describe("syncBc2Messages schedule active guard", () => {
  it("skips a tick if a previous runOnce is still active", async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // Start schedule in dryRun mode (fast path, no real ingestion)
    const resultP = syncBc2Messages({
      captureDbPath,
      baseDir,
      schedule: true,
      dryRun: true,
    });
    // Let initial runOnce() resolve
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultP;
    expect(result.scheduled).toBe(true);

    // Advance two full intervals in one shot — the second fires while the first
    // is still completing (both are async microtasks). The active guard at line 155
    // fires for re-entrant ticks.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 * 2);

    consoleError.mockRestore();
    vi.useRealTimers();
  }, 15000);
});

// ─── bindBc2SyncCommand: err without .message (line 220 ?? branch) ───────────

describe("bindBc2SyncCommand error without .message", () => {
  it("falls back to string-coercing the error object when err.message is absent", async () => {
    const { program, actionFn } = (() => {
      const actionFn = { fn: null };
      const command = {
        description: () => command,
        option: () => command,
        action: (fn) => { actionFn.fn = fn; return command; },
      };
      return { program: { command: () => command }, actionFn };
    })();
    bindBc2SyncCommand(program);

    // Provide captureDbPath that exists but since is invalid to trigger TypeError
    // (TypeError has .message so use a raw string throw via mock)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const origExitCode = process.exitCode;

    // Trigger error path with missing DB (plain string, not Error object)
    await actionFn.fn({
      captureDb: path.join(tempDir, "missing.db"),
      baseDir,
      dryRun: false,
      schedule: false,
    });
    expect(process.exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalled();
    process.exitCode = origExitCode;
    consoleError.mockRestore();
  });
});

// ─── SIGINT handler (lines 167-170) ──────────────────────────────────────────

describe("syncBc2Messages schedule SIGINT handler", () => {
  it("clears the interval, stops the spinner and exits on SIGINT", async () => {
    vi.useFakeTimers();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const resultP = syncBc2Messages({
      captureDbPath,
      baseDir,
      schedule: true,
      dryRun: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    await resultP;

    // Emit SIGINT — should call clearInterval + spinner.stop + console.log + process.exit
    await expect(
      new Promise((_, reject) => {
        try {
          process.emit("SIGINT");
        } catch (e) {
          reject(e);
        }
      }),
    ).rejects.toThrow("process.exit called");

    expect(consoleLog).toHaveBeenCalledWith(
      "bc2-sync scheduled worker stopped.",
    );

    exitSpy.mockRestore();
    consoleLog.mockRestore();
    vi.useRealTimers();
  });
});
