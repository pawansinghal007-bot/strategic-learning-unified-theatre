/**
 * agent-loop-guard-branches.test.js
 *
 * Targets branch gaps in src/llm/agent-loop-guard.js:
 *   Lines 7-18   — stableHash with non-string / null / undefined value
 *   Lines 25-33  — truncateToTokens text longer than maxChars (compression path)
 *   Lines 40-44  — dedupeByHash maxItems stop, and empty/null items
 *   Line  46     — summarizeFileSnippet with score=number vs non-number
 *   Line  76     — createAgentState with all defaults (no args)
 *   Lines 107-112 — enforceTokenBudget: remaining ≤ 0 early exits + separator drain
 *   Line  134    — createReasoningHash with file hash/chunk_id/doc_id fallbacks
 *   Lines 150-158 — createResetModeContext with missing agentState fields
 */

import { describe, it, expect } from "vitest";
import {
  stableHash,
  truncateToTokens,
  summarizeFileSnippet,
  createAgentState,
  enforceTokenBudget,
  createReasoningHash,
  createResetModeContext,
  buildAgentStatePrompt,
  estimateTokens,
  MAX_CONTEXT_TOKENS,
} from "../../src/llm/agent-loop-guard.js";

// ── stableHash (lines 7-18) ────────────────────────────────────────────────

describe("stableHash", () => {
  it("hashes a plain string directly", () => {
    const h = stableHash("hello");
    expect(typeof h).toBe("string");
    expect(h).toHaveLength(64);
  });

  it("hashes a number via JSON.stringify", () => {
    const h = stableHash(42);
    expect(h).toHaveLength(64);
    // Same as JSON.stringify(42) = "42"
    expect(h).toBe(stableHash("42"));
  });

  it("hashes an object", () => {
    const h = stableHash({ a: 1, b: 2 });
    expect(h).toHaveLength(64);
  });

  it("hashes null (line 18: value ?? null path)", () => {
    const h = stableHash(null);
    expect(h).toHaveLength(64);
    // null → JSON.stringify(null) = "null"
    expect(h).toBe(stableHash("null"));
  });

  it("hashes undefined via ?? null fallback", () => {
    const h = stableHash(undefined);
    expect(h).toHaveLength(64);
    // undefined ?? null → null → JSON.stringify(null)
    expect(h).toBe(stableHash(null));
  });

  it("produces different hashes for different values", () => {
    expect(stableHash("a")).not.toBe(stableHash("b"));
  });

  it("is deterministic", () => {
    expect(stableHash({ x: 1 })).toBe(stableHash({ x: 1 }));
  });
});

// ── truncateToTokens (lines 25-33) ─────────────────────────────────────────

