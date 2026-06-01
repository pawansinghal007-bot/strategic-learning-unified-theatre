import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import nodefs from "node:fs";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { nanoid } from "nanoid";

import { AccountStore } from "./accounts/store.js";
import { AgentTypeSchema } from "./accounts/schema.js";
import { SwitcherService } from "./accounts/switcher.js";
import { getSystemHealth } from "./accounts/health.js";
import { ProfileManager } from "./accounts/profile-manager.js";
import { bindProfile } from "./accounts/workspace.js";
import { resolveVSCodeBin } from "./internal/paths.js";
import { Journal } from "./internal/journal.js";
import { GitMonitor } from "./internal/git-monitor.js";
import { Reporter } from "./internal/reporter.js";
import { SecretStore } from "./accounts/secret-store.js";
import { bindHandoffCommands } from "./commands/handoff.js";
import { bindIdeaCommands } from "./commands/idea.js";
import { bindBrowserCommands } from "./commands/browser.js";
import { bindStorageCommands } from "./commands/storage.js";
import { bindLlmCommands } from "./commands/llm.js";
import { bindBc2SyncCommand } from "./commands/bc2-sync.js";
import { bindAiCommands } from "./commands/ai.js";
import { createLogger } from "./logger.js";
import { loadConfig } from "./internal/config.js";
import { getSystemHealth as getSystemHealthSystem } from "./system/systemHealth.js";

const log = createLogger("cli");
const program = new Command();

function createPrompter() {
  const rl = readline.createInterface({ input, output });
  return {
    async ask(label) {
      const ans = await rl.question(label);
      return ans.trim();
    },
    close() {
      rl.close();
    },
  };
}

