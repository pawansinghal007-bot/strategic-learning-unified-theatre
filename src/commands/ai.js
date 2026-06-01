import chalk from "chalk";
import ora from "ora";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryDb } from "../ai-memory/memory-db.js";
import { SprintStateRepo } from "../ai-memory/repositories/sprint-state-repo.js";
import { HandoffRepo } from "../ai-memory/repositories/handoff-repo.js";
import { LessonsRepo } from "../ai-memory/repositories/lessons-repo.js";
import { DecisionsRepo } from "../ai-memory/repositories/decisions-repo.js";
import { TestBaselineRepo } from "../ai-memory/repositories/test-baseline-repo.js";
import { CommandsRepo } from "../ai-memory/repositories/commands-repo.js";
import {
  loadLatestSprintManifest,
  mapSprintManifestToSnapshot,
  mapSprintManifestToHandoff
} from "../agent-handoff.js";

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
  if (!items || items.length === 0) {
    return `${label}: None`;
  }

  return `${label}: ${items.map((item) => String(item)).join(", ")}`;
}

function aiSnapshotPointerPath() {
  return path.join(os.homedir(), ".vscode-rotator", "ai-snapshot-current.json");
}

async function loadSnapshotPointer() {
  try {
    const raw = await fs.readFile(aiSnapshotPointerPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderSummary({
  currentSprint,
  handoff,
  latestBaseline,
  lessons = [],
  decisions = [],
  commands = [],
  snapshotPointer = null
}) {
  console.log(chalk.bold("AI Memory Snapshot"));
  if (snapshotPointer?.tag || snapshotPointer?.path) {
    console.log(
      chalk.bold("Snapshot tag:"),
      (() => {
        const pathSuffix = snapshotPointer.path ? ` (${snapshotPointer.path})` : "";
        return `${snapshotPointer.tag || "<none>"}${pathSuffix}`;
      })()
    );
  }
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
    console.log(
      chalk.bold("Last agent output:"),
      handoff.last_agent_output || "<none>"
    );
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

      const affectedFiles = safeJson(decision.affected_files);

      if (affectedFiles.length > 0) {
        console.log(`  files: ${affectedFiles.join(", ")}`);
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

// ---------------------------------------------------------------------------
// Open AI-memory DB contexts at command execution time. This respects test
// HOME/DB_PATH overrides and avoids leaking test baseline records into the
// user's real local AI-memory database.
// ---------------------------------------------------------------------------
async function createDbContext() {
  const db = await new MemoryDb().init();

  return {
    db,
    sprintRepo: new SprintStateRepo(db),
    handoffRepo: new HandoffRepo(db),
    lessonsRepo: new LessonsRepo(db),
    decisionsRepo: new DecisionsRepo(db),
    baselineRepo: new TestBaselineRepo(db),
    commandsRepo: new CommandsRepo(db),
    close: () => db.close()
  };
}

async function loadAiMemoryContext() {
  const context = await createDbContext();

  let currentSprint = context.sprintRepo.getLatest();
  let handoff = context.handoffRepo.getLatest();

  const latestBaseline = context.baselineRepo.getLatest();

  if (!currentSprint || !handoff) {
    const manifest = await loadLatestSprintManifest();

    if (manifest) {
      if (!currentSprint) {
        currentSprint = mapSprintManifestToSnapshot(manifest);
      }

      if (!handoff) {
        handoff = mapSprintManifestToHandoff(manifest);
      }
    }
  }

  const snapshot = {
    currentSprint,
    handoff,
    latestBaseline,
    decisions: context.decisionsRepo.list(),
    lessons: context.lessonsRepo.list(),
    commands: context.commandsRepo.list(),
    snapshotPointer: await loadSnapshotPointer()
  };
  context.close();
  return snapshot;
}

export function bindAiCommands(program) {
  const ai = program
    .command("ai")
    .description("AI memory persistence commands");

  ai.command("snapshot")
    .description("Print compact operational AI memory summary")
    .action(async () => {
      const spinner = ora("Loading AI memory...").start();

      try {
        const {
          currentSprint,
          handoff,
          latestBaseline,
          decisions,
          lessons,
          commands,
          snapshotPointer
        } = await loadAiMemoryContext();

        spinner.stop();

        renderSummary({
          currentSprint,
          handoff,
          latestBaseline,
          lessons,
          decisions,
          commands,
          snapshotPointer
        });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  ai.command("resume")
    .description("Print compact AI memory resume snapshot")
    .action(async () => {
      const spinner = ora("Loading resume state...").start();

      try {
        const {
          currentSprint,
          handoff,
          latestBaseline,
          decisions,
          lessons,
          commands,
          snapshotPointer
        } = await loadAiMemoryContext();

        spinner.stop();

        renderSummary({
          currentSprint,
          handoff,
          latestBaseline,
          lessons,
          decisions,
          commands,
          snapshotPointer
        });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------------------
  // Lessons
  // ---------------------------------------------------------------------------

  const lessons = ai
    .command("lessons")
    .description("Manage AI lessons learned");

  lessons.command("add")
    .description("Add an AI lesson learned")
    .requiredOption("--problem <problem>", "Problem statement")
    .requiredOption("--fix <fix>", "Fix applied")
    .requiredOption("--prevention-rule <rule>", "Prevention rule")
    .option("--related-files <files>", "Comma-separated related files")
    .action(async (options) => {
      const spinner = ora("Saving lesson...").start();

      try {
        const context = await createDbContext();

        const lesson = context.lessonsRepo.add({
          problem: options.problem,
          fix: options.fix,
          prevention_rule: options.preventionRule,
          related_files: options.relatedFiles
            ? options.relatedFiles
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : []
        });
        context.close();

        spinner.stop();

        console.log("Lesson added");
        console.log(chalk.green(`id: ${lesson.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  lessons.command("list")
    .description("List AI lessons learned")
    .action(async () => {
      const spinner = ora("Loading lessons...").start();

      try {
        const context = await createDbContext();

        const rows = context.lessonsRepo.list();
        context.close();

        spinner.stop();

        if (rows.length === 0) {
          console.log(chalk.yellow("No lessons found."));
          return;
        }

        console.table(
          rows.map((row) => ({
            id: row.id,
            problem: row.problem,
            prevention_rule: row.prevention_rule,
            created_at: row.created_at
          }))
        );
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------------------
  // Decisions
  // ---------------------------------------------------------------------------

  const decisions = ai
    .command("decisions")
    .description("Manage architectural decisions");

  decisions.command("add")
    .description("Add an architectural decision")
    .requiredOption("--title <title>", "Decision title")
    .requiredOption("--rationale <rationale>", "Decision rationale")
    .requiredOption("--decision <decision>", "Final decision summary")
    .option("--affected-files <files>", "Comma-separated affected files")
    .option("--superseded-by <id>", "Superseded by decision id")
    .action(async (options) => {
      const spinner = ora("Saving decision...").start();

      try {
        const context = await createDbContext();

        const record = context.decisionsRepo.add({
          title: options.title,
          rationale: options.rationale,
          decision: options.decision,
          affected_files: options.affectedFiles
            ? options.affectedFiles
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
          superseded_by: options.supersededBy ?? null
        });
        context.close();

        spinner.stop();

        console.log("Decision added");
        console.log(chalk.green(`id: ${record.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  decisions.command("list")
    .description("List architectural decisions")
    .action(async () => {
      const spinner = ora("Loading decisions...").start();

      try {
        const context = await createDbContext();

        const rows = context.decisionsRepo.list();
        context.close();

        spinner.stop();

        if (rows.length === 0) {
          console.log(chalk.yellow("No decisions found."));
          return;
        }

        console.table(
          rows.map((row) => ({
            id: row.id,
            title: row.title,
            created_at: row.created_at,
            superseded_by: row.superseded_by || ""
          }))
        );
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------------------
  // Baselines
  // ---------------------------------------------------------------------------

  const baseline = ai
    .command("baseline")
    .description("Manage test baselines");

  baseline.command("add")
    .description("Record a new test baseline")
    .requiredOption("--passing <n>", "Passing tests count")
    .requiredOption("--failing <n>", "Failing tests count")
    .option("--allow-failing", "Allow recording a known failing baseline")
    .option("--notes <notes>", "Baseline notes")
    .action(async (options) => {
      const spinner = ora("Recording baseline...").start();

      try {
        const passing = Number(options.passing);
        const failing = Number(options.failing);

        if (!Number.isInteger(passing) || passing < 0) {
          throw new Error("--passing must be a non-negative integer");
        }

        if (!Number.isInteger(failing) || failing < 0) {
          throw new Error("--failing must be a non-negative integer");
        }

        if (failing > 0 && !options.allowFailing) {
          throw new Error(
            "Refusing to record a failing test baseline without --allow-failing. " +
              "Run the full suite and record passing=actual, failing=0 for acceptance snapshots."
          );
        }

        const context = await createDbContext();

        const baselineRecord = context.baselineRepo.add({
          passing_tests: passing,
          failing_tests: failing,
          notes: options.notes ?? ""
        });
        context.close();

        spinner.stop();

        console.log("Baseline recorded");
        console.log(chalk.green(`id: ${baselineRecord.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  const commands = ai
    .command("commands")
    .description("Manage important PowerShell commands");

  commands.command("add")
    .description("Add an important PowerShell command")
    .requiredOption("--category <category>", "Command category")
    .requiredOption(
      "--powershell-command <command>",
      "PowerShell command"
    )
    .option("--notes <notes>", "Notes")
    .action(async (options) => {
      const spinner = ora("Saving command...").start();

      try {
        const context = await createDbContext();

        // Commander normalizes:
        // --powershell-command => powershellCommand
        const powershellCommand =
          options.powershellCommand ??
          options["powershell-command"] ??
          "";

        const record = context.commandsRepo.add({
          category: options.category,
          powershell_command: powershellCommand,
          notes: options.notes ?? ""
        });
        context.close();

        spinner.stop();

        console.log("Command saved");
        console.log(chalk.green(`id: ${record.id}`));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  commands.command("list")
    .description("List important PowerShell commands")
    .action(async () => {
      const spinner = ora("Loading commands...").start();

      try {
        const context = await createDbContext();

        const rows = context.commandsRepo.list();
        context.close();

        spinner.stop();

        if (rows.length === 0) {
          console.log(chalk.yellow("No commands found."));
          return;
        }

        rows.forEach((row) => {
          console.log(
            `[${row.category}] ${row.powershell_command} | ${
              row.notes || ""
            } (${row.created_at})`
          );
        });
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });
}
