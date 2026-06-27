import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { acquireLock, releaseLock } from "../src/lock.js";

describe("lock", () => {
  it("throws when lock exists for a running process", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    const lockName = "switch";

    await acquireLock(lockName, { baseDir: dir });
    await expect(acquireLock(lockName, { baseDir: dir })).rejects.toThrow(
      /lock/i,
    );
    await releaseLock(lockName, { baseDir: dir });
  });

  it("re-acquires when lock exists for a non-existent process", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    const lockName = "switch";
    const lockPath = path.join(dir, `${lockName}.lock`);

    await fs.writeFile(lockPath, "999999", "utf8");

    const acquiredPath = await acquireLock(lockName, { baseDir: dir });
    expect(acquiredPath).toBe(lockPath);
    await releaseLock(lockName, { baseDir: dir });
  });

  it("does nothing when releasing a lock that doesn't exist (line 72)", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    // No lock was ever acquired in this dir, so fs.unlink fails with ENOENT,
    // exercising the `err?.code !== "ENOENT"` false branch (swallowed).
    await expect(
      releaseLock("switch", { baseDir: dir }),
    ).resolves.toBeUndefined();
  });

  it("defaults to the home directory when no baseDir is provided", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(dir);

    const lockName = `default-baseDir-${process.pid}`;
    const expectedPath = path.join(dir, ".vscode-rotator", `${lockName}.lock`);

    const acquiredPath = await acquireLock(lockName);
    expect(acquiredPath).toBe(expectedPath);
    await releaseLock(lockName);

    homedirSpy.mockRestore();
  });

  it("does not double-append .lock when the name already has the suffix", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    const lockName = "custom.lock";
    const expectedPath = path.join(dir, lockName);

    const acquiredPath = await acquireLock(lockName, { baseDir: dir });
    expect(acquiredPath).toBe(expectedPath);
    await releaseLock(lockName, { baseDir: dir });
  });

  it("treats a non-positive existing pid as dead and re-acquires", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    const lockName = "switch";
    const lockPath = path.join(dir, `${lockName}.lock`);

    // Negative pid is truthy (so the existingPid check passes) but fails
    // isProcessAlive's `pid <= 0` guard, exercising that branch directly.
    await fs.writeFile(lockPath, "-5", "utf8");

    const acquiredPath = await acquireLock(lockName, { baseDir: dir });
    expect(acquiredPath).toBe(lockPath);

    const contents = await fs.readFile(lockPath, "utf8");
    expect(contents).toBe(String(process.pid));

    await releaseLock(lockName, { baseDir: dir });
  });

  it("rethrows non-EEXIST errors from the initial open attempt", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    // A filename component over 255 bytes fails fs.open with ENAMETOOLONG
    // (not EEXIST), exercising the `err?.code !== "EEXIST"` true branch
    // (rethrow) rather than the lock-recovery logic.
    const lockName = "x".repeat(300);

    await expect(acquireLock(lockName, { baseDir: dir })).rejects.toMatchObject(
      {
        code: "ENAMETOOLONG",
      },
    );
  });

  it("swallows read/unlink failures and rethrows when the lock path is a directory", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"),
    );
    const lockName = "switch";
    const lockPath = path.join(dir, `${lockName}.lock`);

    // Making the lock path a directory causes fs.open(lockPath, "wx") to fail
    // with EEXIST, just like a real lock file would, so we enter the
    // recovery branch. But fs.readFile on a directory throws EISDIR, which
    // is silently swallowed (existingPid stays null), and fs.unlink on a
    // directory also fails and is silently swallowed. The final retry of
    // fs.open then fails again with EEXIST, which propagates uncaught.
    await fs.mkdir(lockPath, { recursive: true });

    await expect(acquireLock(lockName, { baseDir: dir })).rejects.toMatchObject(
      {
        code: "EEXIST",
      },
    );
  });
});
