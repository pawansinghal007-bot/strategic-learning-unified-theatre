import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

const guardTestExcludes =
  process.env.VITEST_INCLUDE_GUARD_TESTS === "1"
    ? []
    : [
        "tests/sprint91-sonar-fix-guard.test.js",
        "tests/sprint92-thread-and-coverage-guard.test.js",
      ];

// Extends base config but excludes guard tests that require post-coverage
// execution. Guard tests run separately via coverage:guarded script after
// coverage-summary.json is available.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: [...(baseConfig.test?.exclude || []), ...guardTestExcludes],
  },
} as Parameters<typeof defineConfig>[0]);
