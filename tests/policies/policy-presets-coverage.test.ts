/**
 * tests/policies/policy-presets-coverage.test.ts
 *
 * Targets the uncovered line in src/policies/policy-presets.ts:
 *
 *   line 82 — `throw new Error(\`Unknown policy preset: ${name}\`)`
 *              getPolicyPreset() called with an unrecognised preset name.
 *
 * Also exercises the remaining exported functions to keep the file well-covered.
 */

import { describe, it, expect } from "vitest";
import {
  listPolicyPresets,
  getPolicyPreset,
  isPolicyPresetName,
  getAllProviders,
  POLICY_PRESETS,
} from "../../src/policies/policy-presets";

// ---------------------------------------------------------------------------
// getPolicyPreset — line 82: unknown-name throw
// ---------------------------------------------------------------------------

describe("getPolicyPreset — unknown preset throws (line 82)", () => {
  it("throws with 'Unknown policy preset' for a completely unknown name", () => {
    expect(() => getPolicyPreset("nonexistent")).toThrow(
      "Unknown policy preset: nonexistent",
    );
  });

  it("throws for an empty-string name", () => {
    expect(() => getPolicyPreset("")).toThrow("Unknown policy preset: ");
  });

  it("throws for a near-miss name (wrong casing)", () => {
    expect(() => getPolicyPreset("Default")).toThrow(
      "Unknown policy preset: Default",
    );
  });

  it("does NOT throw for every valid preset name", () => {
    for (const name of Object.keys(POLICY_PRESETS)) {
      expect(() => getPolicyPreset(name)).not.toThrow();
    }
  });

  it("returns the correct preset object for 'default'", () => {
    const preset = getPolicyPreset("default");
    expect(preset.name).toBe("default");
    expect(preset.policy.routingMode).toBe("cloud");
  });

  it("returns the correct preset object for 'private'", () => {
    const preset = getPolicyPreset("private");
    expect(preset.policy.routingMode).toBe("local-only");
    expect(preset.policy.allowedProviders).toEqual(["local"]);
  });

  it("returns the correct preset object for 'coding'", () => {
    const preset = getPolicyPreset("coding");
    expect(preset.policy.manualProvider).toBe("groq");
    expect(preset.policy.blockedProviders).toContain("perplexity");
  });

  it("returns the correct preset object for 'research'", () => {
    const preset = getPolicyPreset("research");
    expect(preset.policy.manualProvider).toBe("perplexity");
  });

  it("returns the correct preset object for 'enterprise'", () => {
    const preset = getPolicyPreset("enterprise");
    expect(preset.policy.blockedProviders).toContain("groq");
    expect(preset.policy.manualProvider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listPolicyPresets
// ---------------------------------------------------------------------------

describe("listPolicyPresets", () => {
  it("returns an array of all preset objects", () => {
    const list = listPolicyPresets();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(Object.keys(POLICY_PRESETS).length);
  });

  it("every item has name, label, description, and policy fields", () => {
    for (const preset of listPolicyPresets()) {
      expect(preset).toHaveProperty("name");
      expect(preset).toHaveProperty("label");
      expect(preset).toHaveProperty("description");
      expect(preset).toHaveProperty("policy");
    }
  });
});

// ---------------------------------------------------------------------------
// isPolicyPresetName
// ---------------------------------------------------------------------------

describe("isPolicyPresetName", () => {
  it("returns true for each valid preset name", () => {
    for (const name of Object.keys(POLICY_PRESETS)) {
      expect(isPolicyPresetName(name)).toBe(true);
    }
  });

  it("returns false for unknown names", () => {
    expect(isPolicyPresetName("unknown")).toBe(false);
    expect(isPolicyPresetName("")).toBe(false);
    expect(isPolicyPresetName("DEFAULT")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllProviders
// ---------------------------------------------------------------------------

describe("getAllProviders", () => {
  it("includes all five expected providers", () => {
    const providers = getAllProviders();
    expect(providers).toContain("groq");
    expect(providers).toContain("gemini");
    expect(providers).toContain("openai");
    expect(providers).toContain("perplexity");
    expect(providers).toContain("local");
  });

  it("returns a new array each call (no shared reference)", () => {
    const a = getAllProviders();
    const b = getAllProviders();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
