import { Tool } from "./base";
import { readFileTool } from "./read-file";
import { vectorSearchTool } from "./vector-search";
import { searchCodeTool } from "./search-code";
import { retrieveTool } from "./retrieve";

const tools: Map<string, Tool> = new Map();
tools.set(readFileTool.name, readFileTool);
tools.set(vectorSearchTool.name, vectorSearchTool);
tools.set(searchCodeTool.name, searchCodeTool);
tools.set(retrieveTool.name, retrieveTool);

export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

export function getToolDescriptions(): string {
  // Returns a formatted string listing all tools and their descriptions
  // Used to inject into agent system prompts
  return [...tools.values()]
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");
}

export function registerTool(tool: Tool): void {
  tools.set(tool.name, tool);
}
