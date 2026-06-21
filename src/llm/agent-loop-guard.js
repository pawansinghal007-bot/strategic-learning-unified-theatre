import crypto from "node:crypto";

export const MAX_CONTEXT_TOKENS = 25_000;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

export function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value ?? null))
    .digest("hex");
}

export function truncateToTokens(text, maxTokens) {
  const source = String(text || "");
  const maxChars = Math.max(0, maxTokens * CHARS_PER_TOKEN);
  if (source.length <= maxChars) return source;
  return `${source.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[compressed]`;
}

function compactWhitespace(text) {
  return String(text || "").replaceAll(/\s+/g, " ").trim();
}

function dedupeByHash(items, hashFn, maxItems) {
  const unique = new Map();
  for (const item of items || []) {
    const hash = hashFn(item);
    if (!unique.has(hash)) unique.set(hash, item);
    if (unique.size >= maxItems) break;
  }
  return Array.from(unique.values());
}

export function summarizeFileSnippet(file, maxTokens = 220) {
  const content = truncateToTokens(
    compactWhitespace(file.content ?? file.text ?? ""),
    maxTokens,
  );
  return {
    path: file.path || file.filename || file.doc_id || "(unknown)",
    source_type: file.source_type || file.sourceType || "unknown",
    score: typeof file.score === "number" ? Number(file.score.toFixed(3)) : null,
    snippet: content,
    hash: stableHash(content),
  };
}

export function createAgentState({
  goal,
  currentStep = "Assemble bounded coding prompt",
  completedSteps = [],
  openQuestions = [],
  decisionsMade = [],
  relevantFiles = [],
  toolOutputs = [],
  failureSignals = [],
  progressId = 1,
  maxFiles = 10,
} = {}) {
  const files = dedupeByHash(
    relevantFiles.map((file) => summarizeFileSnippet(file)),
    (file) => file.hash,
    maxFiles,
  );
  const toolSummary = dedupeByHash(
    toolOutputs.map((output) => truncateToTokens(compactWhitespace(output), 120)),
    stableHash,
    6,
  ).join(" | ");

  return {
    goal: String(goal || "").trim(),
    current_step: currentStep,
    completed_steps: completedSteps.slice(0, 12),
    open_questions: openQuestions.slice(0, 8),
    decisions_made: decisionsMade.slice(0, 12),
    relevant_files: files,
    tool_memory_summary: toolSummary || "No raw tool logs retained.",
    failure_signals: failureSignals.slice(0, 8),
    progress_id: progressId,
  };
}

export function buildAgentStatePrompt(agentState) {
  return [
    "AGENT_STATE:",
    JSON.stringify(agentState, null, 2),
    "",
    "Loop-control rules:",
    "- Use AGENT_STATE as the only durable history.",
    "- Do not re-analyze completed_steps or decisions_made.",
    "- Make forward progress by changing current_step when more work remains.",
    "- Use summarized snippets only; request exact file contents only when needed.",
  ].join("\n");
}

export function enforceTokenBudget(sections, maxTokens = MAX_CONTEXT_TOKENS) {
  const ordered = [...sections].sort((a, b) => a.priority - b.priority);
  let remaining = maxTokens;
  const kept = [];

  for (const section of ordered) {
    if (remaining <= 0) break;
    if (kept.length > 0) {
      remaining -= estimateTokens("\n\n");
      if (remaining <= 0) break;
    }
    const requested = String(section.text || "");
    const tokens = estimateTokens(requested);
    const text =
      tokens <= remaining
        ? requested
        : truncateToTokens(requested, Math.max(remaining, 0));
    kept.push({ ...section, text });
    remaining -= estimateTokens(text);
  }

  const sortedKept = [...kept].sort((a, b) => a.order - b.order);
  return sortedKept.map((section) => section.text).filter(Boolean).join("\n\n");
}

export function createReasoningHash({
  currentStep,
  retrievedFiles = [],
  toolInputsLastTurn = [],
} = {}) {
  return stableHash({
    currentStep,
    retrievedFilesHash: stableHash(
      retrievedFiles.map((file) => file.hash || file.path || file.chunk_id || file.doc_id),
    ),
    toolInputsLastTurn: toolInputsLastTurn.map((input) => stableHash(input)),
  });
}

export function createResetModeContext({
  goal,
  agentState,
  latestToolOutputSummary = "",
  relevantFiles = [],
} = {}) {
  const resetState = createAgentState({
    goal,
    currentStep: "RESET MODE: redecompose task from compressed state",
    completedSteps: [],
    openQuestions: agentState?.open_questions ?? [],
    decisionsMade: agentState?.decisions_made ?? [],
    relevantFiles,
    toolOutputs: [latestToolOutputSummary].filter(Boolean),
    failureSignals: [
      "Repeated reasoning/tool fingerprint detected",
      ...(agentState?.failure_signals ?? []),
    ],
    progressId: (agentState?.progress_id ?? 0) + 1,
    maxFiles: 5,
  });

  return [
    "RESET MODE ACTIVATED",
    "",
    "Rebuild solution from scratch using only:",
    "- user goal",
    "- minimal relevant files",
    "- latest tool output summary",
    "",
    buildAgentStatePrompt(resetState),
  ].join("\n");
}

export class ToolLoopGuard {
  constructor({ maxSamePhaseCalls = 3 } = {}) {
    this.maxSamePhaseCalls = maxSamePhaseCalls;
    this.phaseId = 0;
    this.toolHistory = [];
    this.reasoningHashes = [];
    this.progressId = 0;
  }

  startPhase() {
    this.phaseId += 1;
    return this.phaseId;
  }

  assertToolCallAllowed(tool, input) {
    const inputHash = stableHash(input);
    const duplicate = this.toolHistory.some(
      (entry) => entry.tool === tool && entry.input_hash === inputHash,
    );
    if (duplicate) {
      return {
        allowed: false,
        reason: `Blocked repeated tool call: ${tool} with identical input.`,
      };
    }

    const phaseCalls = this.toolHistory.filter(
      (entry) => entry.phase_id === this.phaseId && entry.tool === tool,
    ).length;
    if (phaseCalls >= this.maxSamePhaseCalls) {
      return {
        allowed: false,
        reason: `Blocked ${tool}: maximum calls reached for this reasoning phase.`,
      };
    }

    this.toolHistory.push({
      tool,
      input_hash: inputHash,
      phase_id: this.phaseId,
    });
    return { allowed: true, input_hash: inputHash };
  }

  recordProgress() {
    this.progressId += 1;
    return this.progressId;
  }

  evaluateReasoning(reasoningHash) {
    this.reasoningHashes.push(reasoningHash);
    this.reasoningHashes = this.reasoningHashes.slice(-2);
    const [previous, current] = this.reasoningHashes;
    const repeated = Boolean(previous && current && previous === current);
    return {
      repeated,
      resetRequired: repeated,
      progress_id: repeated ? this.recordProgress() : this.progressId,
    };
  }
}
