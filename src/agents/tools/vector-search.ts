import { Tool, ToolResult } from "./base.js";
import { vectorSearch } from "../../shared/retrieval/vector-client.js";

export const vectorSearchTool: Tool = {
  name: "vector-search",
  description:
    "Semantic search over the project's Qdrant vector store. Use for conceptual/fuzzy questions where exact symbol names aren't known. Usage: [TOOL:vector-search query=\"<question>\" topK=\"5\"]",
  async execute(args: Record<string, string>): Promise<ToolResult> {
    if (!args.query) {
      return {
        toolName: this.name,
        success: false,
        output: "",
        error: "Missing required arg: query",
      };
    }

    const topK = args.topK ? Number(args.topK) : 5;

    try {
      const results = await vectorSearch(args.query, topK);

      if (results.length === 0) {
        return {
          toolName: this.name,
          success: true,
          output: "No matching results in the vector store.",
        };
      }

      const output = results
        .map(
          (r, i) =>
            `${i + 1}. [score=${r.score.toFixed(3)}] ${r.source}\n   ${r.text}`,
        )
        .join("\n\n");

      return {
        toolName: this.name,
        success: true,
        output,
      };
    } catch (error) {
      return {
        toolName: this.name,
        success: false,
        output: "",
        error: `vector-search failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
