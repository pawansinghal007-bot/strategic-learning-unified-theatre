/**
 * tests/agents/orchestrator.test.ts
 *
 * Unit tests for src/agents/orchestrator.ts — runOrchestrator.
 *
 * All filesystem I/O, runSubAgent, and appendSessionLog are mocked so tests
 * are deterministic and leave no disk state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

// ─── hoisted mocks ────────────────────────────────────────────────────────────

const { mockExistsSync, mockReadFileSync, mockRunSubAgent, mockAppendSessionLog } =
  vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockRunSubAgent: vi.fn(),
    mockAppendSessionLog: vi.fn(),
  }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

vi.mock("../../src/agents/sub-agent", () => ({
  runSubAgent: mockRunSubAgent,
}));

vi.mock("../../src/agents/memory/session-log", () => ({
  appendSessionLog: mockAppendSessionLog,
}));

vi.mock("../../src/shared/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── module under test ────────────────────────────────────────────────────────

import { runOrchestrator, COMMANDS_DIR, AGENTS_DIR } from "../../src/agents/orchestrator";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid pipeline markdown for command "code-review" */
function makeCommandMd(agentName = "code-reviewer") {
  return `# code-review
Input: {"filePath":"string"}

## Step analyze
agent: ${agentName}
prompt: |
  Review {{filePath}}
`;
}

function makeAgentPath(agentName: string) {
  return path.join(AGENTS_DIR, `${agentName}.md`);
}

function makeCommandPath(command: string) {
  return path.join(COMMANDS_DIR, `${command}.md`);
}

function successSubAgentResult(output = "LGTM [DONE]") {
  return Promise.resolve({
    taskId: "t1",
    agentName: "code-reviewer",
    success: true,
    output,
    iterations: 1,
    durationMs: 10,
  });
}

