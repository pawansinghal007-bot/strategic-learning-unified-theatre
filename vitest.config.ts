import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  test: {
    timeout: 10000,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.{js,jsx}",
      "src/**/*.test.{js,jsx}",
      "electron-ui/**/*.test.{js,jsx}",
      "renderer/**/*.test.{js,jsx}",
      "e2e/**/*.test.{js,jsx}",
      "e2e/**/*.e2e.{js,jsx}",
    ],
    server: {
      deps: { inline: [/\.cjs$/] },
    },
    coverage: {
      provider: "v8",
      all: true,
      reporter: ["text", "json", "html", "json-summary", "lcov", "cobertura"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.js", "src/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.test.*", "**/node_modules/**"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
