/**
 * tests/agents/cli.test.ts
 *
 * Unit tests for src/agents/cli.ts — parseArgs and main().
 *
 * All filesystem I/O and runOrchestrator are mocked so no real processes are
 * spawned and no disk state is left behind.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

// ─── Hoisted mocks (vi.hoisted avoids temporal dead zone with vi.mock) ────────

const { mockRunOrchestrator, mockMkdirSync, mockWriteFileSync } = vi.hoisted(
  () => ({
    mockRunOrchestrator: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
  }),
);

vi.mock("../../src/agents/orchestrator", () => ({
  runOrchestrator: mockRunOrchestrator,
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
  };
});

// ─── Module under test ────────────────────────────────────────────────────────

import { parseArgs, main } from "../../src/agents/cli";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSuccessResult(finalOutput = "LGTM") {
  return {
    command: "code-review",
    success: true,
    steps: [],
    finalOutput,
    totalDurationMs: 10,
  };
}

function makeFailureResult(error = "LLM unavailable") {
  return {
    command: "code-review",
    success: false,
    steps: [
      {
        stepNumber: 1,
        stepName: "analyze",
        agentName: "code-reviewer",
        success: false,
        output: "",
        durationMs: 5,
        error,
      },
    ],
    finalOutput: "",
    totalDurationMs: 10,
    error,
  };
}

/** A noop exit that never throws — lets us assert what code was passed. */
function makeExit() {
  const calls: number[] = [];
  const exit = ((code: number) => {
    calls.push(code);
  }) as unknown as (code: number) => never;
  return { exit, calls };
}

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("extracts the command as first positional arg", () => {
    const { command } = parseArgs(["code-review", "--file", "src/foo.ts"]);
    expect(command).toBe("code-review");
  });

  it("returns undefined command when no args provided", () => {
    const { command } = parseArgs([]);
    expect(command).toBeUndefined();
  });

  it("extracts filePath after --file flag", () => {
    const { filePath } = parseArgs(["code-review", "--file", "src/bar.ts"]);
    expect(filePath).toBe("src/bar.ts");
  });

  it("returns undefined filePath when --file flag is absent", () => {
    const { filePath } = parseArgs(["code-review"]);
    expect(filePath).toBeUndefined();
  });

  it("defaults workspaceId to 'harness-cli' when --workspace absent", () => {
    const { workspaceId } = parseArgs(["code-review"]);
    expect(workspaceId).toBe("harness-cli");
  });

  it("extracts workspaceId after --workspace flag", () => {
    const { workspaceId } = parseArgs([
      "code-review",
      "--file",
      "f.ts",
      "--workspace",
      "ws-abc",
    ]);
    expect(workspaceId).toBe("ws-abc");
  });

  it("handles --workspace before --file", () => {
    const { filePath, workspaceId } = parseArgs([
      "code-review",
      "--workspace",
      "ws-xyz",
      "--file",
      "src/a.ts",
    ]);
    expect(filePath).toBe("src/a.ts");
    expect(workspaceId).toBe("ws-xyz");
  });
});

// ─── main() ───────────────────────────────────────────────────────────────────

