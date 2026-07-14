import { Tool, ToolResult } from "./base";
import { executeRetrieve } from "../../shared/retrieval/execute-retrieve.js";

export const retrieveTool: Tool = {
  name: "retrieve",
  description:
    'Unified retrieval tool that automatically chooses between code search, vector search, or file read based on the query. Usage: [TOOL:retrieve query="<question>" mode="code|vector|file" topK="5" glob="src/agents"] (mode, topK, glob are optional)',
  async execute(args: Record<string, string>): Promise<ToolResult> {
    if (!args.query) {
      return {
        toolName: this.name,
        success: false,
        output: "",
        error: "Missing required arg: query",
      };
    }

    const mode = args.mode as "code" | "vector" | "file" | "symbol" | undefined;
    const topK = args.topK ? Number(args.topK) : 5;
    const glob = args.glob;
    const callerIdentity = args.__callerIdentity;

    try {
      const result = await executeRetrieve(args.query, {
        mode,
        topK,
        glob,
        callerIdentity,
      });

      if ("error" in result) {
        return {
          toolName: this.name,
          success: false,
          output: "",
          error: result.error,
        };
      }

      return {
        toolName: this.name,
        success: true,
        output: result.text,
      };
    } catch (error) {
      return {
        toolName: this.name,
        success: false,
        output: "",
        error: `retrieve failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
