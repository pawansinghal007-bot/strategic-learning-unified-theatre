import { gateway } from "../llm/gateway.ts";
import { runOrchestrator } from "../agents/orchestrator.ts";
import { vectorSearch } from "../shared/retrieval/vector-client.js";
import { searchCode } from "../shared/retrieval/code-search.js";
import { retrieve } from "../shared/retrieval/router.js";
import {
  formatVectorResults,
  formatCodeHits,
} from "../shared/retrieval/format.js";
import { logger } from "../shared/logging/logger.ts";
import type { McpToolResult } from "./types";
import type {
  AskLocalSchema,
  CodeReviewSchema,
  VectorSearchSchema,
  SearchCodeSchema,
  RetrieveSchema,
} from "./schemas.ts";
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
type VectorSearchArgs = {
  [K in keyof typeof VectorSearchSchema]: z.infer<
    (typeof VectorSearchSchema)[K]
  >;
};
type SearchCodeArgs = {
  [K in keyof typeof SearchCodeSchema]: z.infer<(typeof SearchCodeSchema)[K]>;
};
type RetrieveArgs = {
  [K in keyof typeof RetrieveSchema]: z.infer<(typeof RetrieveSchema)[K]>;
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

4. vector-search
   - Semantic similarity search over the project's Qdrant vector store
   - Use for: finding conceptually related code, docs, or sprint history by natural language

5. search-code
   - Lexical/regex search over the repo using ripgrep
   - Use for: finding exact symbols, patterns, or strings across source files

6. retrieve
   - Smart retrieval router that automatically chooses between code, vector, and file search
   - Uses heuristics: path-like (has '/' + extension) → file, symbol-like (camelCase/PascalCase/snake_case/quotes/regex) → code, default → vector
   - Use for: unified retrieval that adapts to query type automatically

Planned tools:
- fix-sonar
- run-sprint
`;

  return { content: [{ type: "text", text: toolsDescription }] };
}

export async function handleVectorSearch(
  input: VectorSearchArgs,
): Promise<McpToolResult> {
  try {
    const results = await vectorSearch(input.query, input.topK ?? 5);

    logger.info("mcp.vector-search", {
      query: input.query,
      topK: input.topK ?? 5,
      hits: results.length,
    });

    if (results.length === 0) {
      return { content: [{ type: "text", text: "No results found." }] };
    }

    const formatted = formatVectorResults(results);

    return { content: [{ type: "text", text: formatted }] };
  } catch (err: any) {
    logger.error("mcp.vector-search.error", { error: err.message });
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

export async function handleSearchCode(
  input: SearchCodeArgs,
): Promise<McpToolResult> {
  try {
    const hits = await searchCode(input.pattern, input.glob);

    logger.info("mcp.search-code", {
      pattern: input.pattern,
      glob: input.glob,
      hits: hits.length,
    });

    if (hits.length === 0) {
      return { content: [{ type: "text", text: "No matches found." }] };
    }

    const formatted = formatCodeHits(hits);

    return { content: [{ type: "text", text: formatted }] };
  } catch (err: any) {
    logger.error("mcp.search-code.error", { error: err.message });
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

export async function handleRetrieve(
  input: RetrieveArgs,
): Promise<McpToolResult> {
  try {
    const result = await retrieve(input.query, {
      mode: input.mode,
      topK: input.topK,
      glob: input.glob,
    });

    logger.info("mcp.retrieve", {
      query: input.query,
      mode: input.mode,
      topK: input.topK ?? 5,
      strategy: result.strategy,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }

    // Format based on strategy
    switch (result.strategy) {
      case "vector": {
        const formatted = formatVectorResults(result.results as any);
        if (formatted === "") {
          return { content: [{ type: "text", text: "No results found." }] };
        }
        return { content: [{ type: "text", text: formatted }] };
      }
      case "code": {
        const formatted = formatCodeHits(result.results as any);
        if (formatted === "") {
          return { content: [{ type: "text", text: "No results found." }] };
        }
        return { content: [{ type: "text", text: formatted }] };
      }
      case "file": {
        // File strategy returns raw content
        return { content: [{ type: "text", text: result.results as string }] };
      }
      default: {
        const _exhaustive: never = result.strategy;
        throw new Error(`Unknown strategy: ${_exhaustive}`);
      }
    }
  } catch (err: any) {
    logger.error("mcp.retrieve.error", { error: err.message });
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}
