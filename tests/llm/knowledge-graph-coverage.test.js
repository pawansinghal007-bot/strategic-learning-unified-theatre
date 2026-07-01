/**
 * knowledge-graph-coverage.test.js
 * Targets uncovered lines in src/llm/knowledge-graph.js:
 *   29-30  — writeAtomicJson rename-retry branch (rename throws first time)
 *   42     — chmod error silently ignored
 *   206-218 — docNode thread-turn edge via filename fallback (no thread_id, filename match)
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { buildGraph } from "../../src/llm/knowledge-graph.js";

// ── minimal db stub factory ───────────────────────────────────────────────────
function makeDb(overrides = {}) {
  return {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    state: {
      sprints: [],
      documents: [],
      mistakes: [],
      rubric_rules: [],
      prompt_history: [],
      conversation_threads: [],
      ...overrides,
    },
  };
}

describe("buildGraph — writeAtomicJson rename-retry branch (line 29-30)", () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-cov-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("retries rename after first rename throws (EEXIST-style failure)", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    let renameCount = 0;

    const origRename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (src, dest) => {
      renameCount++;
      if (renameCount === 1) {
        // Simulate first rename failure (e.g. EEXIST on Windows)
        throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
      }
      return origRename(src, dest);
    });

    const db = makeDb();
    const result = await buildGraph(db, null, outputPath);

    // Should have succeeded via the retry path
    expect(result.outputPath).toBe(outputPath);
    expect(renameCount).toBe(2);

    // Output file should exist and be valid JSON
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(content).toHaveProperty("nodes");
    expect(content).toHaveProperty("edges");
  });
});

describe("buildGraph — chmod failure silently ignored (line 42)", () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-chmod-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("completes successfully even when fs.chmod throws", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    vi.spyOn(fs, "chmod").mockRejectedValue(new Error("chmod not supported"));

    const db = makeDb();
    const result = await buildGraph(db, null, outputPath);
    expect(result.outputPath).toBe(outputPath);
    // File still written despite chmod failure
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(content).toHaveProperty("exportedAt");
  });
});


describe("buildGraph — docNode thread-turn edges (lines 206-218)", () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-thread-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates partOfThread edge via thread_id when present", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const db = makeDb({
      conversation_threads: [{ id: 7, platform: "chatgpt", file_path: "thread.md" }],
      documents: [
        {
          id: 1,
          content: "Turn content",
          source_type: "thread-turn",
          thread_id: 7,
          filename: "thread.md",
          platform: "chatgpt",
        },
      ],
    });

    const result = await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find(
      (e) => e.from === "document-1" && e.to === "thread-7" && e.relation === "partOfThread",
    );
    expect(edge).toBeDefined();
  });

  it("creates partOfThread edge via filename fallback when thread_id is null", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const threadFilename = "/home/user/.vscode-rotator/browser-responses/thread.md";
    const db = makeDb({
      conversation_threads: [
        { id: 3, platform: "chatgpt", file_path: threadFilename },
      ],
      documents: [
        {
          id: 2,
          content: "Turn content via filename",
          source_type: "thread-turn",
          thread_id: null,          // no thread_id — must use filename fallback
          filename: threadFilename,
          platform: "chatgpt",
        },
      ],
    });

    const result = await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find(
      (e) => e.from === "document-2" && e.to === "thread-3" && e.relation === "partOfThread",
    );
    expect(edge).toBeDefined();
  });

  it("skips edge when source_type is thread-turn but no matching thread by filename", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const db = makeDb({
      conversation_threads: [
        { id: 5, platform: "chatgpt", file_path: "/other/path.md" },
      ],
      documents: [
        {
          id: 9,
          content: "Unmatched turn",
          source_type: "thread-turn",
          thread_id: null,
          filename: "/some/unmatched.md",
          platform: "chatgpt",
        },
      ],
    });

    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find((e) => e.from === "document-9");
    expect(edge).toBeUndefined();
  });

  it("skips partOfThread edge when thread-turn doc has no filename", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const db = makeDb({
      conversation_threads: [
        { id: 6, platform: "chatgpt", file_path: "/some/thread.md" },
      ],
      documents: [
        {
          id: 10,
          content: "No filename turn",
          source_type: "thread-turn",
          thread_id: null,
          filename: null,           // no filename — no edge created
          platform: "chatgpt",
        },
      ],
    });

    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find((e) => e.from === "document-10");
    expect(edge).toBeUndefined();
  });
});

describe("buildGraph — miscellaneous node/edge coverage", () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-misc-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("throws when db is falsy", async () => {
    await expect(buildGraph(null, null, path.join(tempDir, "g.json"))).rejects.toThrow(
      "ExperienceDb instance is required",
    );
  });

  it("creates rubricRule promotedTo edge when created_from_mistake_id is set", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const db = makeDb({
      mistakes: [{ id: 1, description: "forgot await", category: "api-misuse" }],
      rubric_rules: [
        { id: 10, rule: "Always await", category: "api-misuse", created_from_mistake_id: 1 },
      ],
    });

    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find((e) => e.relation === "promotedTo");
    expect(edge).toMatchObject({
      from: "mistake-1",
      to: "rubricRule-10",
    });
  });

  it("creates usedInSprint edge when prompt_history has sprint_id", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const db = makeDb({
      sprints: [{ id: "s1", goal: "Build feature", status: "done", date: "2026-01-01" }],
      prompt_history: [
        { id: 1, goal: "Generate prompt", platform: "chatgpt", sprint_id: "s1" },
      ],
    });

    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find((e) => e.relation === "usedInSprint");
    expect(edge).toMatchObject({ from: "promptHistory-1", to: "sprint-s1" });
  });

  it("uses default outputPath when none provided (homedir fallback)", async () => {
    vi.spyOn(os, "homedir").mockReturnValue(tempDir);
    const db = makeDb();

    const result = await buildGraph(db, null, null);
    expect(result.outputPath).toContain("knowledge-graph.json");
    // File should exist in the mocked homedir
    await expect(fs.access(result.outputPath)).resolves.toBeUndefined();
  });

  it("swallows idea-load errors and continues building the graph", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    // listIdeas is imported inside buildGraph; stub it to throw
    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockRejectedValue(new Error("ideas unavailable"));

    const db = makeDb({
      sprints: [{ id: "s1", goal: "Test", status: "active", date: "2026-01-01" }],
    });

    const result = await buildGraph(db, null, outputPath);
    // Graph still built despite idea failure
    expect(result.nodeCount).toBeGreaterThanOrEqual(1);
  });

  it("creates linkedSprint edge when idea has linkedSprint", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([
      {
        id: "idea-1",
        body: "My Idea\ndetails",
        status: "active",
        linkedSprint: "s1",
        project: "test",
        tags: ["tag1"],
      },
    ]);

    const db = makeDb({
      sprints: [{ id: "s1", goal: "Sprint goal", status: "active", date: "2026-01-01" }],
    });

    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const edge = content.edges.find((e) => e.relation === "linkedSprint");
    expect(edge).toMatchObject({ from: "idea-idea-1", to: "sprint-s1" });
  });

  it("uses ideaDir when provided (computes ideaRoot from dirname)", async () => {
    const outputPath = path.join(tempDir, "graph.json");
    const ideaStore = await import("../../src/idea-store.js");
    const listSpy = vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([]);

    const db = makeDb();
    const ideaDir = path.join(tempDir, "ideas", "active");
    await buildGraph(db, ideaDir, outputPath);

    // Confirm listIdeas was called with the parent of parent of ideaDir
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: tempDir }),
    );
  });
});
