process.env.VSCODE_ROTATOR_MOCK_LLM = "1";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

import { ExperienceDb } from "../../src/llm/experience-db.js";
import { PromptGenerator } from "../../src/llm/prompt-generator.js";
import { LocalLlmInference } from "../../src/llm/inference.js";

const makeUnitVector = (index) => {
  const vector = new Float32Array(768);
  vector[index] = 1;
  return vector;
};

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
});

describe("LLM Related Search", () => {
  it("relatedTo returns documents sorted by cosine similarity", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "related-db-"));
    tempDirs.push(baseDir);
    const db = new ExperienceDb({ baseDir });
    await db.open();

    await db.replaceDocumentsForFile("alpha.txt", [
      {
        content: "alpha document",
        embedding: makeUnitVector(0),
        source_type: "document",
      },
    ]);
    await db.replaceDocumentsForFile("beta.txt", [
      {
        content: "beta document",
        embedding: makeUnitVector(1),
        source_type: "document",
      },
    ]);
    await db.replaceDocumentsForFile("gamma.txt", [
      {
        content: "gamma document",
        embedding: makeUnitVector(2),
        source_type: "document",
      },
    ]);

    const related = await db.relatedTo(makeUnitVector(0), { topDocs: 2 });
    expect(related.documents).toHaveLength(2);
    expect(related.documents[0].content).toContain("alpha");
  });

  it("relatedTo includes recent sprints regardless of query", async () => {
    const baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "related-sprints-"),
    );
    tempDirs.push(baseDir);
    const db = new ExperienceDb({ baseDir });
    await db.open();

    await db.upsertSprint({
      id: "sprint-old",
      goal: "Old goal",
      date: "2025-01-01T00:00:00Z",
      status: "active",
    });
    await db.upsertSprint({
      id: "sprint-new",
      goal: "New goal",
      date: "2025-02-01T00:00:00Z",
      status: "active",
    });

    const related = await db.relatedTo(makeUnitVector(0), { topDocs: 5 });
    expect(related.sprints).toHaveLength(2);
    expect(related.sprints[0].id).toBe("sprint-new");
    expect(related.sprints[1].id).toBe("sprint-old");
  });

  it("findRelated returns a markdown report containing expected headings", async () => {
    const baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "related-generator-"),
    );
    tempDirs.push(baseDir);
    const inference = new LocalLlmInference({ baseDir });
    const generator = new PromptGenerator({ baseDir, inference, cwd: baseDir });
    await generator.db.open();
    await generator.db.upsertSprint({
      id: "sprint-health",
      goal: "Build health checks",
      date: "2025-01-01T00:00:00Z",
      status: "active",
    });

    const result = await generator.findRelated("health endpoint");
    expect(result.report).toContain("## Related Sprints");
    expect(result.report).toContain("Build health checks");
    expect(result.raw).toEqual(
      expect.objectContaining({
        documents: expect.any(Array),
        sprints: expect.any(Array),
        promptHistory: expect.any(Array),
      }),
    );
  });
});
