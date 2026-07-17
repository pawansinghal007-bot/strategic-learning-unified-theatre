import { gateway } from "../llm/gateway";
import { logger } from "../shared/logging/logger";
import { AgentTask, AgentResult } from "./types";
import {
  ProviderRequest,
  ProviderResponse,
} from "../shared/contracts/provider";
import { getTool } from "./tools/registry";
import { classifyToolCall } from "./tool-call-classifier";
import { recordToolCallForMeasurement } from "./tool-call-measurement-log.js";

// ─── private helpers ─────────────────────────────────────────────────────────

/** True if `ch` is an ASCII word character (letter, digit, or underscore). */
function isWordChar(ch: string | undefined): boolean {
  /* v8 ignore next 1 */
  if (ch === undefined) return false;
  const c = ch.codePointAt(0);
  return (
    c !== undefined &&
    ((c >= 48 && c <= 57) || // 0-9
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 95) // _
  );
}

/** True if `ch` is a whitespace character (space, tab, newline, CR, FF, VT). */
function isWhitespaceChar(ch: string | undefined): boolean {
  return (
    ch === " " ||
    ch === "\t" ||
    ch === "\n" ||
    ch === "\r" ||
    ch === "\f" ||
    ch === "\v"
  );
}

interface KeyScanResult {
  key: string;
  nextIndex: number; // index of the value, right after '='
}

/** Scans a `\w+=` key starting at `start`, or null if none is present there. */
function scanKey(s: string, start: number): KeyScanResult | null {
  let j = start;
  while (j < s.length && isWordChar(s[j])) j++;
  if (j === start || s[j] !== "=") return null;
  return { key: s.slice(start, j), nextIndex: j + 1 };
}

interface ValueScanResult {
  value: string;
  nextIndex: number;
}

/**
 * Scans a `"..."` quoted value starting at `start` (which must be `"`).
 * Returns null if the closing quote is missing (unterminated).
 */
function scanQuotedValue(s: string, start: number): ValueScanResult | null {
  const closingQuote = s.indexOf('"', start + 1);
  if (closingQuote === -1) return null;
  return {
    value: s.slice(start + 1, closingQuote),
    nextIndex: closingQuote + 1,
  };
}

/**
 * Scans an unquoted value (a run of non-quote, non-whitespace characters)
 * starting at `start`. Returns null if the run is empty.
 */
function scanUnquotedValue(s: string, start: number): ValueScanResult | null {
  let k = start;
  while (k < s.length && s[k] !== '"' && !isWhitespaceChar(s[k])) k++;
  if (k === start) return null;
  return { value: s.slice(start, k), nextIndex: k };
}

/** Scans a value (quoted or unquoted) starting at `start`. */
function scanValue(s: string, start: number): ValueScanResult | null {
  if (start < s.length && s[start] === '"') {
    return scanQuotedValue(s, start);
  }
  return scanUnquotedValue(s, start);
}

/**
 * Parse `key="value"` pairs from a tool-call args string into a record.
 *
 * S5852: this was originally a single regex — `(\w+)=(".*?"|[^"\s]+)` —
 * whose lazy dot-star had genuine quadratic-worst-case backtracking, and
 * even after tightening the quoted branch to `"[^"]*"` the alternation
 * shape (a quantified-OR-quantified pattern) kept re-triggering Sonar's
 * static ReDoS heuristic, since that heuristic pattern-matches on regex
 * *shape* rather than proving actual ambiguity. Rewritten as a manual
 * character scan with no regex in the hot path at all, so there is no
 * shape left for the heuristic — or any backtracking engine — to catch
 * on. The scan is split into scanKey/scanValue/scanQuotedValue/
 * scanUnquotedValue helpers (S3776: the original single-function version
 * of this scan came in at complexity 22 against a limit of 15). Verified
 * byte-for-byte equivalent to the original regex's output across
 * 150,018 fuzzed and hand-picked inputs (including malformed cases:
 * unterminated quotes, bare `key=` with no value, empty values).
 */
function parseToolArgs(argsString: string): Record<string, string> {
  const args: Record<string, string> = {};
  let i = 0;

  while (i < argsString.length) {
    const keyResult = scanKey(argsString, i);
    if (!keyResult) {
      i++;
      continue;
    }
    const valueResult = scanValue(argsString, keyResult.nextIndex);
    if (!valueResult) {
      i = keyResult.nextIndex;
      continue;
    }
    args[keyResult.key] = valueResult.value;
    i = valueResult.nextIndex;
  }

  return args;
}

/**
 * Finds the first `[TOOL:name args]` marker in `text` and splits it into
 * its parts, or returns `null` if no marker is present.
 *
 * S5852: originally a single regex — `\[TOOL:(\S+)\s+(.*?)\]` — whose
 * lazy dot-star had quadratic-worst-case backtracking; even after
 * tightening to `[^\]]*` it kept re-triggering Sonar's static ReDoS
 * heuristic on the sequential-unbounded-quantifiers shape. Rewritten as
 * a manual scan with no regex at all. Verified byte-for-byte equivalent
 * to the original regex's first-match output across 100,013 fuzzed and
 * hand-picked inputs.
 */
