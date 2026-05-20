import { spawnSync } from "node:child_process";

import { exportIdeas } from "../idea-store.js";
import { ExperienceDb } from "./experience-db.js";
import { EmbeddingProvider } from "./embeddings.js";
import { LocalLlmInference } from "./inference.js";

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function sprintSummary(sprint) {
  const completed = (sprint.completed_tasks ?? []).map((task) => task.description).join("; ") || "none";
  const pending = (sprint.pending_tasks ?? []).map((task) => task.description).join("; ") || "none";
  const failed = (sprint.tests_failed ?? []).map((test) => `${test.name}: ${test.error}`).join("; ") || "none";
  return `- ${sprint.date}: ${sprint.goal} [${sprint.status}]. Completed: ${completed}. Pending: ${pending}. Tests failed: ${failed}.`;
}

function clipboardWrite(text) {
  try {
    if (process.platform === "win32") {
      spawnSync("clip", { input: text });
    } else if (process.platform === "darwin") {
      spawnSync("pbcopy", { input: text });
    } else {
      spawnSync("xclip", ["-selection", "clipboard"], { input: text });
    }
  } catch {}
}

export class PromptGenerator {
  constructor({ baseDir, db, embeddings, inference, cwd = process.cwd() } = {}) {
    this.db = db ?? new ExperienceDb({ baseDir });
    this.embeddings = embeddings ?? new EmbeddingProvider();
    this.inference = inference ?? new LocalLlmInference({ baseDir });
    this.cwd = cwd;
  }

  async initialize() {
    await this.db.open();
    await this.embeddings.initialize();
    return this;
  }

  async buildContext({ goal, project, platform = null }) {
    await this.initialize();
    const targetPlatform = platform ?? "chatgpt";
    const queryEmbedding = await this.embeddings.embed(goal);
    const docs = await this.db.vectorSearchDocuments(queryEmbedding, 5);
    const recentResponses = platform ? await this.db.recentLlmResponseChunks(platform, 3) : [];
    const ideas = await exportIdeas({ project, status: "active", cwd: this.cwd });
    const sprints = await this.db.recentSprints(3);
    const rules = await this.db.listRubricRules({ activeOnly: true });
    const responseText = recentResponses.length
      ? `### Recent LLM Responses (platform: ${platform})\n\n${recentResponses
          .map((doc) => doc.content)
          .join("\n\n")}`
      : "";
    const documentText = docs
      .map((doc) => `### ${doc.filename}#${doc.chunk_index} (score ${doc.score.toFixed(2)})\n${doc.content}`)
      .join("\n\n");
    const docText = [responseText, documentText ? `### Project Documents\n\n${documentText}` : ""]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 9000);
    const ruleText = rules.map((rule) => `- ${rule.rule}`).join("\n") || "- None";

    const system = [
      `You are an expert software developer working on ${project || "this project"}.`,
      `Relevant documentation:\n${docText || "None indexed yet."}`,
      `Active ideas:\n${ideas || "None."}`,
      `Recent sprint history:\n${sprints.map(sprintSummary).join("\n") || "- None imported yet."}`,
      `Known mistakes to avoid:\n${ruleText}`,
      `Generate a detailed, implementation-ready prompt for: ${goal}`,
      `Target platform: ${targetPlatform}`
    ].join("\n\n");

    return { system, docs, ideas, sprints, rules };
  }

  async generate({ goal, project, platform = null }) {
    const targetPlatform = platform ?? "chatgpt";
    if (!goal || !String(goal).trim()) throw new Error("--goal is required");
    const context = await this.buildContext({ goal, project, platform });
    const prompt = await this.inference.generate({
      system: context.system,
      prompt: `Write the prompt now. Keep it structured, concrete, and ready to paste into ${targetPlatform}.`
    });
    const history = await this.db.addPromptHistory({
      platform: targetPlatform,
      prompt,
      response_summary: `Generated for goal: ${goal}`,
      tokens_estimated: estimateTokens(prompt)
    });
    await this.db.close();
    clipboardWrite(prompt);
    return { prompt, history, context };
  }
}
