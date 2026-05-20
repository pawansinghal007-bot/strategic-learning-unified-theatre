export const adapter = {
  name: "perplexity",
  baseUrl: "https://www.perplexity.ai/",
  selectors: {
    inputBox: "textarea[placeholder*='Ask']",
    sendButton: "button[aria-label*='Submit']",
    responseContainer: "div[class*='answer']"
  },
  async waitForResponse(page) {
    // Wait for Perplexity's answer container
    await page.waitForSelector("div[class*='answer']", { timeout: 60000 });

    // Wait for response to stabilize
    await page.waitForTimeout(2000);

    // Extract the answer text
    const answerContainer = await page.$("div[class*='answer']");
    if (!answerContainer) throw new Error("Answer container not found");

    const text = await answerContainer.evaluate((node) => {
      return node.textContent || "";
    });

    if (!text.trim()) {
      throw new Error("Response is empty");
    }

    return text.trim();
  }
};

export default adapter;
