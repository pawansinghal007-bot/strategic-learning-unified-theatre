import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

import { vi } from "vitest";

const { spawnMock, captureThreadMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  captureThreadMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, spawn: spawnMock },
    spawn: spawnMock,
  };
});

vi.mock("../src/browser-bridge.js", () => ({
  captureThread: captureThreadMock,
}));

import { WatcherDaemon } from "../src/daemon/watcher.js";

function makeStubs() {
  return {
    store: {
      list: async () => [],
      update: async () => {},
    },
    switcher: { switch: async () => {} },
    scheduler: {
      load: async () => {},
      clearExpired: async () => [],
      setCooldown: async (_, d) => Date.now() + d,
    },
    journal: { append: async () => {} },
    gitMonitor: {
      stop: () => {},
      watchAll: () => {},
      removeAllListeners: () => {},
      on: () => {},
    },
    probeAccount: async () => ({ valid: true }),
  };
}

describe("enhanceSchedule daemon hook", () => {
  let originalHome;
  let originalLogLevel;
  let originalLogSink;
  beforeEach(() => {
    originalHome = process.env.HOME;
    originalLogLevel = process.env.ROTATOR_LOG_LEVEL;
    originalLogSink = process.env.ROTATOR_LOG_SINK;
    process.env.ROTATOR_LOG_LEVEL = "info";
    process.env.ROTATOR_LOG_SINK = "stdout";
  });
  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalLogLevel === undefined) {
      delete process.env.ROTATOR_LOG_LEVEL;
    } else {
      process.env.ROTATOR_LOG_LEVEL = originalLogLevel;
    }
    if (originalLogSink === undefined) {
      delete process.env.ROTATOR_LOG_SINK;
    } else {
      process.env.ROTATOR_LOG_SINK = originalLogSink;
    }
    try {
      vi.useRealTimers();
    } catch {}
  });

  it("does not create enhanceTimer when enhanceSchedule is null", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    await daemon.start(10);
    expect(daemon.enhanceTimer == null).toBeTruthy();
    // advance timers to ensure nothing fires
    vi.useFakeTimers();
    vi.advanceTimersByTime(60000);
    await daemon.stop();
  });

  it("does not create enhanceTimer when enabled is false", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    // write config with enhanceSchedule.enabled = false
    const cfg = {
      enhanceSchedule: { enabled: false, intervalMs: 50, goals: ["g"] },
    };
    await fs.mkdir(path.join(process.env.HOME, ".vscode-rotator"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(process.env.HOME, ".vscode-rotator", "config.json"),
      JSON.stringify(cfg),
    );

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    // stub _spawnEnhance so if accidentally called we can detect
    daemon._spawnEnhance = vi.fn();
    await daemon.start(10);
    vi.useFakeTimers();
    vi.advanceTimersByTime(60000);
    expect(daemon._spawnEnhance).not.toHaveBeenCalled();
    expect(daemon.enhanceTimer == null).toBeTruthy();
    await daemon.stop();
  });

  it("emits enhance_cycle for each goal when poll tick fires", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    const cfg = {
      enhanceSchedule: {
        enabled: true,
        intervalMs: 50,
        goals: ["goal-a", "goal-b"],
        platform: "chatgpt",
      },
    };
    await fs.mkdir(path.join(process.env.HOME, ".vscode-rotator"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(process.env.HOME, ".vscode-rotator", "config.json"),
      JSON.stringify(cfg),
    );

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn().mockResolvedValue(undefined);

    const events = [];
    daemon.on("enhance_cycle", (e) => events.push(e));

    vi.useFakeTimers();
    await daemon.start(10);
    vi.advanceTimersByTime(60000);
    // allow any pending promises to resolve
    await Promise.resolve();

    expect(daemon._spawnEnhance).toHaveBeenCalledTimes(2);
    expect(daemon._spawnEnhance).toHaveBeenCalledWith("goal-a", "chatgpt");
    expect(daemon._spawnEnhance).toHaveBeenCalledWith("goal-b", "chatgpt");
    expect(events.length).toBe(2);
    for (const ev of events) {
      expect(typeof ev.goal).toBe("string");
      expect(typeof ev.platform).toBe("string");
      expect(typeof ev.timestamp).toBe("string");
    }

    await daemon.stop();
    vi.useRealTimers();
  });

  it("does not re-trigger within intervalMs window (thrash guard)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    const cfg = {
      enhanceSchedule: {
        enabled: true,
        intervalMs: 604800000,
        goals: ["goal-x"],
      },
    };
    await fs.mkdir(path.join(process.env.HOME, ".vscode-rotator"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(process.env.HOME, ".vscode-rotator", "config.json"),
      JSON.stringify(cfg),
    );

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn().mockResolvedValue(undefined);

    vi.useFakeTimers();
    await daemon.start(10);
    vi.advanceTimersByTime(60000); // first poll
    await Promise.resolve();
    vi.advanceTimersByTime(60000); // second poll within big interval
    await Promise.resolve();

    expect(daemon._spawnEnhance).toHaveBeenCalledTimes(1);
    await daemon.stop();
    vi.useRealTimers();
  });

  it("clears enhanceTimer on stop()", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    const cfg = {
      enhanceSchedule: { enabled: true, intervalMs: 604800000, goals: ["g"] },
    };
    await fs.mkdir(path.join(process.env.HOME, ".vscode-rotator"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(process.env.HOME, ".vscode-rotator", "config.json"),
      JSON.stringify(cfg),
    );

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    daemon._spawnEnhance = vi.fn().mockResolvedValue(undefined);
    await daemon.start(10);
    expect(daemon.enhanceTimer != null).toBeTruthy();
    await daemon.stop();
    expect(daemon.enhanceTimer == null).toBeTruthy();
  });

  it("emits structured rotation logs while preserving switch behavior", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;

    const accounts = [
      {
        id: "acct-current",
        status: "active",
        lastUsed: new Date(Date.now() + 10),
        cooldownUntil: null,
      },
      {
        id: "acct-next",
        status: "active",
        lastUsed: null,
        cooldownUntil: null,
      },
    ];

    const s = makeStubs();
    s.store.list = async () => accounts;
    s.store.update = vi.fn(async () => {});
    s.switcher.switch = vi.fn(async () => ({ ok: true }));
    s.probeAccount = vi.fn(async (acct) =>
      acct.id === "acct-current"
        ? {
            valid: false,
            remainingRequests: 0,
            resetAt: new Date(Date.now() + 1000),
            error: "quota exhausted",
          }
        : { valid: true, remainingRequests: 100, resetAt: null, error: null },
    );

    const output = [];
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((line) => {
        output.push(String(line));
        return true;
      });

    try {
      const daemon = new WatcherDaemon(s);
      await daemon.start(1000);
      await daemon.stop();
    } finally {
      writeSpy.mockRestore();
    }

    expect(s.switcher.switch).toHaveBeenCalledWith("acct-next", {
      dryRun: false,
    });
    const entries = output.map((line) => JSON.parse(line));
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "info",
          module: "watcher",
          msg: "rotation.start",
          correlationId: "acct-current",
          reason: "quota exhausted",
          action: "cooldown",
        }),
        expect.objectContaining({
          level: "info",
          module: "watcher",
          msg: "rotation.success",
          correlationId: "acct-current",
          reason: "quota exhausted",
          action: "switch",
          targetAccountId: "acct-next",
        }),
      ]),
    );
  });

  it("emits an error event (without throwing) when switch fails during tick (lines 156-161, 303-309)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;

    const accounts = [
      {
        id: "acct-current",
        status: "active",
        lastUsed: new Date(Date.now() + 10),
        cooldownUntil: null,
      },
      {
        id: "acct-next",
        status: "active",
        lastUsed: null,
        cooldownUntil: null,
      },
    ];

    const s = makeStubs();
    s.store.list = async () => accounts;
    s.store.update = vi.fn(async () => {});
    s.switcher.switch = vi.fn(async () => {
      throw new Error("switch boom");
    });
    s.probeAccount = vi.fn(async (acct) =>
      acct.id === "acct-current"
        ? {
            valid: false,
            remainingRequests: 0,
            resetAt: null,
            error: "quota exhausted",
          }
        : { valid: true, remainingRequests: 100, resetAt: null, error: null },
    );

    const daemon = new WatcherDaemon(s);
    const errors = [];
    daemon.on("error", (e) => errors.push(e));

    await expect(daemon.start(1000)).resolves.toBeDefined();
    await daemon.stop();

    expect(s.switcher.switch).toHaveBeenCalled();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("switch boom");
  });

  it("records a failed health probe and still proceeds to cooldown (line 220)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;

    const accounts = [
      {
        id: "acct-current",
        status: "active",
        lastUsed: new Date(Date.now() + 10),
        cooldownUntil: null,
      },
      {
        id: "acct-next",
        status: "active",
        lastUsed: null,
        cooldownUntil: null,
      },
    ];

    const s = makeStubs();
    s.store.list = async () => accounts;
    s.store.update = vi.fn(async () => {});
    s.scheduler.setCooldown = vi.fn(async (_, d) => Date.now() + d);
    s.probeAccount = vi.fn(async (acct) => {
      if (acct.id === "acct-current") {
        throw new Error("probe boom");
      }
      return {
        valid: true,
        remainingRequests: 100,
        resetAt: null,
        error: null,
      };
    });

    const daemon = new WatcherDaemon(s);
    await daemon.start(1000);
    await daemon.stop();

    // A thrown probe is caught and recorded as an invalid health entry,
    // which still drives the account into cooldown.
    expect(s.scheduler.setCooldown).toHaveBeenCalledWith(
      "acct-current",
      expect.any(Number),
    );
  });

  it("does not switch when no better account is available (line 276-277)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;

    const accounts = [
      { id: "solo", status: "active", lastUsed: null, cooldownUntil: null },
    ];

    const s = makeStubs();
    s.store.list = async () => accounts;
    s.store.update = vi.fn(async () => {});
    s.switcher.switch = vi.fn(async () => {});
    s.probeAccount = vi.fn(async () => ({
      valid: false,
      remainingRequests: 0,
      resetAt: null,
      error: "quota exhausted",
    }));

    const daemon = new WatcherDaemon(s);
    await daemon.start(1000);
    await daemon.stop();

    expect(s.switcher.switch).not.toHaveBeenCalled();
  });
});

