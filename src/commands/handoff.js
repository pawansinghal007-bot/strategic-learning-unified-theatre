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
  getActiveSprint
} from "../agent-handoff.js";

function parseInteger(value) {
  return Number.parseInt(value, 10);
}

function accumulate(value, previous) {
  return previous.concat(value);
}

function truncate(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

export function bindHandoffCommands(program) {
  const handoff = program.command("handoff").description("Track agent sprint handoff state");

  handoff
    .command("create")
    .description("Create a new agent sprint manifest")
    .requiredOption("--goal <goal>", "Sprint goal")
    .option("--agent <agent>", "Agent name (claude|chatgpt|gemini|perplexity|other)", "other")
    .option("--model <model>", "Model name", "unknown")
    .option("--limit <n>", "Token limit", "0")
    .option("--status <status>", "Initial sprint status", "active")
    .action(async (options) => {
      const spinner = ora("Creating sprint...").start();
      try {
        const sprint = await createSprint({
          agent: options.agent,
          model: options.model,
          goal: options.goal,
          tokensLimit: parseInteger(options.limit),
          status: options.status
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
        const warnings = [];

        if (options.tokensUsed !== undefined || options.tokensLimit !== undefined) {
          const result = await setTokenBudget(sprintId, {
            tokensUsed: options.tokensUsed !== undefined ? parseInteger(options.tokensUsed) : sprint.tokensUsed,
            tokensLimit: options.tokensLimit !== undefined ? parseInteger(options.tokensLimit) : sprint.tokensLimit
          });
          sprint = result.sprint;
          warnings.push(...result.warnings);
        }

        if (options.addTask.length > 0) {
          for (const desc of options.addTask) {
            sprint = await addPendingTask(sprintId, desc, parseInteger(options.priority));
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
        const sprint = await closeSprint(sprintId, options.status);
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
        process.stdout.write(sprint.resumePrompt + "\n");
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
