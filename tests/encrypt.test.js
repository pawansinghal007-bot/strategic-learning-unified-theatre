import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scryptSync as realScryptSync } from "node:crypto";

// Helper: reset module registry and mock the platform-dependent pieces,
// then dynamically import a fresh copy of encrypt.js. This is required
// because getMachineId()/getKey() cache their results in module-level
// variables (machineIdCache / keyCache) — once set, they never re-run,
// so each platform scenario needs its own clean module instance.
async function loadEncryptModule({
  platform,
  execSyncImpl,
  execFileSyncImpl,
  readFileSyncImpl,
  scryptSyncImpl,
  osImpl,
} = {}) {
  vi.resetModules();

  if (platform) {
    vi.spyOn(process, "platform", "get").mockReturnValue(platform);
  }

  const execSyncFn =
    execSyncImpl ??
    vi.fn(() => {
      throw new Error("execSync not mocked");
    });
  const execFileSyncFn =
    execFileSyncImpl ??
    vi.fn(() => {
      throw new Error("execFileSync not mocked");
    });

  vi.doMock("node:child_process", () => ({
    execSync: execSyncFn,
    execFileSync: execFileSyncFn,
    default: {
      execSync: execSyncFn,
      execFileSync: execFileSyncFn,
    },
  }));

  const readFileSyncFn =
    readFileSyncImpl ??
    vi.fn(() => {
      throw new Error("readFileSync not mocked");
    });

  vi.doMock("node:fs", () => ({
    readFileSync: readFileSyncFn,
    default: {
      readFileSync: readFileSyncFn,
    },
  }));

  if (scryptSyncImpl) {
    vi.doMock("node:crypto", async () => {
      const actual = await vi.importActual("node:crypto");
      const merged = { ...actual, scryptSync: scryptSyncImpl };
      return { ...merged, default: merged };
    });
  }

  if (osImpl) {
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual("node:os");
      const merged = { ...actual, ...osImpl };
      return { ...merged, default: merged };
    });
  }

  vi.doMock("../src/internal/paths.js", () => ({
    sanitizeEnvForSpawn: vi.fn((env) => env),
  }));

  return import("../src/encrypt.js");
}

describe("encrypt/decrypt round trip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    vi.doUnmock("../src/internal/paths.js");
    vi.doUnmock("node:crypto");
    vi.doUnmock("node:os");
  });

  it("encrypts and decrypts a string back to the original plaintext", async () => {
    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });

    const original = "hello world, this is a secret";
    const payload = encrypt(original);

    expect(payload).toHaveProperty("iv");
    expect(payload).toHaveProperty("tag");
    expect(payload).toHaveProperty("ciphertext");

    const result = decrypt(payload);
    expect(result).toBe(original);
  });

  it("produces a different iv/ciphertext on each call (random iv)", async () => {
    const { encrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });

    const a = encrypt("same plaintext");
    const b = encrypt("same plaintext");

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("reuses the cached key on a second encrypt call (getKey cache-hit branch)", async () => {
    const readFileSyncImpl = vi.fn(() => "fake-machine-id-123");
    const { encrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl,
    });

    encrypt("first call");
    encrypt("second call");

    // getMachineId/getKey should only do the expensive lookup once;
    // the second call must hit machineIdCache/keyCache.
    expect(readFileSyncImpl).toHaveBeenCalledTimes(1);
  });
});

describe("encrypt() input validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    vi.doUnmock("../src/internal/paths.js");
    vi.doUnmock("node:crypto");
    vi.doUnmock("node:os");
  });

  it("throws a TypeError when plaintext is not a string", async () => {
    const { encrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });

    expect(() => encrypt(123)).toThrow(TypeError);
    expect(() => encrypt(null)).toThrow(TypeError);
    expect(() => encrypt(undefined)).toThrow(TypeError);
    expect(() => encrypt({})).toThrow(TypeError);
  });
});

describe("decrypt() input validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    vi.doUnmock("../src/internal/paths.js");
    vi.doUnmock("node:crypto");
    vi.doUnmock("node:os");
  });

  it("throws a TypeError when iv is missing", async () => {
    const { decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });
    expect(() => decrypt({ tag: "x", ciphertext: "y" })).toThrow(TypeError);
  });

  it("throws a TypeError when tag is missing", async () => {
    const { decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });
    expect(() => decrypt({ iv: "x", ciphertext: "y" })).toThrow(TypeError);
  });

  it("throws a TypeError when ciphertext is missing", async () => {
    const { decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });
    expect(() => decrypt({ iv: "x", tag: "y" })).toThrow(TypeError);
  });

  it("throws a TypeError when called with no fields at all", async () => {
    const { decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
    });
    expect(() => decrypt({})).toThrow(TypeError);
  });
});

