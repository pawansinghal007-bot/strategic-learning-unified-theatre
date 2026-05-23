import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { z } from "zod";

const SprintAgentSchema = z.enum(["claude", "chatgpt", "gemini", "perplexity", "other"]);
const SprintStatusSchema = z.enum(["active", "paused", "exhausted", "complete"]);
const SprintTaskPriority = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const CompletedTaskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  filesChanged: z.array(z.string())
});

const PendingTaskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  priority: SprintTaskPriority
});

const BlockerSchema = z.object({
  description: z.string().min(1),
  suggestedFix: z.string().min(1)
});

const TestFailureSchema = z.object({
  name: z.string().min(1),
  error: z.string().min(1)
});

const SprintSchema = z.object({
  sprintId: z.string().uuid(),
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO date"
  }),
  agent: SprintAgentSchema,
  model: z.string().min(1),
  goal: z.string().min(1),
  tokensUsed: z.number().nonnegative(),
  tokensLimit: z.number().nonnegative(),
  status: SprintStatusSchema,
  completedTasks: z.array(CompletedTaskSchema),
  pendingTasks: z.array(PendingTaskSchema),
  blockers: z.array(BlockerSchema),
  filesCreated: z.array(z.string()),
  filesModified: z.array(z.string()),
  testsPassed: z.array(z.string()),
  testsFailed: z.array(TestFailureSchema),
  resumePrompt: z.string()
});

function sprintRoot(baseDir) {
  return path.join(baseDir ?? os.homedir(), ".vscode-rotator", "sprints");
}

function sprintFileName(date, sprintId) {
  const day = new Date(date).toISOString().slice(0, 10);
  return `${day}-${sprintId}.json`;
}

async function ensureSprintDirectory(baseDir) {
  const dir = sprintRoot(baseDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function findSprintFilePath(sprintId, baseDir) {
  const dir = await ensureSprintDirectory(baseDir);
  const entries = await fs.readdir(dir);
  const match = entries.find((name) => name.endsWith(`-${sprintId}.json`));
  if (!match) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }
  return path.join(dir, match);
}

function buildResumePrompt(sprint) {
  const completed = sprint.completedTasks.length
    ? sprint.completedTasks.map((task) => `- ${task.description}`).join("\n")
    : "- None";
  const pending = sprint.pendingTasks.length
    ? sprint.pendingTasks
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((task) => `- ${task.description} (priority ${task.priority})`)
        .join("\n")
    : "- None";
  const blockers = sprint.blockers.length
    ? sprint.blockers.map((blocker) => `- ${blocker.description}; suggested fix: ${blocker.suggestedFix}`).join("\n")
    : "- None";
  const filesChanged = [...sprint.filesCreated, ...sprint.filesModified];
  const filesList = filesChanged.length
    ? filesChanged.map((file) => `- ${file}`).join("\n")
    : "- None";
  const testsFailing = sprint.testsFailed.length
    ? sprint.testsFailed.map((failure) => `- ${failure.name}: ${failure.error}`).join("\n")
    : "- None";

  const prompt = [
    `You are continuing sprint ${sprint.sprintId} on strategic-learning-unified-theatre.`,
    `Goal: ${sprint.goal}`,
    `Completed:`,
    completed,
    `Pending (priority order):`,
    pending,
    `Blockers:`,
    blockers,
    `Files changed:`,
    filesList,
    `Tests failing:`,
    testsFailing,
    `Start by fixing the failing tests, then continue with pending tasks in priority order.`
  ].join("\n");

  return prompt.slice(0, 800);
}

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (SprintStatusSchema.safeParse(value).success) {
    return value;
  }
  throw new Error(`Invalid sprint status: ${status}`);
}

function normalizeAgent(agent) {
  const value = String(agent || "other").trim().toLowerCase();
  if (SprintAgentSchema.safeParse(value).success) {
    return value;
  }
  throw new Error(`Invalid agent: ${agent}`);
}

async function saveSprint(sprint, baseDir) {
  const normalized = SprintSchema.parse(sprint);
  const dir = await ensureSprintDirectory(baseDir);
  const filePath = path.join(dir, sprintFileName(normalized.date, normalized.sprintId));
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return { ...normalized, filePath };
}

async function loadSprint(sprintId, { baseDir } = {}) {
  const filePath = await findSprintFilePath(sprintId, baseDir);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const sprint = SprintSchema.parse(parsed);
  return { ...sprint, filePath };
}

