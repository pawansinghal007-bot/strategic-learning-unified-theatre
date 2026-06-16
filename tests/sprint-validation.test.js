import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadSprint, saveSprint } from "../src/agent-handoff.js";
import { loadDashboardSurface } from './dashboard-loader.js';

function validSprint(overrides = {}) {
  return {
    sprintId: "11111111-1111-4111-8111-111111111111",
    date: "2026-05-25T00:00:00.000Z",
    agent: "chatgpt",
    model: "gpt-test",
    goal: "Validate sprint persistence",
    tokensUsed: 1,
    tokensLimit: 100,
    status: "active",
    completedTasks: [],
    pendingTasks: [],
    blockers: [],
    filesCreated: [],
    filesModified: [],
    testsPassed: [],
    testsFailed: [],
    resumePrompt: "",
    ...overrides
  };
}

describe("Sprint validation", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprint-validation-"));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("saveSprint with missing required field throws ROTATOR_SPRINT_INVALID", async () => {
    const sprint = validSprint();
    delete sprint.goal;

    await expect(saveSprint(sprint, baseDir)).rejects.toMatchObject({
      code: "ROTATOR_SPRINT_INVALID"
    });
  });

  it("loadSprint with corrupt JSON throws ROTATOR_HANDOFF_CORRUPT", async () => {
    const dir = path.join(baseDir, ".vscode-rotator", "sprints");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "2026-05-25-11111111-1111-4111-8111-111111111111.json"),
      "{ corrupt json",
      "utf8"
    );

    await expect(loadSprint("11111111-1111-4111-8111-111111111111", { baseDir })).rejects.toMatchObject({
      code: "ROTATOR_HANDOFF_CORRUPT"
    });
  });

  it("valid sprint round-trips through save/load without error", async () => {
    const saved = await saveSprint(validSprint(), baseDir);
    const loaded = await loadSprint(saved.sprintId, { baseDir });

    expect(loaded.sprintId).toBe(saved.sprintId);
    expect(loaded.goal).toBe("Validate sprint persistence");
  });
});
