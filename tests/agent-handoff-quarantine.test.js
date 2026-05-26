import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { listSprints, loadSprint } from "../src/agent-handoff.js";

describe("agent handoff corrupt sprint quarantine", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-quarantine-"));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("quarantines invalid JSON sprint manifests and keeps listing resilient", async () => {
    const sprintId = "11111111-1111-4111-8111-111111111111";
    const sprintDir = path.join(baseDir, ".vscode-rotator", "sprints");
    await fs.mkdir(sprintDir, { recursive: true });
    const corruptPath = path.join(sprintDir, `2026-05-25-${sprintId}.json`);
    await fs.writeFile(corruptPath, "{ invalid json", "utf8");

    await expect(loadSprint(sprintId, { baseDir })).rejects.toMatchObject({
      code: "ROTATOR_HANDOFF_CORRUPT"
    });

    await expect(fs.access(corruptPath)).rejects.toThrow();
    const quarantined = await fs.readdir(path.join(sprintDir, "corrupt"));
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatch(/^2026-05-25-11111111-1111-4111-8111-111111111111\.json\.\d+\.invalid-json$/);

    await expect(listSprints({ baseDir })).resolves.toEqual([]);
  });
});
