/**
 * lock-coverage_test.js
 *
 * Covers all remaining branch gaps in lock.js:
 *
 *   6    resolveBaseDir: baseDir ?? ... → right side when baseDir is undefined
 *   11   resolveLockPath: name.endsWith(".lock") → true branch (name already has suffix)
 *   16   isProcessAlive: !Number.isInteger(pid) → return false; pid <= 0 → return false
 *   20   isProcessAlive: process.kill throws → catch → return false
 *   40   acquireLock: err.code !== "EEXIST" → throw err (unexpected open error)
 *   46   acquireLock: Number.isFinite(parsed) ? parsed : null → null (non-numeric content)
 *   72   releaseLock: err.code !== "ENOENT" → throw err (unexpected unlink error)
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";

import { acquireLock, releaseLock } from "../src/lock.js";

describe("lock: branch coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── line 6: resolveBaseDir – ?? right side ────────────────────────────────
  // When acquireLock/releaseLock is called with no options (or baseDir
  // undefined), resolveBaseDir falls through to path.join(os.homedir(), ...).
  // We don't actually write to homedir; we spy on fs.mkdir and fs.open to
  // make the call observable without touching the filesystem.
  it("resolveBaseDir uses homedir when baseDir is not provided (line 6)", async () => {
    const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined);
    // Make fs.open succeed by returning a fake handle
    const fakeHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(fs, "open").mockResolvedValue(fakeHandle);

    // Call without any options — baseDir is undefined → ?? fires
    const result = await acquireLock("test-default-dir");

    const expectedDir = path.join(os.homedir(), ".vscode-rotator");
    expect(mkdirSpy).toHaveBeenCalledWith(expectedDir, expect.any(Object));
    expect(result).toBe(path.join(expectedDir, "test-default-dir.lock"));
  });

  // ── line 11: resolveLockPath – name already ends in ".lock" ──────────────
  // The ternary `name.endsWith(".lock") ? name : \`${name}.lock\`` takes the
  // true branch when the caller passes a name that already has the suffix.
  it("resolveLockPath uses name as-is when it already ends in .lock (line 11)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-suffix-"));

    const result = await acquireLock("mylock.lock", { baseDir: dir });

    // The file must be named exactly "mylock.lock", not "mylock.lock.lock"
    expect(path.basename(result)).toBe("mylock.lock");
    expect(result).toBe(path.join(dir, "mylock.lock"));
    await releaseLock("mylock.lock", { baseDir: dir });
  });

  // ── line 16: isProcessAlive – non-integer pid → return false ─────────────
  // isProcessAlive is called with `existingPid` which comes from
  // Number.parseInt on the lock file contents. A non-numeric file yields
  // existingPid=null (falsy), so isProcessAlive is never reached that way.
  // To hit the !Number.isInteger branch we need to reach isProcessAlive with
  // a non-integer. We write a lock file with a float string so parseInt
  // returns a finite but non-integer value... but parseInt("1.5") === 1
  // (integer). Instead: write a lock file with "0" so parsed=0, which is
  // finite and an integer but pid<=0 → return false (line 16 second branch).
  it("isProcessAlive returns false for pid <= 0, allowing lock re-acquisition (line 16)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-pid0-"));
    const lockPath = path.join(dir, "switch.lock");

    // pid=0 is a valid integer but <= 0 → isProcessAlive returns false
    await fs.writeFile(lockPath, "0", "utf8");

    const result = await acquireLock("switch", { baseDir: dir });
    expect(result).toBe(lockPath);
    await releaseLock("switch", { baseDir: dir });
  });

  it("isProcessAlive returns false for non-integer pid (NaN from non-numeric content gives null existingPid, skipping isProcessAlive; use negative pid instead) (line 16)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-negpid-"));
    const lockPath = path.join(dir, "switch.lock");

    // A negative pid: parseInt("-5") = -5, which is a finite integer but <= 0
    // → isProcessAlive(-5) → !Number.isInteger(-5) is false, -5 <= 0 is true → return false
    await fs.writeFile(lockPath, "-5", "utf8");

    const result = await acquireLock("switch", { baseDir: dir });
    expect(result).toBe(lockPath);
    await releaseLock("switch", { baseDir: dir });
  });

  // ── line 20-21: isProcessAlive – process.kill throws → return false ──────
  // process.kill(pid, 0) throws when the process does not exist (ESRCH).
  // We use a pid that is extremely unlikely to exist (max safe int).
  it("isProcessAlive returns false when process.kill throws for a non-existent pid (lines 20-21)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-dead-"));
    const lockPath = path.join(dir, "switch.lock");

    // Use a pid so large it cannot possibly be a running process
    const deadPid = 2_000_000;
    await fs.writeFile(lockPath, String(deadPid), "utf8");

    // process.kill(2_000_000, 0) throws ESRCH → isProcessAlive catches → false
    // → lock is considered stale → re-acquired
    const result = await acquireLock("switch", { baseDir: dir });
    expect(result).toBe(lockPath);
    await releaseLock("switch", { baseDir: dir });
  });

  // ── line 40: acquireLock – fs.open throws non-EEXIST error → rethrown ────
  // The catch block on line 39 only swallows EEXIST; any other error is
  // re-thrown on line 40. We simulate a permissions error (EACCES).
  it("acquireLock rethrows non-EEXIST errors from fs.open (line 40)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-open-err-"));

    const permError = Object.assign(new Error("EACCES"), { code: "EACCES" });
    vi.spyOn(fs, "open").mockRejectedValue(permError);

    await expect(acquireLock("switch", { baseDir: dir })).rejects.toThrow(
      "EACCES",
    );
  });

  // ── line 46: existingPid = null when contents are non-numeric ─────────────
  // Number.parseInt on a non-numeric string returns NaN; Number.isFinite(NaN)
  // is false → existingPid stays null → the `if (existingPid && ...)` check
  // is skipped → lock treated as stale and re-acquired.
  it("acquireLock re-acquires when lock file contains non-numeric content (line 46)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-nan-"));
    const lockPath = path.join(dir, "switch.lock");

    // Non-numeric content → parseInt → NaN → isFinite(NaN) false → null
    await fs.writeFile(lockPath, "not-a-pid", "utf8");

    const result = await acquireLock("switch", { baseDir: dir });
    expect(result).toBe(lockPath);
    await releaseLock("switch", { baseDir: dir });
  });

  // ── line 72: releaseLock – fs.unlink throws non-ENOENT error → rethrown ──
  // The catch in releaseLock silently ignores ENOENT (already gone) but
  // re-throws any other error. We mock fs.unlink to throw EACCES.
  it("releaseLock rethrows non-ENOENT errors from fs.unlink (line 72)", async () => {
    const permError = Object.assign(new Error("EACCES"), { code: "EACCES" });
    vi.spyOn(fs, "unlink").mockRejectedValue(permError);

    await expect(
      releaseLock("switch", { baseDir: "/some/dir" }),
    ).rejects.toThrow("EACCES");
  });
  // ── line 72: releaseLock – ENOENT is silently ignored (false branch) ──────
  // When the lock file doesn't exist, fs.unlink throws ENOENT. The catch
  // checks err?.code !== "ENOENT" → false → the error is swallowed silently.
  // This covers the false branch of the conditional on line 72.
  it("releaseLock silently ignores ENOENT when lock file does not exist (line 72)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-cov-enoent-"));

    // No lock file created — unlink will throw ENOENT → swallowed
    await expect(
      releaseLock("switch", { baseDir: dir }),
    ).resolves.toBeUndefined();
  });
});