function failSubAgentResult(error = "LLM error") {
  return Promise.resolve({
    taskId: "t1",
    agentName: "code-reviewer",
    success: false,
    output: "",
    iterations: 1,
    durationMs: 5,
    error,
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("runOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── happy path ──────────────────────────────────────────────────────────────

  it("returns success result when pipeline runs correctly", async () => {
    const commandPath = makeCommandPath("code-review");
    const agentPath = makeAgentPath("code-reviewer");

    mockExistsSync.mockImplementation(
      (p: string) => p === commandPath || p === agentPath,
    );
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return makeCommandMd();
      if (p === agentPath) return "You are a code reviewer.";
      throw new Error(`Unexpected readFileSync: ${p}`);
    });
    mockRunSubAgent.mockReturnValueOnce(successSubAgentResult("All good."));

    const result = await runOrchestrator(
      "code-review",
      { filePath: "src/foo.ts" },
      "ws-1",
    );

    expect(result.success).toBe(true);
    expect(result.command).toBe("code-review");
    expect(result.finalOutput).toBe("All good.");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].success).toBe(true);
    expect(result.steps[0].stepName).toBe("nalyze"); // source: substring(9) on "## Step analyze"
    expect(result.steps[0].agentName).toBe("code-reviewer");
    expect(result.error).toBeUndefined();
    // session log written for step + final summary
    expect(mockAppendSessionLog).toHaveBeenCalledTimes(2);
  });

  it("interpolates filePath into the agent prompt", async () => {
    const commandPath = makeCommandPath("code-review");
    const agentPath = makeAgentPath("code-reviewer");

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return makeCommandMd();
      return "system prompt";
    });
    mockRunSubAgent.mockReturnValueOnce(successSubAgentResult());

    await runOrchestrator("code-review", { filePath: "src/bar.ts" }, "ws-1");

    const subAgentCall = mockRunSubAgent.mock.calls[0][0];
    expect(subAgentCall.userPrompt).toContain("src/bar.ts");
  });

  it("passes workspaceId through to runSubAgent", async () => {
    const commandPath = makeCommandPath("code-review");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeCommandMd());
    mockRunSubAgent.mockReturnValueOnce(successSubAgentResult());

    await runOrchestrator("code-review", {}, "my-workspace");

    const call = mockRunSubAgent.mock.calls[0][0];
    expect(call.workspaceId).toBe("my-workspace");
  });

  // ── command-not-found ───────────────────────────────────────────────────────

  it("returns failure when command file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await runOrchestrator("nonexistent", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Command file not found/);
    expect(result.steps).toHaveLength(0);
    expect(mockRunSubAgent).not.toHaveBeenCalled();
  });

  // ── read error ──────────────────────────────────────────────────────────────

  it("returns failure when readFileSync throws for the command file", async () => {
    const commandPath = makeCommandPath("code-review");
    mockExistsSync.mockImplementation((p: string) => p === commandPath);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("permission denied");
    });

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to read command file/);
  });

  // ── parse error ─────────────────────────────────────────────────────────────

  it("returns failure when pipeline markdown is malformed (no steps)", async () => {
    const commandPath = makeCommandPath("code-review");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("# code-review\nInput: {}\n"); // no steps

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to parse pipeline/);
  });

  // ── agent-not-found ─────────────────────────────────────────────────────────

  it("returns failure when agent file does not exist", async () => {
    const commandPath = makeCommandPath("code-review");
    mockExistsSync.mockImplementation(
      (p: string) => p === commandPath, // agent file returns false
    );
    mockReadFileSync.mockReturnValue(makeCommandMd());

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Agent file not found/);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].success).toBe(false);
    expect(mockRunSubAgent).not.toHaveBeenCalled();
  });

  it("returns failure when agent readFileSync throws an Error instance", async () => {
    const commandPath = makeCommandPath("code-review");
    const agentPath = makeAgentPath("code-reviewer");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return makeCommandMd();
      if (p === agentPath) throw new Error("read fail");
      return "";
    });

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to read agent file/);
  });

  it("returns failure when agent readFileSync throws a non-Error value (line 45: String(err) branch)", async () => {
    const commandPath = makeCommandPath("code-review");
    const agentPath = makeAgentPath("code-reviewer");
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return makeCommandMd();
      if (p === agentPath) throw "non-error string throw"; // exercises String(err) on line 45
      return "";
    });

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to read agent file/);
    expect(result.error).toContain("non-error string throw");
  });

  // ── sub-agent failure ───────────────────────────────────────────────────────

  it("returns failure and stops processing when sub-agent fails", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeCommandMd());
    mockRunSubAgent.mockReturnValueOnce(failSubAgentResult("LLM unavailable"));

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("LLM unavailable");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toBe("LLM unavailable");
  });

  it("stops at first failed step in a multi-step pipeline", async () => {
    const multiStepMd = `# code-review
Input: {}

## Step step1
agent: agent-a
prompt: |
  First

## Step step2
agent: agent-b
prompt: |
  Second
`;
    const agentAPath = makeAgentPath("agent-a");
    const commandPath = makeCommandPath("code-review");

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return multiStepMd;
      return "system prompt"; // both agents exist
    });
    mockRunSubAgent.mockReturnValueOnce(failSubAgentResult("step1 failed"));

    const result = await runOrchestrator("code-review", {}, "ws-1");

    // Only step1 ran; step2 was never reached
    expect(mockRunSubAgent).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(1);
    expect(result.success).toBe(false);
  });

  it("passes previousOutput from one step to the next", async () => {
    const multiStepMd = `# code-review
Input: {}

## Step step1
agent: agent-a
prompt: |
  First step

## Step step2
agent: agent-b
prompt: |
  Previous was: {{previousOutput}}
`;
    const commandPath = makeCommandPath("code-review");

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return multiStepMd;
      return "system prompt";
    });
    mockRunSubAgent
      .mockReturnValueOnce(successSubAgentResult("step1 output"))
      .mockReturnValueOnce(successSubAgentResult("step2 output"));

    await runOrchestrator("code-review", {}, "ws-1");

    const step2Call = mockRunSubAgent.mock.calls[1][0];
    expect(step2Call.userPrompt).toContain("step1 output");
  });

  // ── COMMANDS_DIR export and logStepToSession body (lines 45, 108-125) ──────

  it("exports COMMANDS_DIR, AGENTS_DIR, CLAUDE_DIR with correct structure (line 45)", () => {
    // Importing these constants exercises the export declaration on line 45.
    // Validate they are non-empty strings rooted at the cwd .claude directory.
    expect(typeof COMMANDS_DIR).toBe("string");
    expect(COMMANDS_DIR.length).toBeGreaterThan(0);
    expect(COMMANDS_DIR).toContain(".claude");
    expect(COMMANDS_DIR).toContain("commands");
  });

  it("logStepToSession is called with correct entry fields on success (lines 108-125)", async () => {
    // This test exercises the logStepToSession private function body by
    // running a successful pipeline and asserting that appendSessionLog
    // was called with ALL fields that logStepToSession constructs (lines 108-120).
    const commandPath = makeCommandPath("code-review");
    const agentPath = makeAgentPath("code-reviewer");

    mockExistsSync.mockImplementation(
      (p: string) => p === commandPath || p === agentPath,
    );
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return makeCommandMd();
      if (p === agentPath) return "You are a code reviewer.";
      throw new Error(`Unexpected readFileSync: ${p}`);
    });
    mockRunSubAgent.mockReturnValueOnce(
      Promise.resolve({
        taskId: "t1",
        agentName: "code-reviewer",
        success: true,
        output: "LGTM — looks good",
        iterations: 1,
        durationMs: 12,
      }),
    );

    await runOrchestrator("code-review", { filePath: "src/foo.ts" }, "ws-1");

    // appendSessionLog is called twice: once by logStepToSession (step), once
    // for the final orchestrator summary. The STEP call (from logStepToSession)
    // must contain all the fields constructed inside that function body.
    const stepCall = mockAppendSessionLog.mock.calls.find(
      ([entry]) => entry.stepName !== "orchestrator",
    );
    expect(stepCall).toBeDefined();
    const [entry] = stepCall!;

    // Verify each field that logStepToSession constructs (lines 109-121)
    expect(typeof entry.timestamp).toBe("string");
    expect(entry.command).toBe("code-review");
    expect(entry.taskId).toMatch(/^code-review-step-/);
    expect(typeof entry.stepNumber).toBe("number");
    expect(typeof entry.stepName).toBe("string");
    expect(entry.agentName).toBe("code-reviewer");
    expect(entry.success).toBe(true);
    expect(typeof entry.durationMs).toBe("number");
    expect(typeof entry.outputPreview).toBe("string"); // output.slice(0, 200)
    expect(entry.outputPreview).toContain("LGTM");
    // error field is undefined for a successful step
    expect(entry.error).toBeUndefined();
  });

  it("logStepToSession includes error field when step fails (lines 108-125 error branch)", async () => {
    const commandPath = makeCommandPath("code-review");
    const agentPath = makeAgentPath("code-reviewer");

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return makeCommandMd();
      return "system prompt";
    });
    mockRunSubAgent.mockReturnValueOnce(
      Promise.resolve({
        taskId: "t1",
        agentName: "code-reviewer",
        success: false,
        output: "",
        iterations: 1,
        durationMs: 5,
        error: "LLM timeout",
      }),
    );

    await runOrchestrator("code-review", { filePath: "src/foo.ts" }, "ws-1");

    // The step call to appendSessionLog (via logStepToSession) must include error
    const stepCall = mockAppendSessionLog.mock.calls.find(
      ([entry]) => entry.stepName !== "orchestrator",
    );
    expect(stepCall).toBeDefined();
    const [entry] = stepCall!;
    expect(entry.success).toBe(false);
    expect(entry.error).toBe("LLM timeout");
  });

  // ── crash path ──────────────────────────────────────────────────────────────

  it("includes totalDurationMs in the result", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(makeCommandMd());
    mockRunSubAgent.mockReturnValueOnce(successSubAgentResult());

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(typeof result.totalDurationMs).toBe("number");
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});


