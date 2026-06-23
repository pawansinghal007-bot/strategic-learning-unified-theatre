import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    timeout: 10000,
    environment: "jsdom",
    environmentMatchPatterns: [
      ["tests/llm/local-llm.coverage-additions.test.js", "node"],
    ],
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
      cleanOnRerun: false,
      clean: false,
      provider: "v8",
      all: true,
      reporter: ["text", "json", "html", "json-summary", "lcov", "cobertura"],
      reportsDirectory: "./coverage/js",
      include: [
        "src/accounts/secret-store.js",
        "src/browser-bridge.js",
        "src/agent-handoff.js",
        "src/llm/local-llm.js",
        "src/idea-store.js",
        "src/knowledge/ingest/ingest-sprint-history.js",
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
