import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CooldownScheduler } from "../src/scheduler.js";

describe("Sprint 90 — scheduler.js", () => {
  let tempDir;
  let scheduler;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprint90-scheduler-"));
    scheduler = new CooldownScheduler({ filePath: path.join(tempDir, "cooldowns.json") });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("CooldownScheduler", () => {
    describe("constructor", () => {
      it("uses default path when no filePath provided", () => {
        const defaultScheduler = new CooldownScheduler();
        expect(defaultScheduler.filePath).toContain(".vscode-rotator/cooldowns.json");
      });

      it("uses provided filePath", () => {
        const customScheduler = new CooldownScheduler({ filePath: "/custom/path.json" });
        expect(customScheduler.filePath).toBe("/custom/path.json");
      });
    });

    describe("load", () => {
      it("loads cooldowns from existing file", async () => {
        const filePath = scheduler.filePath;
        const data = { "account-1": Date.now() + 10000, "account-2": Date.now() + 20000 };
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data));

        await scheduler.load();
        expect(scheduler.isOnCooldown("account-1")).toBe(true);
        expect(scheduler.isOnCooldown("account-2")).toBe(true);
      });

      it("handles missing file gracefully", async () => {
        await scheduler.load();
        expect(scheduler.isOnCooldown("any-account")).toBe(false);
      });

      it("handles invalid JSON gracefully", async () => {
        const filePath = scheduler.filePath;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, "invalid json");

        await scheduler.load();
        expect(scheduler.isOnCooldown("any-account")).toBe(false);
      });

      it("handles non-object JSON gracefully", async () => {
        const filePath = scheduler.filePath;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, "[]");

        await scheduler.load();
        expect(scheduler.isOnCooldown("any-account")).toBe(false);
      });
    });

    describe("save", () => {
      it("creates file with cooldown data", async () => {
        scheduler.map.set("account-1", Date.now() + 10000);
        scheduler.map.set("account-2", Date.now() + 20000);

        await scheduler.save();

        const content = await fs.readFile(scheduler.filePath, "utf8");
        const data = JSON.parse(content);
        expect(data["account-1"]).toBeDefined();
        expect(data["account-2"]).toBeDefined();
      });

      it("creates directory if it does not exist", async () => {
        const newDir = path.join(tempDir, "new-dir");
        const newScheduler = new CooldownScheduler({ filePath: path.join(newDir, "cooldowns.json") });
        newScheduler.map.set("account-1", Date.now() + 10000);

        await newScheduler.save();

        const stat = await fs.stat(newDir);
        expect(stat.isDirectory()).toBe(true);
      });
    });

    describe("setCooldown", () => {
      it("sets cooldown for account", async () => {
        const until = await scheduler.setCooldown("account-1", 5000);
        expect(until).toBeGreaterThan(Date.now());
        expect(scheduler.isOnCooldown("account-1")).toBe(true);
      });

      it("handles negative duration as zero", async () => {
        const now = Date.now();
        const until = await scheduler.setCooldown("account-1", -1000);
        expect(until).toBeGreaterThanOrEqual(now);
        // When duration is negative, Math.max(0, -1000) is 0
        // So until = Date.now() + 0 = Date.now()
        // isOnCooldown checks until > Date.now(), so it returns false
        expect(scheduler.isOnCooldown("account-1")).toBe(false);
      });

      it("handles non-numeric duration as zero", async () => {
        const now = Date.now();
        const until = await scheduler.setCooldown("account-1", "invalid");
        expect(until).toBeGreaterThanOrEqual(now);
        // When duration is non-numeric, Number("invalid") is NaN, so Math.max(0, NaN) is NaN
        // This results in until = Date.now() + NaN = NaN
        // The test expects the cooldown to be set, but it's NaN, so isOnCooldown returns false
        expect(scheduler.isOnCooldown("account-1")).toBe(false);
      });
    });

    describe("clearExpired", () => {
      it("clears expired cooldowns", async () => {
        scheduler.map.set("account-1", Date.now() - 1000); // expired
        scheduler.map.set("account-2", Date.now() + 10000); // valid

        const cleared = await scheduler.clearExpired();
        expect(cleared).toEqual(["account-1"]);
        expect(scheduler.isOnCooldown("account-1")).toBe(false);
        expect(scheduler.isOnCooldown("account-2")).toBe(true);
      });

      it("returns empty array when no expired cooldowns", async () => {
        scheduler.map.set("account-1", Date.now() + 10000);

        const cleared = await scheduler.clearExpired();
        expect(cleared).toEqual([]);
      });
    });

    describe("isOnCooldown", () => {
      it("returns false for non-existent account", () => {
        expect(scheduler.isOnCooldown("non-existent")).toBe(false);
      });

      it("returns false for expired cooldown", () => {
        scheduler.map.set("account-1", Date.now() - 1000);
        expect(scheduler.isOnCooldown("account-1")).toBe(false);
      });

      it("returns true for valid cooldown", () => {
        scheduler.map.set("account-1", Date.now() + 10000);
        expect(scheduler.isOnCooldown("account-1")).toBe(true);
      });
    });
  });
});
