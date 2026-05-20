import fs from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";

import {
  ensureBrowserDirs,
  sendPrompt,
  comparePrompts,
  loadPromptLibrary,
  addPrompt,
  findPrompt,
  updatePrompt,
  deletePrompt,
  runPromptTemplate,
  loginToPage,
  listResponses,
  getResponseMetadata,
  clearResponses,
  tagResponse,
  captureThread,
  BROWSER_RESPONSES_DIR
} from "../browser-bridge.js";
import { DocumentIngester } from "../llm/document-ingester.js";

export async function captureAndIngest(platform, outputDir) {
  await ensureBrowserDirs();
  const result = await captureThread(platform, { outputDir });
  const ingester = new DocumentIngester();
  const ingestResult = await ingester.ingestThread(result.filePath, { platform: result.platform });
  return { filename: result.filename, turns: result.turns, platform: result.platform, filePath: result.filePath, chunksIngested: ingestResult.chunks };
}

function accumulate(value, previous) {
  return previous.concat(value);
}

function parseVariables(variables) {
  const result = {};
  for (const varStr of variables) {
    const [key, value] = varStr.split("=");
    if (!key || !value) {
      throw new Error(`Invalid variable format: ${varStr}. Use key=value`);
    }
    result[key.trim()] = value.trim();
  }
  return result;
}