function normalizeAgentType(inputValue) {
  const value = inputValue.trim().toLowerCase();
  const parsed = AgentTypeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid agentType: ${inputValue} (expected ${AgentTypeSchema.options.join(", ")})`,
    );
  }
  return parsed.data;
}

program
  .name("strategic-learning-unified-theatre")
  .description(
    "Local development intelligence with OS secret storage and daemon-based workspace automation",
  )
  .version("0.1.0");

program
  .command("add")
  .description("Add an account to the encrypted store")
  .action(async () => {
    const spinner = ora("Preparing...").start();
    const store = new AccountStore();
    let accountId = null;
    spinner.stop();

    const prompter = createPrompter();
    try {
      const email = await prompter.ask("Email: ");
      const agentTypeRaw = await prompter.ask(
        `Agent type (${AgentTypeSchema.options.join("/")}): `,
      );
      const authBlob = await prompter.ask("Auth blob (single line paste): ");

      const agentType = normalizeAgentType(agentTypeRaw || "vscode");
      const id = nanoid();
      accountId = id;
      log.info("account.add.start", {
        correlationId: accountId,
        email,
        agentType,
      });

      spinner.start("Saving...");
      const secretStore = new SecretStore();
      await secretStore.set(id, authBlob);
      const account = await store.add({
        id,
        email,
        agentType,
        authBlob: null,
        profileName: null,
        cooldownUntil: null,
        lastUsed: null,
        status: "active",
      });
      spinner.stop();

      log.info("account.add.success", {
        correlationId: account.id,
        email: account.email,
        agentType: account.agentType,
      });
      console.log(chalk.green("Added account:"), chalk.cyan(account.id));
    } catch (err) {
      spinner.stop();
      log.error("account.add.failure", {
        correlationId: accountId,
        error: err,
        code: err?.code || "ROTATOR_ACCOUNT_ADD_FAILED",
      });
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    } finally {
      prompter.close();
    }
  });

program
  .command("list")
  .description("List accounts in the store")
  .action(async () => {
    const spinner = ora("Loading...").start();
    const store = new AccountStore();
    try {
      const accounts = await store.list();
      spinner.stop();

      if (accounts.length === 0) {
        console.log(chalk.yellow("No accounts found."));
        return;
      }

      console.table(
        accounts.map((a) => ({
          id: a.id,
          email: a.email,
          agentType: a.agentType,
          status: a.status,
          cooldownUntil: a.cooldownUntil ? a.cooldownUntil.toISOString() : "",
          lastUsed: a.lastUsed ? a.lastUsed.toISOString() : "",
        })),
      );
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("remove")
  .description("Remove an account by id")
  .argument("<id>", "Account id")
  .action(async (id) => {
    const spinner = ora("Removing...").start();
    const store = new AccountStore();
    try {
      const secretStore = new SecretStore();
      await secretStore.delete(id);
      await store.remove(id);
      spinner.stop();
      console.log(chalk.green("Removed:"), chalk.cyan(id));
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("status")
  .description("Show store status and current account summary")
  .action(async () => {
    const spinner = ora("Loading...").start();
    const store = new AccountStore();
    try {
      const accounts = await store.list();
      spinner.stop();

      console.log(chalk.bold("Rotation status:"));
      console.log(`Accounts: ${accounts.length}`);
      console.log(
        "Use 'daemon status' to check the watcher daemon and 'daemon watch' for live log streaming.",
      );
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("use")
  .description("Switch to an account by id (auth swap + VS Code restart)")
  .argument("<accountId>", "Account id")
  .option("--dry-run", "Print plan without executing")
  .action(async (accountId, options) => {
    const store = new AccountStore();
    const svc = new SwitcherService({ store });
    log.info("rotation.start", {
      correlationId: accountId,
      dryRun: Boolean(options?.dryRun),
    });

    let spinner = null;
    const onStep = (evt) => {
      if (evt.phase === "start") {
        spinner = ora(evt.message).start();
        return;
      }

      if (!spinner) {
        spinner = ora().start();
      }

      if (evt.phase === "success") {
        spinner.succeed(evt.message);
        spinner = null;
        return;
      }

      if (evt.phase === "skip") {
        spinner.succeed(evt.message);
        spinner = null;
        return;
      }

      if (evt.phase === "fail") {
        spinner.fail(evt.message);
        spinner = null;
      }
    };

    try {
      const plan = await svc.switch(accountId, {
        dryRun: Boolean(options?.dryRun),
        onStep,
      });

      console.log(chalk.bold("Plan:"));
      console.log(`Account: ${chalk.cyan(plan.accountId)}`);
      console.log(`Agent: ${plan.agentType}`);
      console.log(`Auth path: ${plan.authPath}`);
      console.log(`VS Code profile: ${plan.profileName}`);
      log.info("rotation.success", {
        correlationId: accountId,
        dryRun: Boolean(options?.dryRun),
      });
    } catch (err) {
      spinner?.stop();
      log.error("rotation.failure", {
        correlationId: accountId,
        error: err,
        code: err?.code || "ROTATOR_ROTATION_FAILED",
      });
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("health")
  .description("Probe all accounts (one-shot)")
  .option("--json", "Output machine-readable JSON")
  .action(async (options) => {
    const spinner = ora("Probing system health...").start();
    try {
      const health = await getSystemHealth();
      spinner.stop();

      if (options?.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      console.log(chalk.bold("Daemon:"), health.daemon.status);
      console.log(
        chalk.bold("Local LLM:"),
        `${health.localLlm.status} (${health.localLlm.models.length} model${health.localLlm.models.length === 1 ? "" : "s"})`,
      );
      console.log(
        chalk.bold("Accounts:"),
        `${health.account.status} (${health.account.summary.total} total)`,
      );

      const rows = health.account.accounts.map((acct) => ({
        id: acct.id,
        email: acct.email ?? "",
        agentType: acct.agentType,
        status: acct.healthStatus,
        remainingRequests: acct.remainingRequests ?? "",
        resetAt: acct.resetAt ? new Date(acct.resetAt).toISOString() : "",
        error: acct.error ?? "",
      }));

      if (rows.length === 0) {
        console.log(chalk.yellow("No accounts found."));
        return;
      }

      console.table(rows);
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("system-health")
  .description("Probe full system health and output JSON")
  .option("--pretty", "Pretty-print JSON output")
  .action(async (options) => {
    try {
      const config = await loadConfig();
      const health = await getSystemHealthSystem({
        dbPath: config.memoryDbPath,
        config,
      });

      const out = {
        overallStatus: health.status,
        generatedAt: health.ts,
        subsystems: health.subsystems,
      };

      if (options?.pretty) {
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log(JSON.stringify(out));
      }

      process.exitCode = health.status === "OK" ? 0 : 1;
    } catch (err) {
      console.error(String(err?.message ?? err));
      process.exitCode = 1;
    }
  });

const logCmd = program.command("log").description("Progress journal");

logCmd
  .command("show")
  .description("Show last journal lines")
  .option("--tail <n>", "Number of lines", "20")
  .action(async (options) => {
    try {
      const journal = new Journal();
      const lines = await journal.tail(Number(options?.tail ?? 20));
      if (lines.length === 0) {
        console.log(chalk.yellow("No entries."));
        return;
      }
      for (const line of lines) console.log(line);
    } catch (err) {
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

logCmd
  .command("clear")
  .description("Archive current journal and start fresh")
  .action(async () => {
    const spinner = ora("Clearing...").start();
    try {
      const journal = new Journal();
      const bak = await journal.clear();
      spinner.succeed("Cleared");
      console.log(bak);
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("git-status")
  .description("Show git status summary for a repo path")
  .argument("[repoPath]", "Repository path", process.cwd())
  .action(async (repoPath) => {
    const spinner = ora("Checking git...").start();
    try {
      const gm = new GitMonitor();
      const s = await gm.status(repoPath);
      spinner.stop();
      console.table([
        {
          repoPath,
          branch: s.branch,
          ahead: s.ahead,
          behind: s.behind,
          uncommitted: s.uncommitted,
          stashed: s.stashed,
          lastCommit: `${s.lastCommit.sha.slice(0, 8)} ${s.lastCommit.msg}`,
        },
      ]);
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

program
  .command("report")
  .description("Generate journal summary")
  .command("generate")
  .description("Generate daily summary section")
  .option("--date <yyyy-mm-dd>", "Date (defaults to today)")
  .action(async (options) => {
    const spinner = ora("Generating...").start();
    try {
      const reporter = new Reporter();
      const date = options?.date ? String(options.date) : new Date();
      await reporter.daily(date);
      spinner.succeed("Generated");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

const daemonCmd = program
  .command("daemon")
  .description("Manage the watcher daemon");

const profileCmd = program
  .command("profile")
  .description("Manage VS Code profiles");

profileCmd
  .command("list")
  .description("List local VS Code profiles")
  .action(async () => {
    const spinner = ora("Loading profiles...").start();
    try {
      const pm = new ProfileManager();
      const profiles = await pm.list();
      spinner.stop();
      if (profiles.length === 0) {
        console.log(chalk.yellow("No profiles found."));
        return;
      }
      console.table(profiles.map((p) => ({ name: p })));
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

profileCmd
  .command("create")
  .description("Create a VS Code profile from a template")
  .argument("<name>", "Profile name")
  .option("--template <templateName>", "Template name", "default")
  .action(async (name, options) => {
    const spinner = ora("Creating profile...").start();
    try {
      const pm = new ProfileManager();
      const created = await pm.create(name, options?.template);
      spinner.succeed("Profile created");
      console.log(chalk.cyan(created));
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

profileCmd
  .command("delete")
  .description("Delete a local VS Code profile")
  .argument("<name>", "Profile name")
  .action(async (name) => {
    const spinner = ora("Deleting profile...").start();
    try {
      const pm = new ProfileManager();
      await pm.delete(name);
      spinner.succeed("Profile deleted");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

profileCmd
  .command("link")
  .description("Link an account to a profile name")
  .argument("<accountId>", "Account id")
  .argument("<profileName>", "Profile name")
  .action(async (accountId, profileName) => {
    const spinner = ora("Linking...").start();
    try {
      const store = new AccountStore();
      const pm = new ProfileManager({ store });
      await pm.link(accountId, profileName);
      spinner.succeed("Linked");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

profileCmd
  .command("apply")
  .description("Ensure profile exists, bind workspace, and open VS Code")
  .argument("<accountId>", "Account id")
  .argument("<workspacePath>", ".code-workspace path")
  .action(async (accountId, workspacePath) => {
    const spinner = ora("Preparing...").start();
    log.info("profile.apply.start", {
      correlationId: accountId,
      workspacePath,
    });
    try {
      const store = new AccountStore();
      const account = await store.get(accountId);
      const pm = new ProfileManager({ store });

      const desiredProfile = account.profileName ?? account.id;
      const existing = await pm.list();
      if (!existing.includes(desiredProfile)) {
        spinner.text = "Creating profile...";
        let template = "default";
        if (account.agentType === "codex") {
          template = "codex";
        } else if (account.agentType === "trae") {
          template = "trae";
        }
        await pm.create(desiredProfile, template);
      }

      if (account.profileName !== desiredProfile) {
        await pm.link(accountId, desiredProfile);
      }

      spinner.text = "Binding workspace...";
      await bindProfile(workspacePath, desiredProfile);

      spinner.text = "Launching VS Code...";
      const { spawn } = await import("node:child_process");
      const codeBin = await resolveVSCodeBin();
      const child = spawn(
        codeBin,
        ["--profile", desiredProfile, workspacePath],
        {
          detached: true,
          stdio: "ignore",
        },
      );
      child.unref();

      spinner.succeed("Applied");
      log.info("profile.apply.success", {
        correlationId: accountId,
        profileName: desiredProfile,
        workspacePath,
      });
    } catch (err) {
      spinner.stop();
      log.error("profile.apply.failure", {
        correlationId: accountId,
        workspacePath,
        error: err,
        code: err?.code || "ROTATOR_PROFILE_APPLY_FAILED",
      });
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

profileCmd
  .command("export")
  .description("Export a profile snapshot to a .zip")
  .argument("<name>", "Profile name")
  .argument("<zipPath>", "Output zip path")
  .action(async (name, zipPath) => {
    const spinner = ora("Exporting...").start();
    try {
      const pm = new ProfileManager();
      await pm.exportSnapshot(name, zipPath);
      spinner.succeed("Exported");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

bindHandoffCommands(program);
bindIdeaCommands(program);
bindBrowserCommands(program, { log });
bindStorageCommands(program);
bindLlmCommands(program, { log });
bindBc2SyncCommand(program);
bindAiCommands(program);

profileCmd
  .command("import")
  .description("Import a profile snapshot from a .zip")
  .argument("<zipPath>", "Input zip path")
  .argument("<name>", "Profile name")
  .action(async (zipPath, name) => {
    const spinner = ora("Importing...").start();
    try {
      const pm = new ProfileManager();
      await pm.importSnapshot(zipPath, name);
      spinner.succeed("Imported");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

function daemonPaths() {
  const base = path.join(os.homedir(), ".vscode-rotator");
  return {
    baseDir: base,
    pidPath: path.join(base, "daemon.pid"),
    logPath: path.join(base, "daemon.log"),
  };
}

async function readPid(pidPath) {
  const raw = await fs.readFile(pidPath, "utf8");
  const pid = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Invalid PID file");
  return pid;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

daemonCmd
  .command("start")
  .description("Start daemon as detached process")
  .action(async () => {
    const spinner = ora("Starting daemon...").start();
    try {
      log.info("daemon.start", { correlationId: "daemon" });
      const { spawn } = await import("node:child_process");
      const runner = fileURLToPath(
        new URL("./daemon/daemon-runner.js", import.meta.url),
      );

      const child = spawn(process.execPath, [runner], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      spinner.succeed("Daemon started");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

daemonCmd
  .command("stop")
  .description("Stop the running daemon")
  .action(async () => {
    const spinner = ora("Stopping daemon...").start();
    try {
      log.info("daemon.stop", { correlationId: "daemon" });
      const { pidPath } = daemonPaths();
      const pid = await readPid(pidPath);
      process.kill(pid, "SIGTERM");
      spinner.succeed("Daemon stopped");
    } catch (err) {
      spinner.stop();
      console.error(chalk.red(String(err?.message ?? err)));
      process.exitCode = 1;
    }
  });

daemonCmd
  .command("status")
  .description("Show daemon status")
  .action(async () => {
    const spinner = ora("Checking daemon...").start();
    try {
      const { pidPath } = daemonPaths();
      const pid = await readPid(pidPath);
      spinner.stop();
      const alive = isPidAlive(pid);
      console.log(
        alive ? chalk.green("running") : chalk.red("not running"),
        `(pid ${pid})`,
      );
    } catch (err) {
      spinner.stop();
      log.error("daemon.status.failure", { error: err });
      console.log(chalk.red("not running"));
    }
  });

daemonCmd
  .command("watch")
  .description("Stream daemon log output")
  .action(async () => {
    const { logPath } = daemonPaths();
    await fs.mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });
    await fs.appendFile(logPath, "", { encoding: "utf8" });

    let offset = 0;
    try {
      const initial = await fs.readFile(logPath, "utf8");
      offset = Buffer.byteLength(initial, "utf8");
      process.stdout.write(initial);
    } catch {}

    nodefs.watch(logPath, async () => {
      try {
        const raw = await fs.readFile(logPath);
        const chunk = raw.subarray(offset);
        if (chunk.length > 0) {
          offset += chunk.length;
          process.stdout.write(chunk.toString("utf8"));
        }
      } catch {}
    });
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  log.error("cli.fatal", {
    error: err,
    code: err?.code || "ROTATOR_CLI_FAILURE",
  });
  console.error(chalk.red(String(err?.message ?? err)));
  process.exitCode = 1;
}
