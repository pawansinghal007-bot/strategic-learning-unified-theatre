import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import chalk from "chalk";
import ora from "ora";

import {
  createIdea,
  findIdeaById,
  listIdeas,
  markIdeaDone,
  linkIdeaToSprint,
  exportIdeas
} from "../idea-store.js";
import { IdeaPrioritySchema } from "../domain/schemas.js";
import { DomainError } from "../error.js";

function accumulate(value, previous) {
  return previous.concat(value);
}

function formatValidationError(err) {
  if (Array.isArray(err?.issues)) {
    return err.issues.map((issue) => issue.message).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

function parseIdeaPriority(value) {
  try {
    return IdeaPrioritySchema.parse(Number(value));
  } catch (err) {
    throw new DomainError(
      "ROTATOR_CLI_INVALID",
      `ROTATOR_CLI_INVALID: Invalid --priority: ${formatValidationError(err)}`,
      { err: formatValidationError(err), option: "--priority" }
    );
  }
}

function promptFactory() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  return {
    async ask(label) {
      const answer = await rl.question(label);
      return answer.trim();
    },
    close() {
      rl.close();
    }
  };
}

async function promptForValue(label) {
  const prompter = promptFactory();
  try {
    const answer = await prompter.ask(label);
    return answer;
  } finally {
    prompter.close();
  }
}

async function getBodyWithEditor(template) {
  const editor = process.env.EDITOR;
  if (!editor) return null;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "strategic-learning-unified-theatre-idea-"));
  const tempFile = path.join(tempDir, "idea.md");
  await fs.writeFile(tempFile, template, "utf8");

  const result = spawnSync(editor, [tempFile], {
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  const body = await fs.readFile(tempFile, "utf8");
  await fs.rm(tempDir, { recursive: true, force: true });
  return body.trim();
}

async function askBodyInline(prompter) {
  console.log("Enter idea body. Finish with an empty line.");
  const lines = [];
  while (true) {
    const line = await prompter.ask("");
    if (!line) break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

export async function bindIdeaCommands(program) {
  const idea = program.command("idea").description("Manage structured idea files");

  idea
    .command("add")
    .description("Add a new idea as a structured Markdown file")
    .option("--project <name>", "Project name")
    .option("--tag <tag>", "Tag for the idea", accumulate, [])
    .option("--priority <n>", "Priority level", "3")
    .action(async (options) => {
      const spinner = ora("Preparing idea...").start();
      let created = null;
      try {
        const priority = parseIdeaPriority(options.priority);
        spinner.stop();
        const title = await promptForValue("Title: ");
        let body = "";
        const editor = process.env.EDITOR;
        if (editor) {
          const template = `# ${title}\n\nDescribe the idea here...\n`;
          body = await getBodyWithEditor(template);
        }

        if (!body) {
          const prompter = promptFactory();
          try {
            body = await askBodyInline(prompter);
          } finally {
            prompter.close();
          }
        }

        if (!body.trim()) {
          throw new Error("Idea body is required.");
        }

        const ideaDoc = await createIdea({
          project: options.project,
          tags: options.tag,
          priority,
          body: `# ${title}\n\n${body}`
        });
        console.log(chalk.green("Created idea:"), chalk.cyan(ideaDoc.id));
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  idea
    .command("list")
    .description("List ideas in the current project or global inbox")
    .option("--project <name>", "Project filter")
    .option("--tag <tag>", "Tag filter")
    .option("--status <status>", "Status filter")
    .action(async (options) => {
      const spinner = ora("Loading ideas...").start();
      try {
        const ideas = await listIdeas({
          project: options.project,
          status: options.status,
          tag: options.tag
        });
        spinner.stop();
        if (ideas.length === 0) {
          console.log(chalk.yellow("No ideas found."));
          return;
        }
        console.table(
          ideas.map((idea) => ({
            id: idea.id,
            project: idea.project,
            status: idea.status,
            priority: idea.priority,
            tags: idea.tags.join(", "),
            created: idea.created.slice(0, 10)
          }))
        );
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  idea
    .command("view")
    .description("View an idea by id")
    .argument("<id>", "Idea id")
    .action(async (id) => {
      try {
        const idea = await findIdeaById(id);
        const raw = await fs.readFile(idea.filePath, "utf8");
        process.stdout.write(raw + "\n");
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  idea
    .command("link")
    .description("Link an idea to a sprint")
    .argument("<id>", "Idea id")
    .requiredOption("--sprint <sprintId>", "Sprint id")
    .action(async (id, options) => {
      const spinner = ora("Linking idea...").start();
      try {
        await linkIdeaToSprint(id, options.sprint);
        spinner.succeed("Idea linked to sprint");
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  idea
    .command("done")
    .description("Mark an idea as done")
    .argument("<id>", "Idea id")
    .action(async (id) => {
      const spinner = ora("Marking idea done...").start();
      try {
        await markIdeaDone(id);
        spinner.succeed("Idea marked done");
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  idea
    .command("export")
    .description("Export ideas as concatenated Markdown for prompt ingestion")
    .option("--project <name>", "Project filter")
    .option("--status <status>", "Status filter", "active")
    .action(async (options) => {
      try {
        const output = await exportIdeas({
          project: options.project,
          status: options.status
        });
        process.stdout.write(output + "\n");
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });
}
