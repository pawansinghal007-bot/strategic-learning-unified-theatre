import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "../shared/logging/logger.ts";
import {
  handleAskLocal,
  handleCodeReview,
  handleListTools,
  handleVectorSearch,
  handleSearchCode,
  handleRetrieve,
} from "./tool-handlers.ts";
import {
  AskLocalSchema,
  CodeReviewSchema,
  ListToolsSchema,
  VectorSearchSchema,
  SearchCodeSchema,
  RetrieveSchema,
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

server.registerTool(
  "vector-search",
  {
    description:
      "Semantic similarity search over the project's Qdrant vector store. Use for: finding conceptually related code, docs, or sprint history by natural language.",
    inputSchema: VectorSearchSchema,
  },
  async (args) => {
    logger.info("mcp.tool-call", { tool: "vector-search" });
    return handleVectorSearch(args);
  },
);

server.registerTool(
  "search-code",
  {
    description:
      "Lexical/regex search over the repo using ripgrep. Use for: finding exact symbols, patterns, or strings across source files.",
    inputSchema: SearchCodeSchema,
  },
  async (args) => {
    logger.info("mcp.tool-call", { tool: "search-code" });
    return handleSearchCode(args);
  },
);

server.registerTool(
  "retrieve",
  {
    description:
      "Smart retrieval router that automatically chooses between code, vector, or file search strategies based on query characteristics. Use for: general queries where the best search strategy is unknown.",
    inputSchema: RetrieveSchema,
  },
  async (args) => {
    logger.info("mcp.tool-call", { tool: "retrieve" });
    return handleRetrieve(args);
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