describe("captureSchedule daemon hook", () => {
  let originalHome;
  let originalLogLevel;
  let originalLogSink;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalLogLevel = process.env.ROTATOR_LOG_LEVEL;
    originalLogSink = process.env.ROTATOR_LOG_SINK;
    process.env.ROTATOR_LOG_LEVEL = "info";
    process.env.ROTATOR_LOG_SINK = "stdout";
    captureThreadMock.mockReset();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalLogLevel === undefined) delete process.env.ROTATOR_LOG_LEVEL;
    else process.env.ROTATOR_LOG_LEVEL = originalLogLevel;
    if (originalLogSink === undefined) delete process.env.ROTATOR_LOG_SINK;
    else process.env.ROTATOR_LOG_SINK = originalLogSink;
    try {
      vi.useRealTimers();
    } catch {}
  });

  async function writeConfig(cfg) {
    const dir = path.join(process.env.HOME, ".vscode-rotator");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "config.json"), JSON.stringify(cfg));
  }

  it("emits capture_success for each unique triggered platform on tick (lines 429-463, 477)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    await writeConfig({
      captureSchedule: { enabled: true, intervalMs: 200 },
      platformTriggers: { a: "chatgpt", b: "claude", c: "chatgpt" }, // 'chatgpt' deduped
    });

    captureThreadMock.mockImplementation(async (platform) => ({
      filename: `${platform}.json`,
    }));

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);

    const events = [];
    daemon.on("capture_success", (e) => events.push(e));

    vi.useFakeTimers();
    // Large poll interval keeps the main watcher timer from firing extra
    // ticks while we advance fake time for the capture-specific timer.
    await daemon.start(100000);
    await vi.advanceTimersByTimeAsync(200);

    expect(captureThreadMock).toHaveBeenCalledTimes(2); // chatgpt + claude, deduped
    expect(events.map((e) => e.platform).sort()).toEqual(["chatgpt", "claude"]);

    await daemon.stop();
    vi.useRealTimers();
  });

  it("logs and continues when captureThread fails for one platform (lines 464-469)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    await writeConfig({
      captureSchedule: { enabled: true, intervalMs: 200 },
      platformTriggers: { a: "chatgpt", b: "claude" },
    });

    captureThreadMock.mockImplementation(async (platform) => {
      if (platform === "chatgpt") {
        throw new Error("capture failed");
      }
      return { filename: `${platform}.json` };
    });

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    const events = [];
    daemon.on("capture_success", (e) => events.push(e));

    vi.useFakeTimers();
    await daemon.start(100000);
    await vi.advanceTimersByTimeAsync(200);

    // Both platforms were attempted despite the first one failing.
    expect(captureThreadMock).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.platform)).toEqual(["claude"]);

    await daemon.stop();
    vi.useRealTimers();
  });

  it("clears captureTimer on stop()", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    await writeConfig({
      captureSchedule: { enabled: true, intervalMs: 604800000 },
      platformTriggers: { a: "chatgpt" },
    });
    captureThreadMock.mockResolvedValue({ filename: "f.json" });

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    expect(daemon.captureTimer != null).toBeTruthy();
    await daemon.stop();
    expect(daemon.captureTimer == null).toBeTruthy();
  });
});

