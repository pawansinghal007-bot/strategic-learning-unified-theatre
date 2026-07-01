/**
 * knowledge-graph-branches.test.js
 *
 * Targets branch gaps in src/llm/knowledge-graph.js:
 *   Line  8      — firstLine: empty/null text → "(no title)"
 *   Lines 49-74  — sprint/doc/mistake/rubricRule nodes with empty/null fields
 *   Lines 80-136 — promptHistory node with prompt fallback, thread node fields
 *   Lines 140-161 — idea nodes with/without linkedSprint, ideaDir=null path
 *   Line  164    — db.state.X is not an array → fallback to []
 *   Lines 184-205 — db.state non-array fields for nodes (null fallback)
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { buildGraph } from "../../src/llm/knowledge-graph.js";

// ── helpers ────────────────────────────────────────────────────────────────

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

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "kg-branch-"));
}

// ── firstLine: empty/null/undefined text → "(no title)" (line 8) ───────────

describe("firstLine — empty/null fallback (line 8)", () => {
  it("produces '(no title)' for an idea with empty body", async () => {
    const tempDir = await makeTempDir();
    const outputPath = path.join(tempDir, "graph.json");

    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([
      { id: "i1", body: "", status: "active", tags: [] },  // empty body
      { id: "i2", body: "\n\n\n", status: "active", tags: [] }, // only newlines
    ]);

    const db = makeDb();
    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const ideaNodes = content.nodes.filter((n) => n.type === "idea");
    expect(ideaNodes.every((n) => n.title === "(no title)")).toBe(true);

    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("extracts the first non-empty line when body has leading blank lines", async () => {
    const tempDir = await makeTempDir();
    const outputPath = path.join(tempDir, "graph.json");

    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([
      { id: "i3", body: "\n\n  My Idea Title\nmore details", status: "active", tags: [] },
    ]);

    const db = makeDb();
    await buildGraph(db, null, outputPath);
    const content = JSON.parse(await fs.readFile(outputPath, "utf8"));

    const idea = content.nodes.find((n) => n.id === "idea-i3");
    expect(idea.title).toBe("My Idea Title");

    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

// ── sprint/doc/mistake/rubricRule with empty fields (lines 49-74) ──────────

describe("buildGraph — node field fallbacks (lines 49-74)", () => {
  let tempDir;

  beforeEach(async () => { tempDir = await makeTempDir(); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("sprint node uses '(no goal)' when goal is empty", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      sprints: [{ id: "s1", goal: "", status: null, date: null }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const sprint = nodes.find((n) => n.id === "sprint-s1");
    expect(sprint.title).toBe("(no goal)");
    expect(sprint.meta.status).toBeNull();
    expect(sprint.meta.startedAt).toBeNull();
  });

  it("document node uses '(no content)' when content is empty", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      documents: [{ id: 1, content: "", source_type: null, platform: null, filename: null }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const doc = nodes.find((n) => n.id === "document-1");
    expect(doc.title).toBe("(no content)");
  });

  it("mistake node uses '(no description)' when description is empty", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      mistakes: [{ id: 1, description: "", category: null }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const mistake = nodes.find((n) => n.id === "mistake-1");
    expect(mistake.title).toBe("(no description)");
    expect(mistake.meta.category).toBeNull();
  });

  it("rubricRule node uses '(no rule)' when rule is empty", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      rubric_rules: [{ id: 1, rule: "", category: null, created_from_mistake_id: null }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const rule = nodes.find((n) => n.id === "rubricRule-1");
    expect(rule.title).toBe("(no rule)");
  });

  it("rubricRule without created_from_mistake_id does NOT create edge", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      rubric_rules: [{ id: 5, rule: "Some rule", category: "general", created_from_mistake_id: null }],
    });
    await buildGraph(db, null, outputPath);
    const { edges } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(edges.find((e) => e.relation === "promotedTo")).toBeUndefined();
  });
});

// ── promptHistory node with prompt fallback (lines 80-136) ─────────────────

describe("buildGraph — promptHistory node branches (lines 80-136)", () => {
  let tempDir;

  beforeEach(async () => { tempDir = await makeTempDir(); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses prompt.prompt as title fallback when goal is empty", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      prompt_history: [{
        id: 1,
        goal: "",
        prompt: "Fallback prompt text",
        platform: "chatgpt",
        cycle_ts: null,
        date: "2026-01-01T00:00:00.000Z",
        sprint_id: null,
      }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const ph = nodes.find((n) => n.id === "promptHistory-1");
    expect(ph.title).toContain("Fallback prompt text");
  });

  it("uses '(no prompt)' when both goal and prompt are empty", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      prompt_history: [{
        id: 2, goal: "", prompt: "", platform: null, cycle_ts: null, date: null, sprint_id: null,
      }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const ph = nodes.find((n) => n.id === "promptHistory-2");
    expect(ph.title).toBe("(no prompt)");
  });

  it("uses prompt.cycle_ts for meta.ts when present", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const ts = "2026-05-01T12:00:00.000Z";
    const db = makeDb({
      prompt_history: [{
        id: 3, goal: "Goal", prompt: "p", platform: "gemini",
        cycle_ts: ts, date: "2026-01-01T00:00:00.000Z", sprint_id: null,
      }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const ph = nodes.find((n) => n.id === "promptHistory-3");
    expect(ph.meta.ts).toBe(ts);
  });

  it("falls back to prompt.date for meta.ts when cycle_ts is null", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      prompt_history: [{
        id: 4, goal: "G", prompt: "p", platform: null,
        cycle_ts: null, date: "2026-03-01T00:00:00.000Z", sprint_id: null,
      }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const ph = nodes.find((n) => n.id === "promptHistory-4");
    expect(ph.meta.ts).toBe("2026-03-01T00:00:00.000Z");
  });

  it("promptHistory without sprint_id does NOT create usedInSprint edge", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      prompt_history: [{
        id: 5, goal: "G", prompt: "p", platform: "chatgpt",
        cycle_ts: null, date: null, sprint_id: null,
      }],
    });
    await buildGraph(db, null, outputPath);
    const { edges } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(edges.find((e) => e.relation === "usedInSprint")).toBeUndefined();
  });
});

// ── thread node fields (lines 140-161) ────────────────────────────────────

describe("buildGraph — thread node fields", () => {
  let tempDir;

  beforeEach(async () => { tempDir = await makeTempDir(); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("thread node uses platform as title when present", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      conversation_threads: [{
        id: 1, platform: "gemini", captured_at: "2026-01-01T00:00:00.000Z",
        turn_count: 3, file_path: "/t.md",
      }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const thread = nodes.find((n) => n.id === "thread-1");
    expect(thread.title).toBe("gemini");
    expect(thread.meta.platform).toBe("gemini");
    expect(thread.meta.turnCount).toBe(3);
    expect(thread.meta.filePath).toBe("/t.md");
  });

  it("thread node falls back to 'thread' title when platform is null", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({
      conversation_threads: [{
        id: 2, platform: null, captured_at: null, turn_count: null, file_path: null,
      }],
    });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const thread = nodes.find((n) => n.id === "thread-2");
    expect(thread.title).toBe("thread");
    expect(thread.meta.capturedAt).toBeNull();
    expect(thread.meta.turnCount).toBeNull();
    expect(thread.meta.filePath).toBeNull();
  });
});

// ── db.state fields not arrays → fallback to [] (line 164) ────────────────

describe("buildGraph — non-array db.state fields fall back to [] (line 164)", () => {
  let tempDir;

  beforeEach(async () => { tempDir = await makeTempDir(); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("handles db.state.sprints = null gracefully", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({ sprints: null, documents: null, mistakes: null,
                        rubric_rules: null, prompt_history: null,
                        conversation_threads: null });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(nodes).toEqual([]);
  });

  it("handles db.state.sprints = undefined", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const db = makeDb({ sprints: undefined });
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const sprintNodes = nodes.filter((n) => n.type === "sprint");
    expect(sprintNodes).toEqual([]);
  });
});

// ── idea nodes without linkedSprint / with ideaDir (lines 184-205) ─────────

describe("buildGraph — idea node edge cases (lines 184-205)", () => {
  let tempDir;

  beforeEach(async () => { tempDir = await makeTempDir(); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("idea without linkedSprint does NOT create linkedSprint edge", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([
      { id: "i1", body: "Idea without sprint", status: "active", linkedSprint: null, tags: [] },
    ]);

    const db = makeDb();
    await buildGraph(db, null, outputPath);
    const { edges } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(edges.find((e) => e.relation === "linkedSprint")).toBeUndefined();
  });

  it("idea tags non-array are stored as empty array", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([
      { id: "i2", body: "Tagged idea", status: "active", linkedSprint: null, tags: null },
    ]);

    const db = makeDb();
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const idea = nodes.find((n) => n.id === "idea-i2");
    expect(idea.meta.tags).toEqual([]);
  });

  it("idea with project field stored in meta", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([
      {
        id: "i3",
        body: "Project idea",
        status: "draft",
        linkedSprint: null,
        project: "my-project",
        tags: ["tag-a"],
      },
    ]);

    const db = makeDb();
    await buildGraph(db, null, outputPath);
    const { nodes } = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const idea = nodes.find((n) => n.id === "idea-i3");
    expect(idea.meta.project).toBe("my-project");
    expect(idea.meta.status).toBe("draft");
    expect(idea.meta.tags).toEqual(["tag-a"]);
  });

  it("ideaDir provided: uses dirname(dirname(ideaDir)) as cwd for listIdeas", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const ideaStore = await import("../../src/idea-store.js");
    const spy = vi.spyOn(ideaStore, "listIdeas").mockResolvedValue([]);

    const ideaDir = path.join(tempDir, "ideas", "active");
    await fs.mkdir(ideaDir, { recursive: true });

    const db = makeDb();
    await buildGraph(db, ideaDir, outputPath);

    // cwd should be dirname(dirname(ideaDir)) = tempDir
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: tempDir }),
    );
  });

  it("listIdeas throwing is silently swallowed and graph still built", async () => {
    const outputPath = path.join(tempDir, "g.json");
    const ideaStore = await import("../../src/idea-store.js");
    vi.spyOn(ideaStore, "listIdeas").mockRejectedValue(new Error("file not found"));

    const db = makeDb({
      sprints: [{ id: "s1", goal: "Sprint goal", status: "active", date: "2026-01-01T00:00:00.000Z" }],
    });
    const result = await buildGraph(db, null, outputPath);
    expect(result.nodeCount).toBeGreaterThanOrEqual(1);
  });
});
