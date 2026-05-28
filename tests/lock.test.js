import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { acquireLock, releaseLock } from "../src/lock.js";

describe("lock", () => {
  it("throws when lock exists for a running process", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"));
    const lockName = "switch";

    await acquireLock(lockName, { baseDir: dir });
    await expect(acquireLock(lockName, { baseDir: dir })).rejects.toThrow(
      /lock/i
    );
    await releaseLock(lockName, { baseDir: dir });
  });

  it("re-acquires when lock exists for a non-existent process", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-learning-unified-theatre-lock-"));
    const lockName = "switch";
    const lockPath = path.join(dir, `${lockName}.lock`);

    await fs.writeFile(lockPath, "999999", "utf8");

    const acquiredPath = await acquireLock(lockName, { baseDir: dir });
    expect(acquiredPath).toBe(lockPath);
    await releaseLock(lockName, { baseDir: dir });
  });
});

