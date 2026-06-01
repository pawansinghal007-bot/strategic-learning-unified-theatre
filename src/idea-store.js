import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { DomainError } from "./error.js";

const IdeaStatusSchema = z.enum(["inbox", "active", "parked", "done"]);
const IdeaPrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const IdeaSchema = z.object({
  id: z.uuid(),
  created: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO date",
  }),
  project: z.string().min(1),
  tags: z.array(z.string()).default([]),
  status: IdeaStatusSchema,
  priority: IdeaPrioritySchema,
  linkedSprint: z.uuid().nullable().default(null),
});

function formatValidationError(error) {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function createIdeaInvalidError(error, context = {}) {
  const detail = formatValidationError(error);
  return new DomainError("ROTATOR_IDEA_INVALID", `Invalid idea: ${detail}`, {
    ...context,
    error: detail,
  });
}

function parseIdeaOrThrowDomainError(raw, context = {}) {
  try {
    return IdeaSchema.parse(raw);
  } catch (error) {
    throw createIdeaInvalidError(error, context);
  }
}

function slugify(text) {
  const slug = String(text || "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 40);
  return slug || "idea";
}

function normalizeTags(tags) {
  if (tags == null) return [];
  if (Array.isArray(tags))
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags)
    .split(/[ ,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function extractTitle(body) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

async function quarantineFile(filePath, reason) {
  try {
    const corruptDir = path.join(path.dirname(filePath), "corrupt");
    await fs.mkdir(corruptDir, { recursive: true, mode: 0o700 });
    const targetPath = path.join(
      corruptDir,
      `${path.basename(filePath)}.${Date.now()}.${reason}`,
    );
    await fs.rename(filePath, targetPath);
  } catch {
    // Quarantine is best-effort; callers still skip invalid records.
  }
}

async function readIdeaFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    const parsed = matter(raw);
    const meta = parseIdeaOrThrowDomainError(
      {
        ...parsed.data,
        tags: normalizeTags(parsed.data.tags),
        linkedSprint: parsed.data.linkedSprint ?? null,
      },
      { operation: "listIdeas", filePath },
    );
    return {
      ...meta,
      body: String(parsed.content || "").trim(),
      filePath,
    };
  } catch (err) {
    console.warn("[idea-store] invalid idea metadata", filePath, err);
    await quarantineFile(filePath, "invalid-metadata");
    return null;
  }
}

async function findGitRoot(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  const tempRoot = path.resolve(os.tmpdir());
  while (true) {
    if (await pathExists(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current || parent === tempRoot) break;
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
  let resolvedProject;
  if (project) {
    resolvedProject = String(project).trim();
  } else if (gitRoot) {
    resolvedProject = path.basename(gitRoot);
  } else {
    resolvedProject = path.basename(root) || "global";
  }
  const ideaDir = path.join(root, ".vscode-rotator", "ideas");
  return {
    root,
    gitRoot,
    ideaDir,
    project: resolvedProject,
  };
}

export async function createIdea({
  project,
  tags,
  status = "inbox",
  priority = 3,
  linkedSprint = null,
  body,
  cwd,
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
    status,
    priority: Number(priority),
    linkedSprint: linkedSprint ? String(linkedSprint).trim() : null,
  };
  const parsedIdea = parseIdeaOrThrowDomainError(idea, {
    operation: "createIdea",
  });

  const title = extractTitle(content);
  const slug = slugify(title);
  let fileName = `${created.slice(0, 10)}-${slug}.md`;
  let filePath = path.join(context.ideaDir, fileName);
  if (await pathExists(filePath)) {
    fileName = `${created.slice(0, 10)}-${slug}-${id.slice(0, 8)}.md`;
    filePath = path.join(context.ideaDir, fileName);
  }

  const markdown = matter.stringify(content, parsedIdea);
  await fs.writeFile(filePath, markdown, "utf8");
  return { ...parsedIdea, body: content, filePath };
}

function ideaMatchesFilter(idea, { project, status, tag }) {
  if (project && idea.project !== project) return false;
  if (status && idea.status !== status) return false;
  if (tag && !idea.tags.includes(tag)) return false;
  return true;
}

async function readIdeaFileIfMarkdown(directory, name) {
  if (!name.endsWith(".md")) return null;
  const filePath = path.join(directory, name);
  try {
    return await readIdeaFile(filePath);
  } catch {
    return null;
  }
}

function sortIdeasByCreatedDesc(ideas) {
  return ideas.sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
  );
}

async function readIdeasFromDirectory(directory, filterOptions) {
  const files = await fs.readdir(directory);
  const ideas = [];
  for (const name of files) {
    const idea = await readIdeaFileIfMarkdown(directory, name);
    if (!idea || !ideaMatchesFilter(idea, filterOptions)) continue;
    ideas.push(idea);
  }
  return ideas;
}

export async function listIdeas({
  cwd = process.cwd(),
  project,
  status,
  tag,
} = {}) {
  const context = await getIdeaContext({ cwd, project });
  if (!(await pathExists(context.ideaDir))) {
    return [];
  }
  const ideas = await readIdeasFromDirectory(context.ideaDir, {
    project,
    status,
    tag,
  });
  return sortIdeasByCreatedDesc(ideas);
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
    status: patch.status ? patch.status : idea.status,
    priority: patch.priority ? Number(patch.priority) : idea.priority,
    linkedSprint:
      patch.linkedSprint === undefined ? idea.linkedSprint : patch.linkedSprint,
  };
  const parsedData = parseIdeaOrThrowDomainError(data, {
    operation: "updateIdea",
    id,
    filePath: idea.filePath,
  });
  const updated = {
    ...parsedData,
    body: patch.body !== undefined ? String(patch.body).trim() : idea.body,
  };

  const markdown = matter.stringify(updated.body, parsedData);
  await fs.writeFile(idea.filePath, markdown, "utf8");
  return { ...updated, filePath: idea.filePath };
}

export async function markIdeaDone(id, options = {}) {
  return updateIdea(id, { status: "done" }, options);
}

export async function linkIdeaToSprint(id, sprintId, options = {}) {
  return updateIdea(id, { linkedSprint: String(sprintId).trim() }, options);
}

export async function exportIdeas({
  cwd = process.cwd(),
  project,
  status = "active",
} = {}) {
  const ideas = await listIdeas({ cwd, project, status });
  if (ideas.length === 0) {
    return "";
  }

  const reportProject = project || ideas[0].project || "project";
  const header = `## ${
    String(status || "active")
      .charAt(0)
      .toUpperCase() + String(status || "active").slice(1)
  } ideas for ${reportProject}`;

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
