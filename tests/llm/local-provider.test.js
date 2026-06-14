import { describe, expect, it } from "vitest";

import { resolveLlamaEndpoint } from "../../src/llm/providers/local.ts";

describe("resolveLlamaEndpoint", () => {
  it("defaults to the docker llama server on localhost:8080", () => {
    expect(resolveLlamaEndpoint()).toBe(
      "http://localhost:8080/v1/chat/completions",
    );
  });

  it("prefers an explicitly configured endpoint", () => {
    const original = process.env.VSCODE_ROTATOR_LLM_ENDPOINT;
    process.env.VSCODE_ROTATOR_LLM_ENDPOINT =
      "http://example.test/v1/chat/completions";

    try {
      expect(resolveLlamaEndpoint()).toBe(
        "http://example.test/v1/chat/completions",
      );
    } finally {
      if (original === undefined)
        delete process.env.VSCODE_ROTATOR_LLM_ENDPOINT;
      else process.env.VSCODE_ROTATOR_LLM_ENDPOINT = original;
    }
  });
});
