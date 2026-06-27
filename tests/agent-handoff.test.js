import fs from "node:fs/promises";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createSprint,
  loadSprint,
  listSprints,
  addPendingTask,
  completeTask,
  addBlocker,
  closeSprint,
  setTokenBudget,
  updateSprint,
  getActiveSprint,
  generateResumePrompt,
  parseSprintOrThrowDomainError,
  loadLatestSprintManifest,
  mapSprintManifestToSnapshot,
  mapSprintManifestToHandoff,
} from "../src/agent-handoff.js";
import { DomainError } from "../src/error.js";

describe("Agent Handoff Tracker", () => {
  it("creates, loads, and lists a sprint", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "chatgpt",
      model: "gpt-4",
      goal: "Track sprint handoff",
      tokensLimit: 1000,
      baseDir,
    });

    expect(sprint.agent).toBe("chatgpt");
    expect(sprint.status).toBe("active");
    expect(sprint.resumePrompt).toBe("");

    const loaded = await loadSprint(sprint.sprintId, { baseDir });
    expect(loaded.sprintId).toBe(sprint.sprintId);

    const active = await getActiveSprint({ baseDir });
    expect(active?.sprintId).toBe(sprint.sprintId);

    const all = await listSprints({ baseDir });
    expect(all).toHaveLength(1);
  });

  it("warns and exhausts a sprint when token budget is exceeded", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Exhaust token budget",
      tokensLimit: 100,
      baseDir,
    });

    const warningResult = await setTokenBudget(
      sprint.sprintId,
      {
        tokensUsed: 86,
        tokensLimit: 100,
      },
      { baseDir },
    );
    expect(warningResult.warnings.some((text) => text.includes("85%"))).toBe(
      true,
    );
    expect(warningResult.sprint.status).toBe("active");

    const exhausted = await setTokenBudget(
      sprint.sprintId,
      {
        tokensUsed: 96,
        tokensLimit: 100,
      },
      { baseDir },
    );
    expect(exhausted.warnings.some((text) => text.includes("CRITICAL"))).toBe(
      true,
    );
    expect(exhausted.sprint.status).toBe("exhausted");
    expect(exhausted.sprint.resumePrompt).toContain(
      "You are continuing sprint",
    );
  });

  it("adds and completes tasks, then generates a resume prompt", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "gemini",
      model: "gemini-pro",
      goal: "Finish sprint task list",
      tokensLimit: 500,
      baseDir,
    });

    const pending = await addPendingTask(
      sprint.sprintId,
      "Implement handoff CLI",
      1,
      { baseDir },
    );
    expect(pending.pendingTasks).toHaveLength(1);
    expect(pending.pendingTasks[0].priority).toBe(1);

    const completed = await completeTask(
      sprint.sprintId,
      pending.pendingTasks[0].id,
      { baseDir },
    );
    expect(completed.pendingTasks).toHaveLength(0);
    expect(completed.completedTasks).toHaveLength(1);

    const blocked = await addBlocker(sprint.sprintId, "Missing helper text", {
      baseDir,
    });
    expect(blocked.blockers).toHaveLength(1);

    const closed = await closeSprint(sprint.sprintId, "paused", { baseDir });
    expect(closed.status).toBe("paused");
    expect(closed.resumePrompt.length).toBeLessThanOrEqual(800);
    expect(closed.resumePrompt).toContain("- Implement handoff CLI");
    expect(closed.resumePrompt).toContain("- Missing helper text");
  });

  it("generates a resume prompt for a closed sprint", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "gemini",
      model: "gemini-pro",
      goal: "Review closed sprint resume",
      tokensLimit: 500,
      baseDir,
    });

    const closed = await closeSprint(sprint.sprintId, "complete", { baseDir });
    expect(closed.status).toBe("complete");
    expect(closed.resumePrompt).toBe("");

    const prompt = generateResumePrompt(closed);
    expect(prompt).toContain("Review closed sprint resume");
    expect(prompt).toContain("You are continuing sprint");
  });

  // ---------------------------------------------------------------------
  // Coverage gap-fill tests
  // ---------------------------------------------------------------------

  it("formats non-Error validation failures (line 46 false branch)", () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw "boom";
        },
      },
    );
    expect(() =>
      parseSprintOrThrowDomainError(trap, { operation: "test" }),
    ).toThrow(/Invalid sprint handoff/);
  });

  it("rethrows a DomainError raised during parsing unchanged (line 62)", () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw new DomainError("ROTATOR_CUSTOM", "raw domain failure");
        },
      },
    );
    expect(() =>
      parseSprintOrThrowDomainError(trap, { operation: "test" }),
    ).toThrow("raw domain failure");
  });

  it("throws ROTATOR_HANDOFF_MISSING when sprint file cannot be found (line 97)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(loadSprint("does-not-exist", { baseDir })).rejects.toThrow(
      /Sprint not found/,
    );
  });

  it("sorts pending tasks by priority in the resume prompt (lines 113-114)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Order pending tasks",
      tokensLimit: 500,
      baseDir,
    });

    await addPendingTask(sprint.sprintId, "Low priority task", 3, { baseDir });
    await addPendingTask(sprint.sprintId, "High priority task", 1, { baseDir });
    await addPendingTask(sprint.sprintId, "Mid priority task", 2, { baseDir });

    const closed = await closeSprint(sprint.sprintId, "paused", { baseDir });
    const highIdx = closed.resumePrompt.indexOf("High priority task");
    const midIdx = closed.resumePrompt.indexOf("Mid priority task");
    const lowIdx = closed.resumePrompt.indexOf("Low priority task");
    expect(highIdx).toBeGreaterThanOrEqual(0);
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  it("includes changed files and failing tests in the resume prompt (lines 122, 125)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Track files and failing tests",
      tokensLimit: 500,
      baseDir,
    });

    const updated = await updateSprint(
      sprint.sprintId,
      {
        status: "paused",
        filesCreated: ["src/new-file.js"],
        filesModified: ["src/existing-file.js"],
        testsFailed: [
          { name: "some.test.js", error: "expected true to be false" },
        ],
      },
      { baseDir },
    );

    expect(updated.resumePrompt).toContain("- src/new-file.js");
    expect(updated.resumePrompt).toContain("- src/existing-file.js");
    expect(updated.resumePrompt).toContain(
      "- some.test.js: expected true to be false",
    );
  });

  it("throws for an invalid sprint status (line 152)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(
      createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Invalid status",
        tokensLimit: 100,
        status: "bogus-status",
        baseDir,
      }),
    ).rejects.toThrow(/Invalid sprint status/);
  });

  it("throws for an invalid sprint agent (line 160)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(
      createSprint({
        agent: "bogus-agent",
        model: "claude-sonnet-4-6",
        goal: "Invalid agent",
        tokensLimit: 100,
        baseDir,
      }),
    ).rejects.toThrow(/Invalid agent/);
  });

  it("requires a goal when creating a sprint (line 232, catch block 262-267)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(
      createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "   ",
        tokensLimit: 100,
        baseDir,
      }),
    ).rejects.toThrow(/Sprint goal is required/);
  });

  it("surfaces a generic read failure while loading a sprint (lines 174-181)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Trigger read failure",
      tokensLimit: 100,
      baseDir,
    });

    const enoentSpy = vi
      .spyOn(fsp, "readFile")
      .mockImplementationOnce(async () => {
        const err = new Error("gone");
        err.code = "ENOENT";
        throw err;
      });
    await expect(loadSprint(sprint.sprintId, { baseDir })).rejects.toThrow(
      /Sprint not found/,
    );
    enoentSpy.mockRestore();

    const genericSpy = vi
      .spyOn(fsp, "readFile")
      .mockImplementationOnce(async () => {
        throw new Error("disk exploded");
      });
    await expect(loadSprint(sprint.sprintId, { baseDir })).rejects.toThrow(
      /Invalid sprint handoff/,
    );
    genericSpy.mockRestore();
  });

  it("skips and warns about invalid manifests when listing sprints (lines 212-221)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Valid sprint",
      tokensLimit: 100,
      baseDir,
    });

    const sprintsDir = path.join(baseDir, ".vscode-rotator", "sprints");
    // Deliberately broken JSON guarantees the catch block fires regardless of
    // how permissive the underlying zod schema is (a malformed-but-valid-JSON
    // object might still pass a lenient schema and never hit the catch). This
    // produces a plain SyntaxError, hitting the `instanceof DomainError`
    // FALSE branch.
    await fs.writeFile(
      path.join(
        sprintsDir,
        `${new Date().toISOString().slice(0, 10)}-bad-manifest.json`,
      ),
      "{ this is not valid json",
      "utf8",
    );

    const all = await listSprints({ baseDir });
    expect(all).toHaveLength(1);
  });

  it("treats valid-JSON-but-schema-invalid manifests as DomainErrors when listing (line 212-214 true branch)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Valid sprint",
      tokensLimit: 100,
      baseDir,
    });

    const sprintsDir = path.join(baseDir, ".vscode-rotator", "sprints");
    // Valid JSON, but it fails schema validation. parseSprintOrThrowDomainError
    // wraps this in a DomainError before throwing, so listSprints' catch block
    // sees `error instanceof DomainError === true`.
    await fs.writeFile(
      path.join(
        sprintsDir,
        `${new Date().toISOString().slice(0, 10)}-schema-invalid.json`,
      ),
      JSON.stringify({ not: "a valid sprint shape" }),
      "utf8",
    );

    const all = await listSprints({ baseDir });
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("logs and rethrows when addPendingTask fails (lines 336-341)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Invalid priority",
      tokensLimit: 100,
      baseDir,
    });

    await expect(
      addPendingTask(sprint.sprintId, "Bad priority task", 99, { baseDir }),
    ).rejects.toThrow();
  });

  it("logs and rethrows when addBlocker fails (lines 388-393)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(
      addBlocker("does-not-exist", "Some blocker", { baseDir }),
    ).rejects.toThrow(/Sprint not found/);
  });

  it("logs and rethrows when closeSprint fails (lines 411-417)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(
      closeSprint("does-not-exist", "paused", { baseDir }),
    ).rejects.toThrow(/Sprint not found/);
  });

  it("breaks ties by filename when loading the latest manifest (line 442)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprintsDir = path.join(baseDir, ".vscode-rotator", "sprints");
    await fs.mkdir(sprintsDir, { recursive: true, mode: 0o700 });

    const day = new Date().toISOString().slice(0, 10);
    await fs.writeFile(
      path.join(sprintsDir, `${day}-aaa.json`),
      JSON.stringify({ sprintId: "aaa", goal: "first" }),
      "utf8",
    );
    await fs.writeFile(
      path.join(sprintsDir, `${day}-zzz.json`),
      JSON.stringify({ sprintId: "zzz", goal: "second" }),
      "utf8",
    );

    const manifest = await loadLatestSprintManifest({ baseDir });
    expect(manifest.sprintId).toBe("zzz");
  });

  it("returns null when the latest manifest cannot be parsed (line 451)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprintsDir = path.join(baseDir, ".vscode-rotator", "sprints");
    await fs.mkdir(sprintsDir, { recursive: true, mode: 0o700 });

    const day = new Date().toISOString().slice(0, 10);
    await fs.writeFile(
      path.join(sprintsDir, `${day}-corrupt.json`),
      "{not valid json",
      "utf8",
    );

    const manifest = await loadLatestSprintManifest({ baseDir });
    expect(manifest).toBeNull();
  });

  it("maps a manifest to a snapshot and handoff shape", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Map manifest",
      tokensLimit: 100,
      baseDir,
    });
    await addPendingTask(sprint.sprintId, "Pending task", 2, { baseDir });
    await addBlocker(sprint.sprintId, "Some blocker", { baseDir });
    const manifest = await loadLatestSprintManifest({ baseDir });

    const snapshot = mapSprintManifestToSnapshot(manifest);
    expect(snapshot.sprint_name).toBe(sprint.sprintId);
    expect(snapshot.blockers[0]).toContain("Some blocker");
    expect(snapshot.next_steps[0]).toContain("Pending task");

    const handoff = mapSprintManifestToHandoff(manifest);
    expect(handoff.sprint_name).toBe(sprint.sprintId);
    expect(handoff.pending_tasks[0]).toContain("Pending task");

    expect(mapSprintManifestToSnapshot(null)).toBeNull();
    expect(mapSprintManifestToHandoff(null)).toBeNull();
  });

  it("falls back to 'root' for top-level zod issues with an empty path (line 43)", () => {
    // Passing a non-object causes zod's invalid_type issue to have an empty
    // path array, exercising the `issue.path.join(".") || "root"` fallback.
    expect(() =>
      parseSprintOrThrowDomainError("not-an-object", { operation: "test" }),
    ).toThrow(/Invalid sprint handoff/);
  });

  it("falls back to an empty status string when status is falsy (line 148)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await expect(
      createSprint({
        agent: "claude",
        model: "claude-sonnet-4-6",
        goal: "Falsy status",
        tokensLimit: 100,
        status: "",
        baseDir,
      }),
    ).rejects.toThrow(/Invalid sprint status/);
  });

  it("falls back to 'other' when agent is falsy (line 156)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "",
      model: "claude-sonnet-4-6",
      goal: "Falsy agent",
      tokensLimit: 100,
      baseDir,
    });
    expect(sprint.agent).toBe("other");
  });

  it("falls back to defaults when model is falsy and tokensLimit is nullish (lines 239-242)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "",
      goal: "Falsy model and nullish tokensLimit",
      tokensLimit: null,
      baseDir,
    });
    expect(sprint.model).toBe("unknown");
    expect(sprint.tokensLimit).toBe(0);
  });

  it("leaves tokensLimit untouched when only tokensUsed is provided (line 275)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Partial token update",
      tokensLimit: 200,
      baseDir,
    });

    const result = await setTokenBudget(
      sprint.sprintId,
      { tokensUsed: 10 },
      { baseDir },
    );
    expect(result.sprint.tokensUsed).toBe(10);
    expect(result.sprint.tokensLimit).toBe(200);
  });

  it("falls back to a default error code when addBlocker fails with a plain Error (line 391)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Blocker write failure",
      tokensLimit: 100,
      baseDir,
    });

    // Force saveSprint's fs.writeFile to fail with a plain Error that has no
    // .code property, exercising the `err?.code || "..."` fallback branch.
    const writeSpy = vi
      .spyOn(fsp, "writeFile")
      .mockImplementationOnce(async () => {
        throw new Error("disk exploded");
      });
    await expect(
      addBlocker(sprint.sprintId, "Some blocker", { baseDir }),
    ).rejects.toThrow(/disk exploded/);
    writeSpy.mockRestore();
  });

  it("falls back to a default error code when closeSprint fails with a plain Error (line 415)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Close with invalid status",
      tokensLimit: 100,
      baseDir,
    });

    // normalizeStatus throws a plain Error (no .code), exercising the
    // `err?.code || "..."` fallback branch in closeSprint's catch block.
    await expect(
      closeSprint(sprint.sprintId, "not-a-real-status", { baseDir }),
    ).rejects.toThrow(/Invalid sprint status/);
  });

  it("falls back to the 1970 epoch date for non-date-prefixed filenames (line 435)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprintsDir = path.join(baseDir, ".vscode-rotator", "sprints");
    await fs.mkdir(sprintsDir, { recursive: true, mode: 0o700 });

    // This filename's first 10 characters don't match the yyyy-mm-dd regex,
    // so it sorts as if dated 1970-01-01 and should lose to the real date.
    await fs.writeFile(
      path.join(sprintsDir, "not-a-date-prefix.json"),
      JSON.stringify({ sprintId: "old-fallback" }),
      "utf8",
    );
    const day = new Date().toISOString().slice(0, 10);
    await fs.writeFile(
      path.join(sprintsDir, `${day}-real.json`),
      JSON.stringify({ sprintId: "real-dated" }),
      "utf8",
    );

    const manifest = await loadLatestSprintManifest({ baseDir });
    expect(manifest.sprintId).toBe("real-dated");
  });

  it("maps mixed string/object blockers and pending tasks for the snapshot view (lines 460-462, 468-470)", () => {
    const manifest = {
      sprintId: "snap-1",
      status: "active",
      goal: "Mixed shapes",
      date: "2024-01-01T00:00:00.000Z",
      blockers: [
        "plain string blocker",
        { description: "object blocker, no fix" },
        {
          description: "object blocker, with fix",
          suggestedFix: "do the thing",
        },
        {},
      ],
      pendingTasks: [
        "plain string task",
        { description: "object task, no priority" },
        { description: "object task, with priority", priority: 2 },
        { priority: 1 },
      ],
    };

    const snapshot = mapSprintManifestToSnapshot(manifest);
    expect(snapshot.blockers).toEqual([
      "plain string blocker",
      "object blocker, no fix",
      "object blocker, with fix (fix: do the thing)",
      "{}",
    ]);
    expect(snapshot.next_steps).toEqual([
      "plain string task",
      "object task, no priority",
      "object task, with priority (priority 2)",
      "(priority 1)",
    ]);

    const emptySnapshot = mapSprintManifestToSnapshot({ sprintId: "snap-2" });
    expect(emptySnapshot.blockers).toEqual([]);
    expect(emptySnapshot.next_steps).toEqual([]);
  });

  it("maps mixed string/object completed and pending tasks for the handoff view (lines 486-489, 492-493)", () => {
    const manifest = {
      sprintId: "handoff-1",
      date: "2024-01-01T00:00:00.000Z",
      resumePrompt: "",
      completedTasks: ["plain string done", { description: "object done" }, {}],
      pendingTasks: [
        "plain string pending",
        { description: "object pending, with priority", priority: 1 },
        { description: "object pending, no priority" },
        { priority: 2 },
      ],
    };

    const handoff = mapSprintManifestToHandoff(manifest);
    expect(handoff.completed_steps).toEqual([
      "plain string done",
      "object done",
      "",
    ]);
    expect(handoff.pending_tasks).toEqual([
      "plain string pending",
      "object pending, with priority (priority 1)",
      "object pending, no priority",
      "(priority 2)",
    ]);
    expect(handoff.resume_summary).toContain("Resume state for sprint");

    const emptyHandoff = mapSprintManifestToHandoff({ sprintId: "handoff-2" });
    expect(emptyHandoff.completed_steps).toEqual([]);
    expect(emptyHandoff.pending_tasks).toEqual([]);
  });

  it("falls back to a default code when a caught DomainError has none (line 219)", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    await createSprint({
      agent: "claude",
      model: "claude-sonnet-4-6",
      goal: "Trigger codeless DomainError",
      tokensLimit: 100,
      baseDir,
    });

    // Every other path that reaches listSprints' catch block produces a
    // DomainError with an explicit code, so domainError.code is always
    // truthy. The only way to exercise the `|| "ROTATOR_SPRINT_INVALID"`
    // fallback is to have the read itself throw a DomainError with no code.
    const readSpy = vi
      .spyOn(fsp, "readFile")
      .mockImplementationOnce(async () => {
        throw new DomainError(undefined, "codeless failure");
      });
    const all = await listSprints({ baseDir });
    expect(all).toEqual([]);
    readSpy.mockRestore();
  });
});
