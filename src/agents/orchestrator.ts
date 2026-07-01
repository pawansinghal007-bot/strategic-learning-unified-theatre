import { runSubAgent } from "./sub-agent";
import { parsePipeline, interpolate } from "./pipeline";
import { logger } from "../shared/logging/logger";
import * as fs from "node:fs";
import * as path from "node:path";
import { appendSessionLog, SessionLogEntry } from "./memory/session-log";

const CLAUDE_DIR = path.resolve(process.cwd(), ".claude");
const AGENTS_DIR = path.join(CLAUDE_DIR, "agents");
const COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");

export interface OrchestratorResult {
  command: string;
  success: boolean;
  steps: StepSummary[];
  finalOutput: string;
  totalDurationMs: number;
  error?: string;
}

export interface StepSummary {
  stepNumber: number;
  stepName: string;
  agentName: string;
  success: boolean;
  output: string;
  durationMs: number;
  error?: string;
}

// ─── helpers extracted to reduce cognitive complexity ────────────────────────

/** Reads the agent system-prompt file, returning the content or an error string. */
function loadAgentPrompt(
  agentFilePath: string,
): { ok: true; content: string } | { ok: false; error: string } {
  if (!fs.existsSync(agentFilePath)) {
    return { ok: false, error: `Agent file not found: ${agentFilePath}` };
  }
  try {
    return { ok: true, content: fs.readFileSync(agentFilePath, "utf-8") };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read agent file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Appends a single step result to the persistent session log. */
function logStepToSession(
  summary: StepSummary,
  command: string,
  stepId: string,
): void {
  const entry: SessionLogEntry = {
    timestamp: new Date().toISOString(),
    command,
    taskId: stepId,
    stepNumber: summary.stepNumber,
    stepName: summary.stepName,
    agentName: summary.agentName,
    success: summary.success,
    durationMs: summary.durationMs,
    outputPreview: summary.output.slice(0, 200),
    error: summary.error,
  };
  appendSessionLog(entry);
}

// ─── main orchestrator ───────────────────────────────────────────────────────

/**
 * Runs an orchestrator pipeline for a given command.
 *
 * @param command - The command name (filename without .md)
 * @param input - Input variables for the pipeline
 * @param workspaceId - Optional workspace ID for context
 * @returns The orchestrator result with all step summaries
 */
export async function runOrchestrator(
  command: string,
  input: Record<string, string>,
  workspaceId?: string,
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const commandFilePath = path.join(COMMANDS_DIR, `${command}.md`);

  // Check if command file exists
  if (!fs.existsSync(commandFilePath)) {
    const error = `Command file not found: ${commandFilePath}`;
    logger.error("orchestrator.command-not-found", { command, error });
    return {
      command,
      success: false,
      steps: [],
      finalOutput: "",
      totalDurationMs: Date.now() - startTime,
      error,
    };
  }

  // Read command file
  let markdownContent: string;
  try {
    markdownContent = fs.readFileSync(commandFilePath, "utf-8");
  } catch (err) {
    const error = `Failed to read command file: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("orchestrator.read-error", { command, error });
    return {
      command,
      success: false,
      steps: [],
      finalOutput: "",
      totalDurationMs: Date.now() - startTime,
      error,
    };
  }

  // Parse pipeline
  let pipeline;
  try {
    pipeline = parsePipeline(command, markdownContent);
  } catch (err) {
    const error = `Failed to parse pipeline: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("orchestrator.parse-error", { command, error });
    return {
      command,
      success: false,
      steps: [],
      finalOutput: "",
      totalDurationMs: Date.now() - startTime,
      error,
    };
  }

  const stepResults: StepSummary[] = [];
  let lastOutput = "";
  let overallSuccess = true;
  let finalError: string | undefined = undefined;

  // Process each step
  for (const step of pipeline.steps) {
    const stepStartTime = Date.now();
    const stepId = `${command}-step-${step.stepNumber}`;
    const agentFilePath = path.join(AGENTS_DIR, `${step.agentName}.md`);

    const promptLoad = loadAgentPrompt(agentFilePath);
    if (!promptLoad.ok) {
      logger.error("orchestrator.agent-not-found", {
        command,
        step: step.stepName,
        agent: step.agentName,
        error: promptLoad.error,
      });
      const failedStep: StepSummary = {
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        agentName: step.agentName,
        success: false,
        output: "",
        durationMs: Date.now() - stepStartTime,
        error: promptLoad.error,
      };
      stepResults.push(failedStep);
      overallSuccess = false;
      finalError = promptLoad.error;
      break;
    }

    // Interpolate variables
    const vars = { ...input, previousOutput: lastOutput };
    const resolvedPrompt = interpolate(step.promptTemplate, vars);

    // Run sub-agent
    const agentResult = await runSubAgent({
      taskId: stepId,
      agentName: step.agentName,
      systemPrompt: promptLoad.content,
      userPrompt: resolvedPrompt,
      workspaceId,
      maxIterations: step.maxIterations,
      doneMarker: step.doneMarker,
    });

    const stepSummary: StepSummary = {
      stepNumber: step.stepNumber,
      stepName: step.stepName,
      agentName: step.agentName,
      success: agentResult.success,
      output: agentResult.output,
      durationMs: Date.now() - stepStartTime,
    };

    if (!agentResult.success) {
      stepSummary.error = agentResult.error;
      overallSuccess = false;
      finalError = agentResult.error;
    }

    stepResults.push(stepSummary);
    lastOutput = agentResult.output;

    logger.info("orchestrator.step", {
      command,
      step: step.stepName,
      success: agentResult.success,
      agent: step.agentName,
    });

    logStepToSession(stepSummary, command, stepId);

    if (!agentResult.success) {
      break;
    }
  }

  logger.info("orchestrator.complete", {
    command,
    totalSteps: pipeline.steps.length,
    success: overallSuccess,
    executedSteps: stepResults.length,
  });

  // Append final orchestrator summary to session log
  appendSessionLog({
    timestamp: new Date().toISOString(),
    command,
    taskId: command,
    stepNumber: 0,
    stepName: "orchestrator",
    agentName: "orchestrator",
    success: overallSuccess,
    durationMs: Date.now() - startTime,
    outputPreview: lastOutput.slice(0, 200),
    error: finalError,
  });

  return {
    command,
    success: overallSuccess,
    steps: stepResults,
    finalOutput: lastOutput,
    totalDurationMs: Date.now() - startTime,
    error: finalError,
  };
}

// Export for testing
export { CLAUDE_DIR, AGENTS_DIR, COMMANDS_DIR };
