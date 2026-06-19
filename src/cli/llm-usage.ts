import { getProviderUsage, resetProviderUsage } from "../llm/provider-usage";

export function registerLlmUsage(program) {
  program
    .command("llm:usage")
    .description("Show request, token, and cost usage for all AI providers")
    .action(() => {
      const rows = getProviderUsage();

      console.log("\nAI Provider Usage\n");

      for (const p of rows) {
        const resetLabel =
          p.resetAt === null
            ? ""
            : ` | resets ${new Date(p.resetAt).toISOString()}`;

        console.log(
          [
            p.provider.padEnd(12),
            `req=${String(p.requestCount).padEnd(4)}`,
            `ok=${String(p.successCount).padEnd(4)}`,
            `fail=${String(p.failureCount).padEnd(4)}`,
            `tokens=${String(p.totalTokens).padEnd(8)}`,
            `cost=$${p.estimatedCostUsd.toFixed(4)}`,
            resetLabel,
          ].join(" "),
        );
      }

      console.log("");
    });

  program
    .command("llm:usage:reset [provider]")
    .description("Reset usage counters (all or specific provider)")
    .action((provider) => {
      const valid = ["groq", "gemini", "openai", "perplexity", "local"];
      if (provider && !valid.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        process.exitCode = 1;
        return;
      }

      resetProviderUsage(provider);
      console.log(`✅ Reset usage for ${provider || "all providers"}`);
    });
}
