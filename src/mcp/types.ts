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

export interface VectorSearchInput {
  query: string;
  topK?: number;
}

export interface SearchCodeInput {
  pattern: string;
  glob?: string;
}

export interface RetrieveInput {
  query: string;
  mode?: "code" | "vector" | "file";
  topK?: number;
  glob?: string;
}
