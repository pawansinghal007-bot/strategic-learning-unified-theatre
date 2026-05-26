import {
  DomainError,
  createConfigError,
  createIpcPayloadError,
  isDomainError
} from "../src/error.js";

describe("DomainError", () => {
  it("has correct code and message", () => {
    const err = new DomainError("ROTATOR_CLI_INVALID", "Invalid CLI input");

    expect(err.code).toBe("ROTATOR_CLI_INVALID");
    expect(err.message).toBe("Invalid CLI input");
  });

  it("isDomainError returns true for DomainError instances", () => {
    expect(isDomainError(new DomainError("ROTATOR_CONFIG_INVALID", "Bad config"))).toBe(true);
    expect(isDomainError(new Error("Bad config"))).toBe(false);
  });

  it("createConfigError and createIpcPayloadError return correct codes", () => {
    expect(createConfigError("Invalid config").code).toBe("ROTATOR_CONFIG_INVALID");
    expect(createConfigError("Missing config").code).toBe("ROTATOR_CONFIG_MISSING");
    expect(createIpcPayloadError("Invalid payload").code).toBe("ROTATOR_IPC_PAYLOAD_INVALID");
  });
});
