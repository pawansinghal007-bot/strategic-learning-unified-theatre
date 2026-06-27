import { describe, it, expect, vi } from "vitest";

import { adapter } from "../src/browser-adapters/chatgpt.js";

function makeMessage(textContent) {
  return {
    // Actually invoke the callback against a fake node (mirroring real
    // page.evaluate semantics) instead of just resolving a canned string —
    // otherwise the `(node) => node.textContent || ""` callback itself,
    // and its `|| ""` fallback branch, never run.
    evaluate: vi
      .fn()
      .mockImplementation((cb) => Promise.resolve(cb({ textContent }))),
  };
}

function makePage(messages) {
  return {
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    $$: vi.fn().mockResolvedValue(messages),
  };
}

describe("chatgpt adapter", () => {
  it("exposes the expected static shape (name, baseUrl, selectors)", () => {
    expect(adapter.name).toBe("chatgpt");
    expect(adapter.baseUrl).toBe("https://chat.openai.com/");
    expect(adapter.selectors).toEqual({
      inputBox: "textarea[placeholder*='Message']",
      sendButton: "button[aria-label*='Send']",
      responseContainer: "div[class*='prose']",
    });
  });

  it("is also exported as the module default", async () => {
    const mod = await import("../src/browser-adapters/chatgpt.js");
    expect(mod.default).toBe(adapter);
  });

  it("waitForResponse returns the trimmed text of the last assistant message", async () => {
    const page = makePage([
      makeMessage("first message"),
      makeMessage("  Final answer from the assistant.  "),
    ]);

    const result = await adapter.waitForResponse(page);

    expect(result).toBe("Final answer from the assistant.");
    expect(page.waitForSelector).toHaveBeenCalledWith("div[data-message-id]", {
      timeout: 60000,
    });
    expect(page.waitForTimeout).toHaveBeenCalledWith(1000);
  });

  it("throws 'No messages found' when no message containers exist", async () => {
    const page = makePage([]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "No messages found",
    );
  });

  it("throws 'Response is empty' when the last message has no text content (line 25)", async () => {
    const page = makePage([makeMessage("   ")]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });

  it("throws 'Response is empty' when evaluate() resolves to an empty string", async () => {
    const page = makePage([makeMessage("")]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });

  it("falls back to an empty string when node.textContent is null/undefined", async () => {
    const page = makePage([makeMessage(null)]);

    await expect(adapter.waitForResponse(page)).rejects.toThrow(
      "Response is empty",
    );
  });
});
