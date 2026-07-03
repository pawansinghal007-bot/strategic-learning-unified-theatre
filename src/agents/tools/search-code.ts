import { Tool, ToolResult } from "./base.js";
import { searchCode } from "../../shared/retrieval/code-search.js";

export const searchCodeTool: Tool = {
  name: "search-code",
  description:
    "Lexical/regex search over the repo using ripgrep. Use when you know the symbol, string, or pattern you're looking for. Usage: [TOOL:search-code pattern=\"<regex>\" glob=\"src/**\"]",
  async execute(args: Record<string, string>): Promise<ToolResult> {
    if (!args.pattern) {
      return {
        toolName: this.name,
        success: false,
        output: "",
        error: "Missing required arg: pattern",
      };
    }

    try {
      const hits = await searchCode(args.pattern, args.glob);

      if (hits.length === 0) {
        return {
          toolName: this.name,
          success: true,
          output: `No matches for "${args.pattern}".`,
        };
      }

      const output = hits
        .map((h) => `${h.file}:${h.line}: ${h.text}`)
        .join("\n");

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
        error: `search-code failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
