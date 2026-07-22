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

vi.mock("../src/knowledge/ingest/ingest-repository.js", () => {
  return {
    ingestRepository: vi.fn(),
  };
});

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
import { ingestRepository } from "../src/knowledge/ingest/ingest-repository.js";

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut() {}, writeErr() {} });
  bindStorageCommands(program);
  return program;
}

describe("storage watch with Qdrant re-indexing", () => {
  let logSpy;
  let errorSpy;
  let warnSpy;
  let exitSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    lastMonitorInstance = undefined;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    process.exitCode = undefined;
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  afterEach(() => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("calls ingestRepository exactly once per onIngestibleChange invocation with {baseDir: process.cwd()}", async () => {
    indexAll.mockResolvedValue({ indexed: 0 });
    watch.mockResolvedValue(undefined);
    ingestPath.mockResolvedValue(undefined);
    ingestRepository.mockResolvedValue(undefined);

    await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

    expect(typeof lastMonitorInstance.onIngestibleChange).toBe("function");

    await lastMonitorInstance.onIngestibleChange([
      { event: "unlink", path: "/repo/deleted.md" },
      { event: "add", path: "/repo/new.md" },
      { event: "change", path: "/repo/updated.md" },
    ]);

    // ingestPath should still be called twice (for the non-unlink items)
    expect(ingestPath).toHaveBeenCalledTimes(2);
    expect(ingestPath).toHaveBeenCalledWith("/repo/new.md");
    expect(ingestPath).toHaveBeenCalledWith("/repo/updated.md");

    // ingestRepository should be called exactly once with {baseDir: process.cwd()}
    expect(ingestRepository).toHaveBeenCalledTimes(1);
    expect(ingestRepository).toHaveBeenCalledWith({ baseDir: process.cwd() });
  });

  it("does not throw when ingestRepository rejects, but ingestPath still completes for all non-unlink files", async () => {
    indexAll.mockResolvedValue({ indexed: 0 });
    watch.mockResolvedValue(undefined);
    ingestPath.mockResolvedValue(undefined);
    ingestRepository.mockRejectedValue(new Error("Qdrant connection failed"));

    await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

    // Should not throw when invoking the handler
    let threw = false;
    try {
      await lastMonitorInstance.onIngestibleChange([
        { event: "unlink", path: "/repo/deleted.md" },
        { event: "add", path: "/repo/new.md" },
        { event: "change", path: "/repo/updated.md" },
      ]);
    } catch (e) {
      threw = true;
    }

    expect(threw).toBe(false);

    // ingestPath should still be called for both non-unlink files
    expect(ingestPath).toHaveBeenCalledTimes(2);
    expect(ingestPath).toHaveBeenCalledWith("/repo/new.md");
    expect(ingestPath).toHaveBeenCalledWith("/repo/updated.md");

    // ingestRepository was called but rejected
    expect(ingestRepository).toHaveBeenCalledTimes(1);

    // console.warn should have been called with the error
    expect(warnSpy).toHaveBeenCalled();
  });

  it("skips the second ingestRepository call when one is already in flight (overlap guard)", async () => {
    indexAll.mockResolvedValue({ indexed: 0 });
    watch.mockResolvedValue(undefined);
    ingestPath.mockResolvedValue(undefined);

    // Create a controllable deferred promise for ingestRepository
    let resolveIngest;
    const deferredPromise = new Promise((resolve) => {
      resolveIngest = resolve;
    });
    ingestRepository.mockReturnValue(deferredPromise);

    await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

    // First invocation - does not await, so ingestRepository promise remains pending
    const firstCall = lastMonitorInstance.onIngestibleChange([
      { event: "unlink", path: "/repo/deleted.md" },
      { event: "add", path: "/repo/new.md" },
      { event: "change", path: "/repo/updated.md" },
    ]);

    // Immediately make a second invocation before the first ingestRepository settles
    const secondCall = lastMonitorInstance.onIngestibleChange([
      { event: "add", path: "/repo/another.md" },
      { event: "change", path: "/repo/modified.md" },
    ]);

    // Both calls should complete without error (they don't await the ingestRepository)
    await Promise.all([firstCall, secondCall]);

    // ingestRepository should have been called exactly once (the second invocation was skipped)
    expect(ingestRepository).toHaveBeenCalledTimes(1);

    // But ingestPath should have been called for both invocations (4 times total: 2 + 2)
    expect(ingestPath).toHaveBeenCalledTimes(4);
    expect(ingestPath).toHaveBeenCalledWith("/repo/new.md");
    expect(ingestPath).toHaveBeenCalledWith("/repo/updated.md");
    expect(ingestPath).toHaveBeenCalledWith("/repo/another.md");
    expect(ingestPath).toHaveBeenCalledWith("/repo/modified.md");

    // console.warn should have been called about skipping
    expect(warnSpy).toHaveBeenCalled();
  });

  it("releases the in-flight guard after ingestRepository settles, allowing subsequent calls", async () => {
    indexAll.mockResolvedValue({ indexed: 0 });
    watch.mockResolvedValue(undefined);
    ingestPath.mockResolvedValue(undefined);

    // Create a controllable deferred promise for ingestRepository
    let resolveIngest;
    const deferredPromise = new Promise((resolve) => {
      resolveIngest = resolve;
    });

    ingestRepository.mockReturnValueOnce(deferredPromise);

    await makeProgram().parseAsync(["node", "cli", "storage", "watch"]);

    // First invocation
    const firstCall = lastMonitorInstance.onIngestibleChange([
      { event: "add", path: "/repo/first.md" },
    ]);

    // Second invocation (while first is in flight) - should be skipped
    const secondCall = lastMonitorInstance.onIngestibleChange([
      { event: "add", path: "/repo/second.md" },
    ]);

    // Wait for both to complete (they don't await the deferred ingestRepository)
    await Promise.all([firstCall, secondCall]);

    // ingestRepository should have been called once so far
    expect(ingestRepository).toHaveBeenCalledTimes(1);

    // Now resolve the deferred promise to release the guard
    resolveIngest(undefined);

    // Give the finally block time to execute
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Now mock a successful ingestRepository for the third call
    ingestRepository.mockResolvedValueOnce(undefined);

    // Third invocation - should now call ingestRepository again
    const thirdCall = lastMonitorInstance.onIngestibleChange([
      { event: "add", path: "/repo/third.md" },
    ]);

    await thirdCall;

    // ingestRepository should now have been called twice (once initially, once on third call)
    expect(ingestRepository).toHaveBeenCalledTimes(2);
  });
});
