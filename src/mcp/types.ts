export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface AskLocalInput {
  prompt: string;
  systemPrompt?: string;
  workspaceId?: string;
}

export interface CodeReviewInput {
  filePath: string;
  workspaceId?: string;
}
