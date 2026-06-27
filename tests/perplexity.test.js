import { describe, it, expect, vi } from "vitest";

import { adapter } from "../src/browser-adapters/perplexity.js";

function makeAnswerContainer(textContent) {
  return {
    evaluate: vi
      .fn()
      .mockImplementation((cb) => Promise.resolve(cb({ textContent }))),
  };
}

function makePage(answerContainer) {
  return {
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(answerContainer),
  };
}

describe("perplexity adapter", () => {
  it("exposes the expected static shape (name, baseUrl, selectors)", () => {
    expect(adapter.name).toBe("perplexity");
    expect(adapter.baseUrl).toBe("https://www.perplexity.ai/");
    expect(adapter.selectors).toEqual({
      inputBox: "textarea[placeholder*='Ask']",
      sendButton: "button[aria-label*='Submit']",
      responseContainer: "div[class*='answer']",
    });
  });

  it("is also exported as the module default", async () => {
    const mod = await import("../src/browser-adapters/perplexity.js");
    expect(mod.default).toBe(adapter);
  });

  it("waitForResponse returns the trimmed answer text", async () => {
    const page = makePage(makeAnswerContainer("  The answer.  "));

    const result = await adapter.waitForResponse(page);

    expect(result).toBe("The answer.");
    expect(page.waitForSelector).toHaveBeenCalledWith("div[class*='answer']", {
      timeout: 60000,
    });
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
    expect(page.$).toHaveBeenCalledWith("div[class*='answer']");
  });

  it("throws 'Answer container not found' when page.$ resolves to null", async () => {
    const page = makePage(null);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Answer container not found",
    );
  });

  it("throws 'Response is empty' when the answer text is only whitespace", async () => {
    const page = makePage(makeAnswerContainer("   "));

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });

  it("falls back to an empty string when node.textContent is null/undefined", async () => {
    const page = makePage(makeAnswerContainer(null));

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });
});
