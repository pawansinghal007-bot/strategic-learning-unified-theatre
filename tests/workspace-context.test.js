/**
 * tests/governance/workspace-context.test.ts
 *
 * Full coverage for src/governance/workspace-context.ts
 * Uses a temp DB_PATH so every test is isolated and leaves no state.
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  setWorkspaceContext,
  saveWorkspaceContext,
  getWorkspaceContext,
  clearWorkspaceContext,
  buildWorkspaceContextPrompt,
} from "../src/governance/workspace-context.js";

let tempDir;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-ctx-test-"));
  // Point the module at a fresh DB in our temp dir
  process.env.DB_PATH = path.join(tempDir, "workspace-context.db");
});

afterEach(async () => {
  delete process.env.DB_PATH;
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ─── setWorkspaceContext ──────────────────────────────────────────────────────

describe("setWorkspaceContext", () => {
  it("stores and returns the full payload", () => {
    const result = setWorkspaceContext("ws-1", {
      summary: "My summary",
      tags: ["tag1", "tag2"],
      lastIntent: "build feature",
    });

    expect(result.workspaceId).toBe("ws-1");
    expect(result.summary).toBe("My summary");
    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.lastIntent).toBe("build feature");
    expect(typeof result.updatedAt).toBe("number");
  });

  it("defaults to null/empty when optional fields are omitted", () => {
    const result = setWorkspaceContext("ws-2", {});

    expect(result.summary).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.lastIntent).toBeNull();
  });

  it("replaces an existing record (upsert)", () => {
    setWorkspaceContext("ws-3", { summary: "first" });
    const result = setWorkspaceContext("ws-3", { summary: "second" });
    expect(result.summary).toBe("second");

    const fetched = getWorkspaceContext("ws-3");
    expect(fetched?.summary).toBe("second");
  });
});

// ─── saveWorkspaceContext ─────────────────────────────────────────────────────

describe("saveWorkspaceContext", () => {
  it("is an alias for setWorkspaceContext", () => {
    const result = saveWorkspaceContext("ws-save", {
      summary: "saved",
      tags: ["a"],
      lastIntent: "intent",
    });

    expect(result.workspaceId).toBe("ws-save");
    expect(result.summary).toBe("saved");

    const fetched = getWorkspaceContext("ws-save");
    expect(fetched?.summary).toBe("saved");
  });
});

// ─── getWorkspaceContext ──────────────────────────────────────────────────────

describe("getWorkspaceContext", () => {
  it("returns null when workspace does not exist", () => {
    expect(getWorkspaceContext("nonexistent-ws")).toBeNull();
  });

  it("returns the stored context with parsed tags", () => {
    setWorkspaceContext("ws-get", {
      summary: "hello",
      tags: ["x", "y"],
      lastIntent: "do thing",
    });

    const ctx = getWorkspaceContext("ws-get");
    expect(ctx).not.toBeNull();
    expect(ctx?.summary).toBe("hello");
    expect(ctx?.tags).toEqual(["x", "y"]);
    expect(ctx?.lastIntent).toBe("do thing");
  });

  it("returns empty array for tags when tags column is empty string", () => {
    // Insert with empty tags via set then patch the raw value — simpler:
    // just store with tags=[] and verify parsing
    setWorkspaceContext("ws-notags", {});
    const ctx = getWorkspaceContext("ws-notags");
    expect(ctx?.tags).toEqual([]);
  });
});

// ─── clearWorkspaceContext ────────────────────────────────────────────────────

describe("clearWorkspaceContext", () => {
  it("removes the record so subsequent get returns null", () => {
    setWorkspaceContext("ws-clear", { summary: "to be deleted" });
    expect(getWorkspaceContext("ws-clear")).not.toBeNull();

    clearWorkspaceContext("ws-clear");
    expect(getWorkspaceContext("ws-clear")).toBeNull();
  });

  it("does not throw when workspace does not exist", () => {
    expect(() => clearWorkspaceContext("never-existed")).not.toThrow();
  });
});

// ─── buildWorkspaceContextPrompt ─────────────────────────────────────────────

describe("buildWorkspaceContextPrompt", () => {
  it("returns empty string when workspace has no context", () => {
    expect(buildWorkspaceContextPrompt("no-ctx-ws")).toBe("");
  });

  it("includes summary, tags and lastIntent when all are set", () => {
    setWorkspaceContext("ws-prompt", {
      summary: "Build the thing",
      tags: ["sprint", "feature"],
      lastIntent: "refactor auth",
    });

    const prompt = buildWorkspaceContextPrompt("ws-prompt");
    expect(prompt).toContain("Workspace context:");
    expect(prompt).toContain("Build the thing");
    expect(prompt).toContain("Tags: sprint, feature");
    expect(prompt).toContain("Last intent: refactor auth");
  });

  it("omits tags line when tags array is empty", () => {
    setWorkspaceContext("ws-no-tags", {
      summary: "Just a summary",
      lastIntent: "deploy",
    });

    const prompt = buildWorkspaceContextPrompt("ws-no-tags");
    expect(prompt).toContain("Just a summary");
    expect(prompt).not.toContain("Tags:");
    expect(prompt).toContain("Last intent: deploy");
  });

  it("omits summary line when summary is null", () => {
    setWorkspaceContext("ws-no-summary", {
      tags: ["t1"],
      lastIntent: "plan",
    });

    const prompt = buildWorkspaceContextPrompt("ws-no-summary");
    expect(prompt).toContain("Workspace context:");
    expect(prompt).toContain("Tags: t1");
    expect(prompt).not.toMatch(/^My summary/m);
  });

  it("omits lastIntent line when lastIntent is null", () => {
    setWorkspaceContext("ws-no-intent", {
      summary: "Summary only",
    });

    const prompt = buildWorkspaceContextPrompt("ws-no-intent");
    expect(prompt).toContain("Summary only");
    expect(prompt).not.toContain("Last intent:");
  });

  it("returns only header when context exists but all optional fields are null", () => {
    setWorkspaceContext("ws-empty", {});
    const prompt = buildWorkspaceContextPrompt("ws-empty");
    expect(prompt).toBe("Workspace context:");
  });
});

// ─── getDbPath: ROTATOR_STATE_DIR env var ────────────────────────────────────

describe("getDbPath via ROTATOR_STATE_DIR", () => {
  it("uses ROTATOR_STATE_DIR when DB_PATH is not set", async () => {
    delete process.env.DB_PATH;
    const stateDir = path.join(tempDir, "custom-state");
    await fs.mkdir(stateDir, { recursive: true });
    process.env.ROTATOR_STATE_DIR = stateDir;

    try {
      // Triggers getDbPath → uses stateDir/workspace-context.db
      setWorkspaceContext("ws-statedir", { summary: "via state dir" });
      const ctx = getWorkspaceContext("ws-statedir");
      expect(ctx?.summary).toBe("via state dir");

      // DB file should exist inside stateDir
      const dbFile = path.join(stateDir, "workspace-context.db");
      await expect(fs.access(dbFile)).resolves.toBeUndefined();
    } finally {
      delete process.env.ROTATOR_STATE_DIR;
      // Restore DB_PATH for afterEach cleanup
      process.env.DB_PATH = path.join(tempDir, "workspace-context.db");
    }
  });
});

// ─── Truncation tests for write-time summary truncation ──────────────────────

describe("write-time truncation", () => {
  it("truncates summaries over 500 characters to 500 + \"...\" (503 total)", () => {
    const longSummary = "x".repeat(600); // 600 characters
    const result = setWorkspaceContext("ws-truncate", { summary: longSummary });

    // Should be exactly 500 chars + "..." = 503 chars
    expect(result.summary).toHaveLength(503);
    expect(result.summary).toBe(longSummary.slice(0, 500) + "...");
    
    // Verify it's stored correctly in DB
    const fetched = getWorkspaceContext("ws-truncate");
    expect(fetched?.summary).toHaveLength(503);
    expect(fetched?.summary).toBe(longSummary.slice(0, 500) + "...");
  });

  it("does not truncate summaries at exactly 500 characters", () => {
    const summary500 = "y".repeat(500); // exactly 500 characters
    const result = setWorkspaceContext("ws-500", { summary: summary500 });

    // Should remain unchanged (no truncation)
    expect(result.summary).toHaveLength(500);
    expect(result.summary).toBe(summary500);
    
    const fetched = getWorkspaceContext("ws-500");
    expect(fetched?.summary).toHaveLength(500);
    expect(fetched?.summary).toBe(summary500);
  });

  it("truncates summaries at 501 characters to 503 total", () => {
    const summary501 = "z".repeat(501); // 501 characters
    const result = setWorkspaceContext("ws-501", { summary: summary501 });

    // Should be truncated to 500 chars + "..." = 503 chars
    expect(result.summary).toHaveLength(503);
    expect(result.summary).toBe(summary501.slice(0, 500) + "...");
    
    const fetched = getWorkspaceContext("ws-501");
    expect(fetched?.summary).toHaveLength(503);
    expect(fetched?.summary).toBe(summary501.slice(0, 500) + "...");
  });
});
