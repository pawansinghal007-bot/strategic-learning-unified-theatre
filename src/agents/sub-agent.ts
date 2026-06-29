import { gateway } from "../llm/gateway";
import { logger } from "../shared/logging/logger";
import { AgentTask, AgentResult, AgentMessage } from "./types";
import {
  ProviderRequest,
  ProviderResponse,
} from "../shared/contracts/provider";
import { getTool } from "./tools/registry";

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

      // Build ProviderRequest with systemPrompt prepended to prompt
      const fullPrompt = `SYSTEM:\n${task.systemPrompt}\n\nUSER:\n${task.userPrompt}`;

      const request: ProviderRequest = {
        requestId: taskId,
        workspaceId: workspaceId,
        prompt: fullPrompt,
        constraints: {
          privacyMode: "local-only",
        },
      };

      const response: ProviderResponse = await gateway.ask(request);
      outputText = response.outputText;

      // Check for tool calls
      const toolCallRegex = /\[TOOL:(\S+)\s+(.*?)\]/;
      const toolCallMatch = outputText.match(toolCallRegex);

      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const argsString = toolCallMatch[2];

        // Parse args: key="value" pairs → Record<string, string>
        const args: Record<string, string> = {};
        const argRegex = /(\w+)=(".*?"|[^"\s]+)/g;
        let argMatch;
        while ((argMatch = argRegex.exec(argsString)) !== null) {
          const key = argMatch[1];
          let value = argMatch[2];
          // Remove surrounding quotes if present
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          args[key] = value;
        }

        // Execute tool
        const tool = getTool(toolName);
        if (tool) {
          const result = await tool.execute(args);

          // Append tool result to conversation
          const toolResultMessage = `[TOOL RESULT:${toolName}]\n${result.output}`;

          // Update the prompt to include the tool result
          const updatedPrompt = `${fullPrompt}\n\nTOOL RESULT:\n${toolResultMessage}`;

          // Create new request with tool result
          const toolRequest: ProviderRequest = {
            requestId: taskId,
            workspaceId: workspaceId,
            prompt: updatedPrompt,
            constraints: {
              privacyMode: "local-only",
            },
          };

          const toolResponse: ProviderResponse = await gateway.ask(toolRequest);
          outputText = toolResponse.outputText;

          // Continue loop without incrementing iteration count for tool calls
          continue;
        } else {
          // If tool not found, treat as regular output
          logger.warn("agent.tool-not-found", { toolName });
        }
      }

      // Check for done marker
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

    // If we exhausted all iterations without finding done marker
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
