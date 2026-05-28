import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createSprint,
  loadSprint,
  listSprints,
  addPendingTask,
  completeTask,
  addBlocker,
  closeSprint,
  setTokenBudget,
  getActiveSprint,
  generateResumePrompt
} from "../src/agent-handoff.js";

describe("Agent Handoff Tracker", () => {
  it("creates, loads, and lists a sprint", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "chatgpt",
      model: "gpt-4",
      goal: "Track sprint handoff",
      tokensLimit: 1000,
      baseDir
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
      baseDir
    });

    const warningResult = await setTokenBudget(sprint.sprintId, {
      tokensUsed: 86,
      tokensLimit: 100
    }, { baseDir });
    expect(warningResult.warnings.some((text) => text.includes("85%"))).toBe(true);
    expect(warningResult.sprint.status).toBe("active");

    const exhausted = await setTokenBudget(sprint.sprintId, {
      tokensUsed: 96,
      tokensLimit: 100
    }, { baseDir });
    expect(exhausted.warnings.some((text) => text.includes("CRITICAL"))).toBe(true);
    expect(exhausted.sprint.status).toBe("exhausted");
    expect(exhausted.sprint.resumePrompt).toContain("You are continuing sprint");
  });

  it("adds and completes tasks, then generates a resume prompt", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-"));
    const sprint = await createSprint({
      agent: "gemini",
      model: "gemini-pro",
      goal: "Finish sprint task list",
      tokensLimit: 500,
      baseDir
    });

    const pending = await addPendingTask(sprint.sprintId, "Implement handoff CLI", 1, { baseDir });
    expect(pending.pendingTasks).toHaveLength(1);
    expect(pending.pendingTasks[0].priority).toBe(1);

    const completed = await completeTask(sprint.sprintId, pending.pendingTasks[0].id, { baseDir });
    expect(completed.pendingTasks).toHaveLength(0);
    expect(completed.completedTasks).toHaveLength(1);

    const blocked = await addBlocker(sprint.sprintId, "Missing helper text", { baseDir });
    expect(blocked.blockers).toHaveLength(1);

    const closed = await closeSprint(sprint.sprintId, "paused", { baseDir });
    expect(closed.status).toBe("paused");
    expect(closed.resumePrompt.length).toBeLessThanOrEqual(800);
    expect(closed.resumePrompt).toContain("- Implement handoff CLI");
    expect(closed.resumePrompt).toContain("- Missing helper text");
  });
});