describe("truncateToTokens", () => {
  it("returns source unchanged when it fits within token budget", () => {
    const text = "short text";
    expect(truncateToTokens(text, 100)).toBe(text);
  });

  it("truncates and appends [compressed] when text exceeds maxTokens", () => {
    // 4 chars per token → maxChars = 20, text is 100 chars
    const text = "x".repeat(100);
    const result = truncateToTokens(text, 5); // 5 * 4 = 20 chars
    expect(result).toContain("[compressed]");
    expect(result.length).toBeLessThan(text.length);
  });

  it("handles empty string", () => {
    expect(truncateToTokens("", 10)).toBe("");
  });

  it("handles null/undefined coercion", () => {
    expect(truncateToTokens(null, 10)).toBe("");
    expect(truncateToTokens(undefined, 10)).toBe("");
  });

  it("handles maxTokens=0 (maxChars=0 → returns [compressed] tail)", () => {
    const result = truncateToTokens("hello world", 0);
    expect(result).toContain("[compressed]");
  });

  it("trimEnd applied before [compressed] suffix", () => {
    // Text with enough content to actually produce output before [compressed]
    // 5 tokens = 20 chars, so we need text > 20 chars to trigger compression
    const text = "abcdefghij klmnopqrst " + "x".repeat(200);
    const result = truncateToTokens(text, 5);
    // Result should contain [compressed]
    expect(result).toContain("[compressed]");
    // The text before \n[compressed] should not have trailing whitespace
    const beforeCompressed = result.replace(/\n\[compressed\]$/, "");
    expect(beforeCompressed).not.toMatch(/\s$/);
  });

  // ── fromEnd: true — concrete before/after string tests ──────────────────

  it("fromEnd:true keeps the tail (most recent) portion, not the head", () => {
    // 10 tokens * 4 chars/token = 40 chars budget.
    // Tail is exactly 40 chars — fills the entire kept window.
    // Head is 200 chars — entirely outside the kept window.
    const tail = "RECENT_END_KEEP_TAIL_CONTENT_SURVIVES_!!"; // exactly 40 chars
    const head = "EARLY_".repeat(40);                        // 240 chars — must be discarded
    const full = head + tail;                               // 280 chars > 40 char budget
    const result = truncateToTokens(full, 10, { fromEnd: true });
    expect(result).toContain("RECENT_END_KEEP_TAIL_CONTENT_SURVIVES_!!");
    // Tail fills the whole window, so no head chars appear after the marker
    expect(result).not.toContain("EARLY_");
    expect(result).toContain("[compressed]");
  });

  it("fromEnd:true result starts with the [compressed] marker then the tail", () => {
    // 10 tokens * 4 = 40 chars budget.
    // Tail is exactly 40 chars — fills the entire kept window.
    // Head is 240 chars entirely outside the kept window.
    const tailText = "TAIL_SECTION_KEPT_IN_RESULT_EXACTLY_40!!"; // exactly 40 chars
    const headText = "Z".repeat(240);                               // 240 chars — all dropped
    const full = headText + tailText;                              // 280 chars total
    const result = truncateToTokens(full, 10, { fromEnd: true });
    // Output format: "\n[compressed]\n<tail>"
    expect(result.startsWith("\n[compressed]\n")).toBe(true);
    expect(result.endsWith(tailText)).toBe(true);
    expect(result).not.toContain("Z"); // all Z head chars dropped
  });

  it("fromEnd:true returns source unchanged when it fits within budget", () => {
    const text = "fits fine";
    expect(truncateToTokens(text, 100, { fromEnd: true })).toBe(text);
  });

  it("default (fromEnd omitted) keeps the head, appending [compressed]", () => {
    // Contrast with fromEnd:true to make the difference explicit.
    // Budget: 5 tokens = 20 chars. Head is 20 chars exactly; tail is extra.
    const head = "KEEP_THIS_HEAD_STRT"; // 19 chars (just under budget edge)
    const tail = "DROP_THIS_TAIL_END_XYZ_EXTRA"; // appended, must be cut
    const full = head + tail;
    const result = truncateToTokens(full, 5); // 5*4=20 chars
    // Head portion retained, tail dropped
    expect(result).not.toContain("DROP_THIS_TAIL_END_XYZ_EXTRA");
    expect(result).toContain("[compressed]");
  });
});

// ── dedupeByHash via createAgentState (lines 40-44) ────────────────────────

