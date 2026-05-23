import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    timeout: 10000,
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{js,jsx}", "src/**/*.test.{js,jsx}", "electron-ui/**/*.test.{js,jsx}", "renderer/**/*.test.{js,jsx}", "e2e/**/*.test.{js,jsx}", "e2e/**/*.e2e.{js,jsx}"],
    // Exclude long-running/integration tests that require local runtimes
    exclude: ["tests/llm/ollama-inference.test.js"]
  }
});
