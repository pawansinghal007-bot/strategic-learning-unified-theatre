import { gateway } from "../llm/gateway";
import { logger } from "../shared/logging/logger";
import { AgentTask, AgentResult } from "./types";
import {
  ProviderRequest,
  ProviderResponse,
} from "../shared/contracts/provider";
import { getTool } from "./tools/registry";

// ─── private helpers ─────────────────────────────────────────────────────────

/** Parse `key="value"` pairs from a tool-call args string into a record. */
function parseToolArgs(argsString: string): Record<string, string> {
  const args: Record<string, string> = {};
  const argRegex = /(\w+)=(".*?"|[^"\s]+)/g;
  let argMatch;
  while ((argMatch = argRegex.exec(argsString)) !== null) {
    const key = argMatch[1];
    let value = argMatch[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    args[key] = value;
  }
  return args;
}

/**
 * Executes a named tool and returns the follow-up LLM response incorporating
 * the tool result, or `null` if the tool is not registered.
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, string>,
  baseRequest: ProviderRequest,
): Promise<string | null> {
  const tool = getTool(toolName);
  if (!tool) {
    logger.warn("agent.tool-not-found", { toolName });
    return null;
  }
  const result = await tool.execute(args);
  const toolResultMessage = `[TOOL RESULT:${toolName}]\n${result.output}`;
  const updatedPrompt = `${baseRequest.prompt}\n\nTOOL RESULT:\n${toolResultMessage}`;
  const toolRequest: ProviderRequest = {
    requestId: baseRequest.requestId,
    workspaceId: baseRequest.workspaceId,
    prompt: updatedPrompt,
    constraints: baseRequest.constraints,
  };
  const toolResponse: ProviderResponse = await gateway.ask(toolRequest);
  return toolResponse.outputText;
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function runSubAgent(task: AgentTask): Promise<AgentResult> {
  const startTime = Date.now();
  const taskId = task.taskId;
  const agentName = task.agentName;
  const maxIterations = task.maxIterations ?? 5;
  const doneMarker = task.doneMarker ?? "[DONE]";
  const workspaceId = task.workspaceId ?? "harness-default";

  let outputText = "";
  let iterations = 0;
  let success = false;
  let error: string | undefined = undefined;

  try {
    for (let i = 1; i <= maxIterations; i++) {
      iterations = i;
      logger.info("agent.iteration", { taskId, iteration: i, agentName });

      const fullPrompt = `SYSTEM:\n${task.systemPrompt}\n\nUSER:\n${task.userPrompt}`;
      const request: ProviderRequest = {
        requestId: taskId,
        workspaceId,
        prompt: fullPrompt,
        constraints: { privacyMode: "local-only" },
      };

      const response: ProviderResponse = await gateway.ask(request);
      outputText = response.outputText;

      // Check for tool calls via [TOOL:name args] pattern
      const toolCallRegex = /\[TOOL:(\S+)\s+(.*?)\]/;
      const toolCallMatch = toolCallRegex.exec(outputText);
      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const args = parseToolArgs(toolCallMatch[2]);
        const toolOutput = await executeToolCall(toolName, args, request);
        if (toolOutput !== null) {
          outputText = toolOutput;
          // Continue loop without consuming an iteration for tool calls
          continue;
        }
        // Tool not found — fall through and treat current outputText as-is
      }

      if (outputText.includes(doneMarker)) {
        success = true;
        outputText = outputText.replace(doneMarker, "").trim();
        logger.info("agent.complete", {
          taskId,
          success,
          iterations,
          durationMs: Date.now() - startTime,
        });
        break;
      }
    }

    if (!success && iterations >= maxIterations) {
      error = "Max iterations reached";
      logger.info("agent.complete", {
        taskId,
        success: false,
        iterations,
        durationMs: Date.now() - startTime,
        error,
      });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error("agent.error", {
      taskId,
      agentName,
      error,
      iterations,
      durationMs: Date.now() - startTime,
    });
  }

  return {
    taskId,
    agentName,
    success,
    output: outputText,
    iterations,
    durationMs: Date.now() - startTime,
    error,
  };
}
