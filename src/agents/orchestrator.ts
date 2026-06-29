import { runSubAgent } from "./sub-agent";
import { parsePipeline, interpolate } from "./pipeline";
import { logger } from "../shared/logging/logger";
import * as fs from "fs";
import * as path from "path";
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

    // Load agent system prompt
    const agentFilePath = path.join(AGENTS_DIR, `${step.agentName}.md`);
    let systemPrompt: string;

    if (!fs.existsSync(agentFilePath)) {
      const error = `Agent file not found: ${agentFilePath}`;
      logger.error("orchestrator.agent-not-found", {
        command,
        step: step.stepName,
        agent: step.agentName,
        error,
      });

      stepResults.push({
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        agentName: step.agentName,
        success: false,
        output: "",
        durationMs: Date.now() - stepStartTime,
        error,
      });

      overallSuccess = false;
      finalError = error;
      break;
    }

    try {
      systemPrompt = fs.readFileSync(agentFilePath, "utf-8");
    } catch (err) {
      const error = `Failed to read agent file: ${err instanceof Error ? err.message : String(err)}`;
      logger.error("orchestrator.agent-read-error", {
        command,
        step: step.stepName,
        agent: step.agentName,
        error,
      });

      stepResults.push({
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        agentName: step.agentName,
        success: false,
        output: "",
        durationMs: Date.now() - stepStartTime,
        error,
      });

      overallSuccess = false;
      finalError = error;
      break;
    }

    // Interpolate variables
    const vars = { ...input, previousOutput: lastOutput };
    const resolvedPrompt = interpolate(step.promptTemplate, vars);

    // Run sub-agent
    const agentResult = await runSubAgent({
      taskId: stepId,
      agentName: step.agentName,
      systemPrompt,
      userPrompt: resolvedPrompt,
      workspaceId,
      maxIterations: step.maxIterations,
      doneMarker: step.doneMarker,
    });

    // Record step result
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

    // Log step completion
    logger.info("orchestrator.step", {
      command,
      step: step.stepName,
      success: agentResult.success,
      agent: step.agentName,
    });

    // Append to session log
    const sessionLogEntry: SessionLogEntry = {
      timestamp: new Date().toISOString(),
      command,
      taskId: stepId,
      stepNumber: step.stepNumber,
      stepName: step.stepName,
      agentName: step.agentName,
      success: agentResult.success,
      durationMs: Date.now() - stepStartTime,
      outputPreview: agentResult.output.slice(0, 200),
      error: agentResult.error,
    };
    appendSessionLog(stepSummary);

    // Stop on failure
    if (!agentResult.success) {
      break;
    }
  }

  // Log completion
  logger.info("orchestrator.complete", {
    command,
    totalSteps: pipeline.steps.length,
    success: overallSuccess,
    executedSteps: stepResults.length,
  });

  // Append final orchestrator result to session log
  const orchestratorSummary: SessionLogEntry = {
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
  };
  appendSessionLog(orchestratorSummary);

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
