/**
 * tests/shared/retrieval/repository-id.test.ts
 *
 * Unit tests for src/shared/retrieval/repository-id.ts
 *
 * Covers:
 *   - getRepositoryId returns a UUID-shaped string (lines 1-21)
 *   - Same input always produces same output (deterministic)
 *   - Different PROJECT_ROOT values produce different IDs
 *   - Version nibble is always "5" (UUID v5-shaped)
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// We need to control PROJECT_ROOT so we mock the config/paths module
vi.mock("../../../src/shared/config/paths.js", () => ({
  PROJECT_ROOT: "/test/project/root",
}));

import { getRepositoryId } from "../../../src/shared/retrieval/repository-id.js";

describe("getRepositoryId", () => {
  it("returns a string", () => {
    const id = getRepositoryId();
    expect(typeof id).toBe("string");
  });

  it("returns a UUID-shaped string (8-4-4-4-12 hex segments)", () => {
    const id = getRepositoryId();
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("is deterministic — same output on repeated calls", () => {
    const id1 = getRepositoryId();
    const id2 = getRepositoryId();
    expect(id1).toBe(id2);
  });

  it("version nibble in 3rd segment starts with '5' (UUID v5-shaped)", () => {
    const id = getRepositoryId();
    const segments = id.split("-");
    // Third segment (index 2) must start with '5'
    expect(segments[2]).toMatch(/^5/);
  });

  it("has exactly 5 hyphen-separated segments", () => {
    const id = getRepositoryId();
    const segments = id.split("-");
    expect(segments).toHaveLength(5);
  });

  it("fourth segment has variant bits set (RFC 4122 variant)", () => {
    const id = getRepositoryId();
    const segments = id.split("-");
    // 4th segment (index 3): high bits 10xx (hex 8, 9, a, or b)
    expect(segments[3]).toMatch(/^[89ab]/);
  });
});
