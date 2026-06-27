import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

const indexAll = vi.fn();
const recentChanges = vi.fn();
const watch = vi.fn();
const close = vi.fn();
const ingestPath = vi.fn();

let lastMonitorInstance;

vi.mock("../src/storage/storage-monitor.js", () => ({
  StorageMonitor: vi.fn(function () {
    lastMonitorInstance = this;
    this.indexAll = indexAll;
    this.recentChanges = recentChanges;
    this.watch = watch;
    this.close = close;
    this.onIngestibleChange = null;
    return this;
  }),
}));

vi.mock("../src/llm/document-ingester.js", () => ({
  DocumentIngester: vi.fn(function () {
    this.ingestPath = ingestPath;
    return this;
  }),
}));

vi.mock("chalk", () => ({
  default: new Proxy({}, { get: () => (s) => String(s) }),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

import { bindStorageCommands } from "../src/commands/storage.js";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  bindStorageCommands(program);
  return program;
}

describe("bindStorageCommands", () => {
  let logSpy;
  let errorSpy;
  let tableSpy;
  let exitSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    lastMonitorInstance = undefined;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    process.exitCode = undefined;
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  afterEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  describe("storage watch", () => {
    it("indexes, starts watching, and registers SIGINT/SIGTERM shutdown handlers", async () => {
      indexAll.mockResolvedValue({ indexed: 5 });
      watch.mockResolvedValue(undefined);
      close.mockResolvedValue(undefined);

      await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

      expect(indexAll).toHaveBeenCalled();
      expect(watch).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("Press Ctrl+C to stop.");
      expect(process.listenerCount("SIGINT")).toBe(1);
      expect(process.listenerCount("SIGTERM")).toBe(1);
    });

    it("wires onIngestibleChange to ingest non-unlink changes and skip unlink events", async () => {
      indexAll.mockResolvedValue({ indexed: 0 });
      watch.mockResolvedValue(undefined);
      ingestPath.mockResolvedValue(undefined);

      await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

      expect(typeof lastMonitorInstance.onIngestibleChange).toBe("function");

      await lastMonitorInstance.onIngestibleChange([
        { event: "unlink", path: "/repo/deleted.md" },
        { event: "add", path: "/repo/new.md" },
        { event: "change", path: "/repo/updated.md" },
      ]);

      expect(ingestPath).toHaveBeenCalledTimes(2);
      expect(ingestPath).toHaveBeenCalledWith("/repo/new.md");
      expect(ingestPath).toHaveBeenCalledWith("/repo/updated.md");
      expect(ingestPath).not.toHaveBeenCalledWith("/repo/deleted.md");
    });

    it("calling the registered shutdown handler closes the monitor and exits", async () => {
      indexAll.mockResolvedValue({ indexed: 0 });
      watch.mockResolvedValue(undefined);
      close.mockResolvedValue(undefined);

      await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

      const [, sigintHandler] = process.listeners("SIGINT").length
        ? [null, process.listeners("SIGINT")[0]]
        : [null, null];
      expect(sigintHandler).toBeTypeOf("function");

      await sigintHandler();

      expect(close).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("reports an error and sets exitCode when indexAll() rejects", async () => {
      indexAll.mockRejectedValue(new Error("disk read error"));

      await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("disk read error");
      expect(process.exitCode).toBe(1);
      expect(watch).not.toHaveBeenCalled();
      // No shutdown handlers should be registered if we never got that far.
      expect(process.listenerCount("SIGINT")).toBe(0);
    });

    it("reports an error when watch() itself rejects", async () => {
      indexAll.mockResolvedValue({ indexed: 0 });
      watch.mockRejectedValue(new Error("EADDRINUSE"));

      await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("EADDRINUSE");
      expect(process.exitCode).toBe(1);
    });

    it("falls back to the raw thrown value when indexAll() rejects with a non-Error (line 39)", async () => {
      indexAll.mockRejectedValue("plain string failure");

      await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

      expect(errorSpy).toHaveBeenCalledWith("plain string failure");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("storage status", () => {
    it("prints 'No storage changes found.' for an empty result", async () => {
      recentChanges.mockResolvedValue([]);

      await makeProgram().parseAsync(["node", "cli", "storage", "status"]);

      expect(recentChanges).toHaveBeenCalledWith(20);
      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("No storage changes found.");
      expect(tableSpy).not.toHaveBeenCalled();
    });

    it("renders a table of recent changes when present", async () => {
      recentChanges.mockResolvedValue([
        {
          path: "/repo/file.md",
          event: "add",
          ts: "2026-01-01T00:00:00.000Z",
          ingestible: true,
        },
      ]);

      await makeProgram().parseAsync(["node", "cli", "storage", "status"]);

      expect(tableSpy).toHaveBeenCalledWith([
        {
          path: "/repo/file.md",
          event: "add",
          time: "2026-01-01T00:00:00.000Z",
          ingestible: true,
        },
      ]);
    });

    it("reports an error when recentChanges() rejects", async () => {
      recentChanges.mockRejectedValue(new Error("snapshot missing"));

      await makeProgram().parseAsync(["node", "cli", "storage", "status"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("snapshot missing");
      expect(process.exitCode).toBe(1);
    });

    it("falls back to the raw thrown value when recentChanges() rejects with a non-Error (line 67)", async () => {
      recentChanges.mockRejectedValue({ code: "EBUSY" });

      await makeProgram().parseAsync(["node", "cli", "storage", "status"]);

      expect(errorSpy).toHaveBeenCalledWith("[object Object]");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("storage index", () => {
    it("indexes and reports the count and snapshot path", async () => {
      indexAll.mockResolvedValue({
        indexed: 12,
        snapshotPath: "/repo/.vscode-rotator/storage-snapshot.json",
      });

      await makeProgram().parseAsync(["node", "cli", "storage", "index"]);

      const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("/repo/.vscode-rotator/storage-snapshot.json");
    });

    it("reports an error when indexAll() rejects", async () => {
      indexAll.mockRejectedValue(new Error("permission denied"));

      await makeProgram().parseAsync(["node", "cli", "storage", "index"]);

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0]).toContain("permission denied");
      expect(process.exitCode).toBe(1);
    });

    it("falls back to the raw thrown value when indexAll() rejects with a non-Error (line 84)", async () => {
      indexAll.mockRejectedValue(null);

      await makeProgram().parseAsync(["node", "cli", "storage", "index"]);

      expect(errorSpy).toHaveBeenCalledWith("null");
      expect(process.exitCode).toBe(1);
    });
  });
});
