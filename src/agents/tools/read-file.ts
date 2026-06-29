import * as fs from "fs";
import * as path from "path";
import { Tool, ToolResult } from "./base";

const PROJECT_ROOT = process.env.PROJECT_ROOT ?? path.resolve(process.cwd());

const MAX_LINES = 500;

export const readFileTool: Tool = {
  name: "read-file",
  description:
    'Read a source file. Usage: [TOOL:read-file path="<absolute or relative path>"]',
  async execute(args): Promise<ToolResult> {
    // resolve relative paths against PROJECT_ROOT
    const filePath = path.isAbsolute(args.path)
      ? args.path
      : path.join(PROJECT_ROOT, args.path);

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      if (lines.length > MAX_LINES) {
        const truncatedLines = lines.slice(0, MAX_LINES);
        const output =
          truncatedLines.join("\n") +
          `\n[TRUNCATED: file has ${lines.length} lines, showing first ${MAX_LINES}]`;
        return {
          toolName: this.name,
          success: true,
          output,
        };
      }

      return {
        toolName: this.name,
        success: true,
        output: content,
      };
    } catch (error) {
      return {
        toolName: this.name,
        success: false,        output: '',        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
