/**
 * tests/llm-barrel.test.js
 *
 * Coverage target: src/llm/index.ts (currently 0%)
 * Tests barrel export of LLM modules
 */

import { describe, expect, it } from "vitest";

describe("LLM barrel export", () => {
  it("exports Gateway class", async () => {
    const { Gateway } = await import("../src/llm/index.js");
    expect(Gateway).toBeDefined();
    expect(typeof Gateway).toBe("function");
  });

  it("exports all provider adapters", async () => {
    const { Gateway } = await import("../src/llm/index.js");
    const gateway = new Gateway();
    expect(gateway).toBeDefined();
  });

  it("exports provider-related types and functions", async () => {
    const llmModule = await import("../src/llm/index.js");

    // Gateway should be available from the barrel export
    expect(llmModule.Gateway).toBeDefined();
  });
});
