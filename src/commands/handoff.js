import chalk from "chalk";
import ora from "ora";

import {
  createSprint,
  loadSprint,
  listSprints,
  addPendingTask,
  completeTask,
  addBlocker,
  closeSprint,
  setTokenBudget,
  generateResumePrompt
} from "../agent-handoff.js";
import { HandoffStatusSchema, PositiveIntSchema } from "../domain/schemas.js";
import { DomainError } from "../error.js";

function formatValidationError(err) {
  if (Array.isArray(err?.issues)) {
    return err.issues.map((issue) => issue.message).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

function createCliInvalidError(option, err) {
  return new DomainError(
    "ROTATOR_CLI_INVALID",
    `ROTATOR_CLI_INVALID: Invalid ${option}: ${formatValidationError(err)}`,
    { err: formatValidationError(err), option }
  );
}

function parsePositiveInt(value, option) {
  try {
    return PositiveIntSchema.parse(Number(value));
  } catch (err) {
    throw createCliInvalidError(option, err);
  }
}

function parseHandoffStatus(value, option = "--status") {
  try {
    return HandoffStatusSchema.parse(value);
  } catch (err) {
    throw createCliInvalidError(option, err);
  }
}

function accumulate(value, previous) {
  return previous.concat(value);
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

async function handleUpdateTokenBudget(sprintId, options, sprint, warnings) {
  if (options.tokensUsed === undefined && options.tokensLimit === undefined) {
    return { sprint, warnings };
  }
  const result = await setTokenBudget(sprintId, {
    tokensUsed: options.tokensUsed === undefined ? sprint.tokensUsed : parsePositiveInt(options.tokensUsed, "--tokens-used"),
    tokensLimit: options.tokensLimit === undefined ? sprint.tokensLimit : parsePositiveInt(options.tokensLimit, "--tokens-limit")
  });
    sprint = result.sprint;
    warnings.push(...result.warnings);
  return { sprint, warnings };
}

export function bindHandoffCommands(program) {
  const handoff = program.command("handoff").description("Track agent sprint handoff state");

  handoff
    .command("create")
    .description("Create a new agent sprint manifest")
    .requiredOption("--goal <goal>", "Sprint goal")
    .option("--agent <agent>", "Agent name (claude|chatgpt|gemini|perplexity|other)", "other")
    .option("--model <model>", "Model name", "unknown")
    .option("--limit <n>", "Token limit", "1")
    .option("--status <status>", "Initial sprint status", "active")
    .action(async (options) => {
      const spinner = ora("Creating sprint...").start();
      try {
        const sprint = await createSprint({
          agent: options.agent,
          model: options.model,
          goal: options.goal,
          tokensLimit: parsePositiveInt(options.limit, "--limit"),
          status: parseHandoffStatus(options.status)
        });
        spinner.succeed("Sprint created");
        console.log(chalk.green(sprint.sprintId));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  handoff
    .command("update")
    .description("Update sprint progress and token usage")
    .argument("<sprintId>", "Sprint id")
    .option("--tokens-used <n>", "Tokens used")
    .option("--tokens-limit <n>", "Tokens limit")
    .option("--add-task <desc>", "Add pending task", accumulate, [])
    .option("--priority <n>", "Priority for added tasks", "3")
    .option("--complete-task <id>", "Mark pending task complete", accumulate, [])
    .option("--add-blocker <desc>", "Add blocker", accumulate, [])
    .action(async (sprintId, options) => {
      const spinner = ora("Updating sprint...").start();
      try {
        let sprint = await loadSprint(sprintId);
        let warnings = [];
        
        ({ sprint, warnings } = await handleUpdateTokenBudget(sprintId, options, sprint, warnings));

        if (options.addTask.length > 0) {
          const priority = parsePositiveInt(options.priority, "--priority");
          for (const desc of options.addTask) {
            sprint = await addPendingTask(sprintId, desc, priority);
          }
        }

        if (options.completeTask.length > 0) {
          for (const taskId of options.completeTask) {
            sprint = await completeTask(sprintId, taskId);
          }
        }

        if (options.addBlocker.length > 0) {
          for (const desc of options.addBlocker) {
            sprint = await addBlocker(sprintId, desc);
          }
        }

        spinner.succeed("Sprint updated");
        for (const warning of warnings) {
          process.stderr.write(`${warning}\n`);
        }
        console.log(chalk.green(sprint.sprintId));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  handoff
    .command("close")
    .description("Close a sprint with final status")
    .argument("<sprintId>", "Sprint id")
    .requiredOption("--status <status>", "Sprint status (complete|paused|exhausted)")
    .action(async (sprintId, options) => {
      const spinner = ora("Closing sprint...").start();
      try {
        const sprint = await closeSprint(sprintId, parseHandoffStatus(options.status));
        spinner.succeed("Sprint closed");
        console.log(chalk.green(sprint.sprintId));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  handoff
    .command("resume")
    .description("Print the sprint resume prompt")
    .argument("<sprintId>", "Sprint id")
    .action(async (sprintId) => {
      try {
        const sprint = await loadSprint(sprintId);
        const resumePrompt = sprint.resumePrompt || generateResumePrompt(sprint);
        process.stdout.write(resumePrompt + "\n");
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  handoff
    .command("list")
    .description("List recent sprints")
    .action(async () => {
      try {
        const sprints = await listSprints();
        if (sprints.length === 0) {
          console.log(chalk.yellow("No sprints found."));
          return;
        }
        console.table(
          sprints.map((sprint) => ({
            sprintId: sprint.sprintId,
            date: sprint.date.slice(0, 10),
            agent: sprint.agent,
            model: sprint.model,
            goal: truncate(sprint.goal, 30),
            status: sprint.status,
            tokens: `${sprint.tokensUsed}/${sprint.tokensLimit}`
          }))
        );
      } catch (err) {
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });
}
