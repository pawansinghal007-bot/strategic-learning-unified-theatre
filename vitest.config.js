import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    timeout: 10000,
    environment: "jsdom",
    globals: true,
    include: [
      "tests/**/*.test.{js,jsx}",
      "src/**/*.test.{js,jsx}",
      "electron-ui/**/*.test.{js,jsx}",
      "renderer/**/*.test.{js,jsx}",
      "e2e/**/*.test.{js,jsx}",
      "e2e/**/*.e2e.{js,jsx}",
    ],
    coverage: {
      provider: "v8",
      all: true,
      reporter: ["text", "json", "html", "json-summary", "lcov", "cobertura"],
      reportsDirectory: "./coverage",
      include: [
        "src/accounts/secret-store.js",
        "src/daemon/daemon-runner.js",
        "src/browser-bridge.js",
        "src/agent-handoff.js",
        "src/llm/local-llm.js",
        "src/idea-store.js",
      ],
      exclude: ["**/__tests__/**", "**/*.test.*", "**/node_modules/**"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});
