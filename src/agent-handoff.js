import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { z } from "zod";
import { HandoffSprintSchema } from "./domain/schemas.js";
import { DomainError } from "./error.js";
import { createLogger } from "./logger.js";

const log = createLogger("handoff");

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

const SprintSchema = HandoffSprintSchema;

function formatValidationError(error) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function createSprintInvalidError(error, context = {}) {
  const detail = formatValidationError(error);
  return new DomainError("ROTATOR_SPRINT_INVALID", `Invalid sprint handoff: ${detail}`, {
    ...context,
    error: detail
  });
}

function parseSprintOrThrowDomainError(raw, context = {}) {
  try {
    return SprintSchema.parse(raw);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    throw createSprintInvalidError(error, context);
  }
}

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

async function quarantineSprintFile(filePath, reason) {
  try {
    const corruptDir = path.join(path.dirname(filePath), "corrupt");
    await fs.mkdir(corruptDir, { recursive: true, mode: 0o700 });
    const targetPath = path.join(corruptDir, `${path.basename(filePath)}.${Date.now()}.${reason}`);
    await fs.rename(filePath, targetPath);
  } catch {}
}

async function findSprintFilePath(sprintId, baseDir) {
  const dir = await ensureSprintDirectory(baseDir);
  const entries = await fs.readdir(dir);
  const match = entries.find((name) => name.endsWith(`-${sprintId}.json`));
  if (!match) {
    throw new DomainError("ROTATOR_HANDOFF_MISSING", `Sprint not found: ${sprintId}`, {
      operation: "loadSprint",
      sprintId,
      dir
    });
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
  const normalized = parseSprintOrThrowDomainError(sprint, { operation: "saveSprint" });
  const dir = await ensureSprintDirectory(baseDir);
  const filePath = path.join(dir, sprintFileName(normalized.date, normalized.sprintId));
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return { ...normalized, filePath };
}

async function loadSprint(sprintId, { baseDir } = {}) {
  const filePath = await findSprintFilePath(sprintId, baseDir);
  const raw = await fs.readFile(filePath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw new DomainError("ROTATOR_HANDOFF_MISSING", `Sprint not found: ${sprintId}`, {
        operation: "loadSprint",
        sprintId,
        filePath
      });
    }
    throw createSprintInvalidError(error, { operation: "loadSprint", sprintId, filePath });
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    await quarantineSprintFile(filePath, "invalid-json");
    throw new DomainError(
      "ROTATOR_HANDOFF_CORRUPT",
      "Sprint manifest was corrupt and has been quarantined",
      error
    );
  }
  const sprint = parseSprintOrThrowDomainError(parsed, { operation: "loadSprint", sprintId, filePath });
  return { ...sprint, filePath };
}

