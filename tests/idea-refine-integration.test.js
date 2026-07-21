import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sendPrompt = vi.fn();
vi.mock("../src/browser-bridge.js", () => ({
  sendPrompt: (...a) => sendPrompt(...a),
}));

import { createIdea, findIdeaById } from "../src/idea-store.js"; // REAL, unmocked
import { refineIdea } from "../src/idea-refine.js"; // REAL, unmocked

describe("refineIdea — real idea-store.js integration", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "idea-refine-integration-"),
    );
    sendPrompt.mockImplementation(async ({ platform }) => ({
      platform,
      response:
        platform === "perplexity"
          ? "Real research output"
          : "Real refinement output",
    }));
  });

  afterEach(async () => {
    sendPrompt.mockReset();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("writes researchNotes/refinementNotes to the actual idea file on disk", async () => {
    const idea = await createIdea({
      body: "# Integration Idea\nContent",
      cwd: baseDir,
    });

    const result = await refineIdea(idea.id, { cwd: baseDir });
    expect(result.researchNotes).toBe("Real research output");
    expect(result.refinementNotes).toBe("Real refinement output");

    // The proof: reload from the real file, not the in-memory return value
    const reloaded = await findIdeaById(idea.id, { cwd: baseDir });
    expect(reloaded.researchNotes).toBe("Real research output");
    expect(reloaded.refinementNotes).toBe("Real refinement output");

    const raw = await fs.readFile(reloaded.filePath, "utf8");
    expect(raw).toContain("Real research output");
  });
});
