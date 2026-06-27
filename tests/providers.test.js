/**
 * providers.test.ts
 *
 * Covers all uncovered lines across the provider adapters:
 *
 *   gemini.ts    9-20   capabilities(), execute() key-missing throw, execute() happy path
 *   grok.ts      9-26   same pattern
 *   groq.ts      9-26   same pattern
 *   openai.ts    9-26   same pattern
 *   perplexity.ts 9-20  same pattern
 *   local.ts     38-96  resolveLlamaEndpoint(), execute() mock branch, fetch happy path,
 *                        fetch non-ok branch, outputText fallback chains
 *   index.ts            re-exports (covered by importing from index)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// This file tests the REAL provider adapters. tests/setup.ts globally mocks
// "../src/llm/providers" (for gateway.test.js's sake), and since Vitest
// resolves that to the same file as "../src/llm/providers/index", the mock
// would otherwise intercept these imports too. Unmock it here, locally,
// before importing — vi.unmock is hoisted just like vi.mock.
vi.unmock("../src/llm/providers");
vi.unmock("../src/llm/providers/index");

import {
  GeminiProviderAdapter,
  GrokProviderAdapter,
  GroqProviderAdapter,
  OpenAIProviderAdapter,
  PerplexityProviderAdapter,
  LocalProviderAdapter,
  resolveLlamaEndpoint,
} from "../src/llm/providers/index";
import { resolveLlamaEndpoint as _resolveLlamaEndpoint } from "../src/llm/providers/local";

const baseReq = {
  requestId: "req-001",
  prompt: "Hello world",
  systemPrompt: undefined,
  constraints: undefined,
};

// ── Gemini ────────────────────────────────────────────────────────────────────
describe("GeminiProviderAdapter", () => {
  const adapter = new GeminiProviderAdapter();

  it("name is 'gemini'", () => expect(adapter.name).toBe("gemini"));

  it("capabilities() returns expected array", () => {
    const caps = adapter.capabilities();
    expect(Array.isArray(caps)).toBe(true);
    expect(caps.length).toBeGreaterThan(0);
    expect(caps).toContain("chat");
  });

  it("execute() throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "401 unauthorized: missing API key for gemini",
    );
  });

  it("execute() returns stub response when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    try {
      const res = await adapter.ask(baseReq);
      expect(res.provider).toBe("gemini");
      expect(res.model).toBe("gemini-2.0-flash");
      expect(res.outputText).toContain("[gemini stub]");
      expect(res.finishReason).toBe("stop");
      expect(res.usage.inputTokens).toBe(baseReq.prompt.length);
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });
});

// ── Grok ──────────────────────────────────────────────────────────────────────
describe("GrokProviderAdapter", () => {
  const adapter = new GrokProviderAdapter();

  it("name is 'grok'", () => expect(adapter.name).toBe("grok"));

  it("capabilities() returns expected array", () => {
    const caps = adapter.capabilities();
    expect(Array.isArray(caps)).toBe(true);
    expect(caps).toContain("chat");
  });

  it("execute() throws when XAI_API_KEY is missing", async () => {
    delete process.env.XAI_API_KEY;
    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "401 unauthorized: missing API key for grok",
    );
  });

  it("execute() returns stub response when XAI_API_KEY is set", async () => {
    process.env.XAI_API_KEY = "test-key";
    try {
      const res = await adapter.ask(baseReq);
      expect(res.provider).toBe("grok");
      expect(res.model).toBe("grok-3");
      expect(res.outputText).toContain("[grok stub]");
      expect(res.raw.provider).toBe("grok");
    } finally {
      delete process.env.XAI_API_KEY;
    }
  });
});

// ── Groq ──────────────────────────────────────────────────────────────────────
describe("GroqProviderAdapter", () => {
  const adapter = new GroqProviderAdapter();

  it("name is 'groq'", () => expect(adapter.name).toBe("groq"));

  it("capabilities() returns expected array", () => {
    const caps = adapter.capabilities();
    expect(Array.isArray(caps)).toBe(true);
    expect(caps).toContain("chat");
  });

  it("execute() throws when GROQ_API_KEY is missing", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "401 unauthorized: missing API key for groq",
    );
  });

  it("execute() returns stub response when GROQ_API_KEY is set", async () => {
    process.env.GROQ_API_KEY = "test-key";
    try {
      const res = await adapter.ask(baseReq);
      expect(res.provider).toBe("groq");
      expect(res.model).toBe("llama3-8b-8192");
      expect(res.outputText).toContain("[groq stub]");
    } finally {
      delete process.env.GROQ_API_KEY;
    }
  });
});

// ── OpenAI ────────────────────────────────────────────────────────────────────
describe("OpenAIProviderAdapter", () => {
  const adapter = new OpenAIProviderAdapter();

  it("name is 'openai'", () => expect(adapter.name).toBe("openai"));

  it("capabilities() returns expected array", () => {
    const caps = adapter.capabilities();
    expect(Array.isArray(caps)).toBe(true);
    expect(caps).toContain("chat");
  });

  it("execute() throws when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "401 unauthorized: missing API key for openai",
    );
  });

  it("execute() returns stub response when OPENAI_API_KEY is set", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    try {
      const res = await adapter.ask(baseReq);
      expect(res.provider).toBe("openai");
      expect(res.model).toBe("gpt-4o-mini");
      expect(res.outputText).toContain("[openai stub]");
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});

// ── Perplexity ────────────────────────────────────────────────────────────────
describe("PerplexityProviderAdapter", () => {
  const adapter = new PerplexityProviderAdapter();

  it("name is 'perplexity'", () => expect(adapter.name).toBe("perplexity"));

  it("capabilities() returns expected array", () => {
    const caps = adapter.capabilities();
    expect(Array.isArray(caps)).toBe(true);
    expect(caps).toContain("chat");
  });

  it("execute() throws when PERPLEXITY_API_KEY is missing", async () => {
    delete process.env.PERPLEXITY_API_KEY;
    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "401 unauthorized: missing API key for perplexity",
    );
  });

  it("execute() returns stub response when PERPLEXITY_API_KEY is set", async () => {
    process.env.PERPLEXITY_API_KEY = "test-key";
    try {
      const res = await adapter.ask(baseReq);
      expect(res.provider).toBe("perplexity");
      expect(res.model).toBe("sonar");
      expect(res.outputText).toContain("[perplexity stub]");
    } finally {
      delete process.env.PERPLEXITY_API_KEY;
    }
  });
});

// ── Local ─────────────────────────────────────────────────────────────────────
describe("resolveLlamaEndpoint", () => {
  afterEach(() => {
    delete process.env.VSCODE_ROTATOR_LLM_ENDPOINT;
  });

  it("returns default endpoint when env var is not set", () => {
    delete process.env.VSCODE_ROTATOR_LLM_ENDPOINT;
    expect(_resolveLlamaEndpoint()).toBe(
      "http://localhost:8080/v1/chat/completions",
    );
  });

  it("returns configured endpoint when env var is set", () => {
    process.env.VSCODE_ROTATOR_LLM_ENDPOINT =
      "http://myserver:11434/v1/chat/completions";
    expect(_resolveLlamaEndpoint()).toBe(
      "http://myserver:11434/v1/chat/completions",
    );
  });

  it("falls back to default when env var is whitespace-only", () => {
    process.env.VSCODE_ROTATOR_LLM_ENDPOINT = "   ";
    expect(_resolveLlamaEndpoint()).toBe(
      "http://localhost:8080/v1/chat/completions",
    );
  });
});

describe("LocalProviderAdapter", () => {
  let adapter;

  beforeEach(() => {
    adapter = new LocalProviderAdapter();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    delete process.env.VSCODE_ROTATOR_LLM_ENDPOINT;
    delete process.env.VSCODE_ROTATOR_LLM_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    delete process.env.VSCODE_ROTATOR_LLM_ENDPOINT;
    delete process.env.VSCODE_ROTATOR_LLM_MODEL;
  });

  it("name is 'local'", () => expect(adapter.name).toBe("local"));

  it("capabilities() returns expected array", () => {
    expect(adapter.capabilities()).toContain("offline");
    expect(adapter.capabilities()).toContain("private_mode");
  });

  it("health() returns healthy status", async () => {
    const h = await adapter.health();
    expect(h.provider).toBe("local");
    expect(h.available).toBe(true);
    expect(h.status).toBe("healthy");
  });

  // ── mock branch (VSCODE_ROTATOR_MOCK_LLM set) ─────────────────────────────
  it("execute() returns stub when VSCODE_ROTATOR_MOCK_LLM is set", async () => {
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
    const res = await adapter.ask(baseReq);
    expect(res.provider).toBe("local");
    expect(res.model).toBe("local-dev-stub");
    expect(res.outputText).toContain("[local stub]");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.latencyMs).toBe(5);
  });

  // ── real fetch happy path ──────────────────────────────────────────────────
  it("execute() calls fetch and parses choices[0].message.content", async () => {
    const mockJson = {
      model: "llama3",
      choices: [
        { message: { content: "Hello from llama" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 4 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockJson,
        text: async () => "",
      }),
    );

    const res = await adapter.ask(baseReq);
    expect(res.outputText).toBe("Hello from llama");
    expect(res.model).toBe("llama3");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.inputTokens).toBe(5);
    expect(res.usage.outputTokens).toBe(4);
  });

  // ── fetch with systemPrompt adds system message ────────────────────────────
  it("execute() includes system message when systemPrompt is provided", async () => {
    const mockJson = {
      model: "llama3",
      choices: [{ message: { content: "Response" }, finish_reason: "stop" }],
      usage: {},
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await adapter.ask({ ...baseReq, systemPrompt: "Be helpful" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "Be helpful" });
    expect(body.messages[1]).toEqual({ role: "user", content: baseReq.prompt });
  });

  // ── fetch with constraints ─────────────────────────────────────────────────
  it("execute() passes temperature and maxTokens from constraints", async () => {
    const mockJson = {
      model: "llama3",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: {},
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await adapter.ask({
      ...baseReq,
      constraints: { temperature: 0.9, maxTokens: 256 },
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.9);
    expect(body.max_tokens).toBe(256);
  });

  // ── fetch non-ok response → throws ────────────────────────────────────────
  it("execute() throws when fetch response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: async () => "server overloaded",
      }),
    );

    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "Llama server request failed (503 Service Unavailable): server overloaded",
    );
  });

  // ── fetch non-ok with text() failing → empty string fallback ──────────────
  it("execute() uses empty string when text() throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => {
          throw new Error("no body");
        },
      }),
    );

    await expect(adapter.ask(baseReq)).rejects.toThrow(
      "Llama server request failed (500 Internal Server Error): ",
    );
  });

  // ── outputText fallback: json.message.content ──────────────────────────────
  it("execute() falls back to json.message.content when choices is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          message: { content: "fallback-msg" },
          usage: {},
        }),
        text: async () => "",
      }),
    );

    const res = await adapter.ask(baseReq);
    expect(res.outputText).toBe("fallback-msg");
  });

  // ── outputText fallback: json.response ────────────────────────────────────
  it("execute() falls back to json.response when choices and message are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          response: "direct-response",
          usage: {},
        }),
        text: async () => "",
      }),
    );

    const res = await adapter.ask(baseReq);
    expect(res.outputText).toBe("direct-response");
  });

  // ── outputText fallback: empty string ─────────────────────────────────────
  it("execute() outputs empty string when no content field exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ model: "llama3", usage: {} }),
        text: async () => "",
      }),
    );

    const res = await adapter.ask(baseReq);
    expect(res.outputText).toBe("");
  });

  // ── latencyMs from total_duration ─────────────────────────────────────────
  it("execute() computes latencyMs from total_duration in nanoseconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_duration: 500_000_000,
          }, // 500ms
        }),
        text: async () => "",
      }),
    );

    const res = await adapter.ask(baseReq);
    expect(res.usage.latencyMs).toBe(500); // 500_000_000 / 1_000_000 = 500
  });

  // ── custom model from env var ──────────────────────────────────────────────
  it("execute() uses VSCODE_ROTATOR_LLM_MODEL when set", async () => {
    process.env.VSCODE_ROTATOR_LLM_MODEL = "mistral-7b";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {},
        }),
        text: async () => "",
      }),
    );

    const res = await adapter.ask(baseReq);
    // model in response comes from json.model ?? model-env-var
    expect(res.model).toBe("mistral-7b");
  });
});
