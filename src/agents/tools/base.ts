export interface ToolResult {
  toolName: string;
  success: boolean;
  output: string; // content to inject back into agent conversation
  error?: string;
}

export interface Tool {
  name: string;
  description: string; // shown to agent in system prompt
  execute(args: Record<string, string>): Promise<ToolResult>;
}
