import { vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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
  const modelMap = {
    gemini: "gemini-2.0-flash",
    grok: "grok-3",
    groq: "llama3-8b-8192",
    openai: "gpt-4o-mini",
    perplexity: "sonar",
  };
  return {
    requestId: "stub",
    provider,
    model: modelMap[provider] || `${provider}-stub-model`,
    outputText: `[${provider} stub] stub prompt`,
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
    ask: vi.fn().mockImplementation((req) =>
      Promise.resolve({
        ...makeStubResponse(name),
        outputText: `[${name} stub] ${req.prompt}`,
      }),
    ),
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
  const apiKeyEnvVarMap = {
    gemini: "GEMINI_API_KEY",
    grok: "XAI_API_KEY",
    groq: "GROQ_API_KEY",
    openai: "OPENAI_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
  };
  const apiKeyVar = apiKeyEnvVarMap[name];

  return {
    name,
    capabilities: vi.fn().mockReturnValue(["chat"]),
    health: vi.fn().mockImplementation(() => {
      if (apiKeyVar && process.env[apiKeyVar]) {
        return Promise.resolve({
          provider: name,
          available: true,
          status: "healthy",
          lastCheckedAt: new Date().toISOString(),
        });
      }
      return Promise.resolve({
        provider: name,
        available: false,
        status: "auth_error",
        message: `Missing API key for ${name}`,
        lastCheckedAt: new Date().toISOString(),
      });
    }),
    ask: vi.fn().mockImplementation((req) => {
      if (!apiKeyVar || !process.env[apiKeyVar]) {
        throw new Error(`401 unauthorized: missing API key for ${name}`);
      }
      return Promise.resolve({
        requestId: req.requestId,
        provider: name,
        model:
          name === "gemini"
            ? "gemini-2.0-flash"
            : name === "groq"
              ? "llama3-8b-8192"
              : name === "grok"
                ? "grok-3"
                : name === "openai"
                  ? "gpt-4o-mini"
                  : "sonar",
        outputText: `[${name} stub] ${req.prompt}`,
        finishReason: "stop",
        usage: {
          inputTokens: req.prompt.length,
          outputTokens: Math.ceil(req.prompt.length * 0.8),
          totalTokens: req.prompt.length + Math.ceil(req.prompt.length * 0.8),
          estimatedCostUsd: 0.0001,
          latencyMs: 120,
        },
        routingReasons: [
          {
            code: "default_selection",
            message: `${name} adapter selected from configured provider set.`,
          },
        ],
        raw: { stub: true, provider: name },
      });
    }),
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
    return makeFailingCloudAdapter("grok");
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
