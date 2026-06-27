import { describe, it, expect, vi, beforeEach } from "vitest";

var wfsHolder = vi.hoisted(() => ({ calls: [] }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  console.log("=== Mocking node:fs ===");
  return {
    ...actual,
    writeFileSync: vi.fn((...args) => {
      console.log("writeFileSync MOCK called with:", args[0]);
      wfsHolder.calls.push(args);
    }),
  };
});

import { writeFileSync } from "node:fs";

describe("Simple FS mock test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wfsHolder.calls.length = 0;
  });

  it("should call mocked writeFileSync", () => {
    console.log("writeFileSync:", writeFileSync);
    console.log("writeFileSync mock name:", writeFileSync.getMockName());
    
    writeFileSync("/tmp/test.txt", "test content", "utf8");
    console.log("wfsHolder.calls:", wfsHolder.calls.length);
    
    expect(wfsHolder.calls.length).toBeGreaterThan(0);
  });
});
