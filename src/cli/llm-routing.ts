import { Command } from "commander";
import { getRoutingHistory, resetRoutingHistory } from "../llm/routing-history";

export function registerLlmRouting(program: Command) {
  program
    .command("llm:routing")
    .description("Show recent routing decisions and explanations")
    .option("-n, --limit <limit>", "Number of records to show", "20")
    .action((options) => {
      const limit = Number(options.limit || 20);
      const rows = getRoutingHistory(limit);

      console.log("\nRecent Routing Decisions\n");

      if (!rows.length) {
        console.log("No routing decisions recorded.\n");
        return;
      }

      for (const row of rows) {
        const state = row.success ? "SUCCESS" : "FAILED";
        console.log(
          row.provider.padEnd(12) +
            " " +
            state.padEnd(8) +
            " " +
            new Date(row.createdAt).toISOString(),
        );
        console.log("  reason: " + row.reason);
        if (row.fallbackFrom)
          console.log("  fallbackFrom: " + row.fallbackFrom);
        if (row.latencyMs != null) console.log("  latencyMs: " + row.latencyMs);
        if (row.errorMessage) console.log("  error: " + row.errorMessage);
        console.log("");
      }
    });

  program
    .command("llm:routing:reset")
    .description("Reset routing decision history")
    .action(() => {
      resetRoutingHistory();
      console.log("✅ Reset routing history");
    });
}
