import { Command } from 'commander';
import { getProviderStatus, resetProviderStatus } from '../llm/status';

export function registerLlmHealth(program) {
  program
    .command('llm:health')
    .description('Show health and availability of all AI providers')
    .action(() => {
      const rows = getProviderStatus();

      console.log('\nAI Provider Health\n');

      for (const p of rows) {
        const icon = !p.hasKey ? '🔑' : p.available ? '✅' : '❌';
        const eta =
          p.recoversInMinutes != null
            ? ` (recovers in ${p.recoversInMinutes}m)`
            : '';
        const reason = p.reason ? ` — ${p.reason}` : '';

        console.log(
          `${icon} ${p.name.padEnd(12)} ${p.state.padEnd(16)}${eta}${reason}`,
        );
      }

      console.log('');
    });

  program
    .command('llm:health:reset [provider]')
    .description('Reset provider health (all or specific)')
    .action((provider) => {
      const valid = ['groq', 'gemini', 'openai', 'perplexity', 'local'];
      if (provider && !valid.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        process.exitCode = 1;
        return;
      }

      resetProviderStatus(provider);
      console.log(`✅ Reset health for ${provider || 'all providers'}`);
    });
}