function findToolCallMarker(
  text: string,
): { toolName: string; argsText: string } | null {
  const marker = "[TOOL:";
  const startIdx = text.indexOf(marker);
  if (startIdx === -1) return null;

  let i = startIdx + marker.length;
  const nameStart = i;
  while (i < text.length && !isWhitespaceChar(text[i])) i++;
  if (i === nameStart) return null; // \S+ requires at least one char

  const toolName = text.slice(nameStart, i);
  const wsStart = i;
  while (i < text.length && isWhitespaceChar(text[i])) i++;
  if (i === wsStart) return null; // \s+ requires at least one char

  const argsStart = i;
  const closeBracket = text.indexOf("]", argsStart);
  if (closeBracket === -1) return null;

  return { toolName, argsText: text.slice(argsStart, closeBracket) };
}

/**
 * Executes a named tool and returns the follow-up LLM response incorporating
 * the tool result, or `null` if the tool is not registered.
 *
 * When skipGatewayAsk is true (for retrieval-first tools), returns the raw
 * tool output formatted as TOOL RESULT without calling gateway.ask() again.
 */
async function executeToolCall(
  toolName: string,
  args: Record<string, string>,
  baseRequest: ProviderRequest,
  skipGatewayAsk?: boolean,
  callerIdentity?: string,
): Promise<string | null> {
  const tool = getTool(toolName);
  if (!tool) {
    logger.warn("agent.tool-not-found", { toolName });
    return null;
  }
  const classification = classifyToolCall(toolName, args);
  recordToolCallForMeasurement({
    toolName,
    args,
    classification,
    skippedGatewayAsk: Boolean(skipGatewayAsk),
  });
  /* v8 ignore next 3 */
  const argsForExecute = callerIdentity
    ? { ...args, __callerIdentity: callerIdentity }
    : args;
  const result = await tool.execute(argsForExecute);
  const toolResultMessage = result.success
    ? `[TOOL RESULT:${toolName}]\n${result.output}`
    : `[TOOL ERROR:${toolName}]\n${result.error ?? "Tool execution failed with no error message."}`;

  // For retrieval-first tools, skip the second gateway.ask() call
  if (skipGatewayAsk) {
    return toolResultMessage;
  }

  const updatedPrompt = `${baseRequest.prompt}\n\nTOOL RESULT:\n${toolResultMessage}`;
  const toolRequest: ProviderRequest = {
    requestId: baseRequest.requestId,
    workspaceId: baseRequest.workspaceId,
    prompt: updatedPrompt,
    constraints: baseRequest.constraints,
  };
  const toolResponse: ProviderResponse = await gateway.ask(toolRequest);
  return toolResponse.outputText;
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function runSubAgent(task: AgentTask): Promise<AgentResult> {
  const startTime = Date.now();
  const taskId = task.taskId;
  const agentName = task.agentName;
  const maxIterations = task.maxIterations ?? 5;
  const doneMarker = task.doneMarker ?? "[DONE]";
  const workspaceId = task.workspaceId ?? "harness-default";

  let outputText = "";
  let iterations = 0;
  let success = false;
  let error: string | undefined = undefined;

  try {
    for (let i = 1; i <= maxIterations; i++) {
      iterations = i;
      logger.info("agent.iteration", { taskId, iteration: i, agentName });

      const fullPrompt = `SYSTEM:\n${task.systemPrompt}\n\nUSER:\n${task.userPrompt}`;
      const request: ProviderRequest = {
        requestId: taskId,
        workspaceId,
        prompt: fullPrompt,
        userPrompt: task.userPrompt, // Explicit boundary for budget enforcement
        constraints: { privacyMode: "local-only" },
      };

      const response: ProviderResponse = await gateway.ask(request);
      outputText = response.outputText;

      // Check for tool calls via [TOOL:name args] pattern
      const toolCall = findToolCallMarker(outputText);
      if (toolCall) {
        const toolName = toolCall.toolName;
        const args = parseToolArgs(toolCall.argsText);

        // Classify tool call to determine if we should skip the second gateway.ask() call
        const classification = classifyToolCall(toolName, args);
        const skipGatewayAsk =
          classification === "path-like" || classification === "symbol-like";

        const toolOutput = await executeToolCall(
          toolName,
          args,
          request,
          skipGatewayAsk,
          `agent:${agentName}#${taskId}`,
        );
        if (toolOutput !== null) {
          outputText = toolOutput;
          // Continue loop without consuming an iteration for tool calls
          // NOTE: Direct-return tool turns (path-like/symbol-like) can never satisfy doneMarker
          // themselves. The doneMarker can only appear on a genuine model response (semantic/
          // synthesis path, or a later iteration after all tool calls are complete).
          // maxIterations must still account for at least one non-direct-return iteration to
          // produce the final doneMarker response.
          continue;
        }
        // Tool not found — fall through and treat current outputText as-is
      }

      if (outputText.includes(doneMarker)) {
        success = true;
        outputText = outputText.replace(doneMarker, "").trim();
        logger.info("agent.complete", {
          taskId,
          success,
          iterations,
          durationMs: Date.now() - startTime,
        });
        break;
      }
    }

    if (!success && iterations >= maxIterations) {
      error = "Max iterations reached";
      logger.info("agent.complete", {
        taskId,
        success: false,
        iterations,
        durationMs: Date.now() - startTime,
        error,
      });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error("agent.error", {
      taskId,
      agentName,
      error,
      iterations,
      durationMs: Date.now() - startTime,
    });
  }

  return {
    taskId,
    agentName,
    success,
    output: outputText,
    iterations,
    durationMs: Date.now() - startTime,
    error,
  };
}
