/**
 * tests/mcp/tool-handlers.test.ts
 *
 * Covers handleAskLocal, handleCodeReview, handleListTools,
 * handleVectorSearch, handleSearchCode, and handleRetrieve:
 *   - success path
 *   - error path (gateway/orchestrator/retrieval throws)
 *   - handleCodeReview result.error branch
 *   - handleListTools static content
 *   - handleVectorSearch: missing-arg guard, success, empty results, error
 *   - handleSearchCode: missing-arg guard, success, empty results, error
 *   - handleRetrieve: missing-arg guard, success, empty results, error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any import that transitively loads these
// ---------------------------------------------------------------------------

const {
  mockGatewayAsk,
  mockRunOrchestrator,
  mockVectorSearch,
  mockSearchCode,
  mockRetrieve,
} = vi.hoisted(() => ({
  mockGatewayAsk: vi.fn(),
  mockRunOrchestrator: vi.fn(),
  mockVectorSearch: vi.fn(),
  mockSearchCode: vi.fn(),
  mockRetrieve: vi.fn(),
}));

vi.mock("../../src/llm/gateway.ts", () => ({
  gateway: { ask: (...args: unknown[]) => mockGatewayAsk(...args) },
}));

vi.mock("../../src/agents/orchestrator.ts", () => ({
  runOrchestrator: (...args: unknown[]) => mockRunOrchestrator(...args),
}));

vi.mock("../../src/shared/logging/logger.ts", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Retrieval layer — used directly by handleVectorSearch / handleSearchCode
vi.mock("../../src/shared/retrieval/vector-client.js", () => ({
  vectorSearch: (...args: unknown[]) => mockVectorSearch(...args),
}));

vi.mock("../../src/shared/retrieval/code-search.js", () => ({
  searchCode: (...args: unknown[]) => mockSearchCode(...args),
}));

// Router layer — used by handleRetrieve
vi.mock("../../src/shared/retrieval/router.js", () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

// ---------------------------------------------------------------------------
// Module under test -- imported AFTER mocks are hoisted
// ---------------------------------------------------------------------------

import {
  handleAskLocal,
  handleCodeReview,
  handleListTools,
  handleVectorSearch,
  handleSearchCode,
  handleRetrieve,
} from "../../src/mcp/tool-handlers.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAskLocalArgs(overrides = {}) {
  return { prompt: "What is 2+2?", ...overrides };
}

function makeCodeReviewArgs(overrides = {}) {
  return { filePath: "/workspace/src/foo.ts", ...overrides };
}

// ---------------------------------------------------------------------------
// handleAskLocal
// ---------------------------------------------------------------------------

describe("handleAskLocal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text content from gateway on success", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "The answer is 4." });

    const result = await handleAskLocal(makeAskLocalArgs());

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "The answer is 4.",
    });
  });

  it("passes prompt, systemPrompt, and workspaceId to gateway", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "ok" });

    await handleAskLocal(
      makeAskLocalArgs({ systemPrompt: "Be concise", workspaceId: "ws-123" }),
    );

    const callArg = mockGatewayAsk.mock.calls[0][0];
    expect(callArg.prompt).toBe("What is 2+2?");
    expect(callArg.systemPrompt).toBe("Be concise");
    expect(callArg.workspaceId).toBe("ws-123");
    expect(callArg.constraints.privacyMode).toBe("local-only");
  });

  it("defaults workspaceId to 'mcp-local' when omitted", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "ok" });

    await handleAskLocal(makeAskLocalArgs());

    expect(mockGatewayAsk.mock.calls[0][0].workspaceId).toBe("mcp-local");
  });

  it("returns isError:true when gateway throws", async () => {
    mockGatewayAsk.mockRejectedValue(new Error("LLM unavailable"));

    const result = await handleAskLocal(makeAskLocalArgs());

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: LLM unavailable");
  });

  it("generates a unique requestId per call", async () => {
    mockGatewayAsk.mockResolvedValue({ outputText: "ok" });

    await handleAskLocal(makeAskLocalArgs());
    await handleAskLocal(makeAskLocalArgs());

    const id1 = mockGatewayAsk.mock.calls[0][0].requestId;
    const id2 = mockGatewayAsk.mock.calls[1][0].requestId;
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
    // UUID v4 pattern
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// handleCodeReview
// ---------------------------------------------------------------------------

describe("handleCodeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns finalOutput text on success", async () => {
    mockRunOrchestrator.mockResolvedValue({
      finalOutput: "PASS: no issues found",
      error: null,
    });

    const result = await handleCodeReview(makeCodeReviewArgs());

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("PASS: no issues found");
  });

  it("passes filePath and workspaceId to runOrchestrator", async () => {
    mockRunOrchestrator.mockResolvedValue({ finalOutput: "ok", error: null });

    await handleCodeReview(makeCodeReviewArgs({ workspaceId: "ws-review" }));

    expect(mockRunOrchestrator).toHaveBeenCalledWith(
      "code-review",
      { filePath: "/workspace/src/foo.ts" },
      "ws-review",
    );
  });

  it("defaults workspaceId to 'mcp-review' when omitted", async () => {
    mockRunOrchestrator.mockResolvedValue({ finalOutput: "ok", error: null });

    await handleCodeReview(makeCodeReviewArgs());

    expect(mockRunOrchestrator.mock.calls[0][2]).toBe("mcp-review");
  });

  it("returns isError:true when result.error is set", async () => {
    mockRunOrchestrator.mockResolvedValue({
      finalOutput: "",
      error: "file not found",
    });

    const result = await handleCodeReview(makeCodeReviewArgs());

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Review failed: file not found");
  });

  it("returns isError:true when runOrchestrator throws", async () => {
    mockRunOrchestrator.mockRejectedValue(new Error("orchestrator crash"));

    const result = await handleCodeReview(makeCodeReviewArgs());

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Review failed: orchestrator crash");
  });
});

// ---------------------------------------------------------------------------
// handleListTools
// ---------------------------------------------------------------------------

describe("handleListTools", () => {
  it("returns a text content item listing the three tools", async () => {
    const result = await handleListTools();

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const text = result.content[0].text;
    expect(text).toContain("ask-local");
    expect(text).toContain("code-review");
    expect(text).toContain("list-tools");
  });

  it("mentions planned tools in the output", async () => {
    const result = await handleListTools();
    expect(result.content[0].text).toContain("fix-sonar");
    expect(result.content[0].text).toContain("run-sprint");
  });

  it("never sets isError", async () => {
    const result = await handleListTools();
    expect(result.isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleVectorSearch
// ---------------------------------------------------------------------------

describe("handleVectorSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted results on successful search", async () => {
    mockVectorSearch.mockResolvedValueOnce([
      { score: 0.95, source: "src/foo.ts", text: "function foo()" },
      { score: 0.82, source: "src/bar.ts", text: "const bar = 1" },
    ]);

    const result = await handleVectorSearch({
      query: "how does foo work",
      topK: 5,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const text = result.content[0].text;
    expect(text).toContain("src/foo.ts");
    expect(text).toContain("0.950");
    expect(text).toContain("function foo()");
    expect(text).toContain("src/bar.ts");
  });

  it("passes query and topK to vectorSearch", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    await handleVectorSearch({ query: "test query", topK: 3 });

    expect(mockVectorSearch).toHaveBeenCalledWith("test query", 3);
  });

  it("defaults topK to 5 when not provided", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    await handleVectorSearch({ query: "test", topK: undefined });

    expect(mockVectorSearch).toHaveBeenCalledWith("test", 5);
  });

  it("returns 'No results found' message when result array is empty", async () => {
    mockVectorSearch.mockResolvedValueOnce([]);

    const result = await handleVectorSearch({
      query: "obscure query",
      topK: 5,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No results found");
  });

  it("returns isError:true when vectorSearch throws", async () => {
    mockVectorSearch.mockRejectedValueOnce(
      new Error("Qdrant connection refused"),
    );

    const result = await handleVectorSearch({ query: "query", topK: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "Error: Qdrant connection refused",
    );
  });

  it("returns isError:true when embeddings server throws", async () => {
    mockVectorSearch.mockRejectedValueOnce(
      new Error("embed: embeddings service returned 503"),
    );

    const result = await handleVectorSearch({ query: "q", topK: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Error:/);
  });

  it("formats results with score, source, and text on separate lines", async () => {
    mockVectorSearch.mockResolvedValueOnce([
      {
        score: 0.999,
        source: "docs/README.md",
        text: "Welcome to the project",
      },
    ]);

    const result = await handleVectorSearch({ query: "readme", topK: 1 });

    const text = result.content[0].text;
    expect(text).toContain("1.");
    expect(text).toContain("score: 0.999");
    expect(text).toContain("docs/README.md");
    expect(text).toContain("Welcome to the project");
  });
});

// ---------------------------------------------------------------------------
// handleSearchCode
// ---------------------------------------------------------------------------

describe("handleSearchCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted hits on successful search", async () => {
    mockSearchCode.mockResolvedValueOnce([
      {
        file: "src/agents/sub-agent.ts",
        line: 42,
        text: "export async function runSubAgent(",
      },
      {
        file: "tests/agents/sub-agent.test.ts",
        line: 10,
        text: "import { runSubAgent }",
      },
    ]);

    const result = await handleSearchCode({
      pattern: "runSubAgent",
      glob: undefined,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain(
      "src/agents/sub-agent.ts:42: export async function runSubAgent(",
    );
    expect(text).toContain(
      "tests/agents/sub-agent.test.ts:10: import { runSubAgent }",
    );
  });

  it("passes pattern and glob to searchCode", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    await handleSearchCode({ pattern: "vectorSearch", glob: "src/mcp" });

    expect(mockSearchCode).toHaveBeenCalledWith("vectorSearch", "src/mcp");
  });

  it("passes undefined glob when not provided", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    await handleSearchCode({ pattern: "foo", glob: undefined });

    expect(mockSearchCode).toHaveBeenCalledWith("foo", undefined);
  });

  it("returns 'No matches found' message when hits array is empty", async () => {
    mockSearchCode.mockResolvedValueOnce([]);

    const result = await handleSearchCode({
      pattern: "nothing_xyz",
      glob: undefined,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No matches found");
  });

  it("returns isError:true when searchCode throws", async () => {
    mockSearchCode.mockRejectedValueOnce(new Error("rg exited with code 2"));

    const result = await handleSearchCode({
      pattern: "bad[re",
      glob: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: rg exited with code 2");
  });

  it("returns isError:true when path traversal error is thrown", async () => {
    mockSearchCode.mockRejectedValueOnce(
      new Error('resolveGlob: path "../../etc" escapes REPO_ROOT'),
    );

    const result = await handleSearchCode({
      pattern: "foo",
      glob: "../../etc",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Error:/);
    expect(result.content[0].text).toContain("escapes REPO_ROOT");
  });

  it("formats each hit as file:line: text", async () => {
    mockSearchCode.mockResolvedValueOnce([
      { file: "a/b.ts", line: 7, text: "const x = 1;" },
    ]);

    const result = await handleSearchCode({ pattern: "x", glob: undefined });

    expect(result.content[0].text).toBe("a/b.ts:7: const x = 1;");
  });

  it("lists vector-search and search-code in handleListTools output", async () => {
    const result = await handleListTools();
    const text = result.content[0].text;
    expect(text).toContain("vector-search");
    expect(text).toContain("search-code");
  });
});

// ---------------------------------------------------------------------------
// handleRetrieve
// ---------------------------------------------------------------------------

describe("handleRetrieve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted vector results on successful search", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "vector",
      results: [
        { score: 0.95, source: "src/foo.ts", text: "function foo()" },
        { score: 0.82, source: "src/bar.ts", text: "const bar = 1" },
      ],
    });

    const result = await handleRetrieve({
      query: "how does foo work",
      topK: 5,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const text = result.content[0].text;
    expect(text).toContain("src/foo.ts");
    expect(text).toContain("0.950");
    expect(text).toContain("function foo()");
  });

  it("returns formatted code results on successful search", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "code",
      results: [
        {
          file: "src/agents/sub-agent.ts",
          line: 42,
          text: "export async function runSubAgent(",
        },
      ],
    });

    const result = await handleRetrieve({ query: "runSubAgent", mode: "code" });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain("src/agents/sub-agent.ts:42:");
  });

  it("returns file content on successful file strategy", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "file",
      results: "file contents here",
    });

    const result = await handleRetrieve({
      query: "/path/to/file.ts",
      mode: "file",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe("file contents here");
  });

  it("returns 'No results found' for empty vector results", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "vector",
      results: [],
    });

    const result = await handleRetrieve({ query: "obscure query", topK: 5 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No results found");
  });

  it("returns 'No results found' for empty code results", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "code",
      results: [],
    });

    const result = await handleRetrieve({ query: "nothing", mode: "code" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No results found");
  });

  it("returns isError:true when router returns error field", async () => {
    mockRetrieve.mockResolvedValueOnce({
      strategy: "vector",
      error: "Qdrant connection refused",
    });

    const result = await handleRetrieve({ query: "query", topK: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "Error: Qdrant connection refused",
    );
  });

  it("returns isError:true when retrieve throws", async () => {
    mockRetrieve.mockRejectedValueOnce(new Error("Router crash"));

    const result = await handleRetrieve({ query: "query", topK: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: Router crash");
  });
});
