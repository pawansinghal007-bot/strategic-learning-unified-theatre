import chalk from "chalk";
import ora from "ora";

import { MemoryDb } from "../ai-memory/memory-db.js";
import { SprintStateRepo } from "../ai-memory/repositories/sprint-state-repo.js";
import { HandoffRepo } from "../ai-memory/repositories/handoff-repo.js";
import { LessonsRepo } from "../ai-memory/repositories/lessons-repo.js";
import { DecisionsRepo } from "../ai-memory/repositories/decisions-repo.js";
import { TestBaselineRepo } from "../ai-memory/repositories/test-baseline-repo.js";
import { CommandsRepo } from "../ai-memory/repositories/commands-repo.js";

function safeJson(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [String(value)];
  }
}

function renderArray(label, items) {
  if (!items || items.length === 0) return `${label}: None`; 
  return `${label}: ${items.map((item) => String(item)).join(", ")}`;
}

function renderSummary({ currentSprint, handoff, latestBaseline, lessons = [], decisions = [], commands = [] }) {
  console.log(chalk.bold("AI Memory Snapshot"));
  console.log();
  if (currentSprint) {
    console.log(chalk.bold("Current sprint:"), currentSprint.sprint_name);
    console.log(chalk.bold("Status:"), currentSprint.status);
    console.log(chalk.bold("Goal:"), currentSprint.current_goal || "<none>");
    console.log(renderArray("Blockers", currentSprint.blockers));
    console.log(renderArray("Next steps", currentSprint.next_steps));
    console.log(chalk.bold("Updated:"), currentSprint.updated_at);
  } else {
    console.log(chalk.yellow("No sprint state available."));
  }
  console.log();
  if (handoff) {
    console.log(chalk.bold("Handoff summary:"));
    console.log(handoff.resume_summary || "<none>");
    console.log(renderArray("Completed steps", handoff.completed_steps));
    console.log(renderArray("Pending tasks", handoff.pending_tasks));
    console.log(chalk.bold("Last agent output:"), handoff.last_agent_output || "<none>");
    console.log(chalk.bold("Updated:"), handoff.updated_at);
  } else {
    console.log(chalk.yellow("No handoff state available."));
  }
  console.log();
  if (latestBaseline) {
    console.log(chalk.bold("Latest test baseline:"));
    console.log(`Recorded: ${latestBaseline.recorded_at}`);
    console.log(`Passing: ${latestBaseline.passing_tests}`);
    console.log(`Failing: ${latestBaseline.failing_tests}`);
    console.log(`Notes: ${latestBaseline.notes || "<none>"}`);
  } else {
    console.log(chalk.yellow("No test baseline recorded."));
  }
  console.log();
  if (decisions.length > 0) {
    console.log(chalk.bold("Recent architectural decisions:"));
    decisions.slice(0, 3).forEach((decision) => {
      console.log(`- ${decision.title} (${decision.created_at})`);
      if (decision.affected_files.length > 0) {
        console.log(`  files: ${decision.affected_files.join(", ")}`);
      }
    });
  } else {
    console.log(chalk.yellow("No architectural decisions recorded."));
  }
  console.log();
  if (lessons.length > 0) {
    console.log(chalk.bold("Recent lessons learned:"));
    lessons.slice(0, 3).forEach((lesson) => {
      console.log(`- ${lesson.problem} (${lesson.created_at})`);
    });
  } else {
    console.log(chalk.yellow("No lessons learned recorded."));
  }
  console.log();
  if (commands.length > 0) {
    console.log(chalk.bold("Recent PowerShell commands:"));
    commands.slice(0, 3).forEach((command) => {
      console.log(`- [${command.category}] ${command.powershell_command}`);
    });
  } else {
    console.log(chalk.yellow("No PowerShell commands recorded."));
  }
}

async function createDbContext() {
  const db = new MemoryDb();
  await db.init();
  return {
    db,
    sprintRepo: new SprintStateRepo(db),
    handoffRepo: new HandoffRepo(db),
    lessonsRepo: new LessonsRepo(db),
    decisionsRepo: new DecisionsRepo(db),
    baselineRepo: new TestBaselineRepo(db),
    commandsRepo: new CommandsRepo(db)
  };
}

