/**
 * mistake-tracker-coverage.test.js
 * Targets uncovered lines in src/llm/mistake-tracker.js:
 *   34     — ruleFromMistake fallback: no fix_applied/fix → default message
 *            also: no category → "general", no description fallback
 *   62-65  — setRubricActive method
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { MistakeTracker } from "../../src/llm/mistake-tracker.js";

// ── helper ────────────────────────────────────────────────────────────────────
async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "mistake-tracker-cov-"));
}

describe("MistakeTracker — ruleFromMistake fallback branches (line 34)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default fix message when neither fix_applied nor fix is set", async () => {
    // Mirror the existing working pattern from llm.test.js: use a mock db+embeddings
    // to avoid relying on EmbeddingProvider's determinism. The ruleFromMistake function
    // is exercised when addRubricRule is called from the tracker.
    const unitVec = new Array(768).fill(0);
    unitVec[0] = 1;
    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listMistakes: vi.fn().mockResolvedValue([
        { id: 1, description: "Used wrong API", embedding: unitVec },
      ]),
      incrementMistake: vi.fn().mockResolvedValue({
        id: 1,
        description: "Used wrong API",
        recurrence_count: 2,  // >= 2 → triggers ruleFromMistake
        category: "api-misuse",
        // deliberately omit fix_applied and fix → fallback message
      }),
      addRubricRule: vi.fn().mockResolvedValue({ id: 10 }),
    };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue(unitVec),
    };

    const tracker = new MistakeTracker({ db: mockDb, embeddings: mockEmbeddings });
    const result = await tracker.addMistake({ description: "Used wrong API", category: "api-misuse" });

    expect(result.promoted).toBe(true);
    expect(mockDb.addRubricRule).toHaveBeenCalled();
    const ruleArg = mockDb.addRubricRule.mock.calls[0][0].rule;
    expect(ruleArg).toContain("review the recurrence before implementation");
  });

  it("uses 'general' when category is missing in ruleFromMistake", async () => {
    const unitVec = new Array(768).fill(0);
    unitVec[1] = 1;
    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listMistakes: vi.fn().mockResolvedValue([
        { id: 2, description: "Uncategorised mistake", embedding: unitVec },
      ]),
      incrementMistake: vi.fn().mockResolvedValue({
        id: 2,
        description: "Uncategorised mistake",
        recurrence_count: 2,
        // no category → defaults to "general"
      }),
      addRubricRule: vi.fn().mockResolvedValue({ id: 11 }),
    };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue(unitVec),
    };

    const tracker = new MistakeTracker({ db: mockDb, embeddings: mockEmbeddings });
    const result = await tracker.addMistake({ description: "Uncategorised mistake" });

    expect(result.promoted).toBe(true);
    const ruleArg = mockDb.addRubricRule.mock.calls[0][0].rule;
    expect(ruleArg).toContain("general");
    expect(ruleArg).toContain("review the recurrence before implementation");
  });

  it("uses fix_applied when present (non-fallback path for comparison)", async () => {
    const unitVec = new Array(768).fill(0);
    unitVec[2] = 1;
    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listMistakes: vi.fn().mockResolvedValue([
        { id: 3, description: "Missing null check", embedding: unitVec },
      ]),
      incrementMistake: vi.fn().mockResolvedValue({
        id: 3,
        description: "Missing null check",
        recurrence_count: 2,
        category: "null-check",
        fix_applied: "Add explicit null guard before use.",
      }),
      addRubricRule: vi.fn().mockResolvedValue({ id: 12 }),
    };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue(unitVec),
    };

    const tracker = new MistakeTracker({ db: mockDb, embeddings: mockEmbeddings });
    const result = await tracker.addMistake({
      description: "Missing null check",
      category: "null-check",
      fix_applied: "Add explicit null guard before use.",
    });

    expect(result.promoted).toBe(true);
    const ruleArg = mockDb.addRubricRule.mock.calls[0][0].rule;
    expect(ruleArg).toContain("Add explicit null guard before use.");
  });

  it("uses fix (alias) when fix_applied is absent", async () => {
    const unitVec = new Array(768).fill(0);
    unitVec[3] = 1;
    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listMistakes: vi.fn().mockResolvedValue([
        { id: 4, description: "Sync call in async context", embedding: unitVec },
      ]),
      incrementMistake: vi.fn().mockResolvedValue({
        id: 4,
        description: "Sync call in async context",
        recurrence_count: 2,
        category: "async",
        // no fix_applied, only fix alias
        fix: "Convert to async/await.",
      }),
      addRubricRule: vi.fn().mockResolvedValue({ id: 13 }),
    };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue(unitVec),
    };

    const tracker = new MistakeTracker({ db: mockDb, embeddings: mockEmbeddings });
    const result = await tracker.addMistake({
      description: "Sync call in async context",
      category: "async",
      fix: "Convert to async/await.",
    });

    expect(result.promoted).toBe(true);
    const ruleArg = mockDb.addRubricRule.mock.calls[0][0].rule;
    expect(ruleArg).toContain("Convert to async/await.");
  });
});

describe("MistakeTracker — setRubricActive (lines 62-65)", () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await makeTempDir();
    process.env.VSCODE_ROTATOR_MOCK_LLM = "1";
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.VSCODE_ROTATOR_MOCK_LLM;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("delegates to db.setRubricActive and returns the updated rule", async () => {
    const mockRule = { id: 5, rule: "Always validate inputs", active: false };
    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      setRubricActive: vi.fn().mockResolvedValue({ ...mockRule, active: true }),
    };

    const tracker = new MistakeTracker({ db: mockDb });
    const result = await tracker.setRubricActive(5, true);

    expect(mockDb.open).toHaveBeenCalled();
    expect(mockDb.setRubricActive).toHaveBeenCalledWith(5, true);
    expect(mockDb.close).toHaveBeenCalled();
    expect(result.active).toBe(true);
  });

  it("can deactivate a rule (active=false)", async () => {
    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      setRubricActive: vi.fn().mockResolvedValue({ id: 3, rule: "Some rule", active: false }),
    };

    const tracker = new MistakeTracker({ db: mockDb });
    const result = await tracker.setRubricActive(3, false);

    expect(mockDb.setRubricActive).toHaveBeenCalledWith(3, false);
    expect(result.active).toBe(false);
  });
});

describe("MistakeTracker — addMistake matched but recurrence_count < 2 (non-promote path)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns promoted=false when recurrence_count is 1 (first match, not yet promoted)", async () => {
    // Use a unit vector so cosineSimilarity(v, v) === 1.0 > 0.85
    const unitVec = new Array(768).fill(0);
    unitVec[0] = 1;

    const mockDb = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      listMistakes: vi.fn().mockResolvedValue([
        { id: 1, description: "Some mistake", embedding: unitVec },
      ]),
      incrementMistake: vi.fn().mockResolvedValue({
        id: 1,
        description: "Some mistake",
        recurrence_count: 1,   // < 2 → not promoted
        category: "test",
        fix_applied: "fix it",
      }),
      addMistake: vi.fn().mockResolvedValue({ id: 2 }),
      addRubricRule: vi.fn(),
    };
    const mockEmbeddings = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue(unitVec),
    };

    const tracker = new MistakeTracker({ db: mockDb, embeddings: mockEmbeddings });
    const result = await tracker.addMistake({ description: "Some mistake" });

    expect(result.matched).toBe(true);
    expect(result.promoted).toBe(false);
    expect(mockDb.addRubricRule).not.toHaveBeenCalled();
  });
});
