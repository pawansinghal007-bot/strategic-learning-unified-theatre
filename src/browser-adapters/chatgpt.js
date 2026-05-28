export const adapter = {
  name: "chatgpt",
  baseUrl: "https://chat.openai.com/",
  selectors: {
    inputBox: "textarea[placeholder*='Message']",
    sendButton: "button[aria-label*='Send']",
    responseContainer: "div[class*='prose']"
  },
  async waitForResponse(page) {
    // Wait for the response to appear and stabilize
    await page.waitForSelector("div[data-message-id]", { timeout: 60000 });

    // Get all message containers and find the last assistant message
    const messages = await page.$$("div[data-message-id]");
    if (messages.length === 0) throw new Error("No messages found");

    // Wait for streaming to complete
    await page.waitForTimeout(1000);

    // Extract text from the last message (assistant response)
    const lastMessage = messages[messages.length - 1];
    const text = await lastMessage.evaluate((node) => node.textContent || "");

    if (!text.trim()) {
      throw new Error("Response is empty");
    }

    return text.trim();
  }
};

export default adapter;
