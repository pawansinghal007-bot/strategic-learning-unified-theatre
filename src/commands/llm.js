import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import chalk from "chalk";
import ora from "ora";

import { ExperienceDb } from "../llm/experience-db.js";
import { MistakeTracker } from "../llm/mistake-tracker.js";
import {
  addMistake,
  askLocalLlm,
  generatePrompt,
  importSprints,
  ingestDocuments,
  setupModel
} from "../local-llm.js";

function parseRating(value) {
  const rating = Number.parseInt(String(value), 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer from 1 to 5.");
  }
  return rating;
}

async function prompt(label) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}

export async function bindLlmCommands(program) {
  const llm = program.command("llm").description("Local Dev-LLM setup, ingestion, and prompt generation");

  llm
    .command("setup")
    .description("Download or register a local GGUF model and run a smoke test")
    .option("--model <name>", "phi3, tinyllama, or custom", "phi3")
    .option("--model-path <path>", "Path to an existing .gguf model")
    .option("--base-dir <dir>", "Local storage base directory")
    .action(async (options) => {
      const spinner = ora("Preparing local model...").start();
      try {
        const result = await setupModel({
          model: options.model,
          modelPath: options.modelPath,
          baseDir: options.baseDir
        });
        spinner.succeed("Local model ready");
        console.log(chalk.gray(result.modelPath));
        console.log(`SHA256: ${result.sha256}`);
        console.log(chalk.bold("Smoke test:"));
        console.log(result.response);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("ask")
    .description("Ask the local LLM a question")
    .option("--system <prompt>", "System prompt")
    .option("--model-path <path>", "Use a specific local .gguf model")
    .option("--base-dir <dir>", "Local storage base directory")
    .argument("<question>", "Question to ask")
    .action(async (question, options) => {
      const spinner = ora("Thinking locally...").start();
      try {
        const response = await askLocalLlm({
          question,
          system: options.system,
          modelPath: options.modelPath,
          baseDir: options.baseDir
        });
        spinner.stop();
        console.log(response);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("generate-prompt")
    .description("Generate an implementation-ready prompt using local experience context")
    .requiredOption("--goal <goal>", "Implementation goal")
    .option("--platform <name>", "claude or chatgpt", "chatgpt")
    .option("--project <name>", "Project name")
    .option("--base-dir <dir>", "Local storage base directory")
    .action(async (options) => {
      const spinner = ora("Building local context...").start();
      try {
        const result = await generatePrompt({
          goal: options.goal,
          platform: options.platform,
          project: options.project,
          baseDir: options.baseDir
        });
        spinner.succeed(`Generated prompt #${result.history.id}`);
        console.log(result.prompt);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("ingest")
    .description("Incrementally ingest documents from the R1 storage snapshot")
    .argument("[target]", "Optional specific file or folder")
    .option("--force", "Re-ingest all ingestible snapshot files")
    .option("--base-dir <dir>", "Local storage base directory")
    .action(async (target, options) => {
      const spinner = ora("Ingesting documents...").start();
      try {
        const result = await ingestDocuments({
          targetPath: target,
          force: Boolean(options.force),
          baseDir: options.baseDir
        });
        spinner.succeed("Ingestion complete");
        if (Array.isArray(result)) {
          console.table(result.map((row) => ({ path: row.path, chunks: row.chunks, skipped: row.skipped })));
        } else {
          console.table(result.actions.map((row) => ({ type: row.type, path: row.path, chunks: row.chunks })));
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  const mistake = llm.command("mistake").description("Capture recurring sprint mistakes");
  mistake
    .command("add")
    .requiredOption("--description <text>", "Mistake description")
    .option("--category <name>", "Mistake category", "general")
    .option("--fix <text>", "Fix applied", "")
    .option("--root-cause <text>", "Root cause", "")
    .action(async (options) => {
      const spinner = ora("Recording mistake...").start();
      try {
        const result = await addMistake({
          description: options.description,
          category: options.category,
          fix: options.fix,
          root_cause: options.rootCause
        });
        spinner.succeed(result.promoted ? "Mistake promoted to rubric" : "Mistake recorded");
        console.log(`Mistake #${result.mistake.id}, recurrence ${result.mistake.recurrence_count}`);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  const rubric = llm.command("rubric").description("Manage prompt rubric rules");
  rubric
    .command("list")
    .action(async () => {
      const tracker = new MistakeTracker();
      try {
        const rules = await tracker.listRubric();
        if (rules.length === 0) {
          console.log(chalk.yellow("No rubric rules."));
          return;
        }
        console.table(rules.map((rule) => ({ id: rule.id, active: rule.active, category: rule.category, rule: rule.rule })));
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  rubric
    .command("disable")
    .argument("<id>")
    .action(async (id) => {
      const tracker = new MistakeTracker();
      try {
        await tracker.setRubricActive(id, false);
        console.log(chalk.green("Disabled."));
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  rubric
    .command("enable")
    .argument("<id>")
    .action(async (id) => {
      const tracker = new MistakeTracker();
      try {
        await tracker.setRubricActive(id, true);
        console.log(chalk.green("Enabled."));
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("import-sprints")
    .description("Import R2 sprint handoffs into the experience database")
    .option("--base-dir <dir>", "Local storage base directory")
    .action(async (options) => {
      const spinner = ora("Importing sprint history...").start();
      try {
        const result = await importSprints({ baseDir: options.baseDir });
        spinner.succeed(`Imported ${result.imported} sprints`);
        console.log(`Mistakes extracted: ${result.mistakes}`);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("rate-prompt")
    .argument("<id>", "Prompt history id")
    .requiredOption("--rating <n>", "Rating from 1 to 5")
    .action(async (id, options) => {
      const spinner = ora("Saving rating...").start();
      try {
        const rating = parseRating(options.rating);
        const db = new ExperienceDb();
        await db.open();
        await db.ratePrompt(id, rating);
        await db.close();
        spinner.succeed("Rating saved");
        if (rating <= 2) {
          const description = await prompt("What went wrong? ");
          if (description) {
            await addMistake({
              description,
              category: "prompt-quality",
              fix: "Refine prompt generation context and rubric."
            });
          }
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });
  registerStatus(llm);
}

// status command - added by verify-sprints fix
export function registerStatus(parent) {
  parent
    .command('status')
    .description('Show local LLM status (model path, loaded state)')
    .action(async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const modelDir = path.default.join(os.default.homedir(), '.vscode-rotator', 'models');
      const exists = fs.default.existsSync(modelDir);
      const models = exists ? fs.default.readdirSync(modelDir).filter(f => f.endsWith('.gguf')) : [];
      console.log(`Model dir : ${modelDir}`);
      console.log(`Models    : ${models.length === 0 ? 'none' : models.join(', ')}`);
      console.log(`Status    : ${models.length > 0 ? 'ready' : 'no model downloaded - run: llm setup'}`);
    });
}