export function bindAiCommands(program) {
  const ai = program.command("ai").description("AI memory persistence commands");

  ai.command("snapshot")
    .description("Print compact operational AI memory summary")
    .action(async () => {
      const spinner = ora("Loading AI memory...").start();
      let context;
      try {
        context = await createDbContext();
        spinner.stop();
        const currentSprint = context.sprintRepo.getLatest();
        const handoff = context.handoffRepo.getLatest();
        const latestBaseline = context.baselineRepo.getLatest();
        const decisions = context.decisionsRepo.list();
        const lessons = context.lessonsRepo.list();
        const commands = context.commandsRepo.list();
        renderSummary({ currentSprint, handoff, latestBaseline, lessons, decisions, commands });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  ai.command("resume")
    .description("Print compact AI memory resume snapshot")
    .action(async () => {
      const spinner = ora("Loading resume state...").start();
      let context;
      try {
        context = await createDbContext();
        spinner.stop();
        const currentSprint = context.sprintRepo.getLatest();
        const handoff = context.handoffRepo.getLatest();
        const latestBaseline = context.baselineRepo.getLatest();
        const decisions = context.decisionsRepo.list();
        const lessons = context.lessonsRepo.list();
        const commands = context.commandsRepo.list();
        renderSummary({ currentSprint, handoff, latestBaseline, lessons, decisions, commands });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  const lessons = ai.command("lessons").description("Manage AI lessons learned");

  lessons.command("add")
    .description("Add an AI lesson learned")
    .requiredOption("--problem <problem>", "Problem statement")
    .requiredOption("--fix <fix>", "Fix applied")
    .requiredOption("--prevention-rule <rule>", "Prevention rule")
    .option("--related-files <files>", "Comma-separated related files")
    .action(async (options) => {
      const spinner = ora("Saving lesson...").start();
      let context;
      try {
        context = await createDbContext();
        const lesson = context.lessonsRepo.add({
          problem: options.problem,
          fix: options.fix,
          prevention_rule: options.preventionRule,
          related_files: options.relatedFiles
            ? options.relatedFiles.split(",").map((value) => value.trim()).filter(Boolean)
            : []
        });
        spinner.stop();
        console.log("Lesson added");
        console.log(chalk.green(`id: ${lesson.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  lessons.command("list")
    .description("List AI lessons learned")
    .action(async () => {
      const spinner = ora("Loading lessons...").start();
      let context;
      try {
        context = await createDbContext();
        const rows = context.lessonsRepo.list();
        spinner.stop();
        if (rows.length === 0) {
          console.log(chalk.yellow("No lessons found."));
          return;
        }
        console.table(rows.map((row) => ({
          id: row.id,
          problem: row.problem,
          prevention_rule: row.prevention_rule,
          created_at: row.created_at
        })));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  const decisions = ai.command("decisions").description("Manage architectural decisions");

  decisions.command("add")
    .description("Add an architectural decision")
    .requiredOption("--title <title>", "Decision title")
    .requiredOption("--rationale <rationale>", "Decision rationale")
    .requiredOption("--decision <decision>", "Final decision summary")
    .option("--affected-files <files>", "Comma-separated affected files")
    .option("--superseded-by <id>", "Superseded by decision id")
    .action(async (options) => {
      const spinner = ora("Saving decision...").start();
      let context;
      try {
        context = await createDbContext();
        const record = context.decisionsRepo.add({
          title: options.title,
          rationale: options.rationale,
          decision: options.decision,
          affected_files: options.affectedFiles
            ? options.affectedFiles.split(",").map((value) => value.trim()).filter(Boolean)
            : [],
          superseded_by: options.supersededBy ?? null
        });
        spinner.stop();
        console.log("Decision added");
        console.log(chalk.green(`id: ${record.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  decisions.command("list")
    .description("List architectural decisions")
    .action(async () => {
      const spinner = ora("Loading decisions...").start();
      let context;
      try {
        context = await createDbContext();
        const rows = context.decisionsRepo.list();
        spinner.stop();
        if (rows.length === 0) {
          console.log(chalk.yellow("No decisions found."));
          return;
        }
        console.table(rows.map((row) => ({
          id: row.id,
          title: row.title,
          created_at: row.created_at,
          superseded_by: row.superseded_by || ""
        })));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  const baseline = ai.command("baseline").description("Manage test baselines");

  baseline.command("add")
    .description("Record a new test baseline")
    .requiredOption("--passing <n>", "Passing tests count")
    .requiredOption("--failing <n>", "Failing tests count")
    .option("--notes <notes>", "Baseline notes")
    .action(async (options) => {
      const spinner = ora("Recording baseline...").start();
      let context;
      try {
        context = await createDbContext();
        const baselineRecord = context.baselineRepo.add({
          passing_tests: Number(options.passing),
          failing_tests: Number(options.failing),
          notes: options.notes ?? ""
        });
        spinner.stop();
        console.log("Baseline recorded");
        console.log(chalk.green(`id: ${baselineRecord.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  const commands = ai.command("commands").description("Manage important PowerShell commands");

  commands.command("add")
    .description("Add an important PowerShell command")
    .requiredOption("--category <category>", "Command category")
    .requiredOption("--powershell-command <command>", "PowerShell command")
    .option("--notes <notes>", "Notes")
    .action(async (options) => {
      const spinner = ora("Saving command...").start();
      let context;
      try {
        context = await createDbContext();
        const record = context.commandsRepo.add({
          category: options.category,
          powershell_command: options.powershellCommand,
          notes: options.notes ?? ""
        });
        spinner.stop();
        console.log("Command saved");
        console.log(chalk.green(`id: ${record.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });

  commands.command("list")
    .description("List important PowerShell commands")
    .action(async () => {
      const spinner = ora("Loading commands...").start();
      let context;
      try {
        context = await createDbContext();
        const rows = context.commandsRepo.list();
        spinner.stop();
        if (rows.length === 0) {
          console.log(chalk.yellow("No commands found."));
          return;
        }
        rows.forEach((row) => {
          console.log(`[${row.category}] ${row.powershell_command} | ${row.notes || ""} (${row.created_at})`);
        });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      } finally {
        context?.db?.close();
      }
    });
}