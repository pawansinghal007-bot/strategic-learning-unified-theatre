import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleAskLocal,
  handleCodeReview,
  handleListTools,
} from "./tool-handlers.ts";
import { logger } from "../shared/logging/logger.ts";

const server = new Server(
  { name: "unified-theatre-local-llm", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ask-local",
      description:
        "Send a prompt to the local LLM (llama.cpp / Qwen3-Coder) without using any paid API tokens. Use for: code questions, explanations, summaries, drafts.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The prompt to send" },
          systemPrompt: {
            type: "string",
            description: "Optional system instructions",
          },
          workspaceId: {
            type: "string",
            description: "Optional workspace ID for quota tracking",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "code-review",
      description:
        "Run a full code review on a source file using the local LLM and project standards. Checks JSDoc, error handling, test coverage, and code standards. Returns a structured PASS/FAIL report.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description:
              "Absolute or project-relative path to the file to review",
          },
          workspaceId: { type: "string", description: "Optional workspace ID" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "list-tools",
      description: "List all available harness tools and pipeline commands.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info("mcp.tool-call", { tool: name });

  switch (name) {
    case "ask-local":
      return handleAskLocal(args as any);
    case "code-review":
      return handleCodeReview(args as any);
    case "list-tools":
      return handleListTools();
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp.server.started", { name: "unified-theatre-local-llm" });
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
