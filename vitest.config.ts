import { defineConfig } from "vitest/config";

const guardTestExcludes =
  process.env.VITEST_INCLUDE_GUARD_TESTS === "1"
    ? []
    : [
        "tests/sprint91-sonar-fix-guard.test.js",
        "tests/sprint92-thread-and-coverage-guard.test.js",
      ];

export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  test: {
    projects: [".", "src/installer/hw-probe"],
    timeout: 10000,
    environment: "jsdom",
    environmentMatchPatterns: [
      ["tests/llm/local-llm.coverage-additions.test.js", "node"],
      ["tests/llm/local-llm-branches.test.js", "node"],
      ["tests/llm/inference-branches.test.js", "node"],
      ["tests/llm/inference-coverage.test.js", "node"],
      ["tests/llm/inference-windows.test.js", "node"],
    ],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.{js,jsx,ts,tsx}",
      "src/**/*.test.{js,jsx,ts,tsx}",
      "src/**/*.spec.ts",
      "electron-ui/**/*.test.{js,jsx,ts,tsx}",
      "renderer/**/*.test.{js,jsx,ts,tsx}",
      "e2e/**/*.test.{js,jsx,ts,tsx}",
      "e2e/**/*.e2e.{js,jsx,ts,tsx}",
    ],
    exclude: [
      // Guard tests require coverage-summary.json to already exist.
      // Run them via: npm run coverage:guarded
      ...guardTestExcludes,
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

      reportsDirectory: "./coverage",

      include: ["src/**/*.js", "src/**/*.ts"],

      exclude: [
        "**/__tests__/**",
        "**/*.test.*",
        "**/node_modules/**",
        "**/*.d.ts", // excludes types.d.ts and any other declaration files
        // Browser-only coverage report UI scripts — no exports, DOM-dependent
        "src/coverage/**",
        // ...any other existing excludes
        "**/schema.ts", // types/interfaces only — no executable code
        // Pure barrel re-export files — no executable statements (export * from)
        "src/llm/index.ts",
        "src/llm/providers/index.ts",
        "src/ai-memory/index.js",
        "src/domain/types.js", // ESM re-export barrel + JSDoc @typedefs only — V8 cannot instrument static re-export bindings
        // Interface-only files — no executable JS emitted (all declarations)
        "src/mcp/types.ts",
        "src/agents/types.ts",
        "src/agents/tools/base.ts", // ToolResult + Tool interfaces only — zero executable statements
        // Shadowed by .js runtime counterparts — TS files are never executed at runtime
        "src/knowledge/ingest/chunking.ts",
        "src/knowledge/ingest/embedder.ts",
        "src/llm/qdrant-client.ts",
        // Pure type definitions — no runtime code
        "src/shared/contracts/provider.ts",
        // Barrel re-export only — no executable statements
        "src/shared/errors/index.ts",
        // CLI entry with import.meta.url guard — blocks test execution
        "src/storage/run-indexer.ts",
      ],

      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
