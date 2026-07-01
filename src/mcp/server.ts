import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "../shared/logging/logger.ts";
import {
  handleAskLocal,
  handleCodeReview,
  handleListTools,
} from "./tool-handlers.ts";
import {
  AskLocalSchema,
  CodeReviewSchema,
  ListToolsSchema,
} from "./schemas.ts";

export const server = new McpServer(
  { name: "unified-theatre-local-llm", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "ask-local",
  {
    description:
      "Send a prompt to the local LLM (llama.cpp / Qwen3-Coder) without using any paid API tokens. Use for: code questions, explanations, summaries, drafts.",
    inputSchema: AskLocalSchema,
  },
  async (args) => {
    logger.info("mcp.tool-call", { tool: "ask-local" });
    return handleAskLocal(args);
  },
);

server.registerTool(
  "code-review",
  {
    description:
      "Run a full code review on a source file using the local LLM and project standards. Checks JSDoc, error handling, test coverage, and code standards. Returns a structured PASS/FAIL report.",
    inputSchema: CodeReviewSchema,
  },
  async (args) => {
    logger.info("mcp.tool-call", { tool: "code-review" });
    return handleCodeReview(args);
  },
);

server.registerTool(
  "list-tools",
  {
    description: "List all available harness tools and pipeline commands.",
    inputSchema: ListToolsSchema,
  },
  async () => {
    logger.info("mcp.tool-call", { tool: "list-tools" });
    return handleListTools();
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp.server.started", { name: "unified-theatre-local-llm" });
}

try {
  await main();
} catch (err) /* istanbul ignore next */ {
  console.error("MCP server failed to start:", err);
  process.exit(1);
}
