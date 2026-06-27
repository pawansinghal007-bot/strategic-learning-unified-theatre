import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AccountStore } from "../accounts/store.js";
import { SwitcherService } from "../accounts/switcher.js";
import { probeAccount as probeAccountDefault } from "../accounts/health.js";
import { pickBest } from "../scorer.js";
import { CooldownScheduler } from "../scheduler.js";
import { loadConfig } from "../internal/config.js";
import { captureThread } from "../browser-bridge.js";
import { Journal } from "../internal/journal.js";
import { GitMonitor } from "../internal/git-monitor.js";
import { createLogger } from "../logger.js";

const log = createLogger("watcher");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function pickCurrent(accounts) {
  const active = accounts.filter((a) => a.status !== "retired");

  /* istanbul ignore if -- defensive guard: the only caller (_tick) already
     filters to non-retired accounts and checks length before calling this,
     and this function applies the identical filter, so active can't end up
     empty here given a non-empty input */
  if (active.length === 0) {
    return null;
  }

  return active.slice().sort((a, b) => {
    const at = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;

    const bt = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;

    return bt - at;
  })[0];
}

export class WatcherDaemon extends EventEmitter {
  constructor({
    store,
    switcher,
    scheduler,
    journal,
    gitMonitor,
    probeAccount,
  } = {}) {
    super();

    this.store = store ?? new AccountStore();

    this.switcher =
      switcher ??
      new SwitcherService({
        store: this.store,
      });

    this.scheduler = scheduler ?? new CooldownScheduler();

    this.journal = journal ?? new Journal();

    this.gitMonitor = gitMonitor ?? new GitMonitor();

    this.probeAccount = probeAccount ?? probeAccountDefault;

    this.running = false;

    this.timer = null;
    this.enhanceTimer = null;
    this.captureTimer = null;

    this.interval = 30000;

    this.cooldownMs = 15 * 60 * 1000;

    this.tickInProgress = false;

    this.lastEnhanceRunAt = 0;
    this.lastCaptureRunAt = 0;
  }

  async start(defaultPollIntervalMs = 30000) {
    if (this.running) {
      log.warn("watcher.alreadyRunning", {});

      return this;
    }

    this.running = true;

    try {
      await this.scheduler.load();

      const cfg = await loadConfig();

      this.interval =
        typeof cfg?.pollIntervalMs === "number"
          ? cfg.pollIntervalMs
          : defaultPollIntervalMs;

      this.cooldownMs =
        typeof cfg?.cooldownMs === "number" ? cfg.cooldownMs : 15 * 60 * 1000;

      const gitInterval =
        typeof cfg?.gitPollIntervalMs === "number"
          ? cfg.gitPollIntervalMs
          : this.interval;

      await this._setupGitMonitoring(cfg, gitInterval);

      await this._setupEnhanceLoop(cfg);

      await this._setupCaptureLoop(cfg);

      // immediate first tick
      await this._safeTick(cfg);

      // polling loop
      this.timer = setInterval(() => {
        void this._safeTick(cfg);
      }, this.interval);

      this.timer.unref?.();

      log.info("watcher.started", {
        interval: this.interval,
      });

      return this;
    } catch (err) {
      this.running = false;

      log.error("watcher.start.failure", {
        error: err,
        code: err?.code ?? "ROTATOR_WATCHER_START_FAILED",
      });

      this.emit("error", err);

      throw err;
    }
  }

  async _safeTick(cfg) {
    if (!this.running || this.tickInProgress) {
      return;
    }

    this.tickInProgress = true;

    try {
      await this._tick(cfg);
    } catch (err) {
      log.error("watcher.tick.failure", {
        error: err,
        code: err?.code ?? "ROTATOR_WATCHER_TICK_FAILED",
      });

      this.emit("error", err);
    } finally {
      this.tickInProgress = false;
    }
  }