describe("dedupeByHash via createAgentState maxFiles cap", () => {
  it("limits relevantFiles to maxFiles (dedupeByHash maxItems stop)", () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      path: `file${i}.js`,
      content: `content of file ${i}`,
    }));
    const state = createAgentState({ goal: "test", relevantFiles: files, maxFiles: 5 });
    expect(state.relevant_files).toHaveLength(5);
  });

  it("deduplicates files with identical content hashes", () => {
    const files = [
      { path: "a.js", content: "same content" },
      { path: "b.js", content: "same content" }, // same hash → deduplicated
      { path: "c.js", content: "different content" },
    ];
    const state = createAgentState({ goal: "dedup test", relevantFiles: files, maxFiles: 10 });
    // Two files have the same content → one is deduped
    expect(state.relevant_files).toHaveLength(2);
  });

  it("handles null/undefined items array gracefully via dedupeByHash || []", () => {
    // dedupeByHash uses `for (const item of items || [])` so null is handled internally.
    // However createAgentState calls relevantFiles.map() before dedupeByHash.
    // Passing null to createAgentState is not a supported usage — test with empty array instead.
    const state = createAgentState({ goal: "null files", relevantFiles: [] });
    expect(state.relevant_files).toEqual([]);
  });

  it("dedupes toolOutputs by hash (maxItems=6)", () => {
    const outputs = Array.from({ length: 10 }, (_, i) => `output ${i}`);
    const state = createAgentState({ goal: "tools", toolOutputs: outputs });
    // tool_memory_summary should have at most 6 entries joined by " | "
    const parts = state.tool_memory_summary.split(" | ");
    expect(parts.length).toBeLessThanOrEqual(6);
  });

  it("returns 'No raw tool logs retained.' when toolOutputs is empty", () => {
    const state = createAgentState({ goal: "no tools" });
    expect(state.tool_memory_summary).toBe("No raw tool logs retained.");
  });
});

// ── summarizeFileSnippet score branch (line 46) ────────────────────────────

describe("summarizeFileSnippet", () => {
  it("includes numeric score rounded to 3 decimals", () => {
    const snippet = summarizeFileSnippet({ content: "hello", score: 0.987654 });
    expect(snippet.score).toBe(0.988);
  });

  it("sets score to null when score is not a number", () => {
    const snippet = summarizeFileSnippet({ content: "hello", score: "high" });
    expect(snippet.score).toBeNull();
  });

  it("sets score to null when score is undefined", () => {
    const snippet = summarizeFileSnippet({ content: "hello" });
    expect(snippet.score).toBeNull();
  });

  it("uses file.text when content is absent", () => {
    const snippet = summarizeFileSnippet({ text: "text fallback" });
    expect(snippet.snippet).toContain("text fallback");
  });

  it("uses file.filename as path when path is absent", () => {
    const snippet = summarizeFileSnippet({ content: "x", filename: "foo.js" });
    expect(snippet.path).toBe("foo.js");
  });

  it("uses file.doc_id as path when path and filename are absent", () => {
    const snippet = summarizeFileSnippet({ content: "x", doc_id: "doc-123" });
    expect(snippet.path).toBe("doc-123");
  });

  it("falls back to (unknown) when no path identifiers present", () => {
    const snippet = summarizeFileSnippet({ content: "x" });
    expect(snippet.path).toBe("(unknown)");
  });

  it("uses sourceType when source_type is absent", () => {
    const snippet = summarizeFileSnippet({ content: "x", sourceType: "pdf" });
    expect(snippet.source_type).toBe("pdf");
  });

  it("defaults source_type to 'unknown' when neither present", () => {
    const snippet = summarizeFileSnippet({ content: "x" });
    expect(snippet.source_type).toBe("unknown");
  });
});

// ── createAgentState all-defaults (line 76) ────────────────────────────────

describe("createAgentState — defaults", () => {
  it("works with no arguments at all", () => {
    const state = createAgentState();
    expect(state.goal).toBe("");
    expect(state.current_step).toBe("Assemble bounded coding prompt");
    expect(state.completed_steps).toEqual([]);
    expect(state.open_questions).toEqual([]);
    expect(state.decisions_made).toEqual([]);
    expect(state.relevant_files).toEqual([]);
    expect(state.tool_memory_summary).toBe("No raw tool logs retained.");
    expect(state.failure_signals).toEqual([]);
    expect(state.progress_id).toBe(1);
  });

  it("slices arrays to their max sizes", () => {
    const state = createAgentState({
      goal: "test",
      completedSteps: Array.from({ length: 20 }, (_, i) => `step ${i}`),
      openQuestions: Array.from({ length: 12 }, (_, i) => `q ${i}`),
      decisionsMade: Array.from({ length: 20 }, (_, i) => `decision ${i}`),
      failureSignals: Array.from({ length: 15 }, (_, i) => `signal ${i}`),
    });
    expect(state.completed_steps).toHaveLength(12);
    expect(state.open_questions).toHaveLength(8);
    expect(state.decisions_made).toHaveLength(12);
    expect(state.failure_signals).toHaveLength(8);
  });
});