export function bindBrowserCommands(program) {
  const browser = program.command("browser").description("Multi-LLM browser communicator");

  // Send command
  browser
    .command("send")
    .description("Send a prompt to an LLM via browser")
    .requiredOption("--platform <name>", "Platform (chatgpt|claude|perplexity|gemini)")
    .option("--prompt <text>", "Prompt text")
    .option("--file <path>", "Read prompt from file")
    .option("--browser <type>", "Browser type (chromium|firefox)", "chromium")
    .option("--headless", "Run in headless mode", false)
    .option("--dry-run", "Show what would be sent without opening browser", false)
    .action(async (options) => {
      const spinner = ora("Preparing...").start();
      try {
        await ensureBrowserDirs();

        let prompt = options.prompt;

        if (options.file) {
          spinner.text = "Reading prompt file...";
          prompt = await fs.readFile(options.file, "utf8");
        }

        if (!prompt) {
          throw new Error("Prompt text or --file required");
        }

        spinner.text = `Sending to ${options.platform}...`;

        const result = await sendPrompt({
          platform: options.platform,
          prompt,
          browserType: options.browser,
          headless: options.headless,
          dryRun: options.dryRun
        });

        if (result.dryRun) {
          spinner.succeed(chalk.yellow(result.message));
          console.log(chalk.gray(`\nPrompt:\n${prompt}`));
        } else {
          spinner.succeed(`Response saved to ${result.responsePath}`);
          console.log(chalk.cyan(`\nResponse:\n${result.response}`));
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // Compare command
  browser
    .command("compare")
    .description("Send same prompt to multiple platforms and compare")
    .requiredOption("--prompt <text>", "Prompt text")
    .requiredOption("--platforms <list>", "Comma-separated platform list (chatgpt,claude,perplexity,gemini)")
    .option("--browser <type>", "Browser type (chromium|firefox)", "chromium")
    .option("--headless", "Run in headless mode", false)
    .option("--dry-run", "Show what would be sent", false)
    .action(async (options) => {
      const spinner = ora("Preparing comparison...").start();
      try {
        await ensureBrowserDirs();

        const platforms = options.platforms
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);

        if (platforms.length === 0) {
          throw new Error("At least one platform required");
        }

        spinner.text = `Comparing across ${platforms.length} platform(s)...`;

        const result = await comparePrompts({
          prompt: options.prompt,
          platforms,
          browserType: options.browser,
          headless: options.headless,
          dryRun: options.dryRun
        });

        if (result.dryRun) {
          spinner.succeed(chalk.yellow(result.message));
        } else {
          spinner.succeed(`Comparison report saved to ${result.reportPath}`);
          for (const r of result.results) {
            if (r.error) {
              console.log(chalk.red(`  ${r.platform}: ${r.error}`));
            } else {
              console.log(chalk.green(`  ${r.platform}: OK`));
            }
          }
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // Prompt library commands
  const prompts = browser.command("prompts").description("Manage prompt library");

  prompts
    .command("list")
    .description("List saved prompts")
    .action(async () => {
      const spinner = ora("Loading prompts...").start();
      try {
        const library = await loadPromptLibrary();
        spinner.stop();

        if (library.length === 0) {
          console.log(chalk.yellow("No prompts saved yet."));
          return;
        }

        console.table(
          library.map((p) => ({
            id: p.id.slice(0, 8),
            name: p.name,
            platforms: p.platforms.join(","),
            tags: p.tags.join(","),
            lastUsed: p.lastUsed ? p.lastUsed.slice(0, 10) : "—"
          }))
        );
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  prompts
    .command("view <id>")
    .description("View a prompt by id")
    .action(async (id) => {
      try {
        const prompt = await findPrompt(id);
        console.log(chalk.cyan("Template:"));
        console.log(prompt.template);
        console.log(chalk.cyan("\nMetadata:"));
        console.log(`  Name: ${prompt.name}`);
        console.log(`  Tags: ${prompt.tags.join(", ") || "—"}`);
        console.log(`  Platforms: ${prompt.platforms.join(", ") || "—"}`);
        console.log(`  Last used: ${prompt.lastUsed ? prompt.lastUsed.slice(0, 10) : "—"}`);
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  prompts
    .command("add")
    .description("Add a prompt to the library")
    .requiredOption("--name <name>", "Prompt name")
    .option("--template <text>", "Prompt template")
    .option("--file <path>", "Read template from file")
    .option("--tag <tag>", "Tag", accumulate, [])
    .option("--platform <name>", "Platform", accumulate, [])
    .action(async (options) => {
      const spinner = ora("Adding prompt...").start();
      try {
        let template = options.template;

        if (options.file) {
          spinner.text = "Reading template file...";
          template = await fs.readFile(options.file, "utf8");
        }

        if (!template) {
          throw new Error("Template text or --file required");
        }

        const prompt = await addPrompt({
          name: options.name,
          template,
          tags: options.tag || [],
          platforms: options.platform || []
        });

        spinner.succeed(`Prompt added: ${chalk.cyan(prompt.id.slice(0, 8))}`);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  prompts
    .command("run <id>")
    .description("Run a prompt template")
    .requiredOption("--platform <name>", "Target platform")
    .option("--var <key=value>", "Template variable", accumulate, [])
    .option("--dry-run", "Show substituted text without sending", false)
    .action(async (id, options) => {
      const spinner = ora("Preparing...").start();
      try {
        const variables = parseVariables(options.var);

        spinner.text = `Running prompt ${id.slice(0, 8)}...`;

        const result = await runPromptTemplate({
          promptId: id,
          platform: options.platform,
          variables,
          dryRun: options.dryRun
        });

        if (result.dryRun) {
          spinner.succeed("Template expanded (dry-run)");
          console.log(chalk.cyan(`\n${result.prompt}`));
        } else {
          spinner.succeed(`Response saved`);
          console.log(chalk.cyan(`\nResponse:\n${result.response}`));
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  prompts
    .command("delete <id>")
    .description("Delete a prompt from library")
    .action(async (id) => {
      const spinner = ora("Deleting...").start();
      try {
        await deletePrompt(id);
        spinner.succeed("Prompt deleted");
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // Login command
  browser
    .command("login")
    .description("Log in to a platform and save credentials")
    .requiredOption("--platform <name>", "Platform (chatgpt|claude|perplexity|gemini)")
    .option("--browser <type>", "Browser type (chromium|firefox)", "chromium")
    .option("--timeout <ms>", "Max wait time", "60000")
    .action(async (options) => {
      const spinner = ora("Launching browser...").start();
      try {
        spinner.stop();
        await ensureBrowserDirs();

        const result = await loginToPage({
          platform: options.platform,
          browserType: options.browser,
          timeout: parseInt(options.timeout, 10)
        });

        console.log(chalk.green(`✓ ${result.message}`));
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  browser
    .command("capture")
    .description("Capture a full conversation thread from a browser tab")
    .requiredOption("--platform <name>", "Platform (chatgpt|claude|perplexity|gemini)")
    .option("--thread", "Capture a full thread", false)
    .option("--output-dir <path>", "Directory to save thread file")
    .action(async (options) => {
      const spinner = ora(`Capturing conversation thread from ${options.platform}...`).start();
      try {
        if (!options.thread) {
          throw new Error("--thread is required for browser capture");
        }

        const { filename, turns, platform, chunksIngested } = await captureAndIngest(
          options.platform,
          options.outputDir || undefined
        );

        spinner.succeed(`Captured ${turns.length} turns from ${platform}.`);
        console.log(chalk.green(`Ingested ${chunksIngested} chunks.`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // Responses command
  const responses = browser.command("responses").description("Manage captured responses");

  responses
    .command("list")
    .description("List recent responses")
    .option("--platform <name>", "Filter by platform")
    .option("--limit <n>", "Number to show", "10")
    .action(async (options) => {
      const spinner = ora("Loading responses...").start();
      try {
        const list = await listResponses({
          platform: options.platform,
          limit: parseInt(options.limit, 10)
        });

        spinner.stop();

        if (list.length === 0) {
          console.log(chalk.yellow("No responses found."));
          return;
        }

        console.table(
          list.map((r) => ({
            filename: r.filename,
            size: `${Math.round(r.content.length / 1024)}KB`
          }))
        );
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  responses
    .command("view <filename>")
    .description("View a response")
    .action(async (filename) => {
      try {
        const response = await getResponseMetadata(filename);
        process.stdout.write(response.content + "\n");
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  responses
    .command("clear")
    .description("Delete old responses")
    .option("--platform <name>", "Platform filter")
    .option("--older-than-days <n>", "Age threshold")
    .action(async (options) => {
      const spinner = ora("Clearing responses...").start();
      try {
        const result = await clearResponses({
          platform: options.platform,
          olderThanDays: options.olderThanDays
            ? parseInt(options.olderThanDays, 10)
            : null
        });

        spinner.succeed(`Deleted ${result.deleted} response(s)`);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  responses
    .command("tag <filename>")
    .description("Tag a captured response with quality and optional notes")
    .requiredOption("--quality <quality>", "Quality rating (good|bad|partial)")
    .option("--notes <notes>", "Notes for the response")
    .action(async (filename, options) => {
      const spinner = ora("Tagging response...").start();
      try {
        const result = await tagResponse(filename, {
          quality: options.quality,
          notes: options.notes
        });

        spinner.succeed(`Tagged ${result.filename} as ${result.quality}.`);
        if (result.mistakeCreated) {
          console.log(chalk.red(`Mistake recorded: "${result.notes}"`));
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  responses
    .command("capture")
    .description("Capture a full conversation thread from a browser tab")
    .requiredOption("--platform <name>", "Platform (chatgpt|claude|perplexity|gemini)")
    .option("--output-dir <path>", "Directory to save thread file")
    .action(async (options) => {
      const spinner = ora(`Capturing conversation thread from ${options.platform}...`).start();
      try {
        const { filename, turns, platform, chunksIngested } = await captureAndIngest(
          options.platform,
          options.outputDir || undefined
        );

        spinner.succeed(`Captured ${turns.length} turns from ${platform}.`);
        console.log(chalk.green(`Ingested ${chunksIngested} chunks.`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  responses
    .command("dir")
    .description("Show responses directory")
    .action(() => {
      console.log(chalk.cyan(BROWSER_RESPONSES_DIR));
    });
}