describe("main", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ── no command ──────────────────────────────────────────────────────────────

  it("exits 1 and prints usage when no command provided", async () => {
    const { exit, calls } = makeExit();
    await main([], exit);
    expect(calls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
    );
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  // ── code-review missing --file ──────────────────────────────────────────────

  it("exits 1 when code-review is used without --file", async () => {
    const { exit, calls } = makeExit();
    await main(["code-review"], exit);
    expect(calls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("requires --file"),
    );
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  // ── success path ────────────────────────────────────────────────────────────

  it("prints success message and writes report on successful run", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(
      makeSuccessResult("All good."),
    );
    const { exit, calls } = makeExit();

    await main(["code-review", "--file", "src/foo.ts"], exit);

    expect(calls).toEqual([]); // no exit called
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Command complete"),
    );
    expect(consoleSpy).toHaveBeenCalledWith("All good.");
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("logs"),
      expect.objectContaining({ recursive: true }),
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("code-review-"),
      "All good.",
      "utf-8",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Report written to:"),
    );
  });

  it("passes filePath to runOrchestrator input", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(makeSuccessResult());
    const { exit } = makeExit();

    await main(["code-review", "--file", "src/special.ts"], exit);

    expect(mockRunOrchestrator).toHaveBeenCalledWith(
      "code-review",
      { filePath: "src/special.ts" },
      "harness-cli",
    );
  });

  it("passes custom workspaceId to runOrchestrator", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(makeSuccessResult());
    const { exit } = makeExit();

    await main(
      ["code-review", "--file", "src/x.ts", "--workspace", "ws-custom"],
      exit,
    );

    expect(mockRunOrchestrator).toHaveBeenCalledWith(
      "code-review",
      { filePath: "src/x.ts" },
      "ws-custom",
    );
  });

  // ── non-code-review command without --file ──────────────────────────────────

  it("runs non-code-review commands without requiring --file", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(makeSuccessResult("Done"));
    const { exit, calls } = makeExit();

    await main(["summarize"], exit);

    expect(calls).toEqual([]);
    expect(mockRunOrchestrator).toHaveBeenCalledWith(
      "summarize",
      {},
      "harness-cli",
    );
  });

  // ── failure path ────────────────────────────────────────────────────────────

  it("prints error details and exits 1 on failed run", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(
      makeFailureResult("LLM unavailable"),
    );
    const { exit, calls } = makeExit();

    await main(["code-review", "--file", "src/foo.ts"], exit);

    expect(calls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Command failed"),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Step results"),
    );
  });

  it("prints step error details in failure output", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(
      makeFailureResult("Parsing error"),
    );
    const { exit } = makeExit();

    await main(["code-review", "--file", "src/foo.ts"], exit);

    const allErrors = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(allErrors).toContain("Parsing error");
  });

  it("uses 'Unknown error' when result.error is undefined", async () => {
    mockRunOrchestrator.mockResolvedValueOnce({
      command: "code-review",
      success: false,
      steps: [],
      finalOutput: "",
      totalDurationMs: 5,
      // no error field
    });
    const { exit } = makeExit();

    await main(["code-review", "--file", "src/foo.ts"], exit);

    const allErrors = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(allErrors).toContain("Unknown error");
  });

  // ── step icon rendering ─────────────────────────────────────────────────────

  it("renders ✅ icon for successful steps in failure output", async () => {
    mockRunOrchestrator.mockResolvedValueOnce({
      command: "code-review",
      success: false,
      steps: [
        {
          stepNumber: 1,
          stepName: "analyze",
          agentName: "agent-a",
          success: true,  // step succeeded but overall failed
          output: "",
          durationMs: 3,
        },
        {
          stepNumber: 2,
          stepName: "report",
          agentName: "agent-b",
          success: false,
          output: "",
          durationMs: 1,
          error: "timeout",
        },
      ],
      finalOutput: "",
      totalDurationMs: 10,
      error: "timeout",
    });
    const { exit } = makeExit();

    await main(["code-review", "--file", "src/foo.ts"], exit);

    const allErrors = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(allErrors).toContain("✅");
    expect(allErrors).toContain("❌");
    expect(allErrors).toContain("timeout");
  });

  // ── default exit parameter (line 34) ───────────────────────────────────────

  it("uses the default process.exit parameter when no exit fn is provided (line 34)", async () => {
    // Call main() with a non-exiting path (success result) and NO custom exit
    // argument — this forces the default `(code) => process.exit(code)` arrow
    // on line 34 to be instantiated, which registers it as covered.
    // We mock process.exit to prevent the test process from dying.
    mockRunOrchestrator.mockResolvedValueOnce(makeSuccessResult("Default exit test"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as unknown as (code?: number) => never);

    // Call WITHOUT the second `exit` argument — uses the default
    await main(["code-review", "--file", "src/foo.ts"]);

    // Success path → process.exit is never called (no exit on success)
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("calls the default process.exit(1) when no exit fn is provided and command fails (line 34)", async () => {
    mockRunOrchestrator.mockResolvedValueOnce(makeFailureResult("crash"));
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as unknown as (code?: number) => never);

    // No custom exit — the default arrow `(code) => process.exit(code)` is used
    await main(["code-review", "--file", "src/foo.ts"]);

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("catches thrown errors, prints 'Harness crashed' and exits 1", async () => {
    mockRunOrchestrator.mockRejectedValueOnce(new Error("unexpected crash"));
    const { exit, calls } = makeExit();

    await main(["code-review", "--file", "src/foo.ts"], exit);

    expect(calls).toEqual([1]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Harness crashed"),
      expect.any(Error),
    );
  });
});
