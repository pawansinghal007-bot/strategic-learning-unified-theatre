import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { VscodeContextCollector } from "../../vscode-extension/collector.mjs";
import { MistakeTracker } from "../../src/llm/mistake-tracker.js";

describe("VscodeContextCollector task failure tracking", () => {
  let addMistakeSpy;

  beforeEach(() => {
    addMistakeSpy = vi
      .spyOn(MistakeTracker.prototype, "addMistake")
      .mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates one mistake entry for a failed task when learning is enabled", async () => {
    const collector = new VscodeContextCollector({ appendLine: vi.fn() }, {
      vscodeLearn: { enabled: true, debounceMs: 1000 },
    });

    await collector._onTaskEnd({
      exitCode: 1,
      execution: { task: { name: "npm test" } },
    });

    expect(addMistakeSpy).toHaveBeenCalledTimes(1);
    expect(addMistakeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "vscode-task-failure",
        description: expect.stringContaining("npm test"),
      }),
    );
  });

  it("does not create a mistake entry for a successful task", async () => {
    const collector = new VscodeContextCollector({ appendLine: vi.fn() }, {
      vscodeLearn: { enabled: true, debounceMs: 1000 },
    });

    await collector._onTaskEnd({
      exitCode: 0,
      execution: { task: { name: "npm test" } },
    });

    expect(addMistakeSpy).not.toHaveBeenCalled();
  });

  it("does not create a mistake entry when learning is disabled", async () => {
    const collector = new VscodeContextCollector({ appendLine: vi.fn() }, {
      vscodeLearn: { enabled: false, debounceMs: 1000 },
    });

    await collector._onTaskEnd({
      exitCode: 1,
      execution: { task: { name: "npm test" } },
    });

    expect(addMistakeSpy).not.toHaveBeenCalled();
  });

  it("deduplicates repeated task failures within the debounce window", async () => {
    const collector = new VscodeContextCollector({ appendLine: vi.fn() }, {
      vscodeLearn: { enabled: true, debounceMs: 1000 },
    });

    await collector._onTaskEnd({
      exitCode: 1,
      execution: { task: { name: "npm test" } },
    });
    await collector._onTaskEnd({
      exitCode: 1,
      execution: { task: { name: "npm test" } },
    });

    expect(addMistakeSpy).toHaveBeenCalledTimes(1);
  });
});
