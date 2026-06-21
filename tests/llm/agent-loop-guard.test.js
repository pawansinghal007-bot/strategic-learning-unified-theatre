import {
  ToolLoopGuard,
  createAgentState,
  createReasoningHash,
  createResetModeContext,
  enforceTokenBudget,
  estimateTokens,
} from "../../src/llm/agent-loop-guard.js";

describe("agent loop guard", () => {
  it("blocks duplicate tool calls with identical input", () => {
    const guard = new ToolLoopGuard();
    guard.startPhase();

    expect(guard.assertToolCallAllowed("readFile", { path: "a.js" }).allowed).toBe(
      true,
    );
    const duplicate = guard.assertToolCallAllowed("readFile", { path: "a.js" });

    expect(duplicate.allowed).toBe(false);
    expect(duplicate.reason).toContain("Blocked repeated tool call");
  });

  it("blocks a tool after the same reasoning phase call limit", () => {
    const guard = new ToolLoopGuard({ maxSamePhaseCalls: 3 });
    guard.startPhase();

    expect(guard.assertToolCallAllowed("search", { q: "one" }).allowed).toBe(
      true,
    );
    expect(guard.assertToolCallAllowed("search", { q: "two" }).allowed).toBe(
      true,
    );
    expect(guard.assertToolCallAllowed("search", { q: "three" }).allowed).toBe(
      true,
    );

    const blocked = guard.assertToolCallAllowed("search", { q: "four" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("maximum calls");
  });

  it("detects repeated reasoning hashes and creates reset mode context", () => {
    const guard = new ToolLoopGuard();
    const hash = createReasoningHash({
      currentStep: "inspect files",
      retrievedFiles: [{ path: "src/a.js" }],
      toolInputsLastTurn: [{ tool: "search", q: "loop" }],
    });

    expect(guard.evaluateReasoning(hash).resetRequired).toBe(false);
    expect(guard.evaluateReasoning(hash).resetRequired).toBe(true);

    const state = createAgentState({
      goal: "fix loop",
      relevantFiles: [{ filename: "src/a.js", content: "small snippet" }],
    });
    const resetContext = createResetModeContext({
      goal: "fix loop",
      agentState: state,
      latestToolOutputSummary: "same search repeated",
      relevantFiles: [{ filename: "src/a.js", content: "small snippet" }],
    });

    expect(resetContext).toContain("RESET MODE ACTIVATED");
    expect(resetContext).toContain("Repeated reasoning/tool fingerprint detected");
  });

  it("enforces token budget by preserving priority sections first", () => {
    const prompt = enforceTokenBudget(
      [
        { priority: 2, order: 2, text: "low ".repeat(1000) },
        { priority: 1, order: 1, text: "AGENT_STATE: keep me" },
      ],
      50,
    );

    expect(estimateTokens(prompt)).toBeLessThanOrEqual(50);
    expect(prompt).toContain("AGENT_STATE: keep me");
  });
});
