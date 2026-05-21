import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import chalk from "chalk";
import ora from "ora";

import { ExperienceDb } from "../llm/experience-db.js";
import { PromptGenerator } from "../llm/prompt-generator.js";
import { buildGraph } from "../llm/knowledge-graph.js";
import { MistakeTracker } from "../llm/mistake-tracker.js";
import { DocumentIngester } from "../llm/document-ingester.js";
import { sendPrompt, listResponses, ensureBrowserDirs } from "../browser-bridge.js";
import { defaultStagedSignalsDir, parseFrontmatter, splitStagedSignalDocuments } from "../vscode-learn-utils.js";

async function loadConfigForLlm(options) {
  const { loadConfig } = await import("../config.js");
  const config = await loadConfig();
  if (options?.baseDir) {
    return { ...config, baseDir: path.resolve(options.baseDir) };
  }
  return config;
}

export async function listStagedFiles(stagingDir) {
  try {
    const files = await fs.readdir(stagingDir, { withFileTypes: true });
    return files.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => path.join(stagingDir, entry.name));
  } catch {
    return [];
  }
}

function tagsForStagedSignal(sourceType) {
  if (sourceType === "vscode-edit") return ["editor", "file-save"];
  if (sourceType === "vscode-diagnostic" || sourceType === "vscode-diagnostic-recurring") return ["editor", "diagnostic"];
  if (sourceType === "vscode-git") return ["editor", "git"];
  if (sourceType === "vscode-task-error") return ["editor", "task-error"];
  return ["editor"];
}

async function writeTempStagedDocument(stageFile, index, documentText) {
  const tempPath = path.join(
    path.dirname(stageFile),
    `${path.basename(stageFile, ".md")}-${index + 1}-${Date.now()}.signal.md`
  );
  await fs.writeFile(tempPath, documentText, { encoding: "utf8", mode: 0o600 });
  return tempPath;
}

export async function ingestStagedSignalsFromDirectory(stageRoot, baseDir) {
  const files = await listStagedFiles(stageRoot);
  const ingester = new DocumentIngester({ baseDir });
  await ingester.initialize();
  const tracker = new MistakeTracker({ baseDir });
  const results = [];
  for (const filePath of files) {
    let fileFailed = false;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const documents = splitStagedSignalDocuments(raw);
      for (let index = 0; index < documents.length; index += 1) {
        const documentText = documents[index];
        const { data } = parseFrontmatter(documentText);
        const sourceType = data.source_type || data.signal_type || "vscode-signal";
        const platform = data.platform || "vscode";
        const signalType = data.signal_type || "vscode-signal";
        const tempPath = await writeTempStagedDocument(filePath, index, documentText);
        try {
          const result = await ingester.ingestFile(tempPath, {
            source_type: sourceType,
            platform,
            fileTs: data.captured_at,
            tags: tagsForStagedSignal(sourceType),
            metadata: {
              tags: tagsForStagedSignal(sourceType),
              staged_file: path.basename(filePath),
              signal_type: signalType,
              source_file: data.file_path || null
            }
          });
          if (signalType === "vscode-diagnostic-recurring" || (sourceType === "vscode-diagnostic-recurring" && data.recurring === "true")) {
            await tracker.addMistake({
              description: data.message || data.description || `Recurring diagnostic detected in ${path.basename(filePath)}`,
              category: "vscode-diagnostic",
              fix_applied: data.fix_applied || "Resolve the recurring diagnostic and update the root cause.",
              root_cause: data.root_cause || data.message || "Recurring diagnostic marker"
            });
          }
          results.push({ file: filePath, chunkPath: tempPath, ...result });
        } catch (error) {
          fileFailed = true;
          results.push({ file: filePath, chunkPath: tempPath, chunks: 0, skipped: true, error: String(error?.message ?? error) });
        } finally {
          await fs.rm(tempPath, { force: true });
        }
      }
      if (!fileFailed) {
        await fs.rm(filePath, { force: true });
      }
    } catch (error) {
      results.push({ file: filePath, chunks: 0, skipped: true, error: String(error) });
    }
  }
  await ingester.db.close();
  return results;
}
import {
  addMistake,
  askLocalLlm,
  generatePrompt,
  importSprints,
  ingestDocuments,
  setupModel
} from "../local-llm.js";

