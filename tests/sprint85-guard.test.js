/**
 * Sprint 85 Guard Tests
 *
 * Asserts that:
 * - No NOSONAR string exists in src/llm/gateway.ts
 * - No NOSONAR string exists in src/ui/dashboard.js
 * - TypeScript compilation exits with code 0
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const workspaceRoot = "/home/pawan/vscodeagent/Solution";

describe("Sprint 85 Guard", () => {
  describe("NOSONAR removal", () => {
    it("gateway.ts has no NOSONAR comments", () => {
      const filePath = join(workspaceRoot, "src/llm/gateway.ts");
      const content = readFileSync(filePath, "utf8");
      expect(content).not.toMatch(/NOSONAR/i);
    });

    it("dashboard.js has no NOSONAR comments", () => {
      const filePath = join(workspaceRoot, "src/ui/dashboard.js");
      const content = readFileSync(filePath, "utf8");
      expect(content).not.toMatch(/NOSONAR/i);
    });
  });

  describe("TypeScript compilation", () => {
    it("compiles with 0 errors", () => {
      expect(() =>
        execSync("npx tsc --noEmit", {
          cwd: workspaceRoot,
          stdio: "pipe",
          encoding: "utf8",
        }),
      ).not.toThrow();
    });
  });
});