describe("_spawnEnhance (real child_process integration)", () => {
  let originalHome;
  let originalLogLevel;
  let originalLogSink;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalLogLevel = process.env.ROTATOR_LOG_LEVEL;
    originalLogSink = process.env.ROTATOR_LOG_SINK;
    process.env.ROTATOR_LOG_LEVEL = "info";
    process.env.ROTATOR_LOG_SINK = "stdout";
    spawnMock.mockReset();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalLogLevel === undefined) delete process.env.ROTATOR_LOG_LEVEL;
    else process.env.ROTATOR_LOG_LEVEL = originalLogLevel;
    if (originalLogSink === undefined) delete process.env.ROTATOR_LOG_SINK;
    else process.env.ROTATOR_LOG_SINK = originalLogSink;
  });

  function fakeChild() {
    return new EventEmitter();
  }

  it("resolves when the child process exits with code 0 (lines 484-509)", async () => {
    let lastChild;
    spawnMock.mockImplementation(() => {
      lastChild = fakeChild();
      return lastChild;
    });

    const daemon = new WatcherDaemon(makeStubs());
    const promise = daemon._spawnEnhance("my-goal", "chatgpt");

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [
        "src/cli.js",
        "llm",
        "enhance",
        "--goal",
        "my-goal",
        "--auto",
        "--platform",
        "chatgpt",
      ],
      expect.objectContaining({ stdio: "inherit", detached: false }),
    );

    lastChild.emit("close", 0);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the child process exits with a non-zero code (line 509-510)", async () => {
    let lastChild;
    spawnMock.mockImplementation(() => {
      lastChild = fakeChild();
      return lastChild;
    });

    const daemon = new WatcherDaemon(makeStubs());
    const promise = daemon._spawnEnhance("my-goal", "chatgpt");

    lastChild.emit("close", 1);
    await expect(promise).rejects.toThrow("enhance exited with code 1");
  });

  it("rejects when the child process itself errors (line 504)", async () => {
    let lastChild;
    spawnMock.mockImplementation(() => {
      lastChild = fakeChild();
      return lastChild;
    });

    const daemon = new WatcherDaemon(makeStubs());
    const promise = daemon._spawnEnhance("my-goal", "chatgpt");

    lastChild.emit("error", new Error("ENOENT: spawn failed"));
    await expect(promise).rejects.toThrow("ENOENT: spawn failed");
  });

  it("propagates a child-process failure through the real enhance cycle (line 392)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rotator-test-"));
    process.env.HOME = tmp;
    const dir = path.join(tmp, ".vscode-rotator");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "config.json"),
      JSON.stringify({
        enhanceSchedule: { enabled: true, intervalMs: 50, goals: ["goal-a"] },
      }),
    );

    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      // Fail asynchronously so _spawnEnhance's promise rejects once awaited.
      queueMicrotask(() => child.emit("close", 1));
      return child;
    });

    const s = makeStubs();
    const daemon = new WatcherDaemon(s);

    vi.useFakeTimers();
    await daemon.start(100000);
    await vi.advanceTimersByTimeAsync(60000);

    // The enhance.failure catch block should have swallowed the rejection
    // without crashing the daemon or leaving `running` stuck true.
    await daemon.stop();
    vi.useRealTimers();
    expect(daemon.running).toBe(false);
  });
});