import { verifyNodeLlamaCppInstalled } from "../llm/inference.js";
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
      try {
        await verifyNodeLlamaCppInstalled();
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
        return;
      }
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
      try {
        await verifyNodeLlamaCppInstalled();
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
        return;
      }
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
    .command("topics")
    .description("Run k-means topic clustering on document embeddings")
    .option("--k <number>", "Number of clusters", "5")
    .option("--json", "Output JSON")
    .action(async (options) => {
      const spinner = ora("Clustering documents...").start();
      try {
        const db = new ExperienceDb();
        await db.open();
        const k = Number.parseInt(options.k, 10) || 5;
        const { clusterDocuments } = await import("../llm/embeddings.js");
        const clusters = await clusterDocuments(db, k);
        if (clusters.length < k) {
          spinner.stop();
          console.warn(`Warning: only ${clusters.length} cluster(s) were produced because there are fewer documents with embeddings than requested clusters (${k}).`);
          if (options.json) {
            console.log(JSON.stringify({ clusters }, null, 2));
          } else {
            clusters.forEach((cluster, index) => {
              console.log(`Cluster ${index + 1}:`);
              cluster.snippets.forEach((snippet) => console.log(`  - ${snippet}`));
              console.log("");
            });
          }
          return;
        }
        spinner.stop();
        if (options.json) {
          console.log(JSON.stringify({ clusters }, null, 2));
          return;
        }
        clusters.forEach((cluster, index) => {
          console.log(`Cluster ${index + 1}:`);
          cluster.snippets.slice(0, 3).forEach((snippet) => console.log(`  - ${snippet}`));
          console.log("");
        });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("related")
    .description("Find related past documents, sprints, and prompt history")
    .requiredOption("--to <question>", "Question to relate to")
    .option("--json", "Output raw JSON")
    .action(async (options) => {
      try {
        await verifyNodeLlamaCppInstalled();
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
        return;
      }
      const spinner = ora("Finding related experience...").start();
      try {
        const generator = new PromptGenerator();
        const result = await generator.findRelated(options.to);
        spinner.stop();
        if (options.json) {
          console.log(JSON.stringify(result.raw, null, 2));
        } else {
          console.log(result.report);
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("export-knowledge-graph")
    .description("Export the local knowledge graph as JSON")
    .option("--out <path>", "Output file path")
    .action(async (options) => {
      const spinner = ora("Exporting knowledge graph...").start();
      try {
        const db = new ExperienceDb();
        await db.open();
        const ideaDir = path.join(os.homedir(), ".vscode-rotator", "ideas");
        const outPath = options.out ? path.resolve(options.out) : path.join(os.homedir(), ".vscode-rotator", "knowledge-graph.json");
        const result = await buildGraph(db, ideaDir, outPath);
        spinner.stop();
        console.log(`Knowledge graph exported to ${result.outputPath} — ${result.nodeCount} nodes, ${result.edgeCount} edges`);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  llm
    .command("enhance")
    .description("Generate an enhancement prompt and optionally send it to an online LLM")
    .requiredOption("--goal <goal>", "Enhancement goal")
    .option("--platform <name>", "Platform (chatgpt|claude|perplexity|gemini)", "chatgpt")
    .option("--project <name>", "Project name")
    .option("--auto", "Send prompt automatically via browser bridge", false)
    .option("--rate", "Ask for response quality rating after capture", false)
    .option("--base-dir <dir>", "Local storage base directory")
    .action(async (options) => {
      const spinner = ora("Generating enhancement prompt...").start();
      try {
        const result = await generatePrompt({
          goal: options.goal,
          platform: options.platform,
          project: options.project,
          baseDir: options.baseDir,
          skipHistory: true
        });

        spinner.succeed("Prompt generated");
        console.log(result.prompt);

        let responseFile = null;
        const platform = options.platform;

        if (options.auto) {
          await ensureBrowserDirs();
          spinner.start(`Sending prompt to ${platform}...`);

          const sendResult = await sendPrompt({
            platform,
            prompt: result.prompt,
            browserType: "chromium",
            headless: false,
            dryRun: false
          });

          responseFile = sendResult.responsePath;
          const ingester = new DocumentIngester({ baseDir: options.baseDir });
          await ingester.ingestFile(responseFile, { source_type: "llm-response", platform });
          spinner.succeed(`Response captured to ${responseFile}`);
        } else {
          const previous = await listResponses({ platform, limit: 1 });
          const previousFilename = previous[0]?.filename;

          console.log(chalk.yellow("Prompt copied to clipboard. Send it to the target platform and save the response file to ~/.vscode-rotator/browser-responses/."));
          await prompt("Press Enter when the response file is available...");

          const latest = await listResponses({ platform, limit: 1 });
          if (!latest[0]) {
            throw new Error("No response detected. Ensure a response file exists in ~/.vscode-rotator/browser-responses/.");
          }
          if (latest[0].filename === previousFilename) {
            throw new Error("No new response detected. Please save a new response file before continuing.");
          }

          responseFile = latest[0].filepath;
          const ingester = new DocumentIngester({ baseDir: options.baseDir });
          await ingester.ingestFile(responseFile, { source_type: "llm-response", platform });
          spinner.succeed(`Detected response file ${latest[0].filename}`);
        }

        const db = new ExperienceDb({ baseDir: options.baseDir });
        await db.open();
        const history = await db.logEnhanceCycle({
          goal: options.goal,
          platform,
          promptText: result.prompt,
          responseFile,
          cycleTs: new Date().toISOString(),
          rating: null
        });

        if (options.rate) {
          const ratingValue = await prompt("Rate this response 1–5 (or press Enter to skip): ");
          if (ratingValue) {
            const rating = parseRating(ratingValue);
            await db.ratePromptHistory(history.id, rating);
          }
        }

        await db.close();
        console.log(chalk.green(`Logged enhancement cycle #${history.id}`));
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

  llm
    .command("ingest-staged")
    .description("Ingest staged VS Code learning signals from markdown files")
    .argument("[stagedDir]", "Optional path to the staged signals directory")
    .option("--base-dir <dir>", "Local storage base directory")
    .action(async (stagedDir, options) => {
      try {
        await verifyNodeLlamaCppInstalled();
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
        return;
      }
      const spinner = ora("Ingesting staged VS Code signals...").start();
      try {
        const config = await loadConfigForLlm(options);
        const stageRoot = stagedDir ? path.resolve(stagedDir) : defaultStagedSignalsDir(config);
        const results = await ingestStagedSignalsFromDirectory(stageRoot, options.baseDir);
        spinner.succeed(`Ingested staged signals from ${stageRoot}`);
        if (results.length === 0) {
          console.log(`No staged signals found in ${stageRoot}`);
          return;
        }
        console.table(results.map((row) => ({ path: row.file, chunks: row.chunks, skipped: row.skipped ?? false, error: row.error ?? "" })));
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





