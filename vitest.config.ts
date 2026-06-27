import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  test: {
    timeout: 10000,
    environment: "jsdom",
    environmentMatchPatterns: [
      ["tests/llm/local-llm.coverage-additions.test.js", "node"],
    ],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.{js,jsx,ts,tsx}",
      "src/**/*.test.{js,jsx,ts,tsx}",
      "electron-ui/**/*.test.{js,jsx,ts,tsx}",
      "renderer/**/*.test.{js,jsx,ts,tsx}",
      "e2e/**/*.test.{js,jsx,ts,tsx}",
      "e2e/**/*.e2e.{js,jsx,ts,tsx}",
    ],
    server: {
      deps: { inline: [/\.cjs$/] },
    },
    coverage: {
      cleanOnRerun: true,
      clean: true,
      provider: "v8",
      all: true,

      // important: write reports even if tests fail
      reportOnFailure: true,

      reporter: ["text", "json", "html", "json-summary", "lcov", "cobertura"],

      reportsDirectory: "./coverage/ts",

      include: ["src/**/*.js", "src/**/*.ts"],

      exclude: [
        "**/__tests__/**",
        "**/*.test.*",
        "**/node_modules/**",
        // confirmed-dead .ts spec companions — excluded to avoid phantom coverage
        "src/knowledge/ingest/milvus-client.ts",
        "src/knowledge/ingest/ingest-sprint-history.ts",
        "**/*.d.ts", // excludes types.d.ts and any other declaration files
        // Browser-only coverage report UI scripts — no exports, DOM-dependent
        "src/coverage/**",
        // ...any other existing excludes
        "**/schema.ts", // types/interfaces only — no executable code
      ],

      thresholds: {
        statements: 75,
        branches: 60,
        functions: 80,
        lines: 80,
      },
    },
  },
});