async function listSprints({ baseDir } = {}) {
  const dir = await ensureSprintDirectory(baseDir);
  const entries = await fs.readdir(dir);
  const sprints = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const sprint = parseSprintOrThrowDomainError(parsed, { operation: "listSprints", filePath });
      sprints.push(sprint);
    } catch (error) {
      const domainError = error instanceof DomainError
        ? error
        : createSprintInvalidError(error, { operation: "listSprints", filePath });
      log.warn("handoff.list.invalidManifest", {
        correlationId: filePath,
        filePath,
        error: domainError,
        code: domainError.code || "ROTATOR_SPRINT_INVALID"
      });
      continue;
    }
  }
  return sprints.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function createSprint({ agent = "other", model = "unknown", goal, tokensLimit = 0, status = "active", baseDir } = {}) {
  const sprintId = crypto.randomUUID();
  log.info("handoff.create.start", { correlationId: sprintId, agent, status });
  try {
    if (!goal || !String(goal).trim()) {
      throw new Error("Sprint goal is required");
    }

    const sprint = {
      sprintId,
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

    const saved = await saveSprint(sprint, baseDir);
    log.info("handoff.create.success", { correlationId: sprintId, status: saved.status });
    return saved;
  } catch (err) {
    log.error("handoff.create.failure", {
      correlationId: sprintId,
      error: err,
      code: err?.code || "ROTATOR_HANDOFF_CREATE_FAILED"
    });
    throw err;
  }
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
  log.info("handoff.task.add.start", { correlationId: sprintId, priority });
  try {
    const sprint = await loadSprint(sprintId, { baseDir });
    const task = {
      id: crypto.randomUUID(),
      description: String(description).trim(),
      priority: SprintTaskPriority.parse(priority)
    };
    sprint.pendingTasks.push(task);
    const saved = await saveSprint(sprint, baseDir);
    log.info("handoff.task.add.success", {
      correlationId: sprintId,
      taskId: task.id,
      pendingTasks: saved.pendingTasks.length
    });
    return saved;
  } catch (err) {
    log.error("handoff.task.add.failure", {
      correlationId: sprintId,
      error: err,
      code: err?.code || "ROTATOR_HANDOFF_TASK_ADD_FAILED"
    });
    throw err;
  }
}

async function completeTask(sprintId, taskId, { baseDir } = {}) {
  log.info("handoff.task.complete.start", { correlationId: sprintId, taskId });
  try {
    const sprint = await loadSprint(sprintId, { baseDir });
    const idx = sprint.pendingTasks.findIndex((task) => task.id === taskId);
    if (idx === -1) {
      throw new Error(`Pending task not found: ${taskId}`);
    }
    const [task] = sprint.pendingTasks.splice(idx, 1);
    sprint.completedTasks.push({ ...task, filesChanged: [] });
    const saved = await saveSprint(sprint, baseDir);
    log.info("handoff.task.complete.success", {
      correlationId: sprintId,
      taskId,
      completedTasks: saved.completedTasks.length
    });
    return saved;
  } catch (err) {
    log.error("handoff.task.complete.failure", {
      correlationId: sprintId,
      taskId,
      error: err,
      code: err?.code || "ROTATOR_HANDOFF_TASK_COMPLETE_FAILED"
    });
    throw err;
  }
}

async function addBlocker(sprintId, description, { baseDir } = {}) {
  log.info("handoff.blocker.add.start", { correlationId: sprintId });
  try {
    const sprint = await loadSprint(sprintId, { baseDir });
    sprint.blockers.push({
      description: String(description).trim(),
      suggestedFix: "Review the blocker and continue the sprint once resolved."
    });
    const saved = await saveSprint(sprint, baseDir);
    log.info("handoff.blocker.add.success", {
      correlationId: sprintId,
      blockers: saved.blockers.length
    });
    return saved;
  } catch (err) {
    log.error("handoff.blocker.add.failure", {
      correlationId: sprintId,
      error: err,
      code: err?.code || "ROTATOR_HANDOFF_BLOCKER_ADD_FAILED"
    });
    throw err;
  }
}

async function closeSprint(sprintId, status, { baseDir } = {}) {
  log.info("handoff.close.start", { correlationId: sprintId, status });
  try {
    const sprint = await loadSprint(sprintId, { baseDir });
    sprint.status = normalizeStatus(status);
    if (sprint.status === "paused" || sprint.status === "exhausted") {
      sprint.resumePrompt = buildResumePrompt(sprint);
    } else {
      sprint.resumePrompt = "";
    }
    const saved = await saveSprint(sprint, baseDir);
    log.info("handoff.close.success", { correlationId: sprintId, status: saved.status });
    return saved;
  } catch (err) {
    log.error("handoff.close.failure", {
      correlationId: sprintId,
      status,
      error: err,
      code: err?.code || "ROTATOR_HANDOFF_CLOSE_FAILED"
    });
    throw err;
  }
}

async function getActiveSprint({ baseDir } = {}) {
  const all = await listSprints({ baseDir });
  return all.find((s) => s.status === "active") ?? null;
}

async function loadLatestSprintManifest({ baseDir } = {}) {
  const dir = await ensureSprintDirectory(baseDir);
  const entries = await fs.readdir(dir);
  const manifests = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const datePart = name.slice(0, 10);
      return {
        filePath: path.join(dir, name),
        date: /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "1970-01-01",
        name
      };
    })
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });

  if (manifests.length === 0) return null;

  try {
    const raw = await fs.readFile(manifests.at(-1).filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapSprintManifestToSnapshot(manifest) {
  if (!manifest) return null;
  const blockers = Array.isArray(manifest.blockers)
    ? manifest.blockers.map((blocker) => {
        if (typeof blocker === "string") return blocker;
        return blocker.suggestedFix
          ? `${blocker.description} (fix: ${blocker.suggestedFix})`
          : String(blocker.description || JSON.stringify(blocker));
      })
    : [];

  const nextSteps = Array.isArray(manifest.pendingTasks)
    ? manifest.pendingTasks.map((task) => {
        if (typeof task === "string") return task;
        return `${task.description || ""}${task.priority ? ` (priority ${task.priority})` : ""}`.trim();
      })
    : [];

  return {
    sprint_name: manifest.sprintId,
    status: manifest.status ?? "active",
    current_goal: manifest.goal ?? "",
    blockers,
    next_steps: nextSteps,
    updated_at: manifest.date ?? new Date().toISOString()
  };
}

function mapSprintManifestToHandoff(manifest) {
  if (!manifest) return null;
  const completedSteps = Array.isArray(manifest.completedTasks)
    ? manifest.completedTasks.map((task) => (typeof task === "string" ? task : task.description || ""))
    : [];
  const pendingTasks = Array.isArray(manifest.pendingTasks)
    ? manifest.pendingTasks.map((task) => {
        if (typeof task === "string") return task;
        const inner = task.priority ? ` (priority ${task.priority})` : "";
        return `${task.description || ""}${inner}`.trim();
      })
    : [];

  return {
    sprint_name: manifest.sprintId,
    resume_summary: manifest.resumePrompt || `Resume state for sprint ${manifest.sprintId}`,
    completed_steps: completedSteps,
    pending_tasks: pendingTasks,
    last_agent_output: manifest.resumePrompt ?? "",
    updated_at: manifest.date ?? new Date().toISOString()
  };
}

export {
  createSprint,
  saveSprint,
  loadSprint,
  listSprints,
  addPendingTask,
  completeTask,
  addBlocker,
  closeSprint,
  updateSprint,
  getActiveSprint,
  setTokenBudget,
  buildResumePrompt as generateResumePrompt,
  parseSprintOrThrowDomainError,
  loadLatestSprintManifest,
  mapSprintManifestToSnapshot,
  mapSprintManifestToHandoff
};
