import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VscodeSignalCollector } from "../../vscode-extension/collector.mjs";
import { MistakeTracker } from "../../src/llm/mistake-tracker.js";

describe("VscodeSignalCollector task-failure capture", () => {
  let mockOutput;
  let collector;

  beforeEach(() => {
    mockOutput = { appendLine: vi.fn() };
    collector = new VscodeSignalCollector(mockOutput, {
      vscodeLearn: { enabled: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks task failures through MistakeTracker using the real event shape", async () => {
    const addMistakeSpy = vi
      .spyOn(MistakeTracker.prototype, "addMistake")
      .mockResolvedValue({ matched: false, promoted: false });

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

  it("does not track task failures when the process exits successfully", async () => {
    const addMistakeSpy = vi
      .spyOn(MistakeTracker.prototype, "addMistake")
      .mockResolvedValue({ matched: false, promoted: false });

    await collector._onTaskEnd({
      exitCode: 0,
      execution: { task: { name: "npm test" } },
    });

    expect(addMistakeSpy).not.toHaveBeenCalled();
  });

  it("does not track task failures when passive learning is disabled", async () => {
    const disabledCollector = new VscodeSignalCollector(mockOutput, {
      vscodeLearn: { enabled: false },
    });
    const addMistakeSpy = vi
      .spyOn(MistakeTracker.prototype, "addMistake")
      .mockResolvedValue({ matched: false, promoted: false });

    await disabledCollector._onTaskEnd({
      exitCode: 1,
      execution: { task: { name: "npm test" } },
    });

    expect(addMistakeSpy).not.toHaveBeenCalled();
  });
});
