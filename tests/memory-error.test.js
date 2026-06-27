import { describe, expect, it } from "vitest";
import {
  MemoryNotFoundError,
  MemorySerializationError,
} from "../src/shared/errors/memory.error.js";

describe("MemoryNotFoundError", () => {
  it("has correct error code and default message", () => {
    const error = new MemoryNotFoundError();

    expect(error.code).toBe("MEMORY_NOT_FOUND");
    expect(error.message).toBe("Requested memory item was not found");
    expect(error.retryable).toBe(false);
    expect(error.details).toBeUndefined();
  });

  it("accepts custom message", () => {
    const error = new MemoryNotFoundError("Custom not found message");

    expect(error.message).toBe("Custom not found message");
  });

  it("accepts details object", () => {
    const details = { key: "value", id: 123 };
    const error = new MemoryNotFoundError("Not found", details);

    expect(error.details).toEqual(details);
  });

  it("has correct name", () => {
    const error = new MemoryNotFoundError();
    expect(error.name).toBe("MemoryNotFoundError");
  });
});

describe("MemorySerializationError", () => {
  it("has correct error code and default message", () => {
    const error = new MemorySerializationError();

    expect(error.code).toBe("MEMORY_SERIALIZATION_FAILED");
    expect(error.message).toBe("Memory serialization failed");
    expect(error.retryable).toBe(false);
    expect(error.details).toBeUndefined();
  });

  it("accepts custom message", () => {
    const error = new MemorySerializationError("Custom serialization error");

    expect(error.message).toBe("Custom serialization error");
  });

  it("accepts details object", () => {
    const details = { key: "value", error: "serialize failed" };
    const error = new MemorySerializationError("Serialization failed", details);

    expect(error.details).toEqual(details);
  });

  it("has correct name", () => {
    const error = new MemorySerializationError();
    expect(error.name).toBe("MemorySerializationError");
  });
});
