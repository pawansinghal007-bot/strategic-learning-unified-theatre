import { EventEmitter } from "node:events";
import { AccountStore } from "./store.js";
import { SwitcherService } from "./switcher.js";
import { probeAccount as probeAccountDefault } from "./health.js";
import { pickBest } from "./scorer.js";
import { CooldownScheduler } from "./scheduler.js";
import { loadConfig } from "./config.js";
import { captureThread } from "./browser-bridge.js";
import { Journal } from "./journal.js";
import { GitMonitor } from "./git-monitor.js";

function pickCurrent(accounts) {
  const active = accounts.filter((a) => a.status !== "retired");
  if (active.length === 0) return null;
  return active
    .slice()
    .sort((a, b) => {
      const at = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const bt = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return bt - at;
    })[0];
}

export class WatcherDaemon extends EventEmitter {
  constructor({ store, switcher, scheduler, journal, gitMonitor, probeAccount } = {}) {
    super();
    this.store = store ?? new AccountStore();
    this.switcher = switcher ?? new SwitcherService({ store: this.store });
    this.scheduler = scheduler ?? new CooldownScheduler();
    this.journal = journal ?? new Journal();
    this.gitMonitor = gitMonitor ?? new GitMonitor();
    this.probeAccount = probeAccount ?? probeAccountDefault;
    this.timer = null;
    this.running = false;
  }

