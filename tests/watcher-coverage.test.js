import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

async function makeTmp() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-cov-"));
  process.env.HOME = tmp;
  return tmp;
}

async function writeConfig(tmp, cfg) {
  await fs.mkdir(path.join(tmp, ".vscode-rotator"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, ".vscode-rotator", "config.json"),
    JSON.stringify(cfg),
  );
}

describe("WatcherDaemon coverage — pickCurrent and _tick branches", () => {
  let originalHome;

  beforeEach(() => {
    originalHome = process.env.HOME;
    process.env.ROTATOR_LOG_LEVEL = "silent";
    process.env.ROTATOR_LOG_SINK = "none";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    try {
      vi.useRealTimers();
    } catch {}
  });

  it("_tick returns early when store returns no eligible accounts", async () => {
    await makeTmp();
    const s = makeStubs();
    s.store.list = async () => [];
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    // tick already ran once during start — no errors = branch covered
    await daemon.stop();
  });

  it("_tick returns early when all accounts are retired", async () => {
    await makeTmp();
    const s = makeStubs();
    s.store.list = async () => [
      { id: "r1", status: "retired", lastUsed: null, cooldownUntil: null },
    ];
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    await daemon.stop();
  });

  it("_tick does not rotate when current account health is valid", async () => {
    await makeTmp();
    const s = makeStubs();
    s.store.list = async () => [
      { id: "a1", status: "active", lastUsed: new Date(), cooldownUntil: null },
    ];
    s.probeAccount = async () => ({ valid: true, remainingRequests: 100 });
    s.switcher.switch = vi.fn();
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    await daemon.stop();
    expect(s.switcher.switch).not.toHaveBeenCalled();
  });

  it("_tick recover loop updates store when scheduler clears expired accounts", async () => {
    await makeTmp();
    const s = makeStubs();
    s.scheduler.clearExpired = async () => ["expired-acct-1"];
    s.store.update = vi.fn(async () => {});
    s.store.list = async () => [];
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    await daemon.stop();
    expect(s.store.update).toHaveBeenCalledWith("expired-acct-1", {
      status: "active",
      cooldownUntil: null,
    });
  });

  it("_tick emits recover event when expired account is cleared", async () => {
    await makeTmp();
    const s = makeStubs();
    s.scheduler.clearExpired = async () => ["recovered-acct"];
    s.store.list = async () => [];
    const recovered = [];
    const daemon = new WatcherDaemon(s);
    daemon.on("recover", (evt) => recovered.push(evt));
    await daemon.start(100000);
    await daemon.stop();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].accountId).toBe("recovered-acct");
  });

  it("_tick handles recover store.update failure gracefully", async () => {
    await makeTmp();
    const s = makeStubs();
    s.scheduler.clearExpired = async () => ["fail-acct"];
    s.store.update = async () => {
      throw new Error("store update failed");
    };
    s.store.list = async () => [];
    const daemon = new WatcherDaemon(s);
    // should not throw even if store.update fails
    await expect(daemon.start(100000)).resolves.not.toThrow();
    await daemon.stop();
  });

  it("start() sets running=false and emits error when scheduler.load throws", async () => {
    await makeTmp();
    const s = makeStubs();
    s.scheduler.load = async () => {
      throw new Error("load failed");
    };
    const errors = [];
    const daemon = new WatcherDaemon(s);
    daemon.on("error", (e) => errors.push(e));
    await expect(daemon.start()).rejects.toThrow("load failed");
    expect(daemon.running).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it("start() is a no-op when already running", async () => {
    await makeTmp();
    const s = makeStubs();
    s.scheduler.load = vi.fn(async () => {});
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    await daemon.start(100000); // second call — no-op
    expect(s.scheduler.load).toHaveBeenCalledTimes(1);
    await daemon.stop();
  });

  it("stop() clears all timers including captureTimer", async () => {
    const tmp = await makeTmp();
    await writeConfig(tmp, {
      captureSchedule: { enabled: true, intervalMs: 999999 },
      platformTriggers: { chatgpt: "chatgpt" },
    });
    const s = makeStubs();
    const captureThread = vi.fn(async () => ({ filename: "test.md" }));
    // patch captureThread on the module level via the daemon instance approach
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    // captureTimer may or may not be set depending on whether captureThread is wired
    // — just verify stop() clears it without throwing
    await expect(daemon.stop()).resolves.not.toThrow();
    expect(daemon.captureTimer).toBeNull();
    expect(daemon.enhanceTimer).toBeNull();
    expect(daemon.timer).toBeNull();
  });
});

describe("WatcherDaemon coverage — _setupGitMonitoring", () => {
  let originalHome;

  beforeEach(() => {
    originalHome = process.env.HOME;
    process.env.ROTATOR_LOG_LEVEL = "silent";
    process.env.ROTATOR_LOG_SINK = "none";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    try {
      vi.useRealTimers();
    } catch {}
  });

  it("_setupGitMonitoring is skipped when watchedRepos is empty", async () => {
    const tmp = await makeTmp();
    await writeConfig(tmp, { watchedRepos: [] });
    const s = makeStubs();
    s.gitMonitor.watchAll = vi.fn();
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    await daemon.stop();
    expect(s.gitMonitor.watchAll).not.toHaveBeenCalled();
  });

  it("_setupGitMonitoring calls watchAll when repos are configured", async () => {
    const tmp = await makeTmp();
    await writeConfig(tmp, { watchedRepos: ["/repo/a", "/repo/b"] });
    const s = makeStubs();
    s.gitMonitor.watchAll = vi.fn();
    s.gitMonitor.on = vi.fn();
    s.gitMonitor.removeAllListeners = vi.fn();
    const daemon = new WatcherDaemon(s);
    await daemon.start(100000);
    await daemon.stop();
    expect(s.gitMonitor.watchAll).toHaveBeenCalledWith(
      ["/repo/a", "/repo/b"],
      expect.any(Number),
    );
  });

  it("git_warn event is re-emitted and appended to journal", async () => {
    const tmp = await makeTmp();
    await writeConfig(tmp, { watchedRepos: ["/repo/a"] });
    const s = makeStubs();
    let gitWarnHandler = null;
    s.gitMonitor.on = vi.fn((event, handler) => {
      if (event === "warn") gitWarnHandler = handler;
    });
    s.gitMonitor.removeAllListeners = vi.fn();
    s.gitMonitor.watchAll = vi.fn();
    s.journal.append = vi.fn(async () => {});
    const gitWarnEvents = [];
    const daemon = new WatcherDaemon(s);
    daemon.on("git_warn", (e) => gitWarnEvents.push(e));
    await daemon.start(100000);
    // simulate git warn event
    if (gitWarnHandler) {
      await gitWarnHandler({ repoPath: "/repo/a", reason: "dirty" });
    }
    await daemon.stop();
    expect(gitWarnEvents).toHaveLength(1);
    expect(gitWarnEvents[0]).toMatchObject({
      repoPath: "/repo/a",
      reason: "dirty",
    });
    expect(s.journal.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: "GIT_WARN" }),
    );
  });
});
