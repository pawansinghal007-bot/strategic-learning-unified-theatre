import chalk from "chalk";
import ora from "ora";

import { StorageMonitor } from "../storage/storage-monitor.js";
import { DocumentIngester } from "../llm/document-ingester.js";
import { ingestRepository } from "../knowledge/ingest/ingest-repository.js";

export async function bindStorageCommands(program) {
  const storage = program
    .command("storage")
    .description("Monitor local storage for dev and document changes");

  storage
    .command("watch")
    .description("Start the storage watcher in the foreground")
    .action(async () => {
      const spinner = ora("Starting storage monitor...").start();
      const monitor = new StorageMonitor();
      let qdrantReindexInFlight = false;
      try {
        await monitor.indexAll();
        monitor.onIngestibleChange = async (changes) => {
          const ingester = new DocumentIngester();
          for (const change of changes) {
            if (change.event === "unlink") continue;
            await ingester.ingestPath(change.path);
          }
          if (qdrantReindexInFlight) {
            console.warn(
              "[storage] qdrant re-index already in progress, skipping this flush",
            );
          } else {
            qdrantReindexInFlight = true;
            ingestRepository({ baseDir: process.cwd() })
              .catch((err) =>
                console.warn("[storage] qdrant re-index failed:", err),
              )
              .finally(() => {
                qdrantReindexInFlight = false;
              });
          }
        };
        await monitor.watch();
        spinner.succeed("Storage monitor running");
        console.log(chalk.gray("Press Ctrl+C to stop."));

        const shutdown = async () => {
          await monitor.close();
          process.exit(0);
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  storage
    .command("status")
    .description("Show the last 20 storage changes")
    .action(async () => {
      const spinner = ora("Loading storage changes...").start();
      try {
        const monitor = new StorageMonitor();
        const changes = await monitor.recentChanges(20);
        spinner.stop();
        if (changes.length === 0) {
          console.log(chalk.yellow("No storage changes found."));
          return;
        }
        console.table(
          changes.map((change) => ({
            path: change.path,
            event: change.event,
            time: change.ts,
            ingestible: change.ingestible,
          })),
        );
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });

  storage
    .command("index")
    .description("Force a full storage re-index and regenerate the snapshot")
    .action(async () => {
      const spinner = ora("Indexing storage paths...").start();
      try {
        const monitor = new StorageMonitor();
        const result = await monitor.indexAll();
        spinner.succeed(`Indexed ${result.indexed} files`);
        console.log(chalk.gray(result.snapshotPath));
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(String(err?.message ?? err)));
        process.exitCode = 1;
      }
    });
}
