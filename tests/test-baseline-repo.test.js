import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryDb } from "../src/ai-memory/memory-db.js";
import { TestBaselineRepo } from "../src/ai-memory/repositories/test-baseline-repo.js";

describe("TestBaselineRepo", () => {
  let tempDir;
  let originalHome;
  let db;
  let repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-baseline-repo-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    db = new MemoryDb();
    await db.init();
    repo = new TestBaselineRepo(db);
  });

  afterEach(async () => {
    db.close();
    if (originalHome == null) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("list returns an empty array when there are no baselines (line 23)", () => {
    expect(repo.list()).toEqual([]);
  });

  it("list returns all baselines, most recently recorded first (line 23)", () => {
    repo.add({
      recorded_at: "2026-01-01T00:00:00.000Z",
      passing_tests: 100,
      failing_tests: 0,
      notes: "First baseline",
    });
    repo.add({
      recorded_at: "2026-02-01T00:00:00.000Z",
      passing_tests: 120,
      failing_tests: 1,
      notes: "Second baseline",
    });

    const all = repo.list();
    expect(all).toHaveLength(2);
    // ORDER BY recorded_at DESC — most recent first.
    expect(all[0].notes).toBe("Second baseline");
    expect(all[0].passing_tests).toBe(120);
    expect(all[1].notes).toBe("First baseline");
    expect(all[1].passing_tests).toBe(100);
  });

  it("add defaults recorded_at, passing_tests, failing_tests, and notes when omitted", () => {
    const result = repo.add({});

    expect(result.recorded_at).toEqual(expect.any(String));
    expect(result.passing_tests).toBe(0);
    expect(result.failing_tests).toBe(0);
    expect(result.notes).toBe("");
  });

  it("add coerces string-typed passing/failing counts to numbers", () => {
    const result = repo.add({ passing_tests: "42", failing_tests: "3" });

    expect(result.passing_tests).toBe(42);
    expect(result.failing_tests).toBe(3);
  });

  it("getById returns undefined for a nonexistent id", () => {
    expect(repo.getById(999999)).toBeUndefined();
  });
});
