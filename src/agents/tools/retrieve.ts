import { Tool, ToolResult } from "./base";
import { retrieve } from "../../shared/retrieval/router.js";
import {
  formatVectorResults,
  formatCodeHits,
} from "../../shared/retrieval/format.js";

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

    const mode = args.mode as "code" | "vector" | "file" | undefined;
    const topK = args.topK ? Number(args.topK) : 5;
    const glob = args.glob;

    try {
      const result = await retrieve(args.query, { mode, topK, glob });

      if (result.error) {
        return {
          toolName: this.name,
          success: false,
          output: "",
          error: `retrieve failed: ${result.error}`,
        };
      }

      // Format based on strategy
      let output: string;
      switch (result.strategy) {
        case "vector": {
          const formatted = formatVectorResults(result.results as any);
          if (formatted === "") {
            output = "No matching results in the vector store.";
          } else {
            output = formatted;
          }
          break;
        }
        case "code": {
          const formatted = formatCodeHits(result.results as any);
          if (formatted === "") {
            output = `No matches for "${args.query}".`;
          } else {
            output = formatted;
          }
          break;
        }
        case "file": {
          // File strategy returns raw content, no formatting needed
          output = result.results as string;
          break;
        }
        default: {
          const _exhaustive: never = result.strategy;
          throw new Error(`Unknown strategy: ${_exhaustive}`);
        }
      }

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
        error: `retrieve failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