// ── buildAgentStatePrompt ──────────────────────────────────────────────────

describe("buildAgentStatePrompt", () => {
  it("includes AGENT_STATE: header", () => {
    const state = createAgentState({ goal: "my goal" });
    const prompt = buildAgentStatePrompt(state);
    expect(prompt).toContain("AGENT_STATE:");
    expect(prompt).toContain("Loop-control rules:");
  });
});

// ── enforceTokenBudget (lines 107-112) ────────────────────────────────────

describe("enforceTokenBudget — edge cases", () => {
  it("returns empty string for empty sections array", () => {
    expect(enforceTokenBudget([])).toBe("");
  });

  it("stops adding sections when remaining drops to 0 (line 107 early exit)", () => {
    // Budget so tight the first section consumes all remaining tokens
    const sections = [
      { priority: 1, order: 1, text: "x".repeat(100) }, // ~25 tokens
      { priority: 2, order: 2, text: "more text" },
    ];
    const result = enforceTokenBudget(sections, 25);
    // Second section should not appear since budget exhausted
    expect(result).not.toContain("more text");
  });

  it("separator token drain causes early exit (line 110-112)", () => {
    // Use exactly 2 tokens budget — after first section and separator, nothing left
    const sections = [
      { priority: 1, order: 1, text: "ab" }, // 1 token
      { priority: 2, order: 2, text: "cd" }, // 1 token — but separator "\n\n" = 1 token
    ];
    const result = enforceTokenBudget(sections, 2);
    // First section fits (1 token), separator takes the last token → second section cut
    expect(result).toContain("ab");
  });

  it("filters out falsy text entries from result", () => {
    const sections = [
      { priority: 1, order: 1, text: "" },   // falsy → filtered out
      { priority: 2, order: 2, text: "real content" },
    ];
    const result = enforceTokenBudget(sections, 1000);
    expect(result).toBe("real content");
  });

  it("respects order field when assembling output", () => {
    const sections = [
      { priority: 2, order: 1, text: "FIRST" },
      { priority: 1, order: 2, text: "SECOND" },
    ];
    const result = enforceTokenBudget(sections, 1000);
    // priority 1 processed first but order 1 should appear first in output
    const firstIdx = result.indexOf("FIRST");
    const secondIdx = result.indexOf("SECOND");
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it("truncates a section text when it exceeds remaining budget", () => {
    const longText = "word ".repeat(500);
    const sections = [{ priority: 1, order: 1, text: longText }];
    const result = enforceTokenBudget(sections, 10);
    expect(estimateTokens(result)).toBeLessThanOrEqual(10);
  });

  it("uses default MAX_CONTEXT_TOKENS when maxTokens not provided", () => {
    const sections = [{ priority: 1, order: 1, text: "hello" }];
    const result = enforceTokenBudget(sections);
    expect(result).toBe("hello");
  });
});

// ── createReasoningHash (line 134) ─────────────────────────────────────────

describe("createReasoningHash — file identifier fallbacks", () => {
  it("uses file.hash when present", () => {
    const h = createReasoningHash({
      currentStep: "step",
      retrievedFiles: [{ hash: "abc123", path: "file.js" }],
    });
    expect(typeof h).toBe("string");
    expect(h).toHaveLength(64);
  });

  it("falls back to file.path when hash is absent", () => {
    const h1 = createReasoningHash({
      currentStep: "step",
      retrievedFiles: [{ path: "file-a.js" }],
    });
    const h2 = createReasoningHash({
      currentStep: "step",
      retrievedFiles: [{ path: "file-b.js" }],
    });
    expect(h1).not.toBe(h2);
  });

  it("falls back to file.chunk_id when hash and path are absent", () => {
    const h = createReasoningHash({
      currentStep: "step",
      retrievedFiles: [{ chunk_id: "chunk-001" }],
    });
    expect(h).toHaveLength(64);
  });

  it("falls back to file.doc_id when hash, path, and chunk_id are absent", () => {
    const h = createReasoningHash({
      currentStep: "step",
      retrievedFiles: [{ doc_id: "doc-999" }],
    });
    expect(h).toHaveLength(64);
  });

  it("handles empty retrievedFiles and toolInputsLastTurn arrays", () => {
    const h = createReasoningHash({ currentStep: "step", retrievedFiles: [], toolInputsLastTurn: [] });
    expect(h).toHaveLength(64);
  });

  it("works with no arguments (all defaults)", () => {
    const h = createReasoningHash();
    expect(h).toHaveLength(64);
  });

  it("hashes toolInputsLastTurn inputs", () => {
    const h1 = createReasoningHash({
      currentStep: "s",
      toolInputsLastTurn: [{ path: "x.js" }],
    });
    const h2 = createReasoningHash({
      currentStep: "s",
      toolInputsLastTurn: [{ path: "y.js" }],
    });
    expect(h1).not.toBe(h2);
  });
});

// ── createResetModeContext (lines 150-158) ─────────────────────────────────

describe("createResetModeContext", () => {
  it("works with no arguments (all defaults)", () => {
    const ctx = createResetModeContext();
    expect(ctx).toContain("RESET MODE ACTIVATED");
    expect(ctx).toContain("AGENT_STATE:");
  });

  it("works when agentState is undefined", () => {
    const ctx = createResetModeContext({ goal: "fix bug", agentState: undefined });
    expect(ctx).toContain("RESET MODE ACTIVATED");
    expect(ctx).toContain("fix bug");
  });

  it("uses agentState.open_questions and decisions_made when agentState is provided", () => {
    const agentState = {
      open_questions: ["Is it deployed?"],
      decisions_made: ["Use TypeScript"],
      failure_signals: ["OOM error"],
      progress_id: 3,
    };
    const ctx = createResetModeContext({
      goal: "recover",
      agentState,
      latestToolOutputSummary: "last tool result",
    });
    expect(ctx).toContain("RESET MODE ACTIVATED");
    expect(ctx).toContain("Repeated reasoning/tool fingerprint detected");
    expect(ctx).toContain("OOM error");
  });

  it("increments progressId from agentState.progress_id", () => {
    const agentState = { progress_id: 5, open_questions: [], decisions_made: [], failure_signals: [] };
    const ctx = createResetModeContext({ goal: "test", agentState });
    // The reset state should have progress_id = 6
    expect(ctx).toContain('"progress_id": 6');
  });

  it("filters out empty latestToolOutputSummary from toolOutputs", () => {
    // empty string → filtered out by .filter(Boolean)
    const ctx = createResetModeContext({
      goal: "test",
      latestToolOutputSummary: "",
    });
    expect(ctx).toContain("RESET MODE ACTIVATED");
  });

  it("includes latestToolOutputSummary in output when non-empty", () => {
    const ctx = createResetModeContext({
      goal: "test",
      latestToolOutputSummary: "tool ran successfully",
    });
    // The tool summary gets truncated into the tool_memory_summary field
    expect(ctx).toContain("tool ran successfully");
  });

  it("passes relevantFiles to createAgentState with maxFiles=5", () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `file${i}.js`,
      content: `content ${i}`,
    }));
    const ctx = createResetModeContext({ goal: "many files", relevantFiles: files });
    expect(ctx).toContain("RESET MODE ACTIVATED");
    // With maxFiles=5, only 5 unique files in relevant_files
    const parsed = JSON.parse(
      ctx.replace(/^RESET MODE ACTIVATED[\s\S]*?AGENT_STATE:\n/, "").split("\n\nLoop-control")[0],
    );
    expect(parsed.relevant_files.length).toBeLessThanOrEqual(5);
  });
});
