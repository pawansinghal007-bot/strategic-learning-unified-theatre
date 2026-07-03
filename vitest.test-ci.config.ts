import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

// Extends base config but excludes guard tests that require post-coverage
// execution. Guard tests run separately via coverage:guarded script after
// coverage-summary.json is available.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: [
      ...(baseConfig.test?.exclude || []),
      "tests/sprint91-sonar-fix-guard.test.js",
      "tests/sprint92-thread-and-coverage-guard.test.js",
    ],
  },
} as Parameters<typeof defineConfig>[0]);