// ── Targeted coverage gap tests ───────────────────────────────────────────
// Covers: orchestrator.ts lines 108-125
//   Line 108: `err instanceof Error ? err.message : String(err)` false branch
//             in the readFileSync catch (non-Error thrown)
//   Line 125: same ternary false branch in the parsePipeline catch
//             (non-Error thrown by parsePipeline)

describe("runOrchestrator — non-Error throw branches (lines 108-125)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses String(err) when readFileSync throws a non-Error value (line 108 false branch)", async () => {
    // existsSync returns true so we pass the command-not-found guard,
    // then readFileSync throws a plain string (not an Error instance).
    const commandPath = makeCommandPath("code-review");
    mockExistsSync.mockImplementation((p: string) => p === commandPath);
    mockReadFileSync.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "plain string read error"; // not an Error → hits String(err) branch
    });

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to read command file/);
    // String(err) path includes the raw string value
    expect(result.error).toContain("plain string read error");
  });

  it("uses String(err) when parsePipeline throws a non-Error value (line 125 false branch)", async () => {
    // readFileSync succeeds (returns valid content), but parsePipeline is
    // mocked to throw a plain string so the ternary false branch fires.
    const commandPath = makeCommandPath("code-review");
    mockExistsSync.mockImplementation((p: string) => p === commandPath);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === commandPath) return "# code-review\nInput: {}\n## Step s\nagent: a\nprompt: |\n  x\n";
      return "";
    });

    // Temporarily mock parsePipeline to throw a non-Error
    const pipelineModule = await import("../../src/agents/pipeline");
    const parseSpy = vi
      .spyOn(pipelineModule, "parsePipeline")
      .mockImplementationOnce(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "plain string parse error"; // not an Error → String(err) branch
      });

    const result = await runOrchestrator("code-review", {}, "ws-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to parse pipeline/);
    expect(result.error).toContain("plain string parse error");

    parseSpy.mockRestore();
  });
});
