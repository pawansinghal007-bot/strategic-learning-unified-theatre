import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const IdeaStatusSchema = z.enum(["inbox", "active", "parked", "done"]);
const IdeaPrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const IdeaSchema = z.object({
  id: z.string().uuid(),
  created: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO date"
  }),
  project: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: IdeaStatusSchema,
  priority: IdeaPrioritySchema,
  linkedSprint: z.string().uuid().nullable()
});

function slugify(text) {
  const slug = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return slug || "idea";
}

function normalizeTags(tags) {
  if (tags == null) return [];
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags)
    .split(/[ ,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function extractTitle(body) {
  const lines = String(body || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "Untitled";
  return lines[0].replace(/^#+\s*/, "") || "Untitled";
}

function stripTitleFromBody(body) {
  const lines = String(body || "").split(/\r?\n/);
  if (lines.length === 0) return "";
  const first = lines[0].trim();
  if (/^#+\s*/.test(first)) {
    return lines.slice(1).join("\n").trim();
  }
  return body.trim();
}

function maxCharHint(tokens) {
  return Number(tokens) * 4;
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  while (true) {
    if (await pathExists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

async function ensureDirectory(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function getIdeaContext({ cwd = process.cwd(), project } = {}) {
  const gitRoot = await findGitRoot(cwd);
  const root = gitRoot ?? path.resolve(cwd);
  const resolvedProject = project
    ? String(project).trim()
    : gitRoot
    ? path.basename(gitRoot)
    : path.basename(root) || "global";
  const ideaDir = path.join(root, ".vscode-rotator", "ideas");
  return {
    root,
    gitRoot,
    ideaDir,
    project: resolvedProject
  };
}

export async function createIdea({
  project,
  tags,
  status = "inbox",
  priority = 3,
  linkedSprint = null,
  body,
  cwd
} = {}) {
  const context = await getIdeaContext({ cwd, project });
  await ensureDirectory(context.ideaDir);

  const content = String(body || "").trim();
  if (!content) {
    throw new Error("Idea body cannot be empty.");
  }

  const created = new Date().toISOString();
  const id = crypto.randomUUID();
  const idea = {
    id,
    created,
    project: context.project,
    tags: normalizeTags(tags),
    status: IdeaStatusSchema.parse(status),
    priority: IdeaPrioritySchema.parse(Number(priority)),
    linkedSprint: linkedSprint ? String(linkedSprint).trim() : null
  };

  const title = extractTitle(content);
  const slug = slugify(title);
  let fileName = `${created.slice(0, 10)}-${slug}.md`;
  let filePath = path.join(context.ideaDir, fileName);
  if (await pathExists(filePath)) {
    fileName = `${created.slice(0, 10)}-${slug}-${id.slice(0, 8)}.md`;
    filePath = path.join(context.ideaDir, fileName);
  }

  const markdown = matter.stringify(content, idea);
  await fs.writeFile(filePath, markdown, "utf8");
  return { ...idea, body: content, filePath };
}

export async function listIdeas({ cwd = process.cwd(), project, status, tag } = {}) {
  const context = await getIdeaContext({ cwd, project });
  if (!(await pathExists(context.ideaDir))) return [];
  const files = await fs.readdir(context.ideaDir);
  const ideas = [];
  for (const name of files) {
    if (!name.endsWith(".md")) continue;
    try {
      const filePath = path.join(context.ideaDir, name);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = matter(raw);
      const meta = IdeaSchema.parse({
        ...parsed.data,
        tags: normalizeTags(parsed.data.tags),
        linkedSprint: parsed.data.linkedSprint ?? null
      });
      const idea = {
        ...meta,
        body: String(parsed.content || "").trim(),
        filePath
      };

      if (project && idea.project !== project) continue;
      if (status && idea.status !== status) continue;
      if (tag && !idea.tags.includes(tag)) continue;
      ideas.push(idea);
    } catch {
      continue;
    }
  }
  return ideas.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export async function findIdeaById(id, options = {}) {
  const ideas = await listIdeas(options);
  const found = ideas.find((idea) => idea.id === id);
  if (!found) {
    throw new Error(`Idea not found: ${id}`);
  }
  return found;
}

export async function updateIdea(id, patch = {}, options = {}) {
  const idea = await findIdeaById(id, options);
  const data = {
    id: idea.id,
    created: idea.created,
    project: patch.project ?? idea.project,
    tags: normalizeTags(patch.tags ?? idea.tags),
    status: patch.status ? IdeaStatusSchema.parse(patch.status) : idea.status,
    priority: patch.priority ? IdeaPrioritySchema.parse(Number(patch.priority)) : idea.priority,
    linkedSprint: patch.linkedSprint === undefined ? idea.linkedSprint : patch.linkedSprint
  };
  const updated = {
    ...data,
    body: patch.body !== undefined ? String(patch.body).trim() : idea.body
  };

  const markdown = matter.stringify(updated.body, data);
  await fs.writeFile(idea.filePath, markdown, "utf8");
  return { ...updated, filePath: idea.filePath };
}

export async function markIdeaDone(id, options = {}) {
  return updateIdea(id, { status: "done" }, options);
}

export async function linkIdeaToSprint(id, sprintId, options = {}) {
  return updateIdea(id, { linkedSprint: String(sprintId).trim() }, options);
}

export async function exportIdeas({ cwd = process.cwd(), project, status = "active" } = {}) {
  const ideas = await listIdeas({ cwd, project, status });
  if (ideas.length === 0) {
    return "";
  }

  const reportProject = project || ideas[0].project || "project";
  const header = `## ${String(status || "active").charAt(0).toUpperCase() + String(status || "active").slice(1)} ideas for ${reportProject}`;

  const renderIdea = (ideaBody, ideaPriority) => {
    const title = extractTitle(ideaBody);
    const bodyWithoutTitle = stripTitleFromBody(ideaBody);
    return `### ${title} [priority: ${ideaPriority}]\n${bodyWithoutTitle}`;
  };

  const blocks = ideas.map((idea) => renderIdea(idea.body, idea.priority));
  let output = [header, ...blocks, ""].join("\n---\n");

  if (estimateTokens(output) > 4000) {
    const trimmedBlocks = ideas.map((idea) => {
      const title = extractTitle(idea.body);
      let bodyWithoutTitle = stripTitleFromBody(idea.body);
      if (bodyWithoutTitle.length > 500) {
        bodyWithoutTitle = `${bodyWithoutTitle.slice(0, 497).trimEnd()}...`;
      }
      return `### ${title} [priority: ${idea.priority}]\n${bodyWithoutTitle}`;
    });
    output = [header, ...trimmedBlocks, ""].join("\n---\n");
  }

  if (estimateTokens(output) > 4000) {
    output = output.slice(0, maxCharHint(4000) - 1).trimEnd();
  }

  return output;
}
