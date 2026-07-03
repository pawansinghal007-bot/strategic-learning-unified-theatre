/**
 * Zod input schemas for MCP tool registration.
 *
 * Each schema is a ZodRawShapeCompat (plain { key: ZodType } object) as
 * required by McpServer.registerTool().  Do NOT wrap in z.object() — the SDK
 * does that internally so it can generate the JSON Schema for ListTools.
 */
import { z } from "zod";

/**
 * Input schema for the "ask-local" tool.
 */
export const AskLocalSchema = {
  prompt: z.string().describe("The prompt to send"),
  systemPrompt: z
    .string()
    .optional()
    .describe("Optional system instructions"),
  workspaceId: z
    .string()
    .optional()
    .describe("Optional workspace ID for quota tracking"),
} as const;

/**
 * Input schema for the "code-review" tool.
 */
export const CodeReviewSchema = {
  filePath: z
    .string()
    .describe("Absolute or project-relative path to the file to review"),
  workspaceId: z.string().optional().describe("Optional workspace ID"),
} as const;

/**
 * "list-tools" takes no arguments — an empty shape registers a zero-arg tool.
 */
export const ListToolsSchema = {} as const;

/**
 * Input schema for the "vector-search" tool.
 */
export const VectorSearchSchema = {
  query: z.string().describe("Natural-language query to search for semantically"),
  topK: z.number().int().min(1).max(20).optional().describe("Number of results to return (default 5)"),
} as const;

/**
 * Input schema for the "search-code" tool.
 */
export const SearchCodeSchema = {
  pattern: z.string().describe("Regex pattern to search for (ripgrep syntax)"),
  glob: z.string().optional().describe("Directory path relative to repo root to restrict the search to (e.g. 'src/agents')"),
} as const;