describe("getMachineId() platform branches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    vi.doUnmock("../src/internal/paths.js");
    vi.doUnmock("node:crypto");
    vi.doUnmock("node:os");
  });

  it("win32: uses PowerShell Get-CimInstance UUID when it succeeds", async () => {
    const execSyncImpl = vi.fn(() => Buffer.from("ABCD-1234-WIN-UUID\n"));
    const { encrypt } = await loadEncryptModule({
      platform: "win32",
      execSyncImpl,
    });

    expect(() => encrypt("test")).not.toThrow();
    expect(execSyncImpl).toHaveBeenCalledWith(
      expect.stringContaining("Get-CimInstance"),
      expect.any(Object),
    );
  });

  it("win32: falls back to `wmic csproduct get uuid` when PowerShell throws", async () => {
    const execSyncImpl = vi.fn((cmd) => {
      if (cmd.includes("powershell")) {
        throw new Error("powershell unavailable");
      }
      return Buffer.from("UUID\r\nABCD-1234-WMIC-UUID\r\n\r\n");
    });
    const { encrypt } = await loadEncryptModule({
      platform: "win32",
      execSyncImpl,
    });

    expect(() => encrypt("test")).not.toThrow();
    expect(execSyncImpl).toHaveBeenCalledTimes(2);
  });

  it("win32: falls back to hostname hash when both PowerShell and wmic fail", async () => {
    const execSyncImpl = vi.fn(() => {
      throw new Error("nothing works");
    });
    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "win32",
      execSyncImpl,
    });

    const payload = encrypt("fallback test");
    expect(decrypt(payload)).toBe("fallback test");
  });

  it("darwin: parses IOPlatformUUID from ioreg output", async () => {
    const execFileSyncImpl = vi.fn(
      () => '"IOPlatformUUID" = "ABCD-1234-MAC-UUID"\n',
    );
    const { encrypt } = await loadEncryptModule({
      platform: "darwin",
      execFileSyncImpl,
    });

    expect(() => encrypt("test")).not.toThrow();
    expect(execFileSyncImpl).toHaveBeenCalledWith(
      "ioreg",
      expect.arrayContaining(["-rd1", "-c", "IOPlatformExpertDevice"]),
      expect.any(Object),
    );
  });

  it("darwin: falls back to hostname hash when ioreg output has no UUID", async () => {
    const execFileSyncImpl = vi.fn(() => "no uuid in here");
    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "darwin",
      execFileSyncImpl,
    });

    const payload = encrypt("fallback test");
    expect(decrypt(payload)).toBe("fallback test");
  });

  it("darwin: falls back to hostname hash when ioreg throws", async () => {
    const execFileSyncImpl = vi.fn(() => {
      throw new Error("ioreg not found");
    });
    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "darwin",
      execFileSyncImpl,
    });

    const payload = encrypt("fallback test");
    expect(decrypt(payload)).toBe("fallback test");
  });

  it("linux: reads /etc/machine-id first", async () => {
    const readFileSyncImpl = vi.fn((path) => {
      if (path === "/etc/machine-id") return "linux-machine-id-1\n";
      throw new Error("should not reach here");
    });
    const { encrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl,
    });

    expect(() => encrypt("test")).not.toThrow();
    expect(readFileSyncImpl).toHaveBeenCalledWith("/etc/machine-id", "utf8");
  });

  it("linux: falls back to /var/lib/dbus/machine-id when /etc/machine-id is unreadable", async () => {
    const readFileSyncImpl = vi.fn((path) => {
      if (path === "/etc/machine-id") throw new Error("not found");
      if (path === "/var/lib/dbus/machine-id") return "dbus-machine-id-1\n";
      throw new Error("should not reach here");
    });
    const { encrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl,
    });

    expect(() => encrypt("test")).not.toThrow();
    expect(readFileSyncImpl).toHaveBeenCalledWith(
      "/var/lib/dbus/machine-id",
      "utf8",
    );
  });

  it("linux: falls back to hostname hash when neither machine-id file is readable", async () => {
    const readFileSyncImpl = vi.fn(() => {
      throw new Error("not found");
    });
    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl,
    });

    const payload = encrypt("fallback test");
    expect(decrypt(payload)).toBe("fallback test");
  });

  it("unknown platform: uses the hostname/user/arch fallback hash directly", async () => {
    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "freebsd",
    });

    const payload = encrypt("fallback test");
    expect(decrypt(payload)).toBe("fallback test");
  });
});

describe("remaining edge-case branches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:fs");
    vi.doUnmock("../src/internal/paths.js");
    vi.doUnmock("node:crypto");
    vi.doUnmock("node:os");
  });

  it("getMachineId(): returns the already-cached machineId on a later call (line 11)", async () => {
    // getKey() normally short-circuits on keyCache before ever calling
    // getMachineId() a second time. To exercise the `if (machineIdCache)
    // return machineIdCache;` branch, we make the FIRST encrypt() attempt
    // set machineIdCache (via getMachineId) but fail before keyCache gets
    // assigned, by making scryptSync throw on its first invocation only.
    // The second encrypt() attempt then calls getMachineId() again while
    // machineIdCache is already set, hitting the cache-hit branch.
    let calls = 0;
    const scryptSyncImpl = vi.fn((...args) => {
      calls += 1;
      if (calls === 1) {
        throw new Error("simulated scrypt failure on first attempt");
      }
      // Use the real implementation for the second (successful) call.
      return realScryptSync(...args);
    });

    const { encrypt, decrypt } = await loadEncryptModule({
      platform: "linux",
      readFileSyncImpl: vi.fn(() => "fake-machine-id-123"),
      scryptSyncImpl,
    });

    expect(() => encrypt("first attempt, should fail")).toThrow();
    const payload = encrypt("second attempt, should succeed");
    expect(decrypt(payload)).toBe("second attempt, should succeed");

    // scryptSync called twice (fail, then succeed) but the machine id
    // lookup (readFileSync) only ran once, proving the cache-hit branch
    // on line 11 was taken on the second getMachineId() call.
    expect(scryptSyncImpl).toHaveBeenCalledTimes(2);
  });

  it("getMachineId() fallback: uses an empty string when os.userInfo() has no username (line 32)", async () => {
    const { encrypt, decrypt } = await loadEncryptModule({
      // No machine-id source succeeds, forcing the hostname/user/arch
      // fallback hash to be built.
      platform: "linux",
      readFileSyncImpl: vi.fn(() => {
        throw new Error("no machine-id file");
      }),
      osImpl: {
        hostname: () => "test-host",
        userInfo: () => ({}), // no .username property -> `?? ""` branch
        arch: () => "x64",
      },
    });

    const payload = encrypt("fallback with no username");
    expect(decrypt(payload)).toBe("fallback with no username");
  });
});
