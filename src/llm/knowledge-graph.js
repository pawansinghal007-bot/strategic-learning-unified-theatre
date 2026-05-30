import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listIdeas } from "../idea-store.js";

function firstLine(text) {
  return (
    String(text || "")
      .split(/\r?\n/)
      .find((line) => String(line).trim())
      ?.trim() || "(no title)"
  );
}

async function writeAtomicJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tmpPath, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await fs.rename(tmpPath, filePath);
  } catch {
    await fs.unlink(filePath).catch(() => {});
    await fs.rename(tmpPath, filePath);
  }

  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // ignore chmod failures on platforms that do not support it
  }
}

export async function buildGraph(db, ideaDir, outputPath) {
  if (!db) {
    throw new Error("ExperienceDb instance is required.");
  }
  await db.open();

  const nodes = [];
  const edges = [];

  const sprintNodes = Array.isArray(db.state.sprints) ? db.state.sprints : [];
  sprintNodes.forEach((sprint) => {
    nodes.push({
      id: `sprint-${sprint.id}`,
      type: "sprint",
      title: sprint.goal || "(no goal)",
      meta: {
        status: sprint.status || null,
        startedAt: sprint.date || null,
      },
    });
  });

  const docNodes = Array.isArray(db.state.documents) ? db.state.documents : [];
  docNodes.forEach((doc) => {
    nodes.push({
      id: `document-${doc.id}`,
      type: "document",
      title:
        String(doc.content || "")
          .slice(0, 80)
          .replaceAll(/\s+/g, " ")
          .trim() || "(no content)",
      meta: {
        source_type: doc.source_type || null,
        platform: doc.platform || null,
        filename: doc.filename || null,
      },
    });
  });

  const mistakeNodes = Array.isArray(db.state.mistakes)
    ? db.state.mistakes
    : [];
  mistakeNodes.forEach((mistake) => {
    nodes.push({
      id: `mistake-${mistake.id}`,
      type: "mistake",
      title:
        String(mistake.description || "")
          .slice(0, 80)
          .replaceAll(/\s+/g, " ")
          .trim() || "(no description)",
      meta: {
        category: mistake.category || null,
      },
    });
  });

  const ruleNodes = Array.isArray(db.state.rubric_rules)
    ? db.state.rubric_rules
    : [];
  ruleNodes.forEach((rule) => {
    nodes.push({
      id: `rubricRule-${rule.id}`,
      type: "rubricRule",
      title:
        String(rule.rule || "")
          .slice(0, 80)
          .replaceAll(/\s+/g, " ")
          .trim() || "(no rule)",
      meta: {
        category: rule.category || null,
      },
    });
    if (rule.created_from_mistake_id != null) {
      edges.push({
        from: `mistake-${rule.created_from_mistake_id}`,
        to: `rubricRule-${rule.id}`,
        relation: "promotedTo",
      });
    }
  });

  const promptNodes = Array.isArray(db.state.prompt_history)
    ? db.state.prompt_history
    : [];
  promptNodes.forEach((prompt) => {
    nodes.push({
      id: `promptHistory-${prompt.id}`,
      type: "promptHistory",
      title:
        String(prompt.goal || prompt.prompt || "")
          .slice(0, 80)
          .replaceAll(/\s+/g, " ")
          .trim() || "(no prompt)",
      meta: {
        platform: prompt.platform || null,
        ts: prompt.cycle_ts || prompt.date || null,
      },
    });
    if (prompt.sprint_id != null) {
      edges.push({
        from: `promptHistory-${prompt.id}`,
        to: `sprint-${prompt.sprint_id}`,
        relation: "usedInSprint",
      });
    }
  });

  const threadNodes = Array.isArray(db.state.conversation_threads)
    ? db.state.conversation_threads
    : [];
  threadNodes.forEach((thread) => {
    nodes.push({
      id: `thread-${thread.id}`,
      type: "thread",
      title: String(thread.platform || "thread")
        .slice(0, 80)
        .replaceAll(/\s+/g, " ")
        .trim(),
      meta: {
        platform: thread.platform || null,
        capturedAt: thread.captured_at || null,
        turnCount: thread.turn_count ?? null,
        filePath: thread.file_path || null,
      },
    });
  });

  const ideaNodes = [];
  try {
    const ideaRoot = ideaDir
      ? path.dirname(path.dirname(ideaDir))
      : os.homedir();
    const ideas = await listIdeas({
      cwd: ideaRoot,
      status: undefined,
    });
    ideas.forEach((idea) => {
      ideaNodes.push({
        id: `idea-${idea.id}`,
        type: "idea",
        title: firstLine(idea.body),
        meta: {
          status: idea.status || null,
          linkedSprint: idea.linkedSprint || null,
          project: idea.project || null,
          tags: Array.isArray(idea.tags) ? idea.tags : [],
        },
      });
      if (idea.linkedSprint) {
        edges.push({
          from: `idea-${idea.id}`,
          to: `sprint-${idea.linkedSprint}`,
          relation: "linkedSprint",
        });
      }
    });
  } catch {
    // If ideas cannot be loaded, continue with the rest of the graph.
  }

  nodes.push(...ideaNodes);

  docNodes.forEach((doc) => {
    if (doc.source_type === "thread-turn") {
      const docThreadId = doc.thread_id ?? null;
      if (docThreadId != null) {
        edges.push({
          from: `document-${doc.id}`,
          to: `thread-${docThreadId}`,
          relation: "partOfThread",
        });
      } else if (doc.filename) {
        const matchingThread = threadNodes.find(
          (thread) => thread.file_path === doc.filename,
        );
        if (matchingThread) {
          edges.push({
            from: `document-${doc.id}`,
            to: `thread-${matchingThread.id}`,
            relation: "partOfThread",
          });
        }
      }
    }
  });

  const graph = {
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
  };

  const targetPath =
    outputPath ||
    path.join(os.homedir(), ".vscode-rotator", "knowledge-graph.json");
  await writeAtomicJson(targetPath, graph);
  return {
    outputPath: targetPath,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}
