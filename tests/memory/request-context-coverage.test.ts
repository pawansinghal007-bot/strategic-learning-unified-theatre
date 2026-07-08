/**
 * tests/memory/request-context-coverage.test.ts
 *
 * Targets the two uncovered branch lines in src/memory/request-context.ts:
 *
 *   line 39 — `if (!workspaceId) return null`
 *              getWorkspaceContext() called with undefined / null / ""
 *
 *   line 75 — `if (!context?.summary?.trim()) return null`
 *              buildRequestContextPrompt() when context has no summary,
 *              or summary is only whitespace, or workspaceId is absent.
 *
 * The global setup (tests/setup.ts) creates a fresh temp dir per test and
 * sets UNIFIED_AI_DATA_DIR, which is where readJsonFile/writeJsonFile land.
 */

import { describe, it, expect } from "vitest";
import {
  getWorkspaceContext,
  saveWorkspaceContext,
  clearWorkspaceContext,
  buildRequestContextPrompt,
} from "../../src/memory/request-context";

// ---------------------------------------------------------------------------
// getWorkspaceContext — line 39: falsy workspaceId guard
// ---------------------------------------------------------------------------

describe("getWorkspaceContext — falsy workspaceId (line 39)", () => {
  it("returns null when workspaceId is undefined", () => {
    expect(getWorkspaceContext(undefined)).toBeNull();
  });

  it("returns null when workspaceId is null", () => {
    expect(getWorkspaceContext(null)).toBeNull();
  });

  it("returns null when workspaceId is empty string", () => {
    // Empty string is falsy — same guard fires
    expect(getWorkspaceContext("" as any)).toBeNull();
  });

  it("returns null for a non-existent but truthy workspaceId", () => {
    // Truthy id that has never been saved — takes the ?? null branch
    expect(getWorkspaceContext("ws-does-not-exist")).toBeNull();
  });

  it("returns the record when a valid workspaceId is provided", () => {
    saveWorkspaceContext("ws-rc-1", {
      summary: "test summary",
      tags: ["a"],
      lastIntent: "build",
    });
    const ctx = getWorkspaceContext("ws-rc-1");
    expect(ctx).not.toBeNull();
    expect(ctx!.workspaceId).toBe("ws-rc-1");
    expect(ctx!.summary).toBe("test summary");
  });
});

// ---------------------------------------------------------------------------
// buildRequestContextPrompt — line 75: no-summary guard
// ---------------------------------------------------------------------------

describe("buildRequestContextPrompt — no-summary guard (line 75)", () => {
  it("returns null when workspaceId is undefined", () => {
    // getWorkspaceContext returns null → context is null → line 75 fires
    expect(buildRequestContextPrompt(undefined)).toBeNull();
  });

  it("returns null when workspaceId is null", () => {
    expect(buildRequestContextPrompt(null)).toBeNull();
  });

  it("returns null when no context has been saved for the workspace", () => {
    expect(buildRequestContextPrompt("ws-no-context-ever")).toBeNull();
  });

  it("returns null when saved summary is empty string", () => {
    saveWorkspaceContext("ws-empty-summary", {
      summary: "",
      tags: ["tag1"],
      lastIntent: "intent",
    });
    // summary.trim() === "" → falsy → returns null
    expect(buildRequestContextPrompt("ws-empty-summary")).toBeNull();
  });

  it("returns null when saved summary is only whitespace", () => {
    saveWorkspaceContext("ws-whitespace-summary", {
      summary: "   \t  ",
      tags: [],
    });
    expect(buildRequestContextPrompt("ws-whitespace-summary")).toBeNull();
  });

  it("returns a prompt string when summary has real content", () => {
    saveWorkspaceContext("ws-good-summary", {
      summary: "Working on routing policy",
      tags: ["routing"],
      lastIntent: "debugging",
    });
    const prompt = buildRequestContextPrompt("ws-good-summary");
    expect(prompt).not.toBeNull();
    expect(prompt).toContain("Workspace context:");
    expect(prompt).toContain("Working on routing policy");
    expect(prompt).toContain("Tags: routing");
    expect(prompt).toContain("Last intent: debugging");
  });

  it("omits tags line when tags array is empty", () => {
    saveWorkspaceContext("ws-no-tags", {
      summary: "Summary without tags",
    });
    const prompt = buildRequestContextPrompt("ws-no-tags");
    expect(prompt).toContain("Summary without tags");
    expect(prompt).not.toContain("Tags:");
  });

  it("omits lastIntent line when lastIntent is undefined", () => {
    saveWorkspaceContext("ws-no-intent", {
      summary: "Summary only",
      tags: ["x"],
    });
    const prompt = buildRequestContextPrompt("ws-no-intent");
    expect(prompt).toContain("Tags: x");
    expect(prompt).not.toContain("Last intent:");
  });
});

// ---------------------------------------------------------------------------
// clearWorkspaceContext — return value branches
// ---------------------------------------------------------------------------

describe("clearWorkspaceContext — boolean return branches", () => {
  it("returns false when workspace does not exist", () => {
    expect(clearWorkspaceContext("ws-never-saved")).toBe(false);
  });

  it("returns true and removes record when workspace exists", () => {
    saveWorkspaceContext("ws-to-clear", { summary: "temp", tags: [] });
    expect(clearWorkspaceContext("ws-to-clear")).toBe(true);
    expect(getWorkspaceContext("ws-to-clear")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveWorkspaceContext — defaults
// ---------------------------------------------------------------------------

describe("saveWorkspaceContext — optional field defaults", () => {
  it("defaults tags to empty array when not provided", () => {
    const rec = saveWorkspaceContext("ws-defaults", { summary: "hi" });
    expect(rec.tags).toEqual([]);
    expect(rec.lastIntent).toBeUndefined();
  });

  it("stores lastIntent when provided", () => {
    const rec = saveWorkspaceContext("ws-with-intent", {
      summary: "foo",
      lastIntent: "sprint planning",
    });
    expect(rec.lastIntent).toBe("sprint planning");
  });
});


// ---------------------------------------------------------------------------
// saveWorkspaceContext — write-time truncation (WORKSPACE_CONTEXT_SUMMARY_MAX_CHARS)
// ---------------------------------------------------------------------------

describe("saveWorkspaceContext — write-time truncation", () => {
  it("truncates a summary over 500 chars to exactly 503 chars (500 + '...')", () => {
    const longSummary = "x".repeat(501);
    const rec = saveWorkspaceContext("ws-truncate-over", { summary: longSummary });
    // WORKSPACE_CONTEXT_SUMMARY_MAX_CHARS is 500; truncated = 500 chars + "..."
    expect(rec.summary.length).toBe(503);
    expect(rec.summary.endsWith("...")).toBe(true);
  });

  it("does NOT truncate a summary at exactly 500 chars", () => {
    const exactSummary = "y".repeat(500);
    const rec = saveWorkspaceContext("ws-truncate-exact", { summary: exactSummary });
    expect(rec.summary.length).toBe(500);
    expect(rec.summary.endsWith("...")).toBe(false);
  });

  it("truncates a summary at 501 chars to exactly 503 chars (500 + '...')", () => {
    const borderSummary = "z".repeat(501);
    const rec = saveWorkspaceContext("ws-truncate-501", { summary: borderSummary });
    // WORKSPACE_CONTEXT_SUMMARY_MAX_CHARS = 500; 501 > 500 → slice(0,500) + "..."
    expect(rec.summary.length).toBe(503);
    expect(rec.summary.endsWith("...")).toBe(true);
  });
});
