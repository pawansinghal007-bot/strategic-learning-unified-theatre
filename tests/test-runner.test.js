import { describe, expect, it } from "vitest";
import { detectPython, detectRobotFramework, generateSkeletonRobotFile, enforceTdd } from "../src/test-runner.js";

describe("test-runner scaffold", () => {
  it("exports utility functions", () => {
    expect(typeof detectPython).toBe("function");
    expect(typeof detectRobotFramework).toBe("function");
    expect(typeof generateSkeletonRobotFile).toBe("function");
    expect(typeof enforceTdd).toBe("function");
  });
});
