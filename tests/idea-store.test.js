import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createIdea,
  listIdeas,
  findIdeaById,
  updateIdea,
  markIdeaDone,
  linkIdeaToSprint,
  exportIdeas,
  getIdeaContext
} from "../src/idea-store.js";

describe("Idea Store", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "idea-store-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {}
  });

  describe("createIdea", () => {
    it("creates an idea with valid metadata", async () => {
      const idea = await createIdea({
        body: "# Test Idea\nThis is a test idea.",
        project: "test-project",
        tags: ["test", "feature"],
        priority: 1,
        status: "active",
        cwd: baseDir
      });

      expect(idea.id).toBeDefined();
      expect(idea.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(idea.project).toBe("test-project");
      expect(idea.tags).toEqual(["test", "feature"]);
      expect(idea.priority).toBe(1);
      expect(idea.status).toBe("active");
      expect(idea.body).toContain("Test Idea");
      expect(idea.created).toBeDefined();
      expect(idea.filePath).toBeDefined();
    });

    it("extracts title from body", async () => {
      const idea = await createIdea({
        body: "# My Feature Idea\nSome detailed description here.",
        project: "myproject",
        cwd: baseDir
      });

      expect(idea.body).toContain("My Feature Idea");
      const filename = path.basename(idea.filePath);
      expect(filename).toMatch(/^[\d-]+-my-feature-idea/);
    });

    it("throws on empty body", async () => {
      await expect(
        createIdea({
          body: "",
          project: "test",
          cwd: baseDir
        })
      ).rejects.toThrow(/body cannot be empty/i);
    });

    it("uses default values for optional fields", async () => {
      const idea = await createIdea({
        body: "# Test\nContent",
        cwd: baseDir
      });

      expect(idea.priority).toBe(3);
      expect(idea.status).toBe("inbox");
      expect(idea.tags).toEqual([]);
      expect(idea.linkedSprint).toBeNull();
      expect(idea.project).toBeDefined();
    });

    it("normalizes tags from string or array", async () => {
      const idea = await createIdea({
        body: "# Test\nContent",
        tags: "tag1, tag2, tag3",
        cwd: baseDir
      });

      expect(idea.tags).toEqual(["tag1", "tag2", "tag3"]);
    });
  });

  describe("listIdeas", () => {
    beforeEach(async () => {
      // Create several ideas
      await createIdea({
        body: "# Idea 1\nContent 1",
        project: "project-a",
        tags: ["feature"],
        status: "active",
        priority: 1,
        cwd: baseDir
      });

      await createIdea({
        body: "# Idea 2\nContent 2",
        project: "project-a",
        tags: ["bug"],
        status: "inbox",
        priority: 2,
        cwd: baseDir
      });

      await createIdea({
        body: "# Idea 3\nContent 3",
        project: "project-b",
        tags: ["feature"],
        status: "done",
        priority: 3,
        cwd: baseDir
      });

      // Add delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("lists all ideas", async () => {
      const ideas = await listIdeas({ cwd: baseDir });
      expect(ideas).toHaveLength(3);
    });

    it("filters ideas by project", async () => {
      const ideas = await listIdeas({ project: "project-a", cwd: baseDir });
      expect(ideas).toHaveLength(2);
      expect(ideas.every((i) => i.project === "project-a")).toBe(true);
    });

    it("filters ideas by status", async () => {
      const ideas = await listIdeas({ status: "active", cwd: baseDir });
      expect(ideas).toHaveLength(1);
      expect(ideas[0].status).toBe("active");
    });

    it("filters ideas by tag", async () => {
      const ideas = await listIdeas({ tag: "feature", cwd: baseDir });
      expect(ideas).toHaveLength(2);
      expect(ideas.every((i) => i.tags.includes("feature"))).toBe(true);
    });

    it("combines multiple filters", async () => {
      const ideas = await listIdeas({
        project: "project-a",
        status: "active",
        cwd: baseDir
      });
      expect(ideas).toHaveLength(1);
      expect(ideas[0].project).toBe("project-a");
      expect(ideas[0].status).toBe("active");
    });

    it("sorts ideas by creation date (newest first)", async () => {
      const ideas = await listIdeas({ cwd: baseDir });
      for (let i = 1; i < ideas.length; i++) {
        expect(new Date(ideas[i - 1].created) >= new Date(ideas[i].created)).toBe(true);
      }
    });

    it("returns empty array for non-existent directory", async () => {
      const ideas = await listIdeas({ cwd: path.join(baseDir, "nonexistent") });
      expect(ideas).toEqual([]);
    });
  });

  describe("findIdeaById", () => {
    let createdIdea;

    beforeEach(async () => {
      createdIdea = await createIdea({
        body: "# Test Idea\nThis is searchable",
        project: "test",
        tags: ["searchable"],
        cwd: baseDir
      });
    });

    it("finds an idea by its id", async () => {
      const found = await findIdeaById(createdIdea.id, { cwd: baseDir });
      expect(found.id).toBe(createdIdea.id);
      expect(found.project).toBe("test");
      expect(found.body).toContain("searchable");
    });

    it("throws when idea not found", async () => {
      await expect(
        findIdeaById("00000000-0000-0000-0000-000000000000", { cwd: baseDir })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("updateIdea", () => {
    let idea;

    beforeEach(async () => {
      idea = await createIdea({
        body: "# Original\nOriginal content",
        project: "test",
        status: "inbox",
        tags: ["original"],
        priority: 3,
        cwd: baseDir
      });
    });

    it("updates idea status", async () => {
      const updated = await updateIdea(idea.id, { status: "active" }, { cwd: baseDir });
      expect(updated.status).toBe("active");

      const reloaded = await findIdeaById(idea.id, { cwd: baseDir });
      expect(reloaded.status).toBe("active");
    });

    it("updates idea tags", async () => {
      const updated = await updateIdea(idea.id, { tags: ["updated", "tag"] }, { cwd: baseDir });
      expect(updated.tags).toEqual(["updated", "tag"]);
    });

    it("updates idea priority", async () => {
      const updated = await updateIdea(idea.id, { priority: 1 }, { cwd: baseDir });
      expect(updated.priority).toBe(1);
    });

    it("updates idea body", async () => {
      const newBody = "# Updated\nUpdated content";
      const updated = await updateIdea(idea.id, { body: newBody }, { cwd: baseDir });
      expect(updated.body).toBe(newBody);

      const reloaded = await findIdeaById(idea.id, { cwd: baseDir });
      expect(reloaded.body).toBe(newBody);
    });

    it("preserves unmodified fields", async () => {
      const updated = await updateIdea(idea.id, { status: "active" }, { cwd: baseDir });
      expect(updated.project).toBe(idea.project);
      expect(updated.tags).toEqual(idea.tags);
      expect(updated.priority).toBe(idea.priority);
    });
  });

  describe("markIdeaDone", () => {
    it("marks an idea as done", async () => {
      const idea = await createIdea({
        body: "# Task\nDo this thing",
        cwd: baseDir
      });

      const done = await markIdeaDone(idea.id, { cwd: baseDir });
      expect(done.status).toBe("done");

      const reloaded = await findIdeaById(idea.id, { cwd: baseDir });
      expect(reloaded.status).toBe("done");
    });
  });

  describe("linkIdeaToSprint", () => {
    it("links an idea to a sprint", async () => {
      const idea = await createIdea({
        body: "# Sprint Task\nFor a sprint",
        cwd: baseDir
      });

      const sprintId = "550e8400-e29b-41d4-a716-446655440000";
      const linked = await linkIdeaToSprint(idea.id, sprintId, { cwd: baseDir });
      expect(linked.linkedSprint).toBe(sprintId);

      const reloaded = await findIdeaById(idea.id, { cwd: baseDir });
      expect(reloaded.linkedSprint).toBe(sprintId);
    });

    it("allows updating linkedSprint", async () => {
      const idea = await createIdea({
        body: "# Idea\nContent",
        linkedSprint: "550e8400-e29b-41d4-a716-446655440000",
        cwd: baseDir
      });

      const newSprintId = "660e8400-e29b-41d4-a716-446655440001";
      const updated = await linkIdeaToSprint(idea.id, newSprintId, { cwd: baseDir });
      expect(updated.linkedSprint).toBe(newSprintId);
    });
  });

  describe("exportIdeas", () => {
    beforeEach(async () => {
      await createIdea({
        body: "# Feature Request\nAdd support for X feature",
        project: "app",
        status: "active",
        priority: 1,
        tags: ["feature"],
        cwd: baseDir
      });

      await createIdea({
        body: "# Bug Fix\nFix issue with Y",
        project: "app",
        status: "active",
        priority: 2,
        tags: ["bug"],
        cwd: baseDir
      });

      await createIdea({
        body: "# Done Idea\nAlready completed",
        project: "app",
        status: "done",
        priority: 3,
        cwd: baseDir
      });
    });

    it("exports active ideas for project", async () => {
      const output = await exportIdeas({ project: "app", status: "active", cwd: baseDir });
      expect(output).toContain("## Active ideas for app");
      expect(output).toContain("Feature Request");
      expect(output).toContain("Bug Fix");
      expect(output).toContain("[priority: 1]");
      expect(output).toContain("[priority: 2]");
      expect(output).not.toContain("Done Idea");
    });

    it("trims body to 500 chars if needed", async () => {
      await createIdea({
        body: `# Very Long Idea\n${"x".repeat(1000)}`,
        project: "app",
        status: "active",
        priority: 1,
        cwd: baseDir
      });

      const output = await exportIdeas({ project: "app", status: "active", cwd: baseDir });
      expect(output.length).toBeLessThan(4000 * 4); // 4000 tokens
    });

    it("returns empty string when no ideas match filter", async () => {
      const output = await exportIdeas({
        project: "nonexistent",
        status: "active",
        cwd: baseDir
      });
      expect(output).toBe("");
    });

    it("exports with different status filters", async () => {
      const done = await exportIdeas({ project: "app", status: "done", cwd: baseDir });
      expect(done).toContain("Done Idea");
      expect(done).not.toContain("Feature Request");
    });
  });

  describe("getIdeaContext", () => {
    it("returns idea context with project name", async () => {
      const context = await getIdeaContext({
        cwd: baseDir,
        project: "myproject"
      });

      expect(context.ideaDir).toContain(".vscode-rotator");
      expect(context.ideaDir).toContain("ideas");
      expect(context.project).toBe("myproject");
    });

    it("uses directory name as project if no .git", async () => {
      const context = await getIdeaContext({
        cwd: baseDir
      });

      expect(context.project).toBeDefined();
    });
  });

  describe("YAML front-matter", () => {
    it("stores and retrieves YAML front-matter correctly", async () => {
      const idea = await createIdea({
        body: "# Test\nContent",
        project: "yaml-test",
        tags: ["yaml", "frontmatter"],
        status: "active",
        priority: 1,
        linkedSprint: "550e8400-e29b-41d4-a716-446655440000",
        cwd: baseDir
      });

      const found = await findIdeaById(idea.id, { cwd: baseDir });

      expect(found.project).toBe("yaml-test");
      expect(found.tags).toEqual(["yaml", "frontmatter"]);
      expect(found.status).toBe("active");
      expect(found.priority).toBe(1);
      expect(found.linkedSprint).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(found.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("preserves UUID format in round-trip", async () => {
      const originalId = "550e8400-e29b-41d4-a716-446655440000";
      const idea = await createIdea({
        body: "# Test\nContent",
        linkedSprint: originalId,
        cwd: baseDir
      });

      const found = await findIdeaById(idea.id, { cwd: baseDir });
      expect(found.linkedSprint).toBe(originalId);
    });
  });
});
