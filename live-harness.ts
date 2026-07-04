import { gateway } from "./src/llm/gateway.ts";
import { runSubAgent } from "./src/agents/sub-agent.ts";
import { getTool } from "./src/agents/tools/registry.ts";

function parseToolArgs(argsString: string): Record<string, string> {
  const args: Record<string, string> = {};
  const argRegex = /(\w+)=(".*?"|[^"\s]+)/g;
  let argMatch;
  while ((argMatch = argRegex.exec(argsString)) !== null) {
    let value = argMatch[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    args[argMatch[1]] = value;
  }
  return args;
}

const originalAsk = gateway.ask.bind(gateway);
(gateway as any).ask = async (req: any) => {
  console.log("===== REQUEST =====");
  console.log(req.prompt);
  const result = await originalAsk(req);
  console.log("===== MODEL OUTPUT =====");
  console.log(result.outputText);

  const toolCallMatch = /\[TOOL:(\S+)\s+(.*?)\]/.exec(result.outputText);
  if (toolCallMatch) {
    const toolName = toolCallMatch[1];
    const args = parseToolArgs(toolCallMatch[2]);
    const tool = getTool(toolName);
    console.log("===== TOOL CALL =====");
    console.log(JSON.stringify({ toolName, args }, null, 2));
    if (tool) {
      try {
        const toolResult = await tool.execute(args);
        console.log("===== TOOL RESULT =====");
        console.log(JSON.stringify(toolResult, null, 2));
      } catch (error) {
        console.log("===== TOOL ERROR =====");
        console.log(String(error));
      }
    } else {
      console.log("===== TOOL RESULT =====");
      console.log("tool-not-found");
    }
  }
  return result;
};

(async () => {
  const result = await runSubAgent({
    taskId: "sprint107-harness-1",
    agentName: "local-harness-check",
    systemPrompt:
      'You are a coding assistant inside a local harness. When the user asks about the repository, use the [TOOL:search-code ...] format to invoke the repository search tool.\n\nIMPORTANT: Use the exact syntax [TOOL:search-code pattern="<regex>"] with proper key="value" pairs. Example: [TOOL:search-code pattern="executeToolCall.*fail"].\n\nAfter receiving the tool result, synthesize a concise final answer and end with [DONE].',
    userPrompt:
      "Use the search-code tool to find where executeToolCall handles tool failures in this codebase.",
    workspaceId: "sprint107",
    maxIterations: 5,
    doneMarker: "[DONE]",
  });

  console.log("===== FINAL RESULT =====");
  console.log(result.success ? "SUCCESS" : "FAILED");
  console.log(result.output);
})();