  async _tick(cfg) {
    const cleared = await this.scheduler.clearExpired();

    for (const accountId of cleared) {
      try {
        await this.store.update(accountId, {
          status: "active",
          cooldownUntil: null,
        });

        await this.journal.append({
          type: "RECOVER",
          detail: accountId,
        });

        log.info("rotation.success", {
          correlationId: accountId,
          action: "recover",
        });

        this.emit("recover", {
          accountId,
        });
      } catch (err) {
        log.error("recover.failure", {
          accountId,
          error: err,
        });
      }
    }

    const accounts = await this.store.list();

    const eligible = accounts.filter((a) => a.status !== "retired");

    if (eligible.length === 0) {
      return;
    }

    const current = pickCurrent(eligible);

    /* istanbul ignore if -- defensive guard: pickCurrent can't return null
       here since `eligible` was already checked non-empty just above and
       pickCurrent's internal filter is identical, so this never trips */
    if (!current) {
      return;
    }

    const healthMap = new Map();

    for (const acct of eligible) {
      try {
        const health = await this.probeAccount(acct);

        healthMap.set(acct.id, health);
      } catch (err) {
        healthMap.set(acct.id, {
          valid: false,
          error: String(err?.message ?? err),
        });
      }
    }

    const currentHealth = healthMap.get(current.id) ?? {
      valid: true,
    };

    if (currentHealth.valid) {
      return;
    }

    const reason = currentHealth.error ?? "health probe failed";

    log.info("rotation.start", {
      correlationId: current.id,
      action: "cooldown",
      reason,
    });

    const resetAtMs = currentHealth.resetAt
      ? new Date(currentHealth.resetAt).getTime()
      : null;

    const durationMs =
      typeof resetAtMs === "number" &&
      Number.isFinite(resetAtMs) &&
      resetAtMs > Date.now()
        ? resetAtMs - Date.now()
        : this.cooldownMs;

    const until = await this.scheduler.setCooldown(current.id, durationMs);

    await this.store.update(current.id, {
      status: "cooldown",
      cooldownUntil: new Date(until),
    });

    await this.journal.append({
      type: "COOLDOWN",
      detail: `${current.id} | ${reason}`,
    });

    this.emit("cooldown", {
      accountId: current.id,
      until: new Date(until),
      reason,
    });

    const best = pickBest(accounts, healthMap, {
      remainingThreshold: cfg?.remainingThreshold ?? 20,
    });

    if (!best || best.id === current.id) {
      return;
    }

    try {
      await this.switcher.switch(best.id, {
        dryRun: false,
      });

      await this.journal.append({
        type: "SWITCH",
        detail: `${current.id} -> ${best.id}`,
      });

      log.info("rotation.success", {
        correlationId: current.id,
        action: "switch",
        targetAccountId: best.id,
        reason,
      });

      this.emit("switch", {
        from: current.id,
        to: best.id,
        reason,
      });
    } catch (err) {
      log.error("switch.failure", {
        error: err,
        from: current.id,
        to: best.id,
      });

      throw err;
    }
  }

  async _setupGitMonitoring(cfg, gitInterval) {
    const watchedRepos = Array.isArray(cfg?.watchedRepos)
      ? cfg.watchedRepos
      : [];

    if (watchedRepos.length === 0) {
      return;
    }

    this.gitMonitor.stop();

    this.gitMonitor.watchAll(watchedRepos, gitInterval);

    this.gitMonitor.removeAllListeners("warn");

    this.gitMonitor.on("warn", async (evt) => {
      try {
        await this.journal.append({
          type: "GIT_WARN",
          detail: `${evt.repoPath} | ${evt.reason}`,
        });
      } catch {}

      this.emit("git_warn", evt);
    });
  }