async function listSprints({ baseDir } = {}) {
  const dir = await ensureSprintDirectory(baseDir);
  const entries = await fs.readdir(dir);
  const sprints = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const parsed = JSON.parse(raw);
      const sprint = SprintSchema.parse(parsed);
      sprints.push(sprint);
    } catch {
      continue;
    }
  }
  return sprints.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function createSprint({ agent = "other", model = "unknown", goal, tokensLimit = 0, status = "active", baseDir } = {}) {
  if (!goal || !String(goal).trim()) {
    throw new Error("Sprint goal is required");
  }

  const sprint = {
    sprintId: crypto.randomUUID(),
    date: new Date().toISOString(),
    agent: normalizeAgent(agent),
    model: String(model || "unknown"),
    goal: String(goal).trim(),
    tokensUsed: 0,
    tokensLimit: Number(tokensLimit ?? 0),
    status: normalizeStatus(status),
    completedTasks: [],
    pendingTasks: [],
    blockers: [],
    filesCreated: [],
    filesModified: [],
    testsPassed: [],
    testsFailed: [],
    resumePrompt: ""
  };

  if (sprint.status === "paused" || sprint.status === "exhausted") {
    sprint.resumePrompt = buildResumePrompt(sprint);
  }

  return saveSprint(sprint, baseDir);
}

async function setTokenBudget(sprintId, { tokensUsed, tokensLimit } = {}, { baseDir } = {}) {
  const sprint = await loadSprint(sprintId, { baseDir });
  const next = { ...sprint };
  if (typeof tokensUsed === "number") next.tokensUsed = tokensUsed;
  if (typeof tokensLimit === "number") next.tokensLimit = tokensLimit;

  const warnings = [];
  const ratio = next.tokensLimit > 0 ? next.tokensUsed / next.tokensLimit : 0;
  if (ratio > 0.95) {
    next.status = "exhausted";
    warnings.push("CRITICAL: 95% of token budget used — sprint is exhausted.");
  } else if (ratio > 0.85) {
    warnings.push("⚠ 85% of token budget used — consider handoff soon");
  }

  if (next.status === "paused" || next.status === "exhausted") {
    next.resumePrompt = buildResumePrompt(next);
  }

  const saved = await saveSprint(next, baseDir);
  return { sprint: saved, warnings };
}

async function updateSprint(sprintId, patch = {}, { baseDir } = {}) {
  const sprint = await loadSprint(sprintId, { baseDir });
  const next = { ...sprint, ...patch };

  if (patch.status) {
    next.status = normalizeStatus(patch.status);
  }
  if (patch.agent) {
    next.agent = normalizeAgent(patch.agent);
  }
  if (typeof patch.tokensUsed === "number") {
    next.tokensUsed = patch.tokensUsed;
  }
  if (typeof patch.tokensLimit === "number") {
    next.tokensLimit = patch.tokensLimit;
  }

  if (next.status === "paused" || next.status === "exhausted") {
    next.resumePrompt = buildResumePrompt(next);
  }

  return saveSprint(next, baseDir);
}

async function addPendingTask(sprintId, description, priority = 3, { baseDir } = {}) {
  const sprint = await loadSprint(sprintId, { baseDir });
  const task = {
    id: crypto.randomUUID(),
    description: String(description).trim(),
    priority: SprintTaskPriority.parse(priority)
  };
  sprint.pendingTasks.push(task);
  return saveSprint(sprint, baseDir);
}

async function completeTask(sprintId, taskId, { baseDir } = {}) {
  const sprint = await loadSprint(sprintId, { baseDir });
  const idx = sprint.pendingTasks.findIndex((task) => task.id === taskId);
  if (idx === -1) {
    throw new Error(`Pending task not found: ${taskId}`);
  }
  const [task] = sprint.pendingTasks.splice(idx, 1);
  sprint.completedTasks.push({ ...task, filesChanged: [] });
  return saveSprint(sprint, baseDir);
}

async function addBlocker(sprintId, description, { baseDir } = {}) {
  const sprint = await loadSprint(sprintId, { baseDir });
  sprint.blockers.push({
    description: String(description).trim(),
    suggestedFix: "Review the blocker and continue the sprint once resolved."
  });
  return saveSprint(sprint, baseDir);
}

async function closeSprint(sprintId, status, { baseDir } = {}) {
  const sprint = await loadSprint(sprintId, { baseDir });
  sprint.status = normalizeStatus(status);
  if (sprint.status === "paused" || sprint.status === "exhausted") {
    sprint.resumePrompt = buildResumePrompt(sprint);
  } else {
    sprint.resumePrompt = "";
  }
  return saveSprint(sprint, baseDir);
}

async function getActiveSprint({ baseDir } = {}) {
  const all = await listSprints({ baseDir });
  return all.find((s) => s.status === "active") ?? null;
}

export {
  createSprint,
  loadSprint,
  listSprints,
  addPendingTask,
  completeTask,
  addBlocker,
  closeSprint,
  updateSprint,
  getActiveSprint,
  setTokenBudget,
  buildResumePrompt as generateResumePrompt
};
