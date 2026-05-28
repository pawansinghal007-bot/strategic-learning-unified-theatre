import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    timeout: 60000,
    environment: "jsdom",
    globals: true,
    include: ["tests/llm/ollama-inference.test.js"]
  }
});
