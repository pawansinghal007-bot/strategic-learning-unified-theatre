export const adapter = {
  name: "gemini",
  baseUrl: "https://gemini.google.com/",
  selectors: {
    inputBox: "textarea[placeholder*='Ask']",
    sendButton: "button[aria-label*='Send']",
    responseContainer: "div[data-message-type='response']"
  },
  async waitForResponse(page) {
    // Wait for Gemini's response message container
    await page.waitForSelector("div[data-message-type='response']", { timeout: 60000 });

    // Wait for response to stabilize
    await page.waitForTimeout(2000);

    // Find all response containers and get the last one
    const responses = await page.$$("div[data-message-type='response']");
    if (responses.length === 0) throw new Error("No responses found");

    const lastResponse = responses[responses.length - 1];
    const text = await lastResponse.evaluate((node) => {
      return node.textContent || "";
    });

    if (!text.trim()) {
      throw new Error("Response is empty");
    }

    return text.trim();
  }
};

export default adapter;