  async start(pollIntervalMs = 30000) {
    if (this.running) return;
    this.running = true;
    await this.scheduler.load();

    const cfg = await loadConfig();
    const interval =
      typeof cfg?.pollIntervalMs === "number" ? cfg.pollIntervalMs : pollIntervalMs;
    const cooldownMs =
      typeof cfg?.cooldownMs === "number" ? cfg.cooldownMs : 15 * 60 * 1000;
    const gitInterval =
      typeof cfg?.gitPollIntervalMs === "number" ? cfg.gitPollIntervalMs : interval;

    const watchedRepos = Array.isArray(cfg?.watchedRepos) ? cfg.watchedRepos : [];
    if (watchedRepos.length > 0) {
      this.gitMonitor.stop();
      this.gitMonitor.watchAll(watchedRepos, gitInterval);
    }

    this.gitMonitor.removeAllListeners("warn");
    this.gitMonitor.on("warn", async (evt) => {
      const detail = `${evt.repoPath} | ${evt.reason}`;
      try {
        await this.journal.append({ type: "GIT_WARN", detail });
      } catch {}
      this.emit("git_warn", evt);
    });

    // Enhancement scheduling loop
    const enhanceConfig = cfg?.enhanceSchedule;
    if (enhanceConfig?.enabled &&
        Array.isArray(enhanceConfig.goals) &&
        enhanceConfig.goals.length > 0) {

      const intervalMs = enhanceConfig.intervalMs ?? 604800000;
      let lastEnhanceTs = 0;

      this.enhanceTimer = setInterval(async () => {
        if (!this.running) return;
        const now = Date.now();
        if (now - lastEnhanceTs < intervalMs) return;
        lastEnhanceTs = now;

        for (const goal of enhanceConfig.goals) {
          const platform = enhanceConfig.platform ?? 'chatgpt';
          try {
            this.emit('enhance_cycle', {
              goal,
              platform,
              timestamp: new Date().toISOString()
            });
            await this._spawnEnhance(goal, platform);
          } catch (err) {
            await this.journal.append({
              type: 'ENHANCE_ERR',
              detail: `${goal} | ${err?.message ?? err}`
            });
          }
        }
      }, 60000); // polls every 60 s; intervalMs controls actual cadence

      this.enhanceTimer.unref?.();
    }

    // Platform capture scheduling (periodic headless captures)
    const captureConfig = cfg?.captureSchedule;
    const platformTriggers = cfg?.platformTriggers && typeof cfg.platformTriggers === 'object' ? cfg.platformTriggers : {};
    if (captureConfig?.enabled && Object.keys(platformTriggers).length > 0) {
      const intervalMs = Number.isFinite(Number(captureConfig.intervalMs)) ? Number(captureConfig.intervalMs) : 15 * 60 * 1000;
      let lastCaptureTs = 0;

      this.captureTimer = setInterval(async () => {
        if (!this.running) return;
        const nowTs = Date.now();
        if (nowTs - lastCaptureTs < intervalMs) return;
        lastCaptureTs = nowTs;

        // Determine unique platforms from triggers mapping
        const platforms = Array.from(new Set(Object.values(platformTriggers).filter(Boolean)));
        for (const platform of platforms) {
          try {
            this.emit('capture_start', { platform, timestamp: new Date().toISOString() });
            const result = await captureThread(platform, { headless: true, timeout: captureConfig.timeoutMs ?? 60000 });
            await this.journal.append({ type: 'CAPTURE', detail: `${platform} | ${result.filename ?? result.filePath ?? 'no-file'}` });
          } catch (err) {
            try {
              await this.journal.append({ type: 'CAPTURE_ERR', detail: `${platform} | ${String(err?.message ?? err)}` });
            } catch {}
          }
        }
      }, 60000);

      this.captureTimer.unref?.();
    }

    const tick = async () => {
      if (!this.running) return;

      const cleared = await this.scheduler.clearExpired();
      for (const accountId of cleared) {
        try {
          await this.store.update(accountId, { status: "active", cooldownUntil: null });
          await this.journal.append({ type: "RECOVER", detail: accountId });
          this.emit("recover", { accountId });
        } catch {}
      }

      const accounts = await this.store.list();
      const eligible = accounts.filter((a) => a.status !== "retired");
      if (eligible.length === 0) return;

      const healthMap = new Map();
      for (const acct of eligible) {
        const h = await this.probeAccount(acct);
        healthMap.set(acct.id, h);
      }

      const current = pickCurrent(eligible);
      if (!current) return;
      const currentHealth = healthMap.get(current.id) ?? { valid: true };

      if (currentHealth.valid) return;

      const resetAtMs = currentHealth.resetAt ? new Date(currentHealth.resetAt).getTime() : null;
      const durationMs =
        typeof resetAtMs === "number" && Number.isFinite(resetAtMs) && resetAtMs > Date.now()
          ? resetAtMs - Date.now()
          : cooldownMs;
      const until = await this.scheduler.setCooldown(current.id, durationMs);
      await this.store.update(current.id, {
        status: "cooldown",
        cooldownUntil: new Date(until)
      });
      try {
        await this.journal.append({
          type: "COOLDOWN",
          detail: `${current.id} | until=${new Date(until).toISOString()} | ${currentHealth.error ?? ""}`.trim()
        });
      } catch {}
      this.emit("cooldown", {
        accountId: current.id,
        until: new Date(until),
        reason: currentHealth.error ?? "health probe failed"
      });

      const best = pickBest(accounts, healthMap, {
        remainingThreshold: cfg?.remainingThreshold ?? 20
      });
      if (!best || best.id === current.id) return;

      await this.switcher.switch(best.id, { dryRun: false });
      try {
        await this.journal.append({
          type: "SWITCH",
          detail: `${current.id} -> ${best.id} | ${currentHealth.error ?? ""}`.trim()
        });
      } catch {}
      this.emit("switch", { from: current.id, to: best.id, reason: currentHealth.error ?? null });
    };

    const loop = async () => {
      try {
        await tick();
      } catch (err) {
        this.emit("error", err);
      } finally {
        if (this.running) {
          this.timer = setTimeout(loop, interval);
        }
      }
    };

    await loop();
  }

  async _spawnEnhance(goal, platform) {
    const { spawn } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['src/cli.js', 'llm', 'enhance',
         '--goal', goal,
         '--auto',
         '--platform', platform],
        {
          cwd: new URL('.', import.meta.url).pathname,
          stdio: 'inherit',
          detached: false
        }
      );
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`enhance exited ${code}`)));
      child.on('error', reject);
    });
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.enhanceTimer) {
      clearInterval(this.enhanceTimer);
      this.enhanceTimer = null;
    }
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    this.gitMonitor.stop();
  }
}
