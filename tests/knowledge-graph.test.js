import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createIdea } from "../src/idea-store.js";
import { ExperienceDb } from "../src/llm/experience-db.js";
import { buildGraph } from "../src/llm/knowledge-graph.js";

describe("Knowledge Graph Export", () => {
  it("exports a valid graph JSON file", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-export-"));
    const db = new ExperienceDb({ baseDir });
    await db.open();

    db.state.sprints.push({ id: "1", goal: "Test sprint", date: "2025-01-01T00:00:00Z", status: "active" });
    db.state.prompt_history.push({ id: "1", goal: "Review deliverables", platform: "chatgpt", date: "2025-01-01T00:00:00Z", sprint_id: "1" });
    db.state.mistakes.push({ id: "1", description: "Fix bug", category: "bug" });
    db.state.rubric_rules.push({ id: "1", rule: "Write tests", category: "quality", created_from_mistake_id: "1", active: 1 });
    db.state.documents.push({ id: "1", filename: "test.txt", content: "Example doc content", source_type: "document", platform: "test" });
    db.state.conversation_threads.push({ id: "1", platform: "chatgpt", captured_at: "2025-01-01T00:00:00Z", turn_count: 1, file_path: "thread-1.txt" });
    await db.save();

    const outputPath = path.join(baseDir, "knowledge-graph.json");
    const originalHome = process.env.HOME;
    process.env.HOME = baseDir;
    try {
      const result = await buildGraph(db, path.join(baseDir, ".vscode-rotator", "ideas"), outputPath);
      expect(result.outputPath).toBe(outputPath);
      expect(result.nodeCount).toBeGreaterThan(0);
      expect(result.edgeCount).toBeGreaterThanOrEqual(1);
      const exported = JSON.parse(await fs.readFile(outputPath, "utf8"));
      expect(exported.nodes).toBeInstanceOf(Array);
      expect(exported.edges).toBeInstanceOf(Array);
      expect(exported.exportedAt).toBeTruthy();
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("creates a linkedSprint edge for ideas linked to sprints", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-idea-sprint-"));
    await fs.mkdir(path.join(baseDir, ".git"), { recursive: true, mode: 0o700 });
    const db = new ExperienceDb({ baseDir });
    await db.open();
    const sprintId = "11111111-1111-1111-1111-111111111111";
    await db.upsertSprint({ id: sprintId, goal: "Test sprint", date: "2025-01-01T00:00:00Z", status: "active" });
    const idea = await createIdea({ body: "Test idea", linkedSprint: sprintId, cwd: baseDir });
    const outputPath = path.join(baseDir, "knowledge-graph-linked-sprint.json");

    const result = await buildGraph(db, path.join(baseDir, ".vscode-rotator", "ideas"), outputPath);
    expect(result.outputPath).toBe(outputPath);

    const exported = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const linkedEdge = exported.edges.find((edge) => edge.relation === "linkedSprint");
    expect(linkedEdge).toBeTruthy();
    expect(linkedEdge.from).toBe(`idea-${idea.id}`);
    expect(linkedEdge.to).toBe(`sprint-${sprintId}`);
  });

  it("creates a promotedTo edge when a mistake is promoted to a rubric rule", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-promoted-rule-"));
    const db = new ExperienceDb({ baseDir });
    await db.open();
    db.state.mistakes.push({ id: "m1", description: "forgot await", category: "api-misuse" });
    db.state.rubric_rules.push({ id: "r1", rule: "Always await", category: "quality", created_from_mistake_id: "m1", active: 1 });
    await db.save();

    const outputPath = path.join(baseDir, "knowledge-graph-promoted.json");
    const result = await buildGraph(db, path.join(baseDir, ".vscode-rotator", "ideas"), outputPath);
    expect(result.outputPath).toBe(outputPath);

    const exported = JSON.parse(await fs.readFile(outputPath, "utf8"));
    const promotedEdge = exported.edges.find((edge) => edge.relation === "promotedTo");
    expect(promotedEdge).toBeTruthy();
    expect(promotedEdge.from).toBe("mistake-m1");
    expect(promotedEdge.to).toBe("rubricRule-r1");
  });

  it("exports a valid ISO 8601 exportedAt timestamp", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "kg-timestamp-"));
    const db = new ExperienceDb({ baseDir });
    await db.open();

    const outputPath = path.join(baseDir, "knowledge-graph-timestamp.json");
    await buildGraph(db, path.join(baseDir, ".vscode-rotator", "ideas"), outputPath);

    const exported = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(new Date(exported.exportedAt).toISOString()).toBe(exported.exportedAt);
  });
});
