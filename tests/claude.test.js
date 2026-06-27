import { describe, it, expect, vi } from "vitest";

import { adapter } from "../src/browser-adapters/claude.js";

function makeMessage({ markdownText, nodeText } = {}) {
  return {
    evaluate: vi.fn().mockImplementation((cb) =>
      Promise.resolve(
        cb({
          textContent: nodeText,
          querySelector: () =>
            markdownText === undefined ? null : { textContent: markdownText },
        }),
      ),
    ),
  };
}

function makePage(messages) {
  return {
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    $$: vi.fn().mockResolvedValue(messages),
  };
}

describe("claude adapter", () => {
  it("exposes the expected static shape (name, baseUrl, selectors)", () => {
    expect(adapter.name).toBe("claude");
    expect(adapter.baseUrl).toBe("https://claude.ai/");
    expect(adapter.selectors).toEqual({
      inputBox: "textarea[placeholder*='Message']",
      sendButton: "button[aria-label*='Send']",
      responseContainer: "div[class*='markdown']",
    });
  });

  it("is also exported as the module default", async () => {
    const mod = await import("../src/browser-adapters/claude.js");
    expect(mod.default).toBe(adapter);
  });

  it("waitForResponse prefers the nested markdown container's text", async () => {
    const page = makePage([
      makeMessage({
        markdownText: "  Markdown answer.  ",
        nodeText: "ignored full message text",
      }),
    ]);

    const result = await adapter.waitForResponse(page);

    expect(result).toBe("Markdown answer.");
    expect(page.waitForSelector).toHaveBeenCalledWith(
      "div[class*='markdown']",
      { timeout: 60000 },
    );
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
  });

  it("falls back to the message node's own textContent when no markdown container exists", async () => {
    const page = makePage([
      makeMessage({ nodeText: "  Plain node text.  " }), // markdownText undefined -> querySelector returns null
    ]);

    const result = await adapter.waitForResponse(page);

    expect(result).toBe("Plain node text.");
  });

  it("throws 'No messages found' when no message containers exist", async () => {
    const page = makePage([]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "No messages found",
    );
  });

  it("throws 'Response is empty' when neither markdown nor node text content is present", async () => {
    const page = makePage([makeMessage({ nodeText: null })]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });

  it("throws 'Response is empty' when the combined text is only whitespace", async () => {
    const page = makePage([makeMessage({ nodeText: "   " })]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });

  it("uses the LAST message when multiple are present", async () => {
    const page = makePage([
      makeMessage({ nodeText: "first" }),
      makeMessage({ nodeText: "second (last)" }),
    ]);

    const result = await adapter.waitForResponse(page);
    expect(result).toBe("second (last)");
  });
});
