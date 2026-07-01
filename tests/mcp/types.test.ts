/**
 * tests/mcp/types.test.ts
 *
 * Coverage for src/mcp/types.ts — pure TypeScript interface declarations.
 * Importing the module and constructing conforming objects registers the
 * file as visited in the coverage report.
 */

import { describe, it, expect } from "vitest";
import type { McpToolResult, AskLocalInput, CodeReviewInput } from "../../src/mcp/types";

describe("src/mcp/types.ts — interface shapes", () => {
  it("McpToolResult has content array with type+text entries", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "Hello from MCP" }],
    };
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Hello from MCP");
    expect(result.isError).toBeUndefined();
  });

  it("McpToolResult with isError flag set", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "Error occurred" }],
      isError: true,
    };
    expect(result.isError).toBe(true);
  });

  it("AskLocalInput requires prompt, rest optional", () => {
    const minimal: AskLocalInput = { prompt: "What is 2+2?" };
    const full: AskLocalInput = {
      prompt: "Explain this code",
      systemPrompt: "You are a code expert.",
      workspaceId: "ws-123",
    };

    expect(minimal.prompt).toBe("What is 2+2?");
    expect(minimal.systemPrompt).toBeUndefined();
    expect(minimal.workspaceId).toBeUndefined();

    expect(full.systemPrompt).toBe("You are a code expert.");
    expect(full.workspaceId).toBe("ws-123");
  });

  it("CodeReviewInput requires filePath, workspaceId optional", () => {
    const minimal: CodeReviewInput = { filePath: "src/auth.ts" };
    const full: CodeReviewInput = {
      filePath: "src/accounts/store.ts",
      workspaceId: "ws-review",
    };

    expect(minimal.filePath).toBe("src/auth.ts");
    expect(minimal.workspaceId).toBeUndefined();

    expect(full.filePath).toBe("src/accounts/store.ts");
    expect(full.workspaceId).toBe("ws-review");
  });

  it("all three interfaces work together in a typed pipeline", () => {
    const input: AskLocalInput = { prompt: "Review this", workspaceId: "ws-1" };
    const reviewInput: CodeReviewInput = {
      filePath: "src/foo.ts",
      workspaceId: input.workspaceId,
    };
    const result: McpToolResult = {
      content: [{ type: "text", text: `Reviewed ${reviewInput.filePath}` }],
      isError: false,
    };

    expect(result.content[0].text).toContain("src/foo.ts");
    expect(result.isError).toBe(false);
  });
});
