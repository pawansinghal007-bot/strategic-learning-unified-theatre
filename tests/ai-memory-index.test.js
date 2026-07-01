/**
 * tests/ai-memory-index.test.js
 *
 * Covers src/ai-memory/index.js (0% coverage — pure barrel re-export file).
 *
 * The index re-exports every public class from the ai-memory subsystem.
 * Importing from it and verifying the exports are the real classes is
 * sufficient to bring statement/branch/function/line coverage to 100%.
 */

import { describe, it, expect } from "vitest";

// Import everything through the barrel — this is what drives coverage on index.js
import {
  MemoryDb,
  SprintStateRepo,
  HandoffRepo,
  LessonsRepo,
  DecisionsRepo,
  TestBaselineRepo,
  CommandsRepo,
} from "../src/ai-memory/index.js";

// Import the originals for identity checks
import { MemoryDb as MemoryDbDirect } from "../src/ai-memory/memory-db.js";
import { SprintStateRepo as SprintStateRepoDirect } from "../src/ai-memory/repositories/sprint-state-repo.js";
import { HandoffRepo as HandoffRepoDirect } from "../src/ai-memory/repositories/handoff-repo.js";
import { LessonsRepo as LessonsRepoDirect } from "../src/ai-memory/repositories/lessons-repo.js";
import { DecisionsRepo as DecisionsRepoDirect } from "../src/ai-memory/repositories/decisions-repo.js";
import { TestBaselineRepo as TestBaselineRepoDirect } from "../src/ai-memory/repositories/test-baseline-repo.js";
import { CommandsRepo as CommandsRepoDirect } from "../src/ai-memory/repositories/commands-repo.js";

describe("src/ai-memory/index.js barrel exports", () => {
  it("re-exports MemoryDb as the same class as the direct import", () => {
    expect(MemoryDb).toBe(MemoryDbDirect);
  });

  it("re-exports SprintStateRepo as the same class as the direct import", () => {
    expect(SprintStateRepo).toBe(SprintStateRepoDirect);
  });

  it("re-exports HandoffRepo as the same class as the direct import", () => {
    expect(HandoffRepo).toBe(HandoffRepoDirect);
  });

  it("re-exports LessonsRepo as the same class as the direct import", () => {
    expect(LessonsRepo).toBe(LessonsRepoDirect);
  });

  it("re-exports DecisionsRepo as the same class as the direct import", () => {
    expect(DecisionsRepo).toBe(DecisionsRepoDirect);
  });

  it("re-exports TestBaselineRepo as the same class as the direct import", () => {
    expect(TestBaselineRepo).toBe(TestBaselineRepoDirect);
  });

  it("re-exports CommandsRepo as the same class as the direct import", () => {
    expect(CommandsRepo).toBe(CommandsRepoDirect);
  });

  it("all exports are constructor functions (classes)", () => {
    for (const [name, cls] of [
      ["MemoryDb", MemoryDb],
      ["SprintStateRepo", SprintStateRepo],
      ["HandoffRepo", HandoffRepo],
      ["LessonsRepo", LessonsRepo],
      ["DecisionsRepo", DecisionsRepo],
      ["TestBaselineRepo", TestBaselineRepo],
      ["CommandsRepo", CommandsRepo],
    ]) {
      expect(typeof cls, `${name} should be a function/class`).toBe("function");
    }
  });
});
