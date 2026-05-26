import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createIdea, getIdeaContext, listIdeas, updateIdea } from "../src/idea-store.js";

async function countIdeaFiles(cwd) {
  const context = await getIdeaContext({ cwd });
  const files = await fs.readdir(context.ideaDir).catch(() => []);
  return files.filter((file) => file.endsWith(".md")).length;
}

describe("Idea validation", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "idea-validation-"));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("createIdea with priority 7 throws ROTATOR_IDEA_INVALID, no file created", async () => {
    await expect(
      createIdea({
        body: "# Too Important\nNo write should happen.",
        priority: 7,
        cwd: baseDir
      })
    ).rejects.toMatchObject({ code: "ROTATOR_IDEA_INVALID" });

    expect(await countIdeaFiles(baseDir)).toBe(0);
  });

  it("updateIdea with invalid status throws ROTATOR_IDEA_INVALID, no file written", async () => {
    const idea = await createIdea({
      body: "# Stable Idea\nOriginal body.",
      cwd: baseDir
    });
    const before = await fs.readFile(idea.filePath, "utf8");

    await expect(updateIdea(idea.id, { status: "weird" }, { cwd: baseDir })).rejects.toMatchObject({
      code: "ROTATOR_IDEA_INVALID"
    });

    expect(await fs.readFile(idea.filePath, "utf8")).toBe(before);
  });

  it("listIdeas skips corrupt idea files without crashing", async () => {
    const idea = await createIdea({
      body: "# Good Idea\nKeep this one.",
      cwd: baseDir
    });
    const context = await getIdeaContext({ cwd: baseDir });
    await fs.writeFile(path.join(context.ideaDir, "corrupt.md"), "---\npriority: 99\n---\nBad", "utf8");

    const ideas = await listIdeas({ cwd: baseDir });

    expect(ideas).toHaveLength(1);
    expect(ideas[0].id).toBe(idea.id);
  });
});
