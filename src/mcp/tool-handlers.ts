import { gateway } from "../llm/gateway.ts";
import { runOrchestrator } from "../agents/orchestrator.ts";
import { logger } from "../shared/logging/logger.ts";
import type { McpToolResult } from "./types";
import type { AskLocalSchema, CodeReviewSchema } from "./schemas.ts";
import type { z } from "zod";
import * as crypto from "node:crypto";

// Derive argument types directly from the Zod schemas so handler signatures
// stay in sync with what McpServer will pass after validation.
type AskLocalArgs = {
  [K in keyof typeof AskLocalSchema]: z.infer<(typeof AskLocalSchema)[K]>;
};
type CodeReviewArgs = {
  [K in keyof typeof CodeReviewSchema]: z.infer<(typeof CodeReviewSchema)[K]>;
};

export async function handleAskLocal(
  input: AskLocalArgs,
): Promise<McpToolResult> {
  try {
    const requestId = crypto.randomUUID();
    const workspaceId = input.workspaceId ?? "mcp-local";
    const prompt = input.prompt;
    const systemPrompt = input.systemPrompt;

    const request = {
      requestId,
      workspaceId,
      prompt,
      systemPrompt,
      constraints: { privacyMode: "local-only" },
    };

    const response = await gateway.ask(request);

    logger.info("mcp.ask-local", { workspaceId, promptLength: prompt.length });

    return { content: [{ type: "text", text: response.outputText }] };
  } catch (err: any) {
    logger.error("mcp.ask-local.error", { error: err.message });
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

export async function handleCodeReview(
  input: CodeReviewArgs,
): Promise<McpToolResult> {
  try {
    const result = await runOrchestrator(
      "code-review",
      { filePath: input.filePath },
      input.workspaceId ?? "mcp-review",
    );

    logger.info("mcp.code-review", { filePath: input.filePath });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Review failed: ${result.error}` }],
        isError: true,
      };
    }

    return { content: [{ type: "text", text: result.finalOutput }] };
  } catch (err: any) {
    logger.error("mcp.code-review.error", { error: err.message });
    return {
      content: [{ type: "text", text: `Review failed: ${err.message}` }],
      isError: true,
    };
  }
}

export async function handleListTools(): Promise<McpToolResult> {
  const toolsDescription = `
Available MCP tools and harness commands:

1. ask-local
   - Send a prompt to the local LLM (llama.cpp / Qwen3-Coder) without using any paid API tokens
   - Use for: code questions, explanations, summaries, drafts

2. code-review
   - Run a full code review on a source file using the local LLM and project standards
   - Checks JSDoc, error handling, test coverage, and code standards
   - Returns a structured PASS/FAIL report

3. list-tools
   - List all available harness tools and pipeline commands

Planned tools:
- fix-sonar
- run-sprint
`;

  return { content: [{ type: "text", text: toolsDescription }] };
}
