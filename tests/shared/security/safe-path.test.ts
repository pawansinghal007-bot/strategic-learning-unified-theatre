/**
 * tests/shared/security/safe-path.test.ts
 *
 * Unit tests for src/shared/security/safe-path.ts
 * Covers all branches including the security-critical rejection path.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";

// Mock fs.realpathSync to control path resolution
vi.mock("node:fs", () => ({
  realpathSync: vi.fn(),
}));

describe("resolveSafePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: return input unchanged (identity function)
    (fs.realpathSync as vi.Mock<typeof fs.realpathSync>).mockImplementation(
      (p) => p,
    );
  });

  const PROJECT_ROOT = process.cwd();

  // ── normal cases ─────────────────────────────────────────────────────────────

  it("resolves a relative path within root", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    const result = resolveSafePath("src/foo.ts", PROJECT_ROOT);
    expect(result).toBe(path.resolve(PROJECT_ROOT, "src/foo.ts"));
  });

  it("resolves an absolute path within root", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    const absolutePath = path.resolve(PROJECT_ROOT, "src/foo.ts");
    const result = resolveSafePath(absolutePath, PROJECT_ROOT);
    expect(result).toBe(absolutePath);
  });

  // ── security: path traversal rejection (line 26 in safe-path.ts) ────────────

  it("throws when path escapes root via ../", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    expect(() => resolveSafePath("../escape", PROJECT_ROOT)).toThrow(
      /Path escapes project root/,
    );
  });

  it("throws when absolute path is outside root", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    expect(() => resolveSafePath("/etc/passwd", PROJECT_ROOT)).toThrow(
      /Path escapes project root/,
    );
  });

  it("throws when traversal lands exactly at parent directory", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    expect(() => resolveSafePath("../", PROJECT_ROOT)).toThrow(
      /Path escapes project root/,
    );
  });

  // ── fallback: non-existent path (catch block) ──────────────────────────────

  it("uses fallback path.resolve for non-existent relative path", async () => {
    // Mock realpathSync to throw ENOENT only for non-existent candidate paths,
    // but return the root path unchanged (so PROJECT_ROOT resolution succeeds)
    (fs.realpathSync as vi.Mock<typeof fs.realpathSync>).mockImplementation(
      (p) => {
        if (p === PROJECT_ROOT) {
          return p; // Return root unchanged
        }
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    );

    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    const result = resolveSafePath("nonexistent/file.ts", PROJECT_ROOT);
    // Should fall back to path.resolve which still syntactically collapses ..
    expect(result).toBe(path.resolve(PROJECT_ROOT, "nonexistent/file.ts"));
  });

  it("uses fallback path.resolve for non-existent absolute path", async () => {
    // Mock realpathSync to throw ENOENT only for non-existent candidate paths,
    // but return the root path unchanged (so PROJECT_ROOT resolution succeeds)
    (fs.realpathSync as vi.Mock<typeof fs.realpathSync>).mockImplementation(
      (p) => {
        if (p === PROJECT_ROOT) {
          return p; // Return root unchanged
        }
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    );

    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    const absolutePath = path.resolve(PROJECT_ROOT, "nonexistent/file.ts");
    const result = resolveSafePath(absolutePath, PROJECT_ROOT);
    expect(result).toBe(absolutePath);
  });

  // ── root-failure: PROJECT_ROOT itself is unresolvable ──────────────────────

  it("throws clear error when PROJECT_ROOT cannot be resolved", async () => {
    const UNRESOLVABLE_ROOT = "/nonexistent/project/root";
    (fs.realpathSync as vi.Mock<typeof fs.realpathSync>).mockImplementation(
      (p) => {
        if (p === UNRESOLVABLE_ROOT) {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        }
        return p;
      },
    );

    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    expect(() => resolveSafePath("src/foo.ts", UNRESOLVABLE_ROOT)).toThrow(
      /PROJECT_ROOT cannot be resolved/,
    );
  });

  // ── edge cases ─────────────────────────────────────────────────────────────

  it("handles empty string as relative path", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    const result = resolveSafePath("", PROJECT_ROOT);
    expect(result).toBe(PROJECT_ROOT);
  });

  it("handles current directory . as relative path", async () => {
    const { resolveSafePath } = await import("/src/shared/security/safe-path");
    const result = resolveSafePath(".", PROJECT_ROOT);
    expect(result).toBe(PROJECT_ROOT);
  });
});
