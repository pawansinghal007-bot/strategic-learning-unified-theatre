import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
  const originalLevel = process.env.ROTATOR_LOG_LEVEL;
  const originalSink = process.env.ROTATOR_LOG_SINK;
  const originalStacks = process.env.ROTATOR_LOG_STACKS;
  let writeSpy;

  beforeEach(() => {
    process.env.ROTATOR_LOG_LEVEL = "info";
    process.env.ROTATOR_LOG_SINK = "stdout";
    delete process.env.ROTATOR_LOG_STACKS;
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();

    if (originalLevel === undefined) {
      delete process.env.ROTATOR_LOG_LEVEL;
    } else {
      process.env.ROTATOR_LOG_LEVEL = originalLevel;
    }

    if (originalSink === undefined) {
      delete process.env.ROTATOR_LOG_SINK;
    } else {
      process.env.ROTATOR_LOG_SINK = originalSink;
    }

    if (originalStacks === undefined) {
      delete process.env.ROTATOR_LOG_STACKS;
    } else {
      process.env.ROTATOR_LOG_STACKS = originalStacks;
    }
  });

  function emittedEntry() {
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const line = writeSpy.mock.calls[0][0].trim();
    return JSON.parse(line);
  }

  it("info emits valid JSON with ts, level, module, and msg", () => {
    createLogger("test").info("hello");

    const entry = emittedEntry();
    expect(entry.ts).toEqual(expect.any(String));
    expect(entry.level).toBe("info");
    expect(entry.module).toBe("test");
    expect(entry.msg).toBe("hello");
  });

  it("filters debug messages when level is info", () => {
    createLogger("test").debug("hidden");

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("redacts secrets in messages before writing", () => {
    createLogger("test").info("Bearer sk-abc123");

    const entry = emittedEntry();
    expect(entry.msg).toContain("Bearer [REDACTED]");
    expect(JSON.stringify(entry)).not.toContain("sk-abc123");
  });

  it("passes the entry object to onEntry", () => {
    const entries = [];
    createLogger("test", { onEntry: (entry) => entries.push(entry) }).warn("careful", {
      correlationId: "cid-1"
    });

    const entry = emittedEntry();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(entry);
    expect(entries[0].correlationId).toBe("cid-1");
  });

  it("includes error message and omits stack unless enabled", () => {
    createLogger("test").error("failed", { error: new Error("boom") });

    const entry = emittedEntry();
    expect(entry.error.message).toBe("boom");
    expect(entry.error.stack).toBeUndefined();
  });
});
