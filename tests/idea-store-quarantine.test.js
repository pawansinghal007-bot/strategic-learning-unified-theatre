import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getIdeaContext, listIdeas } from "../src/idea-store.js";

describe("idea-store corrupt file quarantine", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "idea-quarantine-"));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("moves invalid frontmatter files to corrupt without throwing", async () => {
    const context = await getIdeaContext({ cwd: baseDir });
    await fs.mkdir(context.ideaDir, { recursive: true });
    const corruptPath = path.join(context.ideaDir, "bad.md");
    await fs.writeFile(corruptPath, "---\npriority: [\n---\nBad idea", "utf8");

    await expect(listIdeas({ cwd: baseDir })).resolves.toEqual([]);

    await expect(fs.access(corruptPath)).rejects.toThrow();
    const quarantined = await fs.readdir(path.join(context.ideaDir, "corrupt"));
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatch(/^bad\.md\.\d+\.invalid-metadata$/);
  });
});
