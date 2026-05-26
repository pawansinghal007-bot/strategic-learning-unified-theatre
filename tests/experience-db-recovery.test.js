import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ExperienceDb } from "../src/llm/experience-db.js";

describe("ExperienceDb recovery", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "experience-db-recovery-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("quarantines corrupt database bytes and opens a fresh state", async () => {
    const dbPath = path.join(tempDir, "experience.db");
    await fs.writeFile(dbPath, Buffer.from([0, 255, 1, 2, 3]));

    const db = new ExperienceDb({ dbPath });

    await expect(db.open()).resolves.toBe(db);
    expect(db.state).toMatchObject({
      sprints: [],
      mistakes: [],
      documents: []
    });

    const backups = await fs.readdir(tempDir);
    expect(backups.some((name) => /^experience\.db\.corrupt-\d+$/.test(name))).toBe(true);
  });
});
