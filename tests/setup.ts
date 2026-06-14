import { vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Ensure the local-provider stub path is always active
//
// WHY: The real LocalProviderAdapter (src/llm/providers/local.ts) only
// returns its deterministic `[local stub] ...` response when
// VSCODE_ROTATOR_MOCK_LLM is truthy. The npm `test` script sets this via
// cross-env, but tests are sometimes run directly via `vitest`/`npx vitest`,
// which skips that. Tests that import LocalProviderAdapter directly (to
// inject a real instance for the "local" slot) rely on this var being set,
// so we set it here defensively if it isn't already.
// ---------------------------------------------------------------------------

if (!process.env.VSCODE_ROTATOR_MOCK_LLM) {
  process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
}

// ---------------------------------------------------------------------------
// Provider adapter mocks
//
// WHY: Gateway's constructor instantiates every adapter unconditionally.
// Without mocks, adapters crash on construction (no API keys, no Ollama).
//
// HOW: vi.mock() is hoisted by Vitest before module evaluation, so these
// stubs replace the real adapters before any test file runs.
//
// The mock specifier must resolve to the SAME module as the import in
// gateway.ts:
//   import { ... } from "./providers"
// resolved from gateway.ts's location (src/llm/), giving: src/llm/providers
//
// This file lives at <root>/tests/setup.ts, so the equivalent path from
// here is "../src/llm/providers" (NOT the bare "src/llm/providers", which
// does not resolve to the same module and silently fails to intercept it).
// ---------------------------------------------------------------------------

function makeStubResponse(provider) {
  return {
    requestId: "stub",
    provider,
    model: `${provider}-stub-model`,
    outputText: `stub response from ${provider}`,
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    routingReasons: [],
    raw: {},
  };
}

// TokenChunk (src/shared/contracts/provider.ts) requires a `delta` field,
// not `text` — gateway.stream() validates every chunk against
// tokenChunkSchema and throws ValidationFailedError on mismatch.
async function* stubStream(provider) {
  yield {
    requestId: "stub",
    provider,
    delta: `chunk from ${provider}`,
    done: false,
  };
  yield { requestId: "stub", provider, delta: "", done: true };
}

function makeStubAdapter(name) {
  return {
    name,
    capabilities: vi.fn().mockReturnValue(["chat"]),
    health: vi.fn().mockResolvedValue({
      provider: name,
      available: true,
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
    }),
    ask: vi.fn().mockResolvedValue(makeStubResponse(name)),
    stream: vi.fn().mockImplementation(() => stubStream(name)),
  };
}

// Cloud adapters: this dev/test environment has no provider API keys
// configured (see .env), so their ask() rejects with an auth-style error.
// Gateway's per-provider loop in ask() catches this, marks the provider
// unhealthy via markProviderFromError, and continues to the next candidate
// — letting tests with no explicit defaultOrder/exclusions fall through
// groq -> gemini -> openai -> perplexity -> local, landing on local.
function makeFailingCloudAdapter(name) {
  return {
    name,
    capabilities: vi.fn().mockReturnValue(["chat"]),
    health: vi.fn().mockResolvedValue({
      provider: name,
      available: false,
      status: "auth_error",
      message: `Missing API key for ${name}`,
      lastCheckedAt: new Date().toISOString(),
    }),
    ask: vi
      .fn()
      .mockRejectedValue(
        new Error(`401 unauthorized: missing API key for ${name}`),
      ),
    stream: vi.fn().mockImplementation(() => stubStream(name)),
  };
}

// Local adapter mock mirrors the REAL LocalProviderAdapter's
// VSCODE_ROTATOR_MOCK_LLM stub-mode response (see src/llm/providers/local.ts)
// — model "local-dev-stub", outputText "[local stub] <prompt>" — so tests
// asserting on that exact shape pass without a real Ollama server. The
// stream() implementation echoes the prompt in `delta` the same way.
function makeLocalStubAdapter() {
  return {
    name: "local",
    capabilities: vi
      .fn()
      .mockReturnValue([
        "chat",
        "offline",
        "private_mode",
        "summarization",
        "code_generation",
      ]),
    health: vi.fn().mockResolvedValue({
      provider: "local",
      available: true,
      status: "healthy",
      message: "Local provider available",
      lastCheckedAt: new Date().toISOString(),
    }),
    ask: vi.fn().mockImplementation((req) =>
      Promise.resolve({
        requestId: req.requestId,
        provider: "local",
        model: "local-dev-stub",
        outputText: `[local stub] ${req.prompt}`,
        finishReason: "stop",
        usage: {
          inputTokens: req.prompt.length,
          outputTokens: req.prompt.length,
          totalTokens: req.prompt.length * 2,
          estimatedCostUsd: 0,
          latencyMs: 5,
        },
        routingReasons: [
          {
            code: "default_selection",
            message: "Selected local adapter as the configured provider.",
          },
        ],
        raw: { stub: true },
      }),
    ),
    stream: vi.fn().mockImplementation(async function* (req) {
      yield {
        requestId: req.requestId,
        provider: "local",
        delta: `[local stub] ${req.prompt}`,
        done: false,
      };
      yield {
        requestId: req.requestId,
        provider: "local",
        delta: "",
        done: true,
      };
    }),
  };
}

vi.mock("../src/llm/providers", () => ({
  LocalProviderAdapter: vi.fn().mockImplementation(function () {
    return makeLocalStubAdapter();
  }),
  OpenAIProviderAdapter: vi.fn().mockImplementation(function () {
    return makeFailingCloudAdapter("openai");
  }),
  GeminiProviderAdapter: vi.fn().mockImplementation(function () {
    return makeFailingCloudAdapter("gemini");
  }),
  GroqProviderAdapter: vi.fn().mockImplementation(function () {
    return makeFailingCloudAdapter("groq");
  }),
  PerplexityProviderAdapter: vi.fn().mockImplementation(function () {
    return makeFailingCloudAdapter("perplexity");
  }),
  // Not constructed by Gateway (gateway.ts only imports the five adapters
  // above from "./providers"), kept here in case other modules import them
  // from the same barrel.
  ClaudeProviderAdapter: vi.fn().mockImplementation(function () {
    return makeStubAdapter("claude");
  }),
  GrokProviderAdapter: vi.fn().mockImplementation(function () {
    return makeStubAdapter("grok");
  }),
}));

// ---------------------------------------------------------------------------
// Temp directory lifecycle (unchanged)
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vitest-"));
  process.env.UNIFIED_AI_DATA_DIR = tmpDir;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.UNIFIED_AI_DATA_DIR;
});
