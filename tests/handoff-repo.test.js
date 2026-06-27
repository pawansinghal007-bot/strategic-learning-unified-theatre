import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryDb } from "../src/ai-memory/memory-db.js";
import { HandoffRepo } from "../src/ai-memory/repositories/handoff-repo.js";

describe("HandoffRepo", () => {
  let tempDir;
  let originalHome;
  let db;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-repo-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;

    db = new MemoryDb();
    await db.init();
  });

  afterEach(async () => {
    db.close();
    if (originalHome == null) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("upserts with all fields explicitly provided", () => {
    const repo = new HandoffRepo(db);
    const saved = repo.upsert({
      sprint_name: "sprint-1",
      resume_summary: "Resume here",
      completed_steps: ["a", "b"],
      pending_tasks: ["c"],
      last_agent_output: "Done for now",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(saved.sprint_name).toBe("sprint-1");
    expect(saved.resume_summary).toBe("Resume here");
    expect(saved.completed_steps).toEqual(["a", "b"]);
    expect(saved.pending_tasks).toEqual(["c"]);
    expect(saved.last_agent_output).toBe("Done for now");
    expect(saved.updated_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("defaults every optional field when only sprint_name is given", () => {
    const before = Date.now();
    const repo = new HandoffRepo(db);
    const saved = repo.upsert({ sprint_name: "sprint-2" });
    const after = Date.now();

    expect(saved.resume_summary).toBe("");
    expect(saved.completed_steps).toEqual([]);
    expect(saved.pending_tasks).toEqual([]);
    expect(saved.last_agent_output).toBe("");
    const savedMs = Date.parse(saved.updated_at);
    expect(savedMs).toBeGreaterThanOrEqual(before);
    expect(savedMs).toBeLessThanOrEqual(after);
  });

  it("upserting the same sprint_name again updates rather than duplicates", () => {
    const repo = new HandoffRepo(db);
    repo.upsert({ sprint_name: "sprint-3", resume_summary: "First" });
    repo.upsert({ sprint_name: "sprint-3", resume_summary: "Second" });

    expect(
      repo.list().filter((r) => r.sprint_name === "sprint-3"),
    ).toHaveLength(1);
    expect(repo.getBySprint("sprint-3").resume_summary).toBe("Second");
  });

  it("getBySprint returns null when no row matches", () => {
    const repo = new HandoffRepo(db);
    expect(repo.getBySprint("does-not-exist")).toBeNull();
  });

  it("getLatest returns null when the table is empty", () => {
    const repo = new HandoffRepo(db);
    expect(repo.getLatest()).toBeNull();
  });

  it("getLatest returns the most recently updated row", () => {
    const repo = new HandoffRepo(db);
    repo.upsert({
      sprint_name: "sprint-old",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    repo.upsert({
      sprint_name: "sprint-new",
      updated_at: "2026-06-01T00:00:00.000Z",
    });

    expect(repo.getLatest().sprint_name).toBe("sprint-new");
  });

  it("list() returns all rows ordered by updated_at descending (line 42)", () => {
    const repo = new HandoffRepo(db);
    repo.upsert({
      sprint_name: "sprint-a",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    repo.upsert({
      sprint_name: "sprint-b",
      updated_at: "2026-03-01T00:00:00.000Z",
    });
    repo.upsert({
      sprint_name: "sprint-c",
      updated_at: "2026-02-01T00:00:00.000Z",
    });

    const all = repo.list();
    expect(all.map((r) => r.sprint_name)).toEqual([
      "sprint-b",
      "sprint-c",
      "sprint-a",
    ]);
    // Each row passes through _normalize(), so JSON fields are arrays.
    expect(Array.isArray(all[0].completed_steps)).toBe(true);
    expect(Array.isArray(all[0].pending_tasks)).toBe(true);
  });

  it("_normalize() falls back to an empty array for falsy completed_steps/pending_tasks", () => {
    const repo = new HandoffRepo(db);
    const normalized = repo._normalize({
      sprint_name: "raw-row",
      resume_summary: "",
      completed_steps: null,
      pending_tasks: "",
      last_agent_output: "",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(normalized.completed_steps).toEqual([]);
    expect(normalized.pending_tasks).toEqual([]);
  });

  it("_normalize() parses truthy JSON-string fields", () => {
    const repo = new HandoffRepo(db);
    const normalized = repo._normalize({
      sprint_name: "raw-row-2",
      completed_steps: '["x","y"]',
      pending_tasks: '["z"]',
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(normalized.completed_steps).toEqual(["x", "y"]);
    expect(normalized.pending_tasks).toEqual(["z"]);
  });
});
