import { createLogger } from "../src/logger.js";

describe("logger redaction safety", () => {
  const originalLevel = process.env.ROTATOR_LOG_LEVEL;
  const originalSink = process.env.ROTATOR_LOG_SINK;
  let writeSpy;

  beforeEach(() => {
    process.env.ROTATOR_LOG_LEVEL = "debug";
    process.env.ROTATOR_LOG_SINK = "stdout";
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
  });

  function emittedEntry() {
    expect(writeSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(writeSpy.mock.calls[0][0].trim());
  }

  it('scrubs "Bearer sk-abc123" from msg field', () => {
    createLogger("test").info("using Bearer sk-abc123");

    const entry = emittedEntry();
    expect(entry.msg).toBe("using Bearer [REDACTED]");
    expect(JSON.stringify(entry)).not.toContain("sk-abc123");
  });

  it('scrubs "password=secret123" from string fields', () => {
    createLogger("test").info("field redaction", { detail: "password=secret123" });

    const entry = emittedEntry();
    expect(entry.detail).toBe("password=[REDACTED]");
    expect(JSON.stringify(entry)).not.toContain("secret123");
  });

  it('scrubs "token=abc" from string fields', () => {
    createLogger("test").info("field redaction", { detail: "token=abc" });

    const entry = emittedEntry();
    expect(entry.detail).toBe("token=[REDACTED]");
    expect(JSON.stringify(entry)).not.toContain("token=abc");
  });

  it('scrubs "apikey=xyz" from string fields', () => {
    createLogger("test").info("field redaction", { detail: "apikey=xyz" });

    const entry = emittedEntry();
    expect(entry.detail).toBe("apikey=[REDACTED]");
    expect(JSON.stringify(entry)).not.toContain("apikey=xyz");
  });

  it("does not log raw authBlob values", () => {
    const rawAuthBlob = "known-auth-blob-value-password=secret123";

    createLogger("test").info("auth captured", { authBlob: rawAuthBlob });

    const entry = emittedEntry();
    expect(entry.authBlob).toBe("[REDACTED]");
    expect(JSON.stringify(entry)).not.toContain(rawAuthBlob);
  });

  it("scrubs error.message through redact", () => {
    createLogger("test").error("failed", { error: new Error("token=abc") });

    const entry = emittedEntry();
    expect(entry.error.message).toBe("token=[REDACTED]");
    expect(JSON.stringify(entry)).not.toContain("token=abc");
  });

  it("passes correlationId through unmodified", () => {
    const correlationId = "account-password=secret123";

    createLogger("test").info("correlated", { correlationId });

    const entry = emittedEntry();
    expect(entry.correlationId).toBe(correlationId);
  });

  it("passes non-string field values through unmodified", () => {
    const metadata = { password: "secret123" };

    createLogger("test").info("typed fields", {
      count: 7,
      enabled: true,
      metadata
    });

    const entry = emittedEntry();
    expect(entry.count).toBe(7);
    expect(entry.enabled).toBe(true);
    expect(entry.metadata).toEqual(metadata);
  });
});