  async _setupEnhanceLoop(cfg) {
    const enhanceConfig = cfg?.enhanceSchedule;

    if (
      !enhanceConfig?.enabled ||
      !Array.isArray(enhanceConfig.goals) ||
      enhanceConfig.goals.length === 0
    ) {
      return;
    }

    const intervalMs = Number.isFinite(Number(enhanceConfig.intervalMs))
      ? Number(enhanceConfig.intervalMs)
      : 7 * 24 * 60 * 60 * 1000;

    const platform = enhanceConfig.platform ?? "chatgpt";

    let running = false;

    const runEnhanceCycle = async () => {
      if (!this.running || running) {
        return;
      }

      const now = Date.now();

      if (this.lastEnhanceRunAt && now - this.lastEnhanceRunAt < intervalMs) {
        return;
      }

      running = true;

      this.lastEnhanceRunAt = now;

      try {
        const cycles = enhanceConfig.goals.map(async (goal) => {
          this.emit("enhance_cycle", {
            goal,
            platform,
            timestamp: new Date().toISOString(),
          });

          await this._spawnEnhance(goal, platform);

          await this.journal.append({
            type: "ENHANCE",
            detail: `${goal} | ${platform}`,
          });
        });

        await Promise.all(cycles);
      } catch (err) {
        log.error("enhance.failure", {
          error: err,
        });
      } finally {
        running = false;
      }
    };

    // DO NOT run immediately.
    // Tests expect timer-triggered execution only.

    this.enhanceTimer = setInterval(() => {
      void runEnhanceCycle();
    }, 60000);

    this.enhanceTimer.unref?.();
  }

  async _setupCaptureLoop(cfg) {
    const captureConfig = cfg?.captureSchedule;

    const platformTriggers =
      cfg?.platformTriggers && typeof cfg.platformTriggers === "object"
        ? cfg.platformTriggers
        : {};

    if (!captureConfig?.enabled || Object.keys(platformTriggers).length === 0) {
      return;
    }

    const intervalMs = Number.isFinite(Number(captureConfig.intervalMs))
      ? Number(captureConfig.intervalMs)
      : 15 * 60 * 1000;

    let running = false;

    const runCaptureCycle = async () => {
      if (!this.running || running) {
        return;
      }

      const now = Date.now();

      /* istanbul ignore if -- defensive guard: captureTimer's own setInterval
         delay is this same `intervalMs`, so consecutive natural ticks are
         always >= intervalMs apart; this can't trip without an out-of-band
         call to runCaptureCycle, which nothing in this class makes */
      if (this.lastCaptureRunAt && now - this.lastCaptureRunAt < intervalMs) {
        return;
      }

      running = true;

      this.lastCaptureRunAt = now;

      try {
        const platforms = Array.from(
          new Set(Object.values(platformTriggers).filter(Boolean)),
        );

        for (const platform of platforms) {
          try {
            const result = await captureThread(platform, {
              headless: true,
              timeout: captureConfig.timeoutMs ?? 60000,
            });

            await this.journal.append({
              type: "CAPTURE",
              detail: `${platform} | ${result.filename ?? result.filePath ?? "no-file"}`,
            });

            this.emit("capture_success", {
              platform,
              result,
            });
          } catch (err) {
            log.error("capture.failure", {
              platform,
              error: err,
            });
          }
        }
      } finally {
        running = false;
      }
    };

    this.captureTimer = setInterval(() => {
      void runCaptureCycle();
    }, intervalMs);

    this.captureTimer.unref?.();
  }

  async _spawnEnhance(goal, platform) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "src/cli.js",
          "llm",
          "enhance",
          "--goal",
          goal,
          "--auto",
          "--platform",
          platform,
        ],
        {
          cwd: PROJECT_ROOT,
          stdio: "inherit",
          detached: false,
        },
      );

      child.on("error", reject);

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`enhance exited with code ${code}`));
        }
      });
    });
  }

  async stop() {
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.enhanceTimer) {
      clearInterval(this.enhanceTimer);

      this.enhanceTimer = null;
    }

    if (this.captureTimer) {
      clearInterval(this.captureTimer);

      this.captureTimer = null;
    }

    this.gitMonitor.stop();

    log.info("watcher.stopped", {});
  }
}
