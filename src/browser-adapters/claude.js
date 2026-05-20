export const adapter = {
  name: "claude",
  baseUrl: "https://claude.ai/",
  selectors: {
    inputBox: "textarea[placeholder*='Message']",
    sendButton: "button[aria-label*='Send']",
    responseContainer: "div[class*='markdown']"
  },
  async waitForResponse(page) {
    // Wait for Claude's response container to appear
    await page.waitForSelector("div[class*='markdown']", { timeout: 60000 });

    // Wait for response to stabilize
    await page.waitForTimeout(2000);

    // Find the last assistant message
    const messages = await page.$$("div[class*='message']");
    if (messages.length === 0) throw new Error("No messages found");

    // Extract text from the last message
    const lastMessage = messages[messages.length - 1];
    const text = await lastMessage.evaluate((node) => {
      // Find markdown content or text content
      const markdown = node.querySelector("div[class*='markdown']");
      return (markdown?.textContent || node.textContent || "").trim();
    });

    if (!text) {
      throw new Error("Response is empty");
    }

    return text;
  }
};

export default adapter;
