import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryDb } from "../src/ai-memory/memory-db.js";
import { SprintStateRepo } from "../src/ai-memory/repositories/sprint-state-repo.js";

describe("SprintStateRepo", () => {
  let tempDir;
  let originalHome;
  let db;
  let repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprint-state-repo-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    db = new MemoryDb();
    await db.init();
    repo = new SprintStateRepo(db);
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

  it("getBySprint returns null when no row matches (line 33 false branch)", () => {
    expect(repo.getBySprint("does-not-exist")).toBeNull();
  });

  it("getBySprint returns the normalized row when one matches", () => {
    repo.upsert({
      sprint_name: "sprint-1",
      status: "active",
      current_goal: "Ship it",
      blockers: ["blocked-on-x"],
      next_steps: ["step-1", "step-2"],
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const found = repo.getBySprint("sprint-1");
    expect(found.sprint_name).toBe("sprint-1");
    expect(found.blockers).toEqual(["blocked-on-x"]);
    expect(found.next_steps).toEqual(["step-1", "step-2"]);
  });

  it("getLatest returns null when the table is empty (line 38 false branch)", () => {
    expect(repo.getLatest()).toBeNull();
  });

  it("list returns an empty array when there are no rows (line 42)", () => {
    expect(repo.list()).toEqual([]);
  });

  it("list returns all rows, normalized, most recently updated first (line 42)", () => {
    repo.upsert({
      sprint_name: "sprint-1",
      status: "complete",
      current_goal: "First",
      blockers: [],
      next_steps: [],
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    repo.upsert({
      sprint_name: "sprint-2",
      status: "active",
      current_goal: "Second",
      blockers: ["b1"],
      next_steps: ["n1", "n2"],
      updated_at: "2026-02-01T00:00:00.000Z",
    });

    const all = repo.list();
    expect(all).toHaveLength(2);
    // ORDER BY updated_at DESC — most recent first.
    expect(all[0].sprint_name).toBe("sprint-2");
    expect(all[0].blockers).toEqual(["b1"]);
    expect(all[0].next_steps).toEqual(["n1", "n2"]);
    expect(all[1].sprint_name).toBe("sprint-1");
    expect(all[1].blockers).toEqual([]);
    expect(all[1].next_steps).toEqual([]);
  });

  it("upsert defaults status, current_goal, blockers, next_steps, and updated_at when omitted", () => {
    const result = repo.upsert({ sprint_name: "sprint-defaults" });

    expect(result.status).toBe("active");
    expect(result.current_goal).toBe("");
    expect(result.blockers).toEqual([]);
    expect(result.next_steps).toEqual([]);
    expect(result.updated_at).toEqual(expect.any(String));
  });

  it("upsert updates an existing row on conflict rather than duplicating it", () => {
    repo.upsert({
      sprint_name: "sprint-conflict",
      status: "active",
      current_goal: "First goal",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    repo.upsert({
      sprint_name: "sprint-conflict",
      status: "complete",
      current_goal: "Updated goal",
      updated_at: "2026-01-02T00:00:00.000Z",
    });

    expect(repo.list()).toHaveLength(1);
    const updated = repo.getBySprint("sprint-conflict");
    expect(updated.status).toBe("complete");
    expect(updated.current_goal).toBe("Updated goal");
  });
});
