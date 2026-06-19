import { Command } from "commander";
import {
  getProviderStatus,
  resetAllProviderTelemetry,
  resetProviderStatus,
} from "../llm/status";

export function registerLlmHealth(program) {
  program
    .command("llm:health")
    .description("Show health and availability of all AI providers")
    .action(() => {
      const rows = getProviderStatus();

      console.log("\nAI Provider Health\n");

      for (const p of rows) {
        const icon = p.hasKey ? (p.available ? "✅" : "❌") : "🔑";
        const eta = p.recoversInMinutes === null ? "" : ` (recovers in ${p.recoversInMinutes}m)`;
        const reason = p.reason === undefined ? "" : ` — ${p.reason}`;
        const usage = ` | req=${p.requestCount} ok=${p.successCount} fail=${p.failureCount} tokens=${p.totalTokens}`;

        console.log(
          `${icon} ${p.name.padEnd(12)} ${p.state.padEnd(16)}${eta}${reason}${usage}`,
        );
      }

      console.log("");
    });

  program
    .command("llm:health:reset [provider]")
    .option("--all-telemetry", "Reset both health and usage for the provider")
    .description("Reset provider health (all or specific)")
    .action((provider, options) => {
      const valid = ["groq", "gemini", "openai", "perplexity", "local"];
      if (provider && !valid.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        process.exitCode = 1;
        return;
      }

      if (options?.allTelemetry) {
        resetAllProviderTelemetry(provider);
        console.log(
          `✅ Reset health and usage for ${provider || "all providers"}`,
        );
        return;
      }

      resetProviderStatus(provider);
      console.log(`✅ Reset health for ${provider || "all providers"}`);
    });
}
