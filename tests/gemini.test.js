import { describe, it, expect, vi } from "vitest";

import { adapter } from "../src/browser-adapters/gemini.js";

function makeResponse(textContent) {
  return {
    evaluate: vi
      .fn()
      .mockImplementation((cb) => Promise.resolve(cb({ textContent }))),
  };
}

function makePage(responses) {
  return {
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    $$: vi.fn().mockResolvedValue(responses),
  };
}

describe("gemini adapter", () => {
  it("exposes the expected static shape (name, baseUrl, selectors)", () => {
    expect(adapter.name).toBe("gemini");
    expect(adapter.baseUrl).toBe("https://gemini.google.com/");
    expect(adapter.selectors).toEqual({
      inputBox: "textarea[placeholder*='Ask']",
      sendButton: "button[aria-label*='Send']",
      responseContainer: "div[data-message-type='response']",
    });
  });

  it("is also exported as the module default", async () => {
    const mod = await import("../src/browser-adapters/gemini.js");
    expect(mod.default).toBe(adapter);
  });

  it("waitForResponse returns the trimmed text of the last response container", async () => {
    const page = makePage([
      makeResponse("first response"),
      makeResponse("  Final answer.  "),
    ]);

    const result = await adapter.waitForResponse(page);

    expect(result).toBe("Final answer.");
    expect(page.waitForSelector).toHaveBeenCalledWith(
      "div[data-message-type='response']",
      { timeout: 60000 },
    );
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
  });

  it("throws 'No responses found' when no response containers exist", async () => {
    const page = makePage([]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "No responses found",
    );
  });

  it("throws 'Response is empty' when the last response is only whitespace", async () => {
    const page = makePage([makeResponse("   ")]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });

  it("falls back to an empty string when node.textContent is null/undefined", async () => {
    const page = makePage([makeResponse(null)]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });
});
