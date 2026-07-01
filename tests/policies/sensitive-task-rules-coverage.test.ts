/**
 * tests/policies/sensitive-task-rules-coverage.test.ts
 *
 * Targets the uncovered line in src/policies/sensitive-task-rules.ts:
 *
 *   line 98 — `approvedProvidersOnly.filter((p) => rule.approvedProvidersOnly.includes(p))`
 *              This intersection branch only fires when MULTIPLE rules each
 *              have an `approvedProvidersOnly` list AND both match the same
 *              request — the second match narrows the already-populated list.
 *
 * To trigger it: use a prompt that matches BOTH the "finance" rule
 * (approvedProvidersOnly: ["openai", "gemini", "local"]) AND the "legal"
 * rule (approvedProvidersOnly: ["openai", "local"]).
 * Result must be the intersection: ["openai", "local"].
 *
 * The file also adds branch coverage for memory-array paths and the
 * no-match / single-match paths.
 */

import { describe, it, expect } from "vitest";
import { detectSensitiveTask } from "../../src/policies/sensitive-task-rules";

// ---------------------------------------------------------------------------
// Line 98 — intersection of two approvedProvidersOnly lists
// ---------------------------------------------------------------------------

describe("detectSensitiveTask — approvedProvidersOnly intersection (line 98)", () => {
  it("intersects provider lists when finance AND legal rules both match", () => {
    // "invoice" → finance rule  (approvedProvidersOnly: ["openai","gemini","local"])
    // "contract" → legal rule   (approvedProvidersOnly: ["openai","local"])
    // intersection must be ["openai", "local"]
    const result = detectSensitiveTask({
      prompt: "Review the invoice attached to this contract",
    });

    expect(result.matched).toBe(true);
    expect(result.detectedTypes).toContain("finance");
    expect(result.detectedTypes).toContain("legal");
    expect(result.approvedProvidersOnly).toEqual(
      expect.arrayContaining(["openai", "local"]),
    );
    // gemini must have been filtered out by the intersection
    expect(result.approvedProvidersOnly).not.toContain("gemini");
  });

  it("intersects provider lists when finance AND security rules both match", () => {
    // "account number" → finance   (["openai","gemini","local"])
    // "vulnerability"  → security  (["openai","local"])
    const result = detectSensitiveTask({
      prompt: "Check this account number for a security vulnerability",
    });

    expect(result.detectedTypes).toContain("finance");
    expect(result.detectedTypes).toContain("security");
    expect(result.approvedProvidersOnly).toContain("openai");
    expect(result.approvedProvidersOnly).toContain("local");
    expect(result.approvedProvidersOnly).not.toContain("gemini");
  });

  it("intersects all three provider-restricted rules when prompt matches all", () => {
    // finance + legal + security all match; intersection of all three lists
    // finance:  ["openai","gemini","local"]
    // legal:    ["openai","local"]
    // security: ["openai","local"]
    // expected: ["openai","local"]
    const result = detectSensitiveTask({
      prompt: "The invoice relates to the NDA and a security audit incident",
    });

    expect(result.detectedTypes).toContain("finance");
    expect(result.detectedTypes).toContain("legal");
    expect(result.detectedTypes).toContain("security");
    expect(result.approvedProvidersOnly).toEqual(
      expect.arrayContaining(["openai", "local"]),
    );
    expect(result.approvedProvidersOnly!.length).toBe(2);
    expect(result.approvedProvidersOnly).not.toContain("gemini");
  });
});

// ---------------------------------------------------------------------------
// forceLocal rules (pii + credentials)
// ---------------------------------------------------------------------------

describe("detectSensitiveTask — forceLocal rules", () => {
  it("sets forceLocal for PII keywords (SSN)", () => {
    const result = detectSensitiveTask({ prompt: "My SSN is 123-45-6789" });
    expect(result.forceLocal).toBe(true);
    expect(result.detectedTypes).toContain("pii");
  });

  it("sets forceLocal for credential keywords (password)", () => {
    const result = detectSensitiveTask({
      prompt: "Reset the password for this account",
    });
    expect(result.forceLocal).toBe(true);
    expect(result.detectedTypes).toContain("credentials");
  });

  it("sets forceLocal and still populates approvedProvidersOnly=null for force-local rules", () => {
    const result = detectSensitiveTask({ prompt: "My aadhaar number is secret" });
    expect(result.forceLocal).toBe(true);
    // pii rule has forceLocal but no approvedProvidersOnly
    expect(result.approvedProvidersOnly).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single approvedProvidersOnly rule (first-time assignment, no intersection)
// ---------------------------------------------------------------------------

describe("detectSensitiveTask — single restricted-provider rule", () => {
  it("sets approvedProvidersOnly from finance rule alone", () => {
    const result = detectSensitiveTask({
      prompt: "Analyse this balance sheet for the quarterly review",
    });

    expect(result.matched).toBe(true);
    expect(result.detectedTypes).toContain("finance");
    expect(result.approvedProvidersOnly).toEqual(
      expect.arrayContaining(["openai", "gemini", "local"]),
    );
    expect(result.forceLocal).toBe(false);
  });

  it("sets approvedProvidersOnly from legal rule alone", () => {
    const result = detectSensitiveTask({
      prompt: "Draft a compliance checklist for the regulatory review",
    });
    expect(result.detectedTypes).toContain("legal");
    expect(result.approvedProvidersOnly).toEqual(
      expect.arrayContaining(["openai", "local"]),
    );
    expect(result.forceLocal).toBe(false);
  });

  it("sets approvedProvidersOnly from security rule alone", () => {
    const result = detectSensitiveTask({
      prompt: "Summarise findings from the penetration test",
    });
    expect(result.detectedTypes).toContain("security");
    expect(result.approvedProvidersOnly).toContain("openai");
    expect(result.approvedProvidersOnly).toContain("local");
    expect(result.forceLocal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No match
// ---------------------------------------------------------------------------

describe("detectSensitiveTask — no sensitive content", () => {
  it("returns matched:false and null approvedProvidersOnly for benign prompt", () => {
    const result = detectSensitiveTask({
      prompt: "Explain quicksort in JavaScript",
    });
    expect(result.matched).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.detectedTypes).toEqual([]);
    expect(result.forceLocal).toBe(false);
    expect(result.approvedProvidersOnly).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Memory array path in requestText()
// ---------------------------------------------------------------------------

describe("detectSensitiveTask — memory array input", () => {
  it("detects sensitive content in memory array", () => {
    const result = detectSensitiveTask({
      prompt: "summarise this session",
      memory: ["the user shared their SSN", "previous task was benign"],
    });
    expect(result.forceLocal).toBe(true);
    expect(result.detectedTypes).toContain("pii");
  });

  it("handles missing memory field gracefully", () => {
    const result = detectSensitiveTask({ prompt: "hello world" });
    expect(result.matched).toBe(false);
  });

  it("handles non-array memory field gracefully", () => {
    const result = detectSensitiveTask({
      prompt: "show invoice",
      memory: "not an array" as any,
    });
    // prompt alone triggers finance rule; memory is ignored (not an array)
    expect(result.detectedTypes).toContain("finance");
  });
});
