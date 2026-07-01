/**
 * prompt-generator-coverage.test.js
 * Targets uncovered lines in src/llm/prompt-generator.js:
 *   22         — estimateTokens (private, exercised via generate token count)
 *   30-31      — sprintSummary: completed_tasks / pending_tasks fallback ("none")
 *   33-34      — sprintSummary: tests_failed entries rendered as "name: error"
 *   82-85      — clipboardWrite: win32 / darwin / linux branches
 *   161        — generate with skipHistory=true (history stays null)
 *   170-173    — findRelated: doc with no content → "(no content)" title
 *   181        — findRelated: entry with cycle_ts ts field
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mock — must be before any import that pulls in prompt-generator.js ─
const spawnSyncMock = vi.fn().mockReturnValue({ status: 0 });

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnSync: (...args) => spawnSyncMock(...args),
  };
});

import { PromptGenerator } from "../../src/llm/prompt-generator.js";

// ── shared mock db/embeddings/inference factories ─────────────────────────────
function makeMocks(overrides = {}) {
  const mockDb = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    vectorSearchDocuments: vi.fn().mockResolvedValue([]),
    recentLlmResponseChunks: vi.fn().mockResolvedValue([]),
    getThreadContext: vi.fn().mockResolvedValue([]),
    recentSprints: vi.fn().mockResolvedValue([]),
    listRubricRules: vi.fn().mockResolvedValue([]),
    addPromptHistory: vi.fn().mockResolvedValue({ id: 1 }),
    relatedTo: vi.fn().mockResolvedValue({ documents: [], sprints: [], promptHistory: [] }),
    ...overrides.db,
  };
  const mockEmbeddings = {
    initialize: vi.fn().mockResolvedValue(undefined),
    embed: vi.fn().mockResolvedValue(new Array(768).fill(0)),
    ...overrides.embeddings,
  };
  const mockInference = {
    generate: vi.fn().mockResolvedValue("generated prompt text"),
    ...overrides.inference,
  };
  return { mockDb, mockEmbeddings, mockInference };
}

// ── sprintSummary fallbacks (lines 30-34) ─────────────────────────────────────
describe("PromptGenerator — sprintSummary branches in buildContext", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders 'none' when completed_tasks and pending_tasks are empty arrays", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks({
      db: {
        recentSprints: vi.fn().mockResolvedValue([
          {
            date: "2026-01-01",
            goal: "Empty sprint",
            status: "done",
            completed_tasks: [],
            pending_tasks: [],
            tests_failed: [],
          },
        ]),
      },
    });

    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const ctx = await gen.buildContext({ goal: "test", project: "proj" });

    expect(ctx.system).toContain("Completed: none");
    expect(ctx.system).toContain("Pending: none");
    expect(ctx.system).toContain("Tests failed: none");
  });

  it("renders test failures as 'name: error' in sprint summary (line 33-34)", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks({
      db: {
        recentSprints: vi.fn().mockResolvedValue([
          {
            date: "2026-01-02",
            goal: "Sprint with failures",
            status: "active",
            completed_tasks: [{ description: "Built thing" }],
            pending_tasks: [{ description: "Review PR" }],
            tests_failed: [
              { name: "auth.test.js > login", error: "AssertionError: expected 200" },
            ],
          },
        ]),
      },
    });

    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const ctx = await gen.buildContext({ goal: "fix tests", project: "proj" });

    expect(ctx.system).toContain("auth.test.js > login: AssertionError: expected 200");
    expect(ctx.system).toContain("Completed: Built thing");
    expect(ctx.system).toContain("Pending: Review PR");
  });

  it("renders 'none' when completed_tasks / pending_tasks are undefined", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks({
      db: {
        recentSprints: vi.fn().mockResolvedValue([
          {
            date: "2026-01-03",
            goal: "Undefined tasks sprint",
            status: "paused",
            // no completed_tasks, pending_tasks, tests_failed
          },
        ]),
      },
    });

    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const ctx = await gen.buildContext({ goal: "check", project: "proj" });

    expect(ctx.system).toContain("Completed: none");
    expect(ctx.system).toContain("Pending: none");
  });
});


// ── clipboardWrite platform branches (lines 82-85) ────────────────────────────
describe("PromptGenerator — clipboardWrite platform branches", () => {
  let savedPlatform;
  afterEach(() => {
    vi.restoreAllMocks();
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0 });
    if (savedPlatform !== undefined) {
      Object.defineProperty(process, "platform", { value: savedPlatform, configurable: true });
    }
  });

  function setPlatform(plat) {
    savedPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: plat, configurable: true });
  }

  it("uses 'clip' on win32 platform without throwing", async () => {
    setPlatform("win32");
    spawnSyncMock.mockReturnValue({ status: 0 });

    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.generate({ goal: "test goal win32", project: "proj" });
    expect(result.prompt).toBeTruthy();
  });

  it("uses 'pbcopy' on darwin platform without throwing", async () => {
    setPlatform("darwin");
    spawnSyncMock.mockReturnValue({ status: 0 });

    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.generate({ goal: "test goal darwin", project: "proj" });
    expect(result.prompt).toBeTruthy();
  });

  it("uses 'xclip' on linux platform without throwing", async () => {
    setPlatform("linux");
    spawnSyncMock.mockReturnValue({ status: 0 });

    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.generate({ goal: "test goal linux", project: "proj" });
    expect(result.prompt).toBeTruthy();
  });

  it("silently swallows clipboardWrite errors", async () => {
    setPlatform("linux");
    spawnSyncMock.mockImplementation(() => { throw new Error("xclip missing"); });

    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    // Should not throw despite spawnSync throwing
    await expect(gen.generate({ goal: "clipboard error test", project: "proj" })).resolves.toBeTruthy();
  });
});


// ── generate — skipHistory=true (line 161) ───────────────────────────────────
describe("PromptGenerator — generate with skipHistory=true (line 161)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns history=null when skipHistory is true", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });

    const result = await gen.generate({
      goal: "Build auth module",
      project: "proj",
      skipHistory: true,
    });

    expect(result.history).toBeNull();
    expect(mockDb.addPromptHistory).not.toHaveBeenCalled();
    expect(result.prompt).toBe("generated prompt text");
  });

  it("throws when goal is empty string", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });

    await expect(gen.generate({ goal: "   " })).rejects.toThrow("--goal is required");
  });

  it("throws when goal is not provided", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });

    await expect(gen.generate({})).rejects.toThrow("--goal is required");
  });
});

// ── findRelated branches (lines 170-173, 181) ─────────────────────────────────
describe("PromptGenerator — findRelated", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws when question is empty", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });

    await expect(gen.findRelated("")).rejects.toThrow("--to is required");
  });

  it("throws when question is whitespace only", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });

    await expect(gen.findRelated("   ")).rejects.toThrow("--to is required");
  });

  it("returns '(no content)' title for doc with empty content (line 170-173)", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks({
      db: {
        relatedTo: vi.fn().mockResolvedValue({
          documents: [
            { content: null, source_type: "md", platform: "vscode" },
            { content: "", source_type: "md", platform: null },
          ],
          sprints: [],
          promptHistory: [],
        }),
      },
    });

    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.findRelated("find something");

    expect(result.report).toContain("(no content)");
    expect(result.report).toContain("[source_type: md]");
    expect(result.report).toContain("[platform: unknown]");
  });

  it("renders sprint lines with status and startedAt (line 178)", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks({
      db: {
        relatedTo: vi.fn().mockResolvedValue({
          documents: [],
          sprints: [
            { goal: "Build feature", status: "done", startedAt: "2026-05-01" },
            { goal: null, status: null, startedAt: null },
          ],
          promptHistory: [],
        }),
      },
    });

    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.findRelated("sprint work");

    expect(result.report).toContain("Build feature");
    expect(result.report).toContain("[status: done]");
    expect(result.report).toContain("[startedAt: 2026-05-01]");
    expect(result.report).toContain("(no goal)");
    expect(result.report).toContain("[status: unknown]");
  });

  it("renders promptHistory with cycle_ts fallback (line 181)", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks({
      db: {
        relatedTo: vi.fn().mockResolvedValue({
          documents: [],
          sprints: [],
          promptHistory: [
            { goal: "Generate prompt", platform: "chatgpt", cycle_ts: "2026-06-01T10:00:00Z", date: null },
            { goal: null, platform: null, cycle_ts: null, date: null },
          ],
        }),
      },
    });

    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.findRelated("prompt history");

    expect(result.report).toContain("Generate prompt");
    expect(result.report).toContain("[platform: chatgpt]");
    expect(result.report).toContain("[ts: 2026-06-01T10:00:00Z]");
    expect(result.report).toContain("(no goal)");
    expect(result.report).toContain("[platform: unknown]");
    expect(result.report).toContain("[ts: unknown]");
  });

  it("returns '- None found.' lines when all result arrays are empty", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    const result = await gen.findRelated("something obscure");

    expect(result.report).toContain("- None found.");
    expect(result.raw).toBeDefined();
  });

  it("passes topDocs option to db.relatedTo", async () => {
    const { mockDb, mockEmbeddings, mockInference } = makeMocks();
    const gen = new PromptGenerator({ db: mockDb, embeddings: mockEmbeddings, inference: mockInference });
    await gen.findRelated("test", { topDocs: 10 });

    expect(mockDb.relatedTo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topDocs: 10 }),
    );
  });
});
