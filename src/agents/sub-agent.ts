import { gateway } from "../llm/gateway";
import { logger } from "../shared/logging/logger";
import { AgentTask, AgentResult } from "./types";
import {
  ProviderRequest,
  ProviderResponse,
} from "../shared/contracts/provider";
import { getTool } from "./tools/registry";
import { classifyToolCall, type ToolCallClass } from "./tool-call-classifier";

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
 *
 * When skipGatewayAsk is true (for retrieval-first tools), returns the raw
 * tool output formatted as TOOL RESULT without calling gateway.ask() again.
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, string>,
  baseRequest: ProviderRequest,
  skipGatewayAsk?: boolean,
): Promise<string | null> {
  const tool = getTool(toolName);
  if (!tool) {
    logger.warn("agent.tool-not-found", { toolName });
    return null;
  }
  const result = await tool.execute(args);
  const toolResultMessage = result.success
    ? `[TOOL RESULT:${toolName}]\n${result.output}`
    : `[TOOL ERROR:${toolName}]\n${result.error ?? "Tool execution failed with no error message."}`;

  // For retrieval-first tools, skip the second gateway.ask() call
  if (skipGatewayAsk) {
    return toolResultMessage;
  }

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
        userPrompt: task.userPrompt, // Explicit boundary for budget enforcement
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

        // Classify tool call to determine if we should skip the second gateway.ask() call
        const classification = classifyToolCall(toolName, args);
        const skipGatewayAsk =
          classification === "path-like" || classification === "symbol-like";

        const toolOutput = await executeToolCall(
          toolName,
          args,
          request,
          skipGatewayAsk,
        );
        if (toolOutput !== null) {
          outputText = toolOutput;
          // Continue loop without consuming an iteration for tool calls
          // NOTE: Direct-return tool turns (path-like/symbol-like) can never satisfy doneMarker
          // themselves. The doneMarker can only appear on a genuine model response (semantic/
          // synthesis path, or a later iteration after all tool calls are complete).
          // maxIterations must still account for at least one non-direct-return iteration to
          // produce the final doneMarker response.
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
